const PB_CONFIG = window.__WEBMU_POCKETBASE__ || {};
const PB_URL = PB_CONFIG.url || 'https://pocketbase.felixx.dev';
const PB_AUTH_COLLECTION = PB_CONFIG.authCollection || 'webmuser';
const PB_GAMES_COLLECTION = PB_CONFIG.gamesCollection || 'games';
const PB_MESSAGES_COLLECTION = 'webmuMessages';
const PB_GROUPS_COLLECTION = 'webmuGroups';
const PB_GROUP_KEYS_COLLECTION = 'webmuGroupKeys';
const SESSION_KEY = 'webmu-pocketbase-session';
const PRIVATE_KEY_STORAGE = 'webmu-private-key';

const CHAT_SETTINGS_KEY = 'webmu-chat-settings';
const DEFAULT_CHAT_SETTINGS = {
  position: 'bottom-right',
  opacity: 80,
  fontSize: 'medium'
};

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
    try { data = JSON.parse(text); } catch (_) { data = { message: text }; }
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

const gameOverlayPanel = document.createElement('div');
gameOverlayPanel.id = 'game-overlay-panel';
gameOverlayPanel.className = 'game-overlay-panel';
gameOverlayPanel.innerHTML = `
  <div class="overlay-tabs">
    <button class="overlay-tab active" data-tab="players">Players</button>
    <button class="overlay-tab" data-tab="chat">Chat</button>
    <button class="overlay-tab" data-tab="splits">Splits</button>
    <button class="overlay-close">&times;</button>
  </div>
  <div class="overlay-content">
    <div class="tab-panel" id="players-panel">
      <div class="players-list"></div>
    </div>
    <div class="tab-panel" id="chat-panel" style="display:none;">
      <div class="chat-messages"></div>
      <div class="chat-input-area">
        <input type="text" class="chat-input" placeholder="Type..." />
        <button class="chat-send">Send</button>
      </div>
    </div>
    <div class="tab-panel" id="splits-panel" style="display:none;">
      <div class="splits-header">
        <span class="splits-profile-name">Default</span>
      </div>
      <div class="splits-time">00:00.000</div>
      <div class="splits-delta"></div>
      <div class="splits-segments"></div>
      <div class="splits-controls">
        <span class="key-hint">F7: Start | F8: Split | F9: Reset | F10: Skip | F5: Profile</span>
      </div>
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

const SPLITS_KEY = 'webmu-splits';
let currentProfileIndex = 0;
let profiles = [];
let isSplitsRunning = false;
let startTime = 0;
let currentSegment = 0;
let segmentTimes = [];
let pausedTime = 0;

function getProfiles() {
  const raw = localStorage.getItem(SPLITS_KEY);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

function getOrCreateProfiles() {
  let profiles = getProfiles();
  if (profiles.length === 0) {
    profiles = [{ name: 'Default', gameFilter: '', segments: [{ name: 'Any%', personalBest: 0 }] }];
    localStorage.setItem(SPLITS_KEY, JSON.stringify(profiles));
  }
  return profiles;
}

function formatTime(ms) {
  if (!ms || ms <= 0) return '00:00.000';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

function formatDelta(ms) {
  if (!ms || ms === 0) return '';
  const sign = ms > 0 ? '+' : '-';
  return sign + formatTime(Math.abs(ms));
}

async function initEncryption() {
  const localPriv = localStorage.getItem(PRIVATE_KEY_STORAGE);
  const remotePub = currentUser.publicKey;
  if (localPriv && remotePub) {
    try {
      userPrivateKey = await CryptoUtils.importPrivateKey(localPriv);
      userPublicKey = await CryptoUtils.importPublicKey(remotePub);
      return;
    } catch (e) { console.error('Key import failed', e); }
  }
  const pair = await CryptoUtils.generateRSAKeyPair();
  const pubJWK = await CryptoUtils.exportPublicKey(pair.publicKey);
  const privJWK = await CryptoUtils.exportPrivateKey(pair.privateKey);
  localStorage.setItem(PRIVATE_KEY_STORAGE, privJWK);
  userPrivateKey = pair.privateKey;
  userPublicKey = pair.publicKey;
  currentUser = await pbRequest(`/api/collections/${PB_AUTH_COLLECTION}/records/${currentUser.id}`, {
    method: 'PATCH', token: authToken, body: { publicKey: pubJWK }
  });
}

async function getGroupAESKey(groupId) {
  const qs = new URLSearchParams({ filter: `group="${groupId}" && user="${currentUser.id}"` });
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
    console.error('Decrypt error:', e);
    return { text: '[Decryption error]', imageUrl: '' };
  }
}

async function loadCurrentPlayers() {
  if (!session || !currentGameName) return;
  try {
    const gameName = currentGameName.toLowerCase().replace(/\s*\(.*?\)/g, '').trim();
    const qs = new URLSearchParams({ filter: `currentlyPlaying != null`, expand: 'currentlyPlaying', perPage: '100' });
    const res = await pbRequest(`/api/collections/${PB_GAMES_COLLECTION}/records?${qs.toString()}`, { token: authToken });
    const list = gameOverlayPanel.querySelector('.players-list');
    list.innerHTML = '';
    const players = [];
    for (const game of res.items || []) {
      const expand = game.expand || {};
      const playing = expand.currentlyPlaying || [];
      for (const user of playing) {
        if (!players.find(p => p.id === user.id)) players.push(user);
      }
    }
    if (players.length === 0) {
      list.innerHTML = '<div class="no-players">No one currently playing</div>';
      return;
    }
    players.forEach(user => {
      const el = document.createElement('div');
      el.className = 'player-item';
      el.innerHTML = `
        <div class="player-avatar">${(user.name || user.email || '?')[0].toUpperCase()}</div>
        <div class="player-name">${user.name || user.email}</div>
      `;
      list.appendChild(el);
    });
  } catch (err) { console.error('[loadCurrentPlayers]', err); }
}

function fmtTime(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function loadGameChat() {
  if (!gameChatId) return;
  const qs = new URLSearchParams({ filter: `group="${gameChatId}"`, sort: 'created', expand: 'sender' });
  try {
    const res = await pbRequest(`/api/collections/${PB_MESSAGES_COLLECTION}/records?${qs.toString()}`, { token: authToken });
    const messages = res.items || [];
    if (messages.length > 0 && messages[messages.length - 1].id === lastChatMessageId) return;
    const container = gameOverlayPanel.querySelector('#chat-panel .chat-messages');
    container.innerHTML = '';
    for (const msg of messages) {
      const isSent = msg.sender === currentUser.id;
      const decrypted = await decryptMessageData(msg);
      const el = document.createElement('div');
      el.className = `chat-message ${isSent ? 'sent' : 'received'}`;
      let content = '';
      if (decrypted.imageUrl) content += `<img src="${decrypted.imageUrl}" class="msg-img" />`;
      if (decrypted.text) content += `<div class="msg-bubble">${decrypted.text}</div>`;
      el.innerHTML = `${content}<div class="msg-meta">${fmtTime(msg.created)}</div>`;
      container.appendChild(el);
    }
    if (messages.length > 0) {
      lastChatMessageId = messages[messages.length - 1].id;
      container.scrollTop = container.scrollHeight;
    } else {
      container.innerHTML = '<div class="no-messages">No messages yet for this game</div>';
    }
  } catch (err) { console.error('[loadGameChat]', err); }
}

async function findOrCreateGameChat(gameName) {
  const groupName = `${gameName}_chat`;
  const qs = new URLSearchParams({ filter: `name="${groupName}"`, perPage: '1' });
  try {
    let res = await pbRequest(`/api/collections/${PB_GROUPS_COLLECTION}/records?${qs.toString()}`, { token: authToken });
    if (res.items && res.items.length > 0) return res.items[0].id;
    const group = await pbRequest(`/api/collections/${PB_GROUPS_COLLECTION}/records`, {
      method: 'POST', token: authToken,
      body: { name: groupName, members: [currentUser.id], creator: currentUser.id }
    });
    return group.id;
  } catch (err) { console.error('[findOrCreateGameChat]', err); return null; }
}

function renderSplits() {
  const profile = profiles[currentProfileIndex];
  if (!profile) return;
  const sp = gameOverlayPanel.querySelector('#splits-panel');
  sp.querySelector('.splits-profile-name').textContent = profile.name;
  const totalTime = isSplitsRunning ? Date.now() - startTime + pausedTime : pausedTime;
  sp.querySelector('.splits-time').textContent = formatTime(totalTime);
  if (profile.segments.length > 0) {
    const pbTotal = profile.segments.reduce((sum, s) => sum + (s.personalBest || 0), 0);
    const delta = totalTime - pbTotal;
    const deltaEl = sp.querySelector('.splits-delta');
    deltaEl.textContent = formatDelta(delta);
    deltaEl.className = 'splits-delta ' + (delta > 0 ? 'behind' : delta < 0 ? 'ahead' : '');
  }
  const segContainer = sp.querySelector('.splits-segments');
  segContainer.innerHTML = '';
  profile.segments.forEach((seg, idx) => {
    const el = document.createElement('div');
    el.className = 'split-segment';
    if (idx === currentSegment) el.classList.add('current');
    if (segmentTimes[idx] !== undefined) el.classList.add('completed');
    const time = segmentTimes[idx] || 0;
    el.innerHTML = `<span class="seg-name">${seg.name}</span><span class="seg-time">${formatTime(time)}</span>`;
    segContainer.appendChild(el);
  });
}

function startSplits() {
  if (isSplitsRunning) return;
  isSplitsRunning = true;
  startTime = Date.now();
  pausedTime = 0;
  currentSegment = 0;
  segmentTimes = [];
  renderSplits();
}

function split() {
  if (!isSplitsRunning) return;
  const profile = profiles[currentProfileIndex];
  if (!profile) return;
  const now = Date.now() - startTime + pausedTime;
  segmentTimes[currentSegment] = now;
  if (profile.segments[currentSegment]) {
    profile.segments[currentSegment].personalBest = Math.min(profile.segments[currentSegment].personalBest || now, now);
    localStorage.setItem(SPLITS_KEY, JSON.stringify(profiles));
  }
  if (currentSegment < profile.segments.length - 1) currentSegment++;
  else isSplitsRunning = false;
  renderSplits();
}

function resetSplits() {
  isSplitsRunning = false;
  currentSegment = 0;
  segmentTimes = [];
  pausedTime = 0;
  renderSplits();
}

function skipSegment() {
  if (!isSplitsRunning) return;
  const profile = profiles[currentProfileIndex];
  if (!profile) return;
  segmentTimes[currentSegment] = -1;
  if (currentSegment < profile.segments.length - 1) currentSegment++;
  else isSplitsRunning = false;
  renderSplits();
}

function switchProfile(delta) {
  if (profiles.length <= 1) return;
  currentProfileIndex = (currentProfileIndex + delta + profiles.length) % profiles.length;
  resetSplits();
  renderSplits();
}

const tabs = gameOverlayPanel.querySelectorAll('.overlay-tab');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    gameOverlayPanel.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
    const panel = gameOverlayPanel.querySelector(`#${tab.dataset.tab}-panel`);
    if (panel) panel.style.display = 'flex';
    
    if (tab.dataset.tab === 'players') {
      loadCurrentPlayers();
      if (!playersPollInterval) {
        playersPollInterval = setInterval(loadCurrentPlayers, 5000);
      }
    } else if (tab.dataset.tab === 'chat' && !chatPollInterval) {
      loadGameChat();
      chatPollInterval = setInterval(loadGameChat, 3000);
    } else if (tab.dataset.tab === 'splits') {
      renderSplits();
    }
  });
});

