const PB_CONFIG = window.__WEBMU_POCKETBASE__ || {};
const PB_URL = PB_CONFIG.url || 'https://pocketbase.felixx.dev';
const PB_AUTH_COLLECTION = PB_CONFIG.authCollection || 'webmuser';
const PB_GAMES_COLLECTION = PB_CONFIG.gamesCollection || 'games';
const PB_SESSION_KEY = 'webmu-pocketbase-session';

const SYSTEM_LABELS = {
  nes: 'NES / Famicom', snes: 'Super NES', gameboy: 'Game Boy / GBC / GBA',
  gamewatch: 'Game & Watch', genesis: 'Genesis', gamegear: 'Game Gear',
  playstation: 'PlayStation', psp: 'PSP', n64: 'Nintendo 64', nds: 'Nintendo DS',
};

const SYSTEM_PAGES = {
  nes: 'nes.html', snes: 'snes.html', gameboy: 'gameboy.html',
  gamewatch: 'gamewatch.html', genesis: 'genesis.html', gamegear: 'gamegear.html',
  playstation: 'playstation.html', psp: 'psp.html', n64: 'n64.html', nds: 'nds.html',
};

const COVER_REPOS = {
  nes: 'Nintendo_-_Nintendo_Entertainment_System',
  snes: 'Nintendo_-_Super_Nintendo_Entertainment_System',
  gameboy: 'Nintendo_-_Game_Boy',
  gamewatch: 'Nintendo_-_Game_and_Watch',
  genesis: 'Sega_-_Mega_Drive_-_Genesis',
  gamegear: 'Sega_-_Game_Gear',
  playstation: 'Sony_-_PlayStation',
  psp: 'Sony_-_PlayStation_Portable',
  n64: 'Nintendo_-_Nintendo_64',
  nds: 'Nintendo_-_Nintendo_DS',
};

const EXT_TO_SYSTEM = {
  nes: 'nes', fds: 'nes', sfc: 'snes', smc: 'snes',
  gb: 'gameboy', gbc: 'gameboy', gba: 'gameboy', mgw: 'gamewatch',
  md: 'genesis', gen: 'genesis', smd: 'genesis',
  gg: 'gamegear', sms: 'gamegear',
  cue: 'playstation', cso: 'psp',
  n64: 'n64', z64: 'n64', v64: 'n64',
  nds: 'nds', srl: 'nds',
  bin: null, iso: null, img: null, pbp: null, rom: null,
};

const ROM_EXTENSIONS = new Set(Object.keys(EXT_TO_SYSTEM));

function detectSystem(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return EXT_TO_SYSTEM[ext] ?? null;
}

function isRomFile(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return ROM_EXTENSIONS.has(ext);
}

const IDB_NAME = 'webmu-roms';
const IDB_VERSION = 1;
const IDB_STORE = 'roms';

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

const idb = await openIDB();

async function saveRom(id, file) {
  const tx = idb.transaction(IDB_STORE, 'readwrite');
  tx.objectStore(IDB_STORE).put(file, id);
  return new Promise((res, rej) => {
    tx.oncomplete = res;
    tx.onerror = rej;
  });
}

async function getRom(id) {
  const tx = idb.transaction(IDB_STORE, 'readonly');
  const req = tx.objectStore(IDB_STORE).get(id);
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result || null);
    req.onerror = rej;
  });
}

async function deleteRom(id) {
  const tx = idb.transaction(IDB_STORE, 'readwrite');
  tx.objectStore(IDB_STORE).delete(id);
  return new Promise((res, rej) => {
    tx.oncomplete = res;
    tx.onerror = rej;
  });
}

function getDeviceId() {
  let id = localStorage.getItem('webmu-device-id');
  if (!id) {
    id = 'device-' + Math.random().toString(36).slice(2);
    localStorage.setItem('webmu-device-id', id);
  }
  return id;
}

