const PB_CONFIG = window.__WEBMU_POCKETBASE__ || {};
const PB_URL = PB_CONFIG.url || 'https://pocketbase.felixx.dev';
const PB_AUTH_COLLECTION = PB_CONFIG.authCollection || 'webmuser';
const PB_GAMES_COLLECTION = PB_CONFIG.gamesCollection || 'games';
const SESSION_KEY = 'webmu-pocketbase-session';
const META_KEY = 'webmu-launch-meta';

let playStartTime = null;
let flushed = false;

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

function readLaunchMeta() {
  const raw = sessionStorage.getItem(META_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.gameId) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

async function pbRequest(path, { method = 'GET', token = null, body = null, keepalive = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = token;
  const init = { method, headers, keepalive };
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

function startPlaySession() {
  playStartTime = Date.now();
  flushed = false;
}

async function listUserGames(userId, token) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  do {
    const qs = new URLSearchParams({
      page: String(page),
      perPage: '200',
      filter: `owner="${userId}"`,
    });
    const res = await pbRequest(`/api/collections/${PB_GAMES_COLLECTION}/records?${qs.toString()}`, { token });
    items.push(...(res.items || []));
    totalPages = res.totalPages || 1;
    page++;
  } while (page <= totalPages);
  return items;
}

async function flushPlayStats() {
  if (flushed) return;
  flushed = true;

  const meta = readLaunchMeta();
  if (!meta || !meta.gameId) return;

  const session = readSession();
  const userId = session?.record?.id || null;
  const token = session?.token || null;
  const durationSeconds = playStartTime
    ? Math.max(1, Math.round((Date.now() - playStartTime) / 1000))
    : 1;

  const path = `/api/collections/${PB_GAMES_COLLECTION}/records/${meta.gameId}`;

  if (token) {
    try {
      const record = await pbRequest(path, { token });
      const playCount = Number(record.playCount || 0) + 1;
      const totalPlaySeconds = Number(record.totalPlaySeconds || 0) + durationSeconds;
      await pbRequest(path, {
        method: 'PATCH',
        token,
        keepalive: true,
        body: {
          playCount,
          totalPlaySeconds,
          lastPlayedAt: new Date().toISOString(),
        },
      });
    } catch (_) {}
  }

  if (userId && token && window.WebMuAchievements) {
    try {
      const games = await listUserGames(userId, token);
      const totalSeconds = games.reduce((sum, g) => sum + (Number(g.totalPlaySeconds) || 0), 0);

      const opts = {
        speedrunActive: !!window.WebMuSpeedrunActive,
        playedPublicGame: !!meta.isPublic,
      };

      WebMuAchievements.updateUserLevel(userId, totalSeconds, token);
      const newlyUnlocked = await WebMuAchievements.checkAndUnlockAchievements(
        userId, games, totalSeconds, opts, token
      );
      if (newlyUnlocked.length > 0) {
        WebMuAchievements.showAchievementToast(newlyUnlocked);
      }
    } catch (_) {}
  }
}

window.startPlaySession = startPlaySession;
window.WebMuPlayTracker = {
  flushPlayStats,
  startPlaySession,
};