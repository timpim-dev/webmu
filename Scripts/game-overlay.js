const PLAYERS_KEY = 'webmu-players-settings';
const CHAT_SETTINGS_KEY = 'webmu-chat-settings';

const PB_CONFIG = window.__WEBMU_POCKETBASE__ || {};
const PB_URL = PB_CONFIG.url || 'https://pocketbase.felixx.dev';
const PB_AUTH_COLLECTION = PB_CONFIG.authCollection || 'webmuser';
const PB_GAMES_COLLECTION = PB_CONFIG.gamesCollection || 'games';
const PB_MESSAGES_COLLECTION = 'webmuMessages';
const PB_GROUPS_COLLECTION = 'webmuGroups';
const PB_GROUP_KEYS_COLLECTION = 'webmuGroupKeys';
const SESSION_KEY = 'webmu-pocketbase-session';
const PRIVATE_KEY_STORAGE = 'webmu-private-key';

const DEFAULT_PLAYERS_SETTINGS = {
  position: 'top-left',
  opacity: 80,
  fontSize: 'medium',
  visible: false
};

const DEFAULT_CHAT_SETTINGS = {
  position: 'bottom-right',
  opacity: 80,
  fontSize: 'medium',
  visible: false,
  toggleKey: 'F6'
};

function getPlayersSettings() {
  const raw = localStorage.getItem(PLAYERS_KEY);
  try {
    return raw ? JSON.parse(raw) : DEFAULT_PLAYERS_SETTINGS;
  } catch {
    return DEFAULT_PLAYERS_SETTINGS;
  }
}

function savePlayersSettings(settings) {
  localStorage.setItem(PLAYERS_KEY, JSON.stringify(settings));
}

function getChatSettings() {
  const raw = localStorage.getItem(CHAT_SETTINGS_KEY);
  try {
    return raw ? JSON.parse(raw) : DEFAULT_CHAT_SETTINGS;
  } catch {
    return DEFAULT_CHAT_SETTINGS;
  }
}

function saveChatSettings(settings) {
  localStorage.setItem(CHAT_SETTINGS_KEY, JSON.stringify(settings));
}

function pbUrl(path) {
  return `${PB_URL}${path}`;
}

function readSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return (parsed?.token && parsed?.record?.id) ? parsed : null;
  } catch (_) {
    return null;
  }
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
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = { message: text };
    }
  }
  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data;
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const playersPanel = document.createElement('div');
playersPanel.id = 'players-panel';
playersPanel.className = 'game-overlay';
playersPanel.style.display = 'none';
playersPanel.innerHTML = `
  <div class="overlay-header">
    <span>Currently Playing</span>
    <button class="overlay-close">&times;</button>
  </div>
  <div class="players-list"></div>
`;

const chatPanel = document.createElement('div');
chatPanel.id = 'chat-panel';
chatPanel.className = 'game-overlay';
chatPanel.style.display = 'none';
chatPanel.innerHTML = `
  <div class="overlay-header">
    <span>Game Chat</span>
    <button class="overlay-settings">⚙</button>
  </div>
  <div class="chat-messages"></div>
  <div class="chat-input-area">
    <input type="text" class="chat-input" placeholder="Type a message..." />
    <input type="file" class="chat-img-input" accept="image/*" hidden />
    <button class="chat-img-btn">📷</button>
    <button class="chat-send">Send</button>
  </div>
`;

const settingsModal = document.createElement('div');
settingsModal.id = 'overlay-settings-modal';
settingsModal.className = 'modal';
settingsModal.style.display = 'none';
settingsModal.innerHTML = `
  <div class="modal-content">
    <h3>Chat Settings</h3>
    <div class="setting-group">
      <label>Position</label>
      <select class="setting-position">
        <option value="top-left">Top Left</option>
        <option value="top-right">Top Right</option>
        <option value="bottom-left">Bottom Left</option>
        <option value="bottom-right">Bottom Right</option>
      </select>
    </div>
    <div class="setting-group">
      <label>Opacity</label>
      <input type="range" class="setting-opacity" min="10" max="100" value="80" />
    </div>
    <div class="setting-group">
      <label>Font Size</label>
      <select class="setting-font">
        <option value="small">Small</option>
        <option value="medium">Medium</option>
        <option value="large">Large</option>
      </select>
    </div>
    <div class="setting-group">
      <label>Toggle Key</label>
      <select class="setting-key">
        <option value="F6">F6</option>
        <option value="F7">F7</option>
        <option value="F8">F8</option>
        <option value="F9">F9</option>
        <option value="F10">F10</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn close-settings">Done</button>
    </div>
  </div>
`;