function buildCoverUrl(repo, name) {
  return `https://cdn.jsdelivr.net/gh/libretro-thumbnails/${repo}@master/Named_Boxarts/${encodeURIComponent(name)}.png`;
}

async function fetchCover(name, system) {
  const repo = COVER_REPOS[system];
  if (!repo) return null;

  for (const n of [name, name.replace(/\s*\(.*?\)/g, '').trim()]) {
    const url = buildCoverUrl(repo, n);
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) return url;
    } catch (_) {}
  }
  return null;
}

async function scanCoverCandidates(name, system) {
  const repo = COVER_REPOS[system];
  if (!repo) return [];

  const candidates = [
    { label: name, query: name },
    { label: name.replace(/\s*\(.*?\)/g, '').trim(), query: name.replace(/\s*\(.*?\)/g, '').trim() },
    { label: name + ' (USA)', query: name + ' (USA)' },
    { label: name + ' (Europe)', query: name + ' (Europe)' },
    { label: name + ' (Japan)', query: name + ' (Japan)' },
    { label: name + ' (World)', query: name + ' (World)' },
  ].filter((c, i, arr) => c.query && arr.findIndex(x => x.query === c.query) === i);

  const results = [];
  for (const c of candidates) {
    const url = buildCoverUrl(repo, c.query);
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) results.push({ url, label: c.label });
    } catch (_) {}
  }
  return results;
}

function compressImage(file, maxSize = 400) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > h) {
          h = Math.round(h * maxSize / w);
          w = maxSize;
        } else {
          w = Math.round(w * maxSize / h);
          h = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function compressAvatar(file) {
  return compressImage(file, 200);
}

function pbUrl(path) {
  return `${PB_URL}${path}`;
}

function extractPbMessage(payload, fallback) {
  if (!payload || typeof payload !== 'object') return fallback;

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }

  if (payload.data && typeof payload.data === 'object') {
    for (const key of Object.keys(payload.data)) {
      const item = payload.data[key];
      if (item && typeof item.message === 'string' && item.message.trim()) {
        return item.message;
      }
    }
  }

  return fallback;
}

async function pbRequest(path, { method = 'GET', token = null, body = null } = {}) {
  const headers = {
    Accept: 'application/json',
  };

  if (token) {
    headers.Authorization = token;
  }

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

  if (!res.ok) {
    throw new Error(extractPbMessage(data, `PocketBase request failed (${res.status})`));
  }

  return data;
}

function authStorageKey() {
  return PB_SESSION_KEY;
}

function readStoredSession() {
  const raw = localStorage.getItem(authStorageKey());
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.token || !parsed.record) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function storeSession(token, record) {
  localStorage.setItem(authStorageKey(), JSON.stringify({ token, record }));
}

function clearSession() {
  localStorage.removeItem(authStorageKey());
}

function displayNameFor(record) {
  return record?.name?.trim() || record?.email?.split('@')[0] || 'User';
}

function avatarFor(record) {
  return record?.photoBase64 || record?.avatarBase64 || record?.avatar || '';
}

function storeLaunchMeta(meta) {
  sessionStorage.setItem('webmu-launch-meta', JSON.stringify({
    ...meta,
    launchedAt: Date.now(),
  }));
}

async function createAuthUser(email, password) {
  await pbRequest(`/api/collections/${PB_AUTH_COLLECTION}/records`, {
    method: 'POST',
    body: {
      email,
      password,
      passwordConfirm: password,
      name: email.split('@')[0] || 'User',
    },
  });
}

async function loginAuthUser(email, password) {
  return pbRequest(`/api/collections/${PB_AUTH_COLLECTION}/auth-with-password`, {
    method: 'POST',
    body: {
      identity: email,
      password,
    },
  });
}

async function refreshAuthUser(token) {
  return pbRequest(`/api/collections/${PB_AUTH_COLLECTION}/auth-refresh`, {
    method: 'POST',
    token,
  });
}

