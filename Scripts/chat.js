const PB_CONFIG = window.__WEBMU_POCKETBASE__ || {};
const PB_URL = PB_CONFIG.url || 'https://pocketbase.felixx.dev';
const PB_AUTH_COLLECTION = PB_CONFIG.authCollection || 'webmuser';
const PB_MESSAGES_COLLECTION = 'webmuMessages';
const PB_GROUPS_COLLECTION = 'webmuGroups';
const PB_GROUP_KEYS_COLLECTION = 'webmuGroupKeys';
const SESSION_KEY = 'webmu-pocketbase-session';
const PRIVATE_KEY_STORAGE = 'webmu-private-key';

const chatList = document.getElementById('chatList');
const messageList = document.getElementById('messageList');
const chatTitle = document.getElementById('chatTitle');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const chatImgInput = document.getElementById('chatImgInput');
const imagePreview = document.getElementById('imagePreview');
const previewImg = document.getElementById('previewImg');
const removeImgBtn = document.getElementById('removeImgBtn');
const newGroupBtn = document.getElementById('newGroupBtn');
const groupModal = document.getElementById('groupModal');
const memberList = document.getElementById('memberList');
const groupNameInput = document.getElementById('groupNameInput');
const confirmGroupBtn = document.getElementById('confirmGroupBtn');
const cancelGroupBtn = document.getElementById('cancelGroupBtn');
const tabs = document.querySelectorAll('.tab-btn');

let currentUser = null;
let authToken = '';
let userPrivateKey = null;
let userPublicKey = null;

// --- E2EE Key Management ---

async function initEncryption() {
  const localPriv = localStorage.getItem(PRIVATE_KEY_STORAGE);
  const remotePub = currentUser.publicKey;

  if (localPriv && remotePub) {
    try {
      userPrivateKey = await CryptoUtils.importPrivateKey(localPriv);
      userPublicKey = await CryptoUtils.importPublicKey(remotePub);
      return;
    } catch (e) {
      console.error('Failed to import keys, regenerating...', e);
    }
  }

  // Generate new pair
  const pair = await CryptoUtils.generateRSAKeyPair();
  const pubJWK = await CryptoUtils.exportPublicKey(pair.publicKey);
  const privJWK = await CryptoUtils.exportPrivateKey(pair.privateKey);

  // Save local
  localStorage.setItem(PRIVATE_KEY_STORAGE, privJWK);
  userPrivateKey = pair.privateKey;
  userPublicKey = pair.publicKey;

  // Save remote
  currentUser = await pbRequest(`/api/collections/${PB_AUTH_COLLECTION}/records/${currentUser.id}`, {
    method: 'PATCH',
    token: authToken,
    body: { publicKey: pubJWK }
  });
}

async function getRemotePublicKey(userId) {
  const user = await pbRequest(`/api/collections/${PB_AUTH_COLLECTION}/records/${userId}`, { token: authToken });
  if (!user.publicKey) throw new Error('User has not enabled encryption.');
  return await CryptoUtils.importPublicKey(user.publicKey);
}

async function getGroupAESKey(groupId) {
  const qs = new URLSearchParams({
    filter: `group="${groupId}" && user="${currentUser.id}"`
  });
  const res = await pbRequest(`/api/collections/${PB_GROUP_KEYS_COLLECTION}/records?${qs.toString()}`, { token: authToken });
  if (!res.items.length) throw new Error('You do not have access to this group\'s encryption key.');
  
  const encryptedKeyBuf = CryptoUtils.base64ToBuffer(res.items[0].encryptedKey);
  const decryptedJWKBuf = await CryptoUtils.decryptRSA(userPrivateKey, encryptedKeyBuf);
  const jwkStr = CryptoUtils.bufferToText(decryptedJWKBuf);
  return await CryptoUtils.importAESKey(jwkStr);
}