let session = null;
let authToken = '';
let currentUser = null;
let userPrivateKey = null;
let userPublicKey = null;
let currentGameName = '';
let gameChatId = null;
let chatPollInterval = null;
let playersPollInterval = null;
let lastChatMessageId = null;

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

  const pair = await CryptoUtils.generateRSAKeyPair();
  const pubJWK = await CryptoUtils.exportPublicKey(pair.publicKey);
  const privJWK = await CryptoUtils.exportPrivateKey(pair.privateKey);

  localStorage.setItem(PRIVATE_KEY_STORAGE, privJWK);
  userPrivateKey = pair.privateKey;
  userPublicKey = pair.publicKey;

  currentUser = await pbRequest(`/api/collections/${PB_AUTH_COLLECTION}/records/${currentUser.id}`, {
    method: 'PATCH',
    token: authToken,
    body: { publicKey: pubJWK }
  });
}

async function getGroupAESKey(groupId) {
  const qs = new URLSearchParams({
    filter: `group="${groupId}" && user="${currentUser.id}"`
  });
  const res = await pbRequest(`/api/collections/${PB_GROUP_KEYS_COLLECTION}/records?${qs.toString()}`, { token: authToken });
  if (!res.items.length) throw new Error('No access to group key');

  const encryptedKeyBuf = CryptoUtils.base64ToBuffer(res.items[0].encryptedKey);
  const decryptedJWKBuf = await CryptoUtils.decryptRSA(userPrivateKey, encryptedKeyBuf);
  const jwkStr = CryptoUtils.bufferToText(decryptedJWKBuf);
  return await CryptoUtils.importAESKey(jwkStr);
}

async function decryptMessageData(msg) {
  try {
    if (!msg.encryptedData || !msg.iv) return { text: '[Unencrypted]', imageUrl: '' };

    const aesKey = await getGroupAESKey(msg.group);
    const encryptedDataBuf = CryptoUtils.base64ToBuffer(msg.encryptedData);
    const ivBuf = CryptoUtils.base64ToBuffer(msg.iv);
    const decryptedBuf = await CryptoUtils.decryptAES(aesKey, encryptedDataBuf, ivBuf);
    const payloadStr = CryptoUtils.bufferToText(decryptedBuf);
    return JSON.parse(payloadStr);
  } catch (e) {
    console.error('Decryption error:', e);
    return { text: '[Decryption error]', imageUrl: '' };
  }
}

async function loadCurrentPlayers() {
  if (!session || !currentGameName) return;

  try {
    const gameName = currentGameName.toLowerCase().replace(/\s*\(.*?\)/g, '').trim();

    const qs = new URLSearchParams({
      filter: `currentlyPlaying != null`,
      expand: 'currentlyPlaying',
      perPage: '100'
    });

    const res = await pbRequest(`/api/collections/${PB_GAMES_COLLECTION}/records?${qs.toString()}`, { token: authToken });

    const playersList = playersPanel.querySelector('.players-list');
    playersList.innerHTML = '';

    const players = [];
    for (const game of res.items || []) {
      const expand = game.expand || {};
      const playing = expand.currentlyPlaying || [];
      for (const user of playing) {
        if (!players.find(p => p.id === user.id)) {
          players.push(user);
        }
      }
    }

    if (players.length === 0) {
      playersList.innerHTML = '<div class="no-players">No one currently playing</div>';
      return;
    }

    players.forEach(user => {
      const el = document.createElement('div');
      el.className = 'player-item';
      el.innerHTML = `
        <div class="player-avatar">${(user.name || user.email || '?')[0].toUpperCase()}</div>
        <div class="player-name">${user.name || user.email}</div>
      `;
      playersList.appendChild(el);
    });
  } catch (err) {
    console.error('[loadCurrentPlayers]', err);
  }
}