async function updateCurrentUser(data) {
  if (!currentUser || !authToken) return null;
  const updated = await pbRequest(`/api/collections/${PB_AUTH_COLLECTION}/records/${currentUser.id}`, {
    method: 'PATCH',
    token: authToken,
    body: data,
  });
  currentUser = updated;
  storeSession(authToken, currentUser);
  return updated;
}

async function listGames(ownerId) {
  const items = [];
  let page = 1;
  let totalPages = 1;

  do {
    const qs = new URLSearchParams({
      page: String(page),
      perPage: '200',
      sort: '-created',
      filter: `owner="${ownerId}"`,
    });
    const res = await pbRequest(`/api/collections/${PB_GAMES_COLLECTION}/records?${qs.toString()}`, {
      token: authToken,
    });
    items.push(...(res.items || []));
    totalPages = res.totalPages || 1;
    page += 1;
  } while (page <= totalPages);

  return items;
}

async function createGameRecord(payload) {
  return pbRequest(`/api/collections/${PB_GAMES_COLLECTION}/records`, {
    method: 'POST',
    token: authToken,
    body: payload,
  });
}

async function updateGameRecord(id, payload) {
  return pbRequest(`/api/collections/${PB_GAMES_COLLECTION}/records/${id}`, {
    method: 'PATCH',
    token: authToken,
    body: payload,
  });
}

async function deleteGameRecord(id) {
  return pbRequest(`/api/collections/${PB_GAMES_COLLECTION}/records/${id}`, {
    method: 'DELETE',
    token: authToken,
  });
}

const signinScreen = document.getElementById('signinScreen');
const collectionScreen = document.getElementById('collectionScreen');
const signOutBtn = document.getElementById('signOutBtn');
const userAvatar = document.getElementById('userAvatar');
const avatarUploadInput = document.getElementById('avatarUploadInput');
const userName = document.getElementById('userName');
const collectionTitle = document.getElementById('collectionTitle');
const collectionContent = document.getElementById('collectionContent');
const deviceBanner = document.getElementById('deviceBanner');
const addGameBtn = document.getElementById('addGameBtn');
const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalSaveBtn = document.getElementById('modalSaveBtn');
const modalGameName = document.getElementById('modalGameName');
const modalSystem = document.getElementById('modalSystem');
const modalRomFile = document.getElementById('modalRomFile');
const modalFileName = document.getElementById('modalFileName');
const modalFileDrop = document.getElementById('modalFileDrop');
const modalStatus = document.getElementById('modalStatus');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const passwordConfirmInput = document.getElementById('passwordConfirmInput');
const emailAuthBtn = document.getElementById('emailAuthBtn');
const signinToggle = document.getElementById('signinToggle');
const signinError = document.getElementById('signinError');
const signinHeading = document.getElementById('signinHeading');
const searchInput = document.getElementById('searchInput');
const folderInput = document.getElementById('folderInput');
const importProgress = document.getElementById('importProgress');
const folderModalOverlay = document.getElementById('folderModalOverlay');
const folderModalBody = document.getElementById('folderModalBody');
const folderModalCount = document.getElementById('folderModalCount');
const folderModalClose = document.getElementById('folderModalClose');
const folderModalCancel = document.getElementById('folderModalCancel');
const folderModalImport = document.getElementById('folderModalImport');
const coverModalOverlay = document.getElementById('coverModalOverlay');
const coverModalTitle = document.getElementById('coverModalTitle');
const coverModalClose = document.getElementById('coverModalClose');
const coverModalCancel = document.getElementById('coverModalCancel');
const coverModalSave = document.getElementById('coverModalSave');
const coverSearchInput = document.getElementById('coverSearchInput');
const coverRescanBtn = document.getElementById('coverRescanBtn');
const coverUploadInput = document.getElementById('coverUploadInput');
const coverResultsWrap = document.getElementById('coverResultsWrap');
const coverResultsGrid = document.getElementById('coverResultsGrid');
const coverResultsLabel = document.getElementById('coverResultsLabel');
const coverStatus = document.getElementById('coverStatus');