async function decryptMessageData(msg) {
  try {
    if (!msg.encryptedData || !msg.iv) return { text: '[Unencrypted or missing data]', imageUrl: '' };

    let aesKey;
    if (msg.group) {
      aesKey = await getGroupAESKey(msg.group);
    } else {
      const encryptedKeyBase64 = msg.sender === currentUser.id ? msg.senderKey : msg.encryptedKey;
      if (!encryptedKeyBase64) return { text: '[Key missing]', imageUrl: '' };
      
      const encryptedKeyBuf = CryptoUtils.base64ToBuffer(encryptedKeyBase64);
      const decryptedJWKBuf = await CryptoUtils.decryptRSA(userPrivateKey, encryptedKeyBuf);
      const jwkStr = CryptoUtils.bufferToText(decryptedJWKBuf);
      aesKey = await CryptoUtils.importAESKey(jwkStr);
    }

    const encryptedDataBuf = CryptoUtils.base64ToBuffer(msg.encryptedData);
    const ivBuf = CryptoUtils.base64ToBuffer(msg.iv);
    const decryptedBuf = await CryptoUtils.decryptAES(aesKey, encryptedDataBuf, ivBuf);
    const payloadStr = CryptoUtils.bufferToText(decryptedBuf);
    return JSON.parse(payloadStr);
  } catch (e) {
    console.error('Decryption error:', e);
    return { text: '[Encryption error or key mismatch]', imageUrl: '' };
  }
}

let currentTab = 'dms';
let activeChatId = null; // Can be userId (for DM) or groupId
let activeChatType = 'dm'; // 'dm' or 'group'
let activeChatData = null;
let lastMessageId = null;
let pollInterval = null;
let editingMessageId = null;
let groupCreatorId = null;

function pbUrl(path) { return `${PB_URL}${path}`; }

function readSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return (parsed?.token && parsed?.record?.id) ? parsed : null;
  } catch (_) { return null; }
}

async function pbRequest(path, { method = 'GET', token = null, body = null } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = token;
  const init = { method, headers };
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(pbUrl(path), init);
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (_) { data = { message: text }; }
  }
  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data;
}

// Image Handling (Base64)
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

