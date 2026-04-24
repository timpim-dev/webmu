const PB_CONFIG = window.__WEBMU_POCKETBASE__ || {};
const PB_URL = PB_CONFIG.url || 'https://pocketbase.felixx.dev';
const PB_GAME_SAVES_COLLECTION = 'game_saves';
const PB_CATALOG_COLLECTION = 'catalog_games';
const SESSION_KEY = 'webmu-pocketbase-session';

function pbUrl(path) {
  return `${PB_URL}${path}`;
}

function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function pbRequest(path, { method = 'GET', token = null, body = null } = {}) {
  const headers = {};
  if (token) headers.Authorization = token;
  
  const init = { method, headers };
  if (body instanceof FormData) {
    delete headers['Content-Type'];
    init.body = body;
  } else if (body !== null) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  
  const res = await fetch(pbUrl(path), init);
  
  if (body instanceof FormData) {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Upload failed (${res.status})`);
    }
    return res.ok ? { success: true } : null;
  }
  
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

async function findCatalogGame(system, name) {
  const session = getSession();
  if (!session) return null;
  
  try {
    const filter = `system = "${system}" && name ~ "${name}"`;
    const res = await pbRequest(`/api/collections/${PB_CATALOG_COLLECTION}/records?filter=${encodeURIComponent(filter)}&perPage=1`, {
      token: session.token
    });
    
    if (res.items?.length > 0) {
      return res.items[0];
    }
  } catch (_) {}
  return null;
}

async function loadSave(token, catalogGameId) {
  if (!token || !catalogGameId) return null;
  
  try {
    const filter = `game = "${catalogGameId}"`;
    const res = await pbRequest(`/api/collections/${PB_GAME_SAVES_COLLECTION}/records?filter=${encodeURIComponent(filter)}&perPage=1&sort=-updated`, {
      token
    });
    
    if (res.items?.length > 0) {
      const save = res.items[0];
      if (save.saveFile) {
        return {
          id: save.id,
          label: save.label || 'Save',
          url: pbUrl(`/api/collections/${PB_GAME_SAVES_COLLECTION}/records/${save.id}/saveFile`)
        };
      }
    }
  } catch (e) {
    console.warn('[game-saves] load failed:', e.message);
  }
  return null;
}

async function saveStateToPB(gameName, system, stateBlob, label = 'Auto') {
  const session = getSession();
  if (!session) {
    console.warn('[game-saves] not logged in');
    return false;
  }
  
  const token = session.token;
  const catalogGame = await findCatalogGame(system, gameName);
  
  if (!catalogGame) {
    console.warn('[game-saves] catalog game not found:', system, gameName);
    return false;
  }
  
  try {
    const existingFilter = `game = "${catalogGame.id}"`;
    const existing = await pbRequest(`/api/collections/${PB_GAME_SAVES_COLLECTION}/records?filter=${encodeURIComponent(existingFilter)}&perPage=1`, {
      token
    });
    
    const formData = new FormData();
    formData.append('game', catalogGame.id);
    formData.append('owner', session.record.id);
    formData.append('slot', 0);
    formData.append('label', label);
    formData.append('saveFile', stateBlob, `${gameName}.state`);
    
    if (existing.items?.length > 0) {
      const saveId = existing.items[0].id;
      await pbRequest(`/api/collections/${PB_GAME_SAVES_COLLECTION}/records/${saveId}`, {
        method: 'PATCH',
        token,
        body: formData
      });
      console.log('[game-saves] updated:', gameName);
    } else {
      await pbRequest(`/api/collections/${PB_GAME_SAVES_COLLECTION}/records`, {
        method: 'POST',
        token,
        body: formData
      });
      console.log('[game-saves] saved:', gameName);
    }
    return true;
  } catch (e) {
    console.error('[game-saves] save failed:', e.message);
    return false;
  }
}

async function loadStateFromPB(gameName, system) {
  const session = getSession();
  if (!session) return null;
  
  const catalogGame = await findCatalogGame(system, gameName);
  if (!catalogGame) return null;
  
  return loadSave(session.token, catalogGame.id);
}

const WebMuGameSaves = {
  saveStateToPB,
  loadStateFromPB
};

window.WebMuGameSaves = WebMuGameSaves;