let currentUser = null;
let authToken = '';
let isRegistering = false;
let allGames = [];
let folderFiles = [];
let coverEditGame = null;
let coverSelectedUrl = null;
let coverUploadedBase64 = null;

function setAuthenticatedState() {
  signinScreen.style.display = 'none';
  collectionScreen.classList.add('active');
}

function setSignedOutState() {
  currentUser = null;
  authToken = '';
  userAvatar.src = '';
  userName.textContent = '';
  collectionTitle.textContent = 'My Collection';
  deviceBanner.classList.remove('visible');
  signinScreen.style.display = '';
  collectionScreen.classList.remove('active');
}

async function bootstrapAuth() {
  const stored = readStoredSession();
  if (!stored) {
    setSignedOutState();
    return;
  }

  try {
    const refreshed = await refreshAuthUser(stored.token);
    authToken = refreshed.token;
    currentUser = refreshed.record;
    storeSession(authToken, currentUser);
    const displayName = displayNameFor(currentUser);
    userName.textContent = displayName;
    collectionTitle.textContent = `${displayName}'s Collection`;
    userAvatar.src = avatarFor(currentUser);
    setAuthenticatedState();
    await checkDevice();
    await loadCollection();
  } catch (e) {
    console.warn('[pocketbase] stored session is no longer valid', e);
    clearSession();
    setSignedOutState();
  }
}

signinToggle.addEventListener('click', () => {
  isRegistering = !isRegistering;
  signinHeading.textContent = isRegistering ? 'Create account' : 'Sign in';
  emailAuthBtn.textContent = isRegistering ? 'Register' : 'Sign in';
  signinToggle.textContent = isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Register";
  signinError.textContent = '';
  passwordConfirmInput.style.display = isRegistering ? 'block' : 'none';
});

emailAuthBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const passwordConfirm = passwordConfirmInput.value;
  signinError.textContent = '';

  if (!email || !password) {
    signinError.textContent = 'Enter your email and password.';
    return;
  }

  if (isRegistering) {
    if (!passwordConfirm) {
      signinError.textContent = 'Please confirm your password.';
      return;
    }
    if (password !== passwordConfirm) {
      signinError.textContent = 'Passwords do not match.';
      return;
    }
    if (password.length < 8) {
      signinError.textContent = 'Password must be at least 8 characters.';
      return;
    }
  }

  emailAuthBtn.disabled = true;
  emailAuthBtn.textContent = 'Please wait...';

  try {
    if (isRegistering) {
      await createAuthUser(email, password);
    }

    const session = await loginAuthUser(email, password);
    authToken = session.token;
    currentUser = session.record;
    if (!currentUser.name) {
      try {
        currentUser = await updateCurrentUser({ name: email.split('@')[0] || 'User' }) || currentUser;
      } catch (_) {}
    }
    storeSession(authToken, currentUser);
    const displayName = displayNameFor(currentUser);
    userName.textContent = displayName;
    collectionTitle.textContent = `${displayName}'s Collection`;
    userAvatar.src = avatarFor(currentUser);
    setAuthenticatedState();
    await checkDevice();
    await loadCollection();
  } catch (e) {
    signinError.textContent = extractPbMessage(e, 'Something went wrong. Try again.');
  } finally {
    emailAuthBtn.disabled = false;
    emailAuthBtn.textContent = isRegistering ? 'Register' : 'Sign in';
  }
});

signOutBtn.addEventListener('click', () => {
  clearSession();
  setSignedOutState();
});