// UI Helpers
function fmtTime(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Chat Management
async function loadDMs() {
  // Find users I've messaged or who messaged me
  const qs = new URLSearchParams({
    filter: `sender="${currentUser.id}" || recipient="${currentUser.id}"`,
    sort: '-created',
    perPage: '100',
    expand: 'sender,recipient'
  });
  const res = await pbRequest(`/api/collections/${PB_MESSAGES_COLLECTION}/records?${qs.toString()}`, { token: authToken });
  const messages = res.items || [];
  
  const userMap = new Map();
  messages.forEach(msg => {
    const other = msg.sender === currentUser.id ? msg.expand.recipient : msg.expand.sender;
    if (other && other.id !== currentUser.id && !userMap.has(other.id)) {
      userMap.set(other.id, {
        user: other,
        lastMsg: msg.text || (msg.imageUrl ? '📷 Image' : ''),
        time: msg.created
      });
    }
  });
  
  return [...userMap.values()];
}

async function loadGroups() {
  const qs = new URLSearchParams({
    filter: `members ~ "${currentUser.id}"`,
    sort: '-updated',
    expand: 'members'
  });
  const res = await pbRequest(`/api/collections/${PB_GROUPS_COLLECTION}/records?${qs.toString()}`, { token: authToken });
  return res.items || [];
}

async function renderChatList() {
  chatList.innerHTML = '<div class="library-meta">Loading...</div>';
  try {
    if (currentTab === 'dms') {
      const dms = await loadDMs();
      chatList.innerHTML = dms.length ? '' : '<div class="library-meta">No conversations yet.</div>';
      dms.forEach(dm => {
        const display = dm.user.name || dm.user.email.split('@')[0];
        const item = document.createElement('div');
        item.className = `chat-item ${activeChatId === dm.user.id ? 'active' : ''}`;
        item.innerHTML = `
          <div class="user-info">
            <div class="user-name">${display}</div>
            <div class="user-meta">${dm.lastMsg}</div>
          </div>
        `;
        item.addEventListener('click', () => openChat(dm.user.id, 'dm', display));
        chatList.appendChild(item);
      });
    } else {
      const groups = await loadGroups();
      chatList.innerHTML = groups.length ? '' : '<div class="library-meta">No groups yet.</div>';
      groups.forEach(group => {
        const item = document.createElement('div');
        item.className = `chat-item ${activeChatId === group.id ? 'active' : ''}`;
        item.innerHTML = `
          <div class="user-info">
            <div class="user-name">${group.name}</div>
            <div class="user-meta">${group.members.length} members</div>
          </div>
        `;
        item.addEventListener('click', () => openChat(group.id, 'group', group.name));
        chatList.appendChild(item);
      });
    }
  } catch (err) {
    console.error('[load chat list]', err);
    chatList.innerHTML = '<div class="library-meta">Error loading chats.</div>';
  }
}

async function openChat(id, type, title) {
  activeChatId = id;
  activeChatType = type;
  chatTitle.textContent = title;
  chatInput.disabled = false;
  sendBtn.disabled = false;
  messageList.innerHTML = '<div class="library-meta">Loading messages...</div>';
  editingMessageId = null;
  groupCreatorId = null;
  
  if (type === 'group') {
    try {
      const group = await pbRequest(`/api/collections/${PB_GROUPS_COLLECTION}/records/${id}`, { token: authToken });
      groupCreatorId = group.creator;
    } catch (e) { console.error('Failed to load group data', e); }
  }
  
  await loadMessages();
  renderChatList(); // Update active state
  
  // Start polling
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(loadMessages, 3000);
}

async function loadMessages() {
  if (!activeChatId) return;
  
  let filter = '';
  if (activeChatType === 'dm') {
    filter = `(sender="${currentUser.id}" && recipient="${activeChatId}") || (sender="${activeChatId}" && recipient="${currentUser.id}")`;
  } else {
    filter = `group="${activeChatId}"`;
  }
  
  const qs = new URLSearchParams({
    filter: filter,
    sort: 'created',
    expand: 'sender'
  });
  
  try {
    const res = await pbRequest(`/api/collections/${PB_MESSAGES_COLLECTION}/records?${qs.toString()}`, { token: authToken });
    const messages = res.items || [];
    
    // Only re-render if we have new messages
    if (messages.length > 0 && messages[messages.length - 1].id === lastMessageId) return;
    
    messageList.innerHTML = '';
    for (const msg of messages) {
      const isSent = msg.sender === currentUser.id;
      const isGroupOwner = groupCreatorId === currentUser.id;
      const decrypted = await decryptMessageData(msg);
      
      const el = document.createElement('div');
      el.className = `message ${isSent ? 'sent' : 'received'}`;
      
      let content = '';
      if (decrypted.imageUrl) content += `<img src="${decrypted.imageUrl}" class="msg-img" onclick="window.open('${decrypted.imageUrl}')" />`;
      if (decrypted.text) content += `<div class="msg-bubble">${decrypted.text}</div>`;
      
      const senderName = msg.expand?.sender?.name || msg.expand?.sender?.email.split('@')[0] || 'Unknown';
      
      // Actions
      let actions = '';
      if (isSent) {
        actions += `<button class="msg-action" data-action="edit" data-id="${msg.id}">Edit</button>`;
      }
      if (isSent || isGroupOwner) {
        actions += `<button class="msg-action delete" data-action="delete" data-id="${msg.id}">Delete</button>`;
      }

      el.innerHTML = `
        ${activeChatType === 'group' && !isSent ? `<div class="user-meta">${senderName}</div>` : ''}
        ${content}
        <div class="msg-meta">
          ${fmtTime(msg.created)}
          ${actions}
        </div>
      `;

      // Event Listeners for actions
      el.querySelectorAll('.msg-action').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = btn.dataset.id;
          const action = btn.dataset.action;
          if (action === 'delete') {
            await deleteMessage(id);
          } else if (action === 'edit') {
            startEditMessage(id, decrypted.text);
          }
        });
      });

      messageList.appendChild(el);
    }
    
    if (messages.length > 0) {
      lastMessageId = messages[messages.length - 1].id;
      messageList.scrollTop = messageList.scrollHeight;
    } else {
      messageList.innerHTML = '<div class="chat-placeholder">No messages yet. Start the conversation!</div>';
    }
  } catch (err) {
    console.error('[load messages]', err);
  }
}

