const PB_CONFIG = window.__WEBEMU_POCKETBASE__ || {};
const PB_URL = PB_CONFIG.url || 'https://pocketbase.felixx.dev';
const PB_AUTH_COLLECTION = PB_CONFIG.authCollection || 'webmuser';
const PB_GAMES_COLLECTION = PB_CONFIG.gamesCollection || 'games';
const SESSION_KEY = 'webemu-pocketbase-session';
const SYSTEM_LABELS = {
  nes: 'NES / Famicom',
  snes: 'Super NES / Super Famicom',
  gameboy: 'Game Boy / GBC / GBA',
  gamewatch: 'Game & Watch',
  genesis: 'Genesis / Mega Drive',
  gamegear: 'Game Gear',
  playstation: 'PlayStation',
  psp: 'PSP',
  n64: 'Nintendo 64',
  nds: 'Nintendo DS',
};

const profileAvatar = document.getElementById('profileAvatar');
const avatarInput = document.getElementById('avatarInput');
const displayName = document.getElementById('displayName');
const accountBlurb = document.getElementById('accountBlurb');
const profileEmail = document.getElementById('profileEmail');
const memberSince = document.getElementById('memberSince');
const lastSeen = document.getElementById('lastSeen');
const nameInput = document.getElementById('nameInput');
const saveNameBtn = document.getElementById('saveNameBtn');
const signOutBtn = document.getElementById('signOutBtn');
const totalGames = document.getElementById('totalGames');
const totalPlayTime = document.getElementById('totalPlayTime');
const favoriteConsole = document.getElementById('favoriteConsole');
const mostPlayedGame = document.getElementById('mostPlayedGame');
const uniqueSystems = document.getElementById('uniqueSystems');
const playSessions = document.getElementById('playSessions');
const systemSummary = document.getElementById('systemSummary');
const consoleBars = document.getElementById('consoleBars');
const gameSelect = document.getElementById('gameSelect');
const selectedGameMeta = document.getElementById('selectedGameMeta');
const gamePlayTime = document.getElementById('gamePlayTime');
const gamePlayCount = document.getElementById('gamePlayCount');
const gameSystem = document.getElementById('gameSystem');
const gameLastPlayed = document.getElementById('gameLastPlayed');
const libraryList = document.getElementById('libraryList');
const libraryNote = document.getElementById('libraryNote');
const activityList = document.getElementById('activityList');
const recentNote = document.getElementById('recentNote');

let currentUser = null;
let authToken = '';
let allGames = [];

function pbUrl(path) {
  return `${PB_URL}${path}`;
}

function readSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.record?.id) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function storeSession(token, record) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, record }));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function fmtDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function fmtLongDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

function fmtDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
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
  if (!res.ok) {
    throw new Error(data?.message || `PocketBase request failed (${res.status})`);
  }
  return data;
}

async function refreshAuth() {
  const stored = readSession();
  if (!stored) return null;
  const refreshed = await pbRequest(`/api/collections/${PB_AUTH_COLLECTION}/auth-refresh`, {
    method: 'POST',
    token: stored.token,
  });
  authToken = refreshed.token;
  currentUser = refreshed.record;
  storeSession(authToken, currentUser);
  return currentUser;
}