userAvatar.addEventListener('click', () => avatarUploadInput.click());
avatarUploadInput.addEventListener('change', async () => {
  const f = avatarUploadInput.files[0];
  if (!f || !currentUser) return;

  try {
    const base64 = await compressAvatar(f);
    userAvatar.src = base64;
    await updateCurrentUser({ photoBase64: base64 });
  } catch (e) {
    console.error('[avatar]', e);
  }
  avatarUploadInput.value = '';
});

async function checkDevice() {
  if (!currentUser) return;
  const deviceId = getDeviceId();
  const lastDevice = currentUser.lastDevice || '';

  if (lastDevice && lastDevice !== deviceId) {
    deviceBanner.classList.add('visible');
  } else {
    deviceBanner.classList.remove('visible');
  }

  await updateCurrentUser({
    lastDevice: deviceId,
    lastSeen: new Date().toISOString(),
  });
}

async function loadCollection() {
  if (!currentUser) return;
  collectionContent.innerHTML = '<div class="loading-state">Loading your collection...</div>';
  allGames = await listGames(currentUser.id);
  renderCollection(allGames, searchInput.value.trim().toLowerCase());
}

function renderCollection(games, query = '') {
  const filtered = query
    ? games.filter(g => String(g.name || '').toLowerCase().includes(query) || (SYSTEM_LABELS[g.system] || '').toLowerCase().includes(query))
    : games;

  collectionContent.innerHTML = '';

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = query
      ? `<div class="empty-title">No results for "${query}"</div><p class="empty-desc">Try a different search term.</p>`
      : `<div class="empty-title">No games yet</div><p class="empty-desc">Click "Add Game" or "Import Folder" to get started.</p>`;
    collectionContent.appendChild(empty);
    return;
  }

  const grouped = {};
  filtered.forEach(g => {
    if (!grouped[g.system]) grouped[g.system] = [];
    grouped[g.system].push(g);
  });

  for (const system of Object.keys(grouped)) {
    const section = document.createElement('div');
    section.className = 'section-wrap';

    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = `<span class="section-title">${SYSTEM_LABELS[system] || system}</span><div class="section-line"></div>`;

    const grid = document.createElement('div');
    grid.className = 'game-grid';

    for (const game of grouped[system]) {
      buildCard(game).then(card => grid.appendChild(card));
    }

    section.appendChild(header);
    section.appendChild(grid);
    collectionContent.appendChild(section);
  }
}

searchInput.addEventListener('input', () => renderCollection(allGames, searchInput.value.trim().toLowerCase()));

async function buildCard(game) {
  const card = document.createElement('div');
  card.className = 'game-card';

  const romFile = await getRom(game.id);
  const hasRom = !!romFile;

  const coverHtml = game.coverUrl
    ? `<div class="game-cover-wrap"><img class="game-cover" src="${game.coverUrl}" alt="${game.name}" loading="lazy" /><button class="game-cover-edit" data-id="${game.id}"><span class="game-cover-edit-label">Edit Cover</span></button></div>`
    : `<div class="game-cover-wrap"><div class="game-cover-placeholder">NO ART</div><button class="game-cover-edit" data-id="${game.id}"><span class="game-cover-edit-label">Add Cover</span></button></div>`;

  card.innerHTML = `
    ${coverHtml}
    <div class="game-info">
      <div class="game-name">${game.name}</div>
      <div class="game-system-badge">${SYSTEM_LABELS[game.system] || game.system}</div>
      <div class="game-actions">
        <button class="game-play-btn" ${!hasRom ? 'disabled' : ''}>${hasRom ? 'Play' : 'No ROM'}</button>
        <button class="game-remove-btn" title="Remove">✕</button>
      </div>
      ${!hasRom ? `<div class="game-rom-btn">Add ROM file<input type="file" /></div>` : ''}
    </div>
  `;

  const playBtn = card.querySelector('.game-play-btn');
  const removeBtn = card.querySelector('.game-remove-btn');
  const attachInput = card.querySelector('.game-rom-btn input');
  const editCoverBtn = card.querySelector('.game-cover-edit');

  if (playBtn && hasRom) {
    playBtn.addEventListener('click', () => {
      const page = SYSTEM_PAGES[game.system];
      if (!page) return;
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(romFile, 'pending-launch');
      tx.oncomplete = () => {
        storeLaunchMeta({
          gameId: game.id,
          name: game.name,
          system: game.system,
        });
        sessionStorage.setItem('webmu-launch-name', game.name);
        window.location.href = page;
      };
    });
  }

  removeBtn.addEventListener('click', async () => {
    if (!confirm(`Remove "${game.name}" from your collection?`)) return;
    try {
      await deleteGameRecord(game.id);
      await deleteRom(game.id);
      await loadCollection();
    } catch (e) {
      console.error('[remove game]', e);
      alert('Could not remove the game. Try again.');
    }
  });

  if (attachInput) {
    attachInput.addEventListener('change', async () => {
      const f = attachInput.files[0];
      if (!f) return;
      try {
        await saveRom(game.id, f);
        await loadCollection();
      } catch (e) {
        console.error('[attach rom]', e);
        alert('Could not save the ROM file. Try again.');
      }
    });
  }

  if (editCoverBtn) {
    editCoverBtn.addEventListener('click', () => openCoverModal(game));
  }

  return card;
}

