const PB_CONFIG = window.__WEBMU_POCKETBASE__ || {};
const PB_URL = PB_CONFIG.url || 'https://pocketbase.felixx.dev';
const PB_AUTH_COLLECTION = PB_CONFIG.authCollection || 'webmuser';
const PB_GAMES_COLLECTION = PB_CONFIG.gamesCollection || 'games';
const SESSION_KEY = 'webmu-pocketbase-session';
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

const userSearch = document.getElementById('userSearch');
const userList = document.getElementById('userList');
const statsContent = document.getElementById('statsContent');
const statsPlaceholder = document.getElementById('statsPlaceholder');
const profileAvatar = document.getElementById('profileAvatar');
const avatarInitials = document.getElementById('avatarInitials');
const displayName = document.getElementById('displayName');
const userHandle = document.getElementById('userHandle');
const memberSince = document.getElementById('memberSince');
const lastSeen = document.getElementById('lastSeen');
const totalGames = document.getElementById('totalGames');
const totalPlayTime = document.getElementById('totalPlayTime');
const favoriteConsole = document.getElementById('favoriteConsole');
const mostPlayedGame = document.getElementById('mostPlayedGame');
const uniqueSystems = document.getElementById('uniqueSystems');
const playSessions = document.getElementById('playSessions');
const consoleBars = document.getElementById('consoleBars');
const libraryList = document.getElementById('libraryList');
const libraryNote = document.getElementById('libraryNote');
const messageBtn = document.getElementById('messageBtn');

let currentUser = null;
let authToken = '';
let allUsers = [];
let selectedUserId = null;

function pbUrl(path) {
  return `${PB_URL}${path}`;
}

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

function fmtLongDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.length ? parts.join(' ') : '0m';
}

function fmtDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function systemLabel(system) {
  return SYSTEM_LABELS[system] || system || '-';
}

async function loadUsers(search = '') {
  const filterParts = ['isPublic = true'];
  if (search) {
    filterParts.push(`(name ~ "${search}" || email ~ "${search}")`);
  }
  const qs = new URLSearchParams({
    filter: filterParts.join(' && '),
    sort: '-lastSeen,-created',
    perPage: '50',
  });
  const res = await pbRequest(`/api/collections/${PB_AUTH_COLLECTION}/records?${qs.toString()}`, {
    token: authToken,
  });
  return res.items || [];
}

async function loadUserStats(userId) {
  const qs = new URLSearchParams({
    filter: `owner="${userId}"`,
    sort: '-lastPlayedAt,-totalPlaySeconds',
    perPage: '500',
  });
  const res = await pbRequest(`/api/collections/${PB_GAMES_COLLECTION}/records?${qs.toString()}`, {
    token: authToken,
  });
  return res.items || [];
}

function renderUserList(users) {
  userList.innerHTML = '';
  if (!users.length) {
    userList.innerHTML = '<div class="library-meta">No public users found.</div>';
    return;
  }
  users.forEach(user => {
    const display = user.name || user.email.split('@')[0];
    const item = document.createElement('div');
    item.className = `user-item ${selectedUserId === user.id ? 'active' : ''}`;
    
    const photo = user.photoBase64 || user.photoURL || '';
    let avatarHtml = `<div class="user-initials-small">${display.charAt(0).toUpperCase()}</div>`;
    if (photo) {
      avatarHtml = `<img src="${photo}" class="user-avatar-small" />`;
    }

    item.innerHTML = `
      ${avatarHtml}
      <div class="user-info">
        <div class="user-name">${display}</div>
        <div class="user-meta">Member since ${new Date(user.created).getFullYear()}</div>
      </div>
    `;
    item.addEventListener('click', () => selectUser(user));
    userList.appendChild(item);
  });
}

async function selectUser(user) {
  selectedUserId = user.id;
  renderUserList(allUsers);
  
  statsPlaceholder.style.display = 'none';
  statsContent.style.display = 'block';
  
  const display = user.name || user.email.split('@')[0];
  displayName.textContent = display;
  userHandle.innerHTML = `${user.email.split('@')[0]}@webmu ${authToken ? `<span id="statsLevelBadge" style="display:inline;background:linear-gradient(135deg,#f97316,#fb923c);color:#fff;font-size:10px;padding:2px 8px;border-radius:12px;font-weight:bold;">LVL <span id="statsLevelNum">${user.level || 1}</span></span>` : ''}`;
  memberSince.textContent = `Member since ${fmtDate(user.created)}`;
  lastSeen.textContent = user.lastSeen ? `Last seen ${fmtDate(user.lastSeen)}` : 'No recent activity';
  
  const photo = user.photoBase64 || user.photoURL || '';
  if (photo) {
    profileAvatar.src = photo;
    profileAvatar.style.display = 'block';
    avatarInitials.textContent = '';
  } else {
    profileAvatar.src = '';
    profileAvatar.style.display = 'none';
    avatarInitials.textContent = display.charAt(0).toUpperCase();
  }

  try {
    const games = await loadUserStats(user.id);
    renderStats(games);
    renderStatsAchievements(user.id, games);
  } catch (err) {
    console.error('[stats load]', err);
  }
}