async function deleteMessage(id) {
  if (!confirm('Are you sure you want to delete this message?')) return;
  try {
    await pbRequest(`/api/collections/${PB_MESSAGES_COLLECTION}/records/${id}`, {
      method: 'DELETE',
      token: authToken
    });
    loadMessages();
  } catch (err) {
    alert('Failed to delete message: ' + err.message);
  }
}

function startEditMessage(id, currentText) {
  editingMessageId = id;
  chatInput.value = currentText;
  chatInput.focus();
  sendBtn.textContent = 'Update';
}

async function sendMessage() {
  const text = chatInput.value.trim();
  const file = chatImgInput.files[0];
  
  if (!text && !file) return;
  
  chatInput.value = '';
  chatInput.disabled = true;
  sendBtn.disabled = true;
  
  try {
    let imageUrl = '';
    if (file) {
      imageUrl = await fileToBase64(file);
      clearImagePreview();
    }
    
    // Create payload
    const payload = JSON.stringify({ text, imageUrl });
    const payloadBuf = CryptoUtils.textToBuffer(payload);

    let body = {
      sender: currentUser.id,
    };

    if (activeChatType === 'dm') {
      body.recipient = activeChatId;

      // Generate message AES key
      const aesKey = await CryptoUtils.generateAESKey();
      const { encrypted, iv } = await CryptoUtils.encryptAES(aesKey, payloadBuf);
      
      const aesKeyJWK = await CryptoUtils.exportAESKey(aesKey);
      const aesKeyJWKBuf = CryptoUtils.textToBuffer(aesKeyJWK);

      // Encrypt AES key for recipient
      const recipientPub = await getRemotePublicKey(activeChatId);
      const encKeyRecipient = await CryptoUtils.encryptRSA(recipientPub, aesKeyJWKBuf);

      // Encrypt AES key for sender (self)
      const encKeySender = await CryptoUtils.encryptRSA(userPublicKey, aesKeyJWKBuf);

      body.encryptedData = CryptoUtils.bufferToBase64(encrypted);
      body.iv = CryptoUtils.bufferToBase64(iv);
      body.encryptedKey = CryptoUtils.bufferToBase64(encKeyRecipient);
      body.senderKey = CryptoUtils.bufferToBase64(encKeySender);

    } else {
      body.group = activeChatId;

      // Use Group AES Key
      const groupKey = await getGroupAESKey(activeChatId);
      const { encrypted, iv } = await CryptoUtils.encryptAES(groupKey, payloadBuf);

      body.encryptedData = CryptoUtils.bufferToBase64(encrypted);
      body.iv = CryptoUtils.bufferToBase64(iv);
    }
    
    const url = editingMessageId 
      ? `/api/collections/${PB_MESSAGES_COLLECTION}/records/${editingMessageId}`
      : `/api/collections/${PB_MESSAGES_COLLECTION}/records`;
    
    await pbRequest(url, {
      method: editingMessageId ? 'PATCH' : 'POST',
      token: authToken,
      body: body
    });
    
    editingMessageId = null;
    sendBtn.textContent = 'Send';
    loadMessages();
  } catch (err) {
    alert(err.message);
  } finally {
    chatInput.disabled = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

// Group Modal
async function loadMembers() {
  memberList.innerHTML = 'Loading members...';
  try {
    const res = await pbRequest(`/api/collections/${PB_AUTH_COLLECTION}/records?filter=id!="${currentUser.id}"`, { token: authToken });
    const members = res.items || [];
    memberList.innerHTML = '';
    members.forEach(m => {
      const el = document.createElement('div');
      el.className = 'member-item';
      el.innerHTML = `
        <input type="checkbox" value="${m.id}" id="m-${m.id}" />
        <label for="m-${m.id}">${m.name || m.email}</label>
      `;
      memberList.appendChild(el);
    });
  } catch (err) {
    memberList.innerHTML = 'Error loading members';
  }
}

async function createGroup() {
  const name = groupNameInput.value.trim();
  if (!name) return alert('Group name is required');
  
  const selectedIds = Array.from(memberList.querySelectorAll('input:checked')).map(i => i.value);
  selectedIds.push(currentUser.id); // Creator is also a member
  
  try {
    // 1. Create the group
    const group = await pbRequest(`/api/collections/${PB_GROUPS_COLLECTION}/records`, {
      method: 'POST',
      token: authToken,
      body: {
        name: name,
        members: selectedIds,
        creator: currentUser.id
      }
    });

    // 2. Generate Group AES Key
    const groupAESKey = await CryptoUtils.generateAESKey();
    const groupAESKeyJWK = await CryptoUtils.exportAESKey(groupAESKey);
    const groupAESKeyJWKBuf = CryptoUtils.textToBuffer(groupAESKeyJWK);

    // 3. Share the key with every member (including self)
    const sharePromises = selectedIds.map(async (memberId) => {
      try {
        const memberPub = await getRemotePublicKey(memberId);
        const encKey = await CryptoUtils.encryptRSA(memberPub, groupAESKeyJWKBuf);
        const encKeyBase64 = CryptoUtils.bufferToBase64(encKey);

        await pbRequest(`/api/collections/${PB_GROUP_KEYS_COLLECTION}/records`, {
          method: 'POST',
          token: authToken,
          body: {
            group: group.id,
            user: memberId,
            encryptedKey: encKeyBase64
          }
        });
      } catch (err) {
        console.error(`Failed to share group key with ${memberId}:`, err);
      }
    });

    await Promise.all(sharePromises);

    groupModal.classList.remove('open');
    openChat(group.id, 'group', group.name);
  } catch (err) {
    alert(err.message);
  }
}

// Event Listeners
tabs.forEach(btn => {
  btn.addEventListener('click', () => {
    tabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    renderChatList();
  });
});

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', e => {
  if (e.key === 'Enter') sendMessage();
});