gameOverlayPanel.querySelector('.overlay-close').addEventListener('click', () => {
  gameOverlayPanel.style.display = 'none';
  window.WebMuGameOverlay = false;
});

const chatInput = gameOverlayPanel.querySelector('.chat-input');
const chatSendBtn = gameOverlayPanel.querySelector('.chat-send');
chatSendBtn.addEventListener('click', async () => {
  const text = chatInput.value.trim();
  if (!text || !gameChatId) return;
  chatInput.value = '';
  try {
    const payload = JSON.stringify({ text, imageUrl: '' });
    const payloadBuf = CryptoUtils.textToBuffer(payload);
    const groupKey = await getGroupAESKey(gameChatId);
    const { encrypted, iv } = await CryptoUtils.encryptAES(groupKey, payloadBuf);
    const body = { group: gameChatId, sender: currentUser.id, encryptedData: CryptoUtils.bufferToBase64(encrypted), iv: CryptoUtils.bufferToBase64(iv) };
    await pbRequest(`/api/collections/${PB_MESSAGES_COLLECTION}/records`, { method: 'POST', token: authToken, body });
    loadGameChat();
  } catch (err) { console.error('[sendMessage]', err); }
});

chatInput.addEventListener('keypress', e => { if (e.key === 'Enter') chatSendBtn.click(); });

