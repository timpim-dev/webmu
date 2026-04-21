const PB_CONFIG = window.__WEBMU_POCKETBASE__ || {};
const PB_URL = PB_CONFIG.url || 'https://pocketbase.felixx.dev';
const PB_GAMES_COLLECTION = PB_CONFIG.gamesCollection || 'games';
const SESSION_KEY = 'webmu-pocketbase-session';
const META_KEY = 'webmu-launch-meta';

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

function clearLaunchMeta() {
  sessionStorage.removeItem(META_KEY);
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
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = { message: text };
    }
  }

  if (!res.ok) {
    const message = data?.message || `PocketBase request failed (${res.status})`;
    throw new Error(message);
  }

  return data;
}

async function flushPlayStats() {
  const meta = readLaunchMeta();
  const session = readSession();
  if (!meta || !session) return;
  if (flushPlayStats._flushed) return;

  flushPlayStats._flushed = true;
  clearLaunchMeta();

  if (!meta.gameId) return;

  const startedAt = Number(meta.launchedAt || Date.now());
  const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  const record = await pbRequest(`/api/collections/${PB_GAMES_COLLECTION}/records/${meta.gameId}`, {
    token: session.token,
  });

  const playCount = Number(record.playCount || 0) + 1;
  const totalPlaySeconds = Number(record.totalPlaySeconds || 0) + durationSeconds;

  await pbRequest(`/api/collections/${PB_GAMES_COLLECTION}/records/${meta.gameId}`, {
    method: 'PATCH',
    token: session.token,
    keepalive: true,
    body: {
      playCount,
      totalPlaySeconds,
      lastPlayedAt: new Date().toISOString(),
    },
  });
}

const launchMeta = readLaunchMeta();
if (launchMeta) {
  window.addEventListener('pagehide', () => {
    flushPlayStats().catch(() => {});
  });

  window.addEventListener('beforeunload', () => {
    flushPlayStats().catch(() => {});
  });
}

window.WebMuPlayTracker = {
  flushPlayStats,
};