function fmtTime(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function loadGameChat() {
  if (!gameChatId) return;

  const qs = new URLSearchParams({
    filter: `group="${gameChatId}"`,
    sort: 'created',
    expand: 'sender'
  });

  try {
    const res = await pbRequest(`/api/collections/${PB_MESSAGES_COLLECTION}/records?${qs.toString()}`, { token: authToken });
    const messages = res.items || [];

    if (messages.length > 0 && messages[messages.length - 1].id === lastChatMessageId) return;

    const container = chatPanel.querySelector('.chat-messages');
    container.innerHTML = '';

    for (const msg of messages) {
      const isSent = msg.sender === currentUser.id;
      const decrypted = await decryptMessageData(msg);

      const el = document.createElement('div');
      el.className = `chat-message ${isSent ? 'sent' : 'received'}`;

      let content = '';
      if (decrypted.imageUrl) content += `<img src="${decrypted.imageUrl}" class="msg-img" />`;
      if (decrypted.text) content += `<div class="msg-bubble">${decrypted.text}</div>`;

      const senderName = msg.expand?.sender?.name || msg.expand?.sender?.email?.split('@')[0] || '?';

      el.innerHTML = `
        ${content}
        <div class="msg-meta">${fmtTime(msg.created)}</div>
      `;
      container.appendChild(el);
    }

    if (messages.length > 0) {
      lastChatMessageId = messages[messages.length - 1].id;
      container.scrollTop = container.scrollHeight;
    } else {
      container.innerHTML = '<div class="no-messages">No messages yet for this game</div>';
    }
  } catch (err) {
    console.error('[loadGameChat]', err);
  }
}

async function findOrCreateGameChat(gameName) {
  const groupName = `${gameName}_chat`;

  const qs = new URLSearchParams({
    filter: `name="${groupName}"`,
    perPage: '1'
  });

  try {
    let res = await pbRequest(`/api/collections/${PB_GROUPS_COLLECTION}/records?${qs.toString()}`, { token: authToken });

    if (res.items && res.items.length > 0) {
      return res.items[0].id;
    }

    const group = await pbRequest(`/api/collections/${PB_GROUPS_COLLECTION}/records`, {
      method: 'POST',
      token: authToken,
      body: {
        name: groupName,
        members: [currentUser.id],
        creator: currentUser.id
      }
    });

    return group.id;
  } catch (err) {
    console.error('[findOrCreateGameChat]', err);
    return null;
  }
}

function togglePlayersPanel() {
  const settings = getPlayersSettings();
  settings.visible = !settings.visible;
  savePlayersSettings(settings);
  playersPanel.style.display = settings.visible ? 'flex' : 'none';

  if (settings.visible && !playersPollInterval) {
    loadCurrentPlayers();
    playersPollInterval = setInterval(loadCurrentPlayers, 5000);
  } else if (!settings.visible && playersPollInterval) {
    clearInterval(playersPollInterval);
    playersPollInterval = null;
  }
}

function toggleChatPanel() {
  const settings = getChatSettings();
  settings.visible = !settings.visible;
  saveChatSettings(settings);
  chatPanel.style.display = settings.visible ? 'flex' : 'none';

  if (!settings.visible && chatPollInterval) {
    clearInterval(chatPollInterval);
    chatPollInterval = null;
  }
}

function updatePlayersPanelPosition(position) {
  const settings = getPlayersSettings();
  settings.position = position;
  savePlayersSettings(settings);
  playersPanel.className = 'game-overlay players-' + position;
}

function updateChatPanelPosition(position) {
  const settings = getChatSettings();
  settings.position = position;
  saveChatSettings(settings);
  chatPanel.className = 'game-overlay chat-' + position;
}

function updateChatPanelOpacity(opacity) {
  const settings = getChatSettings();
  settings.opacity = opacity;
  saveChatSettings(settings);
  chatPanel.style.opacity = (opacity / 100).toString();
}

function updateChatPanelFontSize(size) {
  const settings = getChatSettings();
  settings.fontSize = size;
  saveChatSettings(settings);

  const fontMap = { small: '12px', medium: '14px', large: '16px' };
  chatPanel.style.fontSize = fontMap[size] || '14px';
}

playersPanel.querySelector('.overlay-close').addEventListener('click', togglePlayersPanel);
chatPanel.querySelector('.overlay-settings').addEventListener('click', () => {
  settingsModal.style.display = 'flex';

  const settings = getChatSettings();
  settingsModal.querySelector('.setting-position').value = settings.position;
  settingsModal.querySelector('.setting-opacity').value = settings.opacity;
  settingsModal.querySelector('.setting-font').value = settings.fontSize;
  settingsModal.querySelector('.setting-key').value = settings.toggleKey;
});

settingsModal.querySelector('.close-settings').addEventListener('click', () => {
  settingsModal.style.display = 'none';

  updateChatPanelPosition(settingsModal.querySelector('.setting-position').value);
  updateChatPanelOpacity(parseInt(settingsModal.querySelector('.setting-opacity').value));
  updateChatPanelFontSize(settingsModal.querySelector('.setting-font').value);
});

document.body.appendChild(playersPanel);
document.body.appendChild(chatPanel);
document.body.appendChild(settingsModal);

let chatInput = chatPanel.querySelector('.chat-input');
let chatSendBtn = chatPanel.querySelector('.chat-send');
let chatImgInput = chatPanel.querySelector('.chat-img-input');
let chatImgBtn = chatPanel.querySelector('.chat-img-btn');

chatSendBtn.addEventListener('click', async () => {
  const text = chatInput.value.trim();
  const file = chatImgInput.files[0];

  if (!text && !file) return;
  if (!gameChatId) return;

  chatInput.value = '';
  chatInput.disabled = true;
  chatSendBtn.disabled = true;

  try {
    let imageUrl = '';
    if (file) {
      imageUrl = await fileToBase64(file);
    }

    const payload = JSON.stringify({ text, imageUrl });
    const payloadBuf = CryptoUtils.textToBuffer(payload);

    const groupKey = await getGroupAESKey(gameChatId);
    const { encrypted, iv } = await CryptoUtils.encryptAES(groupKey, payloadBuf);

    const body = {
      group: gameChatId,
      sender: currentUser.id,
      encryptedData: CryptoUtils.bufferToBase64(encrypted),
      iv: CryptoUtils.bufferToBase64(iv)
    };

    await pbRequest(`/api/collections/${PB_MESSAGES_COLLECTION}/records`, {
      method: 'POST',
      token: authToken,
      body: body
    });

    loadGameChat();
  } catch (err) {
    console.error('[sendMessage]', err);
    alert(err.message);
  } finally {
    chatInput.disabled = false;
    chatSendBtn.disabled = false;
    chatInput.focus();
  }
});

chatInput.addEventListener('keypress', e => {
  if (e.key === 'Enter') chatSendBtn.click();
});

chatImgBtn.addEventListener('click', () => chatImgInput.click());

chatImgInput.addEventListener('change', () => {
  if (chatImgInput.files[0]) {
    chatInput.placeholder = 'Image selected';
  }
});

document.addEventListener('keydown', e => {
  if (!window.WebMuGameActive) return;
  if (e.key === 'Tab') {
    e.preventDefault();
    togglePlayersPanel();
  }

  const chatSettings = getChatSettings();
  if (e.key === chatSettings.toggleKey) {
    e.preventDefault();
    if (chatSettings.visible) {
      if (chatPollInterval) {
        clearInterval(chatPollInterval);
        chatPollInterval = null;
      }
      chatPanel.style.display = 'none';
      chatSettings.visible = false;
      saveChatSettings(chatSettings);
    } else {
      if (!gameChatId) {
        (async () => {
          gameChatId = await findOrCreateGameChat(currentGameName);
          if (gameChatId && chatSettings.visible) {
            loadGameChat();
            chatPollInterval = setInterval(loadGameChat, 3000);
          }
        })();
      } else {
        loadGameChat();
        chatPollInterval = setInterval(loadGameChat, 3000);
      }
      chatPanel.style.display = 'flex';
      chatSettings.visible = true;
      saveChatSettings(chatSettings);
    }
  }
});

async function initOverlay(gameName) {
  session = readSession();
  if (!session) return;

  authToken = session.token;
  currentUser = session.record;
  currentGameName = gameName;

  try {
    await initEncryption();

    const playersSettings = getPlayersSettings();
    playersPanel.className = 'game-overlay players-' + playersSettings.position;
    playersPanel.style.opacity = (playersSettings.opacity / 100).toString();

    const chatSettings = getChatSettings();
    chatPanel.className = 'game-overlay chat-' + chatSettings.position;
    chatPanel.style.opacity = (chatSettings.opacity / 100).toString();

    const fontMap = { small: '12px', medium: '14px', large: '16px' };
    chatPanel.style.fontSize = fontMap[chatSettings.fontSize] || '14px';

    gameChatId = await findOrCreateGameChat(gameName);
  } catch (err) {
    console.error('[initOverlay]', err);
  }
}

function cleanupOverlay() {
  if (playersPollInterval) {
    clearInterval(playersPollInterval);
    playersPollInterval = null;
  }
  if (chatPollInterval) {
    clearInterval(chatPollInterval);
    chatPollInterval = null;
  }
}

window.WebMuOverlay = {
  initOverlay,
  cleanupOverlay,
  togglePlayersPanel,
  toggleChatPanel,
  getChatSettings,
  saveChatSettings
};