function openCoverModal(game) {
  coverEditGame = game;
  coverSelectedUrl = null;
  coverUploadedBase64 = null;
  coverModalTitle.textContent = `Cover Art — ${game.name}`;
  coverSearchInput.value = game.name;
  coverResultsWrap.style.display = 'none';
  coverResultsGrid.innerHTML = '';
  coverStatus.textContent = '';
  coverModalOverlay.classList.add('active');
}

coverModalClose.addEventListener('click', () => coverModalOverlay.classList.remove('active'));
coverModalCancel.addEventListener('click', () => coverModalOverlay.classList.remove('active'));
coverModalOverlay.addEventListener('click', e => {
  if (e.target === coverModalOverlay) coverModalOverlay.classList.remove('active');
});

coverRescanBtn.addEventListener('click', async () => {
  const searchName = coverSearchInput.value.trim();
  if (!searchName || !coverEditGame) return;

  coverRescanBtn.disabled = true;
  coverRescanBtn.textContent = 'Scanning...';
  coverStatus.textContent = '';
  coverResultsWrap.style.display = 'none';
  coverResultsGrid.innerHTML = '';
  coverSelectedUrl = null;
  coverUploadedBase64 = null;

  const results = await scanCoverCandidates(searchName, coverEditGame.system);

  coverRescanBtn.disabled = false;
  coverRescanBtn.textContent = 'Scan';

  if (results.length === 0) {
    coverStatus.textContent = 'No cover art found. Try a different name or upload your own.';
    return;
  }

  coverResultsLabel.textContent = `${results.length} result${results.length > 1 ? 's' : ''} found — click one to select it`;
  coverResultsWrap.style.display = 'block';

  results.forEach(r => {
    const item = document.createElement('div');
    item.className = 'cover-result-item';

    const img = document.createElement('img');
    img.className = 'cover-result-img';
    img.src = r.url;
    img.alt = r.label;
    img.loading = 'lazy';

    const label = document.createElement('div');
    label.className = 'cover-result-label';
    label.textContent = r.label;

    item.appendChild(img);
    item.appendChild(label);

    item.addEventListener('click', () => {
      coverResultsGrid.querySelectorAll('.cover-result-img').forEach(i => i.classList.remove('selected'));
      img.classList.add('selected');
      coverSelectedUrl = r.url;
      coverUploadedBase64 = null;
    });

    coverResultsGrid.appendChild(item);
  });

  const firstImg = coverResultsGrid.querySelector('.cover-result-img');
  if (firstImg) {
    firstImg.classList.add('selected');
    coverSelectedUrl = results[0].url;
  }
});

