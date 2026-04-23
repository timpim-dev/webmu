const PB_CONFIG = window.__WEBMU_POCKETBASE__ || {};
const PB_URL = PB_CONFIG.url || 'https://pocketbase.felixx.dev';
const PB_AUTH_COLLECTION = PB_CONFIG.authCollection || 'webmuser';
const PB_GAMES_COLLECTION = PB_CONFIG.gamesCollection || 'games';
const SESSION_KEY = 'webmu-pocketbase-session';

const ADMIN_EMAIL = 'account@felixx.dev';

const systemSelect = document.getElementById('systemSelect');
const gameNameInput = document.getElementById('gameNameInput');
const romFileInput = document.getElementById('romFileInput');
const coverUrlInput = document.getElementById('coverUrlInput');
const publicCheck = document.getElementById('publicCheck');
const uploadBtn = document.getElementById('uploadBtn');
const uploadStatus = document.getElementById('uploadStatus');
const gamesList = document.getElementById('gamesList');

let currentUser = null;
let authToken = '';

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

function checkAdmin() {
  const session = readSession();
  if (!session) {
    window.location.href = 'collection.html';
    return false;
  }
  
  const email = session.record?.email?.toLowerCase();
  if (email !== ADMIN_EMAIL.toLowerCase()) {
    window.location.href = 'collection.html';
    return false;
  }
  
  authToken = session.token;
  currentUser = session.record;
  return true;
}

async function loadGames() {
  try {
    const res = await pbRequest(`/api/collections/${PB_GAMES_COLLECTION}/records?perPage=100`, {
      token: authToken
    });
    
    const games = res.items || [];
    gamesList.innerHTML = '';
    
    if (games.length === 0) {
      gamesList.innerHTML = '<div class="library-meta">No games uploaded yet.</div>';
      return;
    }
    
    games.forEach(game => {
      const el = document.createElement('div');
      el.className = 'uploaded-game-item';
      el.innerHTML = `
        <div class="game-info">
          <div class="game-name">${game.name}</div>
          <div class="game-system">${game.system}${game.public ? ' · Public' : ''}</div>
        </div>
        <button class="btn delete-btn" data-id="${game.id}">Delete</button>
      `;
      gamesList.appendChild(el);
    });
    
    gamesList.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this game?')) return;
        try {
          await pbRequest(`/api/collections/${PB_GAMES_COLLECTION}/records/${btn.dataset.id}`, {
            method: 'DELETE',
            token: authToken
          });
          loadGames();
        } catch (e) {
          uploadStatus.textContent = 'Error deleting: ' + e.message;
        }
      });
    });
  } catch (e) {
    gamesList.innerHTML = '<div class="library-meta">Error loading games.</div>';
  }
}

async function uploadGame() {
  const system = systemSelect.value;
  const gameName = gameNameInput.value.trim();
  const romFile = romFileInput.files[0];
  const coverUrl = coverUrlInput.value.trim();
  const isPublic = publicCheck.checked;
  
  if (!gameName || !romFile) {
    uploadStatus.textContent = 'Please fill in all required fields.';
    return;
  }
  
  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Uploading...';
  uploadStatus.textContent = '';
  
  try {
    const formData = new FormData();
    formData.append('name', gameName);
    formData.append('system', system);
    formData.append('romFile', romFile);
    formData.append('source', 'manual');
    if (coverUrl) {
      formData.append('coverUrl', coverUrl);
    }
    formData.append('public', isPublic ? 'true' : 'false');
    
    const res = await fetch(pbUrl(`/api/collections/${PB_GAMES_COLLECTION}/records`), {
      method: 'POST',
      headers: { Authorization: authToken },
      body: formData
    });
    
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Upload failed');
    }
    
    uploadStatus.textContent = 'Game uploaded successfully!';
    gameNameInput.value = '';
    romFileInput.value = '';
    coverUrlInput.value = '';
    publicCheck.checked = false;
    loadGames();
  } catch (e) {
    uploadStatus.textContent = 'Error: ' + e.message;
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Upload Game';
  }
}

uploadBtn.addEventListener('click', uploadGame);

if (checkAdmin()) {
  loadGames();
}