document.addEventListener('keydown', e => {
  if (!window.WebMuGameActive) return;
  if (e.key === 'Tab') {
    e.preventDefault();
    if (gameOverlayPanel.style.display === 'none' || !gameOverlayPanel.style.display) {
      gameOverlayPanel.style.display = 'flex';
      window.WebMuGameOverlay = true;
      loadCurrentPlayers();
      if (!playersPollInterval) playersPollInterval = setInterval(loadCurrentPlayers, 5000);
    } else {
      gameOverlayPanel.style.display = 'none';
      window.WebMuGameOverlay = false;
    }
    return;
  }
  if (!window.WebMuGameOverlay) return;
  switch (e.key) {
    case 'F7': e.preventDefault(); if (!isSplitsRunning) startSplits(); break;
    case 'F8': e.preventDefault(); if (isSplitsRunning) split(); break;
    case 'F9': e.preventDefault(); resetSplits(); break;
    case 'F10': e.preventDefault(); skipSegment(); break;
    case 'F5': e.preventDefault(); switchProfile(e.shiftKey ? -1 : 1); break;
  }
});

document.body.appendChild(gameOverlayPanel);

async function initOverlay(gameName) {
  session = readSession();
  if (!session) return;
  authToken = session.token;
  currentUser = session.record;
  currentGameName = gameName;
  profiles = getOrCreateProfiles();
  currentProfileIndex = 0;
  if (gameName) {
    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      if (profile.gameFilter) {
        try {
          const regex = new RegExp(profile.gameFilter, 'i');
          if (regex.test(gameName)) { currentProfileIndex = i; break; }
        } catch {
          if (profile.gameFilter.toLowerCase().includes(gameName.toLowerCase())) { currentProfileIndex = i; break; }
        }
      }
    }
  }
  try {
    await initEncryption();
    gameChatId = await findOrCreateGameChat(gameName);
  } catch (err) { console.error('[initOverlay]', err); }
}

function cleanupOverlay() {
  if (playersPollInterval) { clearInterval(playersPollInterval); playersPollInterval = null; }
  if (chatPollInterval) { clearInterval(chatPollInterval); chatPollInterval = null; }
}

window.WebMuOverlay = { initOverlay, cleanupOverlay, startSplits, split, resetSplits, skipSegment, switchProfile };