coverUploadInput.addEventListener('change', async () => {
  const f = coverUploadInput.files[0];
  if (!f) return;
  try {
    coverStatus.textContent = 'Processing image...';
    const base64 = await compressImage(f, 400);
    coverUploadedBase64 = base64;
    coverSelectedUrl = null;
    coverResultsGrid.querySelectorAll('.cover-result-img').forEach(i => i.classList.remove('selected'));
    coverStatus.textContent = 'Custom image ready. Click Save Cover to apply.';
  } catch (e) {
    coverStatus.textContent = 'Could not process image. Try a different file.';
    console.error(e);
  }
  coverUploadInput.value = '';
});

coverModalSave.addEventListener('click', async () => {
  if (!coverEditGame || !currentUser) return;
  if (!coverSelectedUrl && !coverUploadedBase64) {
    coverStatus.textContent = 'Select a cover art result or upload your own image first.';
    return;
  }

  coverModalSave.disabled = true;
  coverModalSave.textContent = 'Saving...';

  try {
    const newCoverUrl = coverUploadedBase64 || coverSelectedUrl;
    await updateGameRecord(coverEditGame.id, { coverUrl: newCoverUrl });
    coverModalOverlay.classList.remove('active');
    await loadCollection();
  } catch (e) {
    coverStatus.textContent = 'Failed to save. Try again.';
    console.error(e);
  } finally {
    coverModalSave.disabled = false;
    coverModalSave.textContent = 'Save Cover';
  }
});

addGameBtn.addEventListener('click', () => {
  modalGameName.value = '';
  modalSystem.value = '';
  modalRomFile.value = '';
  modalFileName.textContent = '';
  modalStatus.textContent = '';
  modalFileDrop.classList.remove('has-file');
  modalOverlay.classList.add('active');
});

modalClose.addEventListener('click', () => modalOverlay.classList.remove('active'));
modalCancelBtn.addEventListener('click', () => modalOverlay.classList.remove('active'));
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) modalOverlay.classList.remove('active');
});

modalRomFile.addEventListener('change', () => {
  const f = modalRomFile.files[0];
  if (!f) return;
  modalFileName.textContent = f.name;
  modalFileDrop.classList.add('has-file');
  if (!modalGameName.value) modalGameName.value = f.name.replace(/\.\w+$/, '');
  const detected = detectSystem(f.name);
  if (detected && !modalSystem.value) modalSystem.value = detected;
});

modalSaveBtn.addEventListener('click', async () => {
  if (!currentUser) return;
  const name = modalGameName.value.trim();
  const system = modalSystem.value;
  const file = modalRomFile.files[0];

  if (!name) {
    modalStatus.textContent = 'Enter a game name.';
    return;
  }
  if (!system) {
    modalStatus.textContent = 'Select a system.';
    return;
  }
  if (!file) {
    modalStatus.textContent = 'Add a ROM file.';
    return;
  }

  modalSaveBtn.disabled = true;
  modalSaveBtn.textContent = 'Saving...';
  modalStatus.textContent = '';

  let gameRecord = null;

  try {
    const coverUrl = await fetchCover(name, system);
    const payload = {
      owner: currentUser.id,
      name,
      system,
      coverUrl: coverUrl || '',
      source: 'manual',
      playCount: 0,
      totalPlaySeconds: 0,
      lastPlayedAt: null,
    };
    gameRecord = await createGameRecord(payload);
    await saveRom(gameRecord.id, file);
    modalOverlay.classList.remove('active');
    await loadCollection();
  } catch (e) {
    if (gameRecord?.id) {
      try {
        await deleteGameRecord(gameRecord.id);
      } catch (_) {}
    }
    modalStatus.textContent = extractPbMessage(e, 'Failed to save. Try again.');
    console.error(e);
  } finally {
    modalSaveBtn.disabled = false;
    modalSaveBtn.textContent = 'Save to Collection';
  }
});