async function renderStatsAchievements(userId, games) {
  const achSection = document.getElementById('statsAchievementsSection');
  const grid = document.getElementById('statsAchievementsGrid');
  const countEl = document.getElementById('statsAchievementCount');
  if (!achSection || !grid) return;

  if (!window.WebMuAchievements || !authToken) {
    achSection.style.display = 'none';
    return;
  }

  try {
    const unlocked = await WebMuAchievements.getUnlockedAchievements(userId, authToken);
    const allAch = WebMuAchievements.ALL_ACHIEVEMENTS;
    if (countEl) countEl.textContent = `${unlocked.length}/${allAch.length}`;

    grid.innerHTML = '';
    allAch.forEach(ach => {
      const isUnlocked = unlocked.includes(ach.id);
      const el = document.createElement('div');
      el.className = `achievement-card ${isUnlocked ? 'unlocked' : 'locked'}`;
      el.innerHTML = `
        <div class="ach-icon">${isUnlocked ? ach.icon : '?'}</div>
        <div class="ach-name">${isUnlocked ? ach.name : '???'}</div>
        <div class="ach-desc">${isUnlocked ? ach.description : 'Locked'}</div>
      `;
      grid.appendChild(el);
    });
    achSection.style.display = '';
  } catch (_) {
    achSection.style.display = 'none';
  }
}

function renderStats(games) {
  const totalSeconds = games.reduce((sum, g) => sum + (Number(g.totalPlaySeconds) || 0), 0);
  const totalSessions = games.reduce((sum, g) => sum + (Number(g.playCount) || 0), 0);
  const systems = [...new Set(games.map(g => g.system || g.catalogGame?.system).filter(Boolean))];
  
  const grouped = new Map();
  games.forEach(g => {
    const s = g.system || g.catalogGame?.system;
    if (s) grouped.set(s, (grouped.get(s) || 0) + (Number(g.totalPlaySeconds) || 0));
  });
  const sortedSystems = [...grouped.entries()].sort((a, b) => b[1] - a[1]);
  const favorite = sortedSystems[0]?.[0] || '-';
  const mostPlayed = [...games].sort((a, b) => (Number(b.totalPlaySeconds) || 0) - (Number(a.totalPlaySeconds) || 0))[0];

  totalGames.textContent = String(games.length);
  totalPlayTime.textContent = fmtLongDuration(totalSeconds);
  favoriteConsole.textContent = systemLabel(favorite);
  mostPlayedGame.textContent = mostPlayed ? (mostPlayed.name || mostPlayed.catalogGame?.name || 'Untitled') : '-';
  uniqueSystems.textContent = String(systems.length);
  playSessions.textContent = String(totalSessions);

  // Bars
  consoleBars.innerHTML = '';
  const max = sortedSystems[0]?.[1] || 0;
  sortedSystems.forEach(([system, seconds]) => {
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

  // Library
  libraryList.innerHTML = '';
  libraryNote.textContent = `${games.length} games`;
  const libSorted = [...games].sort((a, b) => {
    const na = a.name || a.catalogGame?.name || '';
    const nb = b.name || b.catalogGame?.name || '';
    return na.localeCompare(nb);
  });
  libSorted.slice(0, 50).forEach(game => {
    const name = game.name || game.catalogGame?.name || 'Untitled';
    const sys = systemLabel(game.system || game.catalogGame?.system);
    const item = document.createElement('div');
    item.className = 'library-item';
    item.innerHTML = `
      <div>
        <div class="library-name">${name}</div>
        <div class="library-meta">${sys}</div>
      </div>
      <div class="library-meta">${fmtLongDuration(game.totalPlaySeconds || 0)}</div>
    `;
    libraryList.appendChild(item);
  });
}

userSearch.addEventListener('input', async () => {
  try {
    allUsers = await loadUsers(userSearch.value);
    renderUserList(allUsers);
  } catch (err) { console.error('[search]', err); }
});

async function init() {
  const session = readSession();
  if (session) {
    authToken = session.token;
    currentUser = session.record;
  }
  try {
    allUsers = await loadUsers();
    renderUserList(allUsers);
  } catch (err) { console.error('[init]', err); }
}

init();