chatImgInput.addEventListener('change', () => {
  const file = chatImgInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = e => {
      previewImg.src = e.target.result;
      imagePreview.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  }
});

function clearImagePreview() {
  chatImgInput.value = '';
  imagePreview.style.display = 'none';
  previewImg.src = '';
}

removeImgBtn.addEventListener('click', clearImagePreview);

newGroupBtn.addEventListener('click', () => {
  groupModal.classList.add('open');
  loadMembers();
});

cancelGroupBtn.addEventListener('click', () => groupModal.classList.remove('open'));
confirmGroupBtn.addEventListener('click', createGroup);

// Initial Load
async function init() {
  const session = readSession();
  if (!session) {
    window.location.href = 'collection.html';
    return;
  }
  authToken = session.token;
  currentUser = session.record;
  
  try {
    await initEncryption();
  } catch (err) {
    console.error('Encryption initialization failed:', err);
    alert('Failed to initialize secure chat. Some features may not work.');
  }

  const urlParams = new URLSearchParams(window.location.search);
  const dmId = urlParams.get('dm');
  if (dmId) {
    try {
      const user = await pbRequest(`/api/collections/${PB_AUTH_COLLECTION}/records/${dmId}`, { token: authToken });
      openChat(dmId, 'dm', user.name || user.email.split('@')[0]);
    } catch (err) { console.error(err); }
  }
  
  renderChatList();
}

init();