folderInput.addEventListener('change', () => {
  const files = Array.from(folderInput.files).filter(f => isRomFile(f.name));
  folderInput.value = '';
  if (files.length === 0) {
    alert('No recognised ROM files found in this folder.');
    return;
  }
  folderFiles = files.map(f => ({ file: f, name: f.name.replace(/\.\w+$/, ''), system: detectSystem(f.name), skipped: false }));
  buildFolderModal();
  folderModalOverlay.classList.add('active');
});

function buildFolderModal() {
  folderModalBody.innerHTML = '';
  folderFiles.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'folder-file-row';
    row.dataset.index = i;

    const nameEl = document.createElement('div');
    nameEl.className = 'folder-file-name';
    nameEl.textContent = entry.name;
    nameEl.title = entry.file.name;

    const select = document.createElement('select');
    select.className = 'folder-file-select';
    select.innerHTML = `<option value="">Unknown</option><option value="nes">NES</option><option value="snes">SNES</option><option value="gameboy">Game Boy</option><option value="gamewatch">Game &amp; Watch</option><option value="genesis">Genesis</option><option value="gamegear">Game Gear</option><option value="playstation">PlayStation</option><option value="psp">PSP</option><option value="n64">N64</option><option value="nds">Nintendo DS</option>`;
    select.value = entry.system || '';
    select.addEventListener('change', () => {
      folderFiles[i].system = select.value || null;
      updateFolderCount();
    });

    const skipBtn = document.createElement('button');
    skipBtn.className = 'folder-file-skip';
    skipBtn.textContent = 'Skip';
    skipBtn.addEventListener('click', () => {
      folderFiles[i].skipped = !folderFiles[i].skipped;
      row.classList.toggle('skipped', folderFiles[i].skipped);
      skipBtn.textContent = folderFiles[i].skipped ? 'Undo' : 'Skip';
      updateFolderCount();
    });

    row.appendChild(nameEl);
    row.appendChild(select);
    row.appendChild(skipBtn);
    folderModalBody.appendChild(row);
  });
  updateFolderCount();
}

function updateFolderCount() {
  const valid = folderFiles.filter(e => !e.skipped && e.system).length;
  folderModalCount.textContent = `${valid} of ${folderFiles.length} games ready to import`;
}

folderModalClose.addEventListener('click', () => folderModalOverlay.classList.remove('active'));
folderModalCancel.addEventListener('click', () => folderModalOverlay.classList.remove('active'));

folderModalImport.addEventListener('click', async () => {
  if (!currentUser) return;
  const toImport = folderFiles.filter(e => !e.skipped && e.system);
  if (toImport.length === 0) {
    alert('No games ready to import. Assign a system to at least one game.');
    return;
  }

  folderModalImport.disabled = true;
  folderModalImport.textContent = 'Importing...';
  const uid = currentUser.id;
  let done = 0;

  folderModalOverlay.classList.remove('active');
  importProgress.classList.add('visible');

  for (const entry of toImport) {
    importProgress.textContent = `Importing ${done + 1} of ${toImport.length}: ${entry.name}`;
    try {
      const coverUrl = await fetchCover(entry.name, entry.system);
      const gameRecord = await createGameRecord({
        owner: uid,
        name: entry.name,
        system: entry.system,
        coverUrl: coverUrl || '',
        source: 'imported',
        playCount: 0,
        totalPlaySeconds: 0,
        lastPlayedAt: null,
      });
      await saveRom(gameRecord.id, entry.file);
      done++;
    } catch (e) {
      console.error('[folder import]', entry.name, e);
    }
  }

  importProgress.textContent = `Imported ${done} games.`;
  setTimeout(() => importProgress.classList.remove('visible'), 3000);
  folderModalImport.disabled = false;
  folderModalImport.textContent = 'Import All';
  await loadCollection();
});

bootstrapAuth();