async function loadGames(ownerId) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  do {
    const qs = new URLSearchParams({
      page: String(page),
      perPage: '200',
      sort: '-lastPlayedAt,-updated,-created',
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

function currentGameLabel(game) {
  return game.catalogGame?.name || game.name || 'Untitled game';
}

function currentGameSystem(game) {
  return game.catalogGame?.system || game.system || '-';
}

function systemLabel(system) {
  return SYSTEM_LABELS[system] || system || '-';
}

function groupSystemTime(games) {
  const grouped = new Map();
  for (const game of games) {
    const system = currentGameSystem(game);
    if (!system) continue;
    grouped.set(system, (grouped.get(system) || 0) + Number(game.totalPlaySeconds || 0));
  }
  return [...grouped.entries()].sort((a, b) => b[1] - a[1]);
}

function renderBars(games) {
  consoleBars.innerHTML = '';
  const grouped = groupSystemTime(games);
  const max = grouped[0]?.[1] || 0;
  systemSummary.textContent = grouped.length ? `${grouped.length} systems with recorded playtime` : 'No playtime yet';

  if (!grouped.length) {
    consoleBars.innerHTML = '<div class="library-meta">Play a game from your collection and the chart will fill in here.</div>';
    return;
  }

  grouped.forEach(([system, seconds]) => {
    const row = document.createElement('div');
    row.className = 'console-row';
    row.innerHTML = `
      <div class="console-row-head">
        <span>${systemLabel(system)}</span>
        <span>${fmtLongDuration(seconds)}</span>
      </div>
      <div class="console-bar"><div class="console-bar-fill" style="width:${max ? Math.max(8, Math.round((seconds / max) * 100)) : 0}%"></div></div>
    `;
    consoleBars.appendChild(row);
  });
}

function renderLibrary(games) {
  libraryList.innerHTML = '';
  libraryNote.textContent = `${games.length} games`;

  if (!games.length) {
    libraryList.innerHTML = '<div class="library-meta">Your library is empty.</div>';
    return;
  }

  const sorted = [...games].sort((a, b) => currentGameLabel(a).localeCompare(currentGameLabel(b)));
  for (const game of sorted) {
    const item = document.createElement('div');
    item.className = 'library-item';
    item.innerHTML = `
      <div>
        <div class="library-name">${currentGameLabel(game)}</div>
        <div class="library-meta">${systemLabel(currentGameSystem(game))} · ${game.source || 'manual'}</div>
      </div>
      <div class="library-meta">${fmtLongDuration(game.totalPlaySeconds || 0)}</div>
    `;
    libraryList.appendChild(item);
  }
}

function renderActivity(games) {
  activityList.innerHTML = '';
  const recent = [...games]
    .filter(game => game.lastPlayedAt)
    .sort((a, b) => new Date(b.lastPlayedAt) - new Date(a.lastPlayedAt));

  recentNote.textContent = recent.length ? 'Recent play sessions' : 'Nothing recent';

  if (!recent.length) {
    activityList.innerHTML = '<div class="library-meta">Start a game from your collection to see it here.</div>';
    return;
  }

  recent.slice(0, 6).forEach(game => {
    const item = document.createElement('div');
    item.className = 'activity-item';
    item.innerHTML = `
      <div>
        <div class="activity-name">${currentGameLabel(game)}</div>
        <div class="activity-meta">${systemLabel(currentGameSystem(game))} · ${game.playCount || 0} sessions</div>
      </div>
      <div class="activity-meta">${fmtDate(game.lastPlayedAt)}</div>
    `;
    activityList.appendChild(item);
  });
}

function renderGameSelector(games) {
  gameSelect.innerHTML = '';
  if (!games.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No games yet';
    gameSelect.appendChild(option);
    updateSelectedGame(null);
    return;
  }

  const sorted = [...games].sort((a, b) => currentGameLabel(a).localeCompare(currentGameLabel(b)));
  sorted.forEach(game => {
    const option = document.createElement('option');
    option.value = game.id;
    option.textContent = `${currentGameLabel(game)} · ${fmtLongDuration(game.totalPlaySeconds || 0)}`;
    gameSelect.appendChild(option);
  });

  const preferred = sorted.find(game => game.lastPlayedAt) || sorted[0];
  gameSelect.value = preferred.id;
  updateSelectedGame(preferred);
}

function updateSelectedGame(game) {
  if (!game) {
    selectedGameMeta.textContent = 'Select a game';
    gamePlayTime.textContent = '0m';
    gamePlayCount.textContent = '0';
    gameSystem.textContent = '-';
    gameLastPlayed.textContent = '-';
    return;
  }

  selectedGameMeta.textContent = currentGameLabel(game);
  gamePlayTime.textContent = fmtLongDuration(game.totalPlaySeconds || 0);
  gamePlayCount.textContent = String(game.playCount || 0);
  gameSystem.textContent = systemLabel(currentGameSystem(game));
  gameLastPlayed.textContent = fmtDate(game.lastPlayedAt);
}

function updateHeader(user) {
  const display = user.name?.trim() || user.email?.split('@')[0] || 'User';
  displayName.textContent = `${display}'s Account`;
  accountBlurb.textContent = 'Track your library, playtime, favorite systems, and the games you keep coming back to.';
  profileEmail.textContent = user.email || '';
  memberSince.textContent = `Member since ${fmtDate(user.created)}`;
  lastSeen.textContent = user.lastSeen ? `Last seen ${fmtDate(user.lastSeen)}` : 'No recent device check';
  nameInput.value = user.name || display;
  profileAvatar.src = user.photoBase64 || user.photoURL || '';
}

function computeStats(games) {
  const totalSeconds = games.reduce((sum, game) => sum + Number(game.totalPlaySeconds || 0), 0);
  const totalSessions = games.reduce((sum, game) => sum + Number(game.playCount || 0), 0);
  const systems = [...new Set(games.map(game => currentGameSystem(game)).filter(Boolean))];
  const favorite = groupSystemTime(games)[0]?.[0] || '-';
  const mostPlayed = [...games].sort((a, b) => Number(b.totalPlaySeconds || 0) - Number(a.totalPlaySeconds || 0))[0];

  totalGames.textContent = String(games.length);
  totalPlayTime.textContent = fmtLongDuration(totalSeconds);
  favoriteConsole.textContent = systemLabel(favorite);
  mostPlayedGame.textContent = mostPlayed ? currentGameLabel(mostPlayed) : '-';
  uniqueSystems.textContent = String(systems.length);
  playSessions.textContent = String(totalSessions);
}

async function persistName() {
  if (!currentUser || !authToken) return;
  const nextName = nameInput.value.trim();
  saveNameBtn.disabled = true;
  saveNameBtn.textContent = 'Saving...';
  try {
    currentUser = await pbRequest(`/api/collections/${PB_AUTH_COLLECTION}/records/${currentUser.id}`, {
      method: 'PATCH',
      token: authToken,
      body: { name: nextName },
    });
    storeSession(authToken, currentUser);
    updateHeader(currentUser);
  } finally {
    saveNameBtn.disabled = false;
    saveNameBtn.textContent = 'Save name';
  }
}

async function persistAvatar(file) {
  if (!currentUser || !authToken || !file) return;
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  profileAvatar.src = base64;
  currentUser = await pbRequest(`/api/collections/${PB_AUTH_COLLECTION}/records/${currentUser.id}`, {
    method: 'PATCH',
    token: authToken,
    body: { photoBase64: base64 },
  });
  storeSession(authToken, currentUser);
  updateHeader(currentUser);
}

async function bootstrap() {
  try {
    const user = await refreshAuth();
    if (!user) {
      window.location.href = 'collection.html';
      return;
    }
    updateHeader(user);
    const games = await loadGames(user.id);
    allGames = games;
    computeStats(games);
    renderBars(games);
    renderLibrary(games);
    renderActivity(games);
    renderGameSelector(games);
  } catch (e) {
    clearSession();
    console.error('[account]', e);
    window.location.href = 'collection.html';
  }
}

gameSelect.addEventListener('change', () => {
  const game = allGames.find(item => item.id === gameSelect.value) || null;
  updateSelectedGame(game);
});

saveNameBtn.addEventListener('click', () => {
  persistName().catch(err => {
    console.error('[account name]', err);
  });
});

avatarInput.addEventListener('change', () => {
  const file = avatarInput.files[0];
  if (!file) return;
  persistAvatar(file).catch(err => {
    console.error('[account avatar]', err);
  });
  avatarInput.value = '';
});

signOutBtn.addEventListener('click', () => {
  clearSession();
  window.location.href = 'collection.html';
});

bootstrap();
