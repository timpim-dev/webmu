const PB_CONFIG = window.__WEBMU_POCKETBASE__ || {};
const PB_URL = PB_CONFIG.url || 'https://pocketbase.felixx.dev';
const PB_AUTH_COLLECTION = PB_CONFIG.authCollection || 'webmuser';
const PB_ACHIEVEMENTS_COLLECTION = PB_CONFIG.achievementsCollection || 'webmu_achievements';
const PB_GAMES_COLLECTION = PB_CONFIG.gamesCollection || 'games';
const PB_USERS_COLLECTION = PB_CONFIG.usersCollection || 'webmuser';
const SESSION_KEY = 'webmu-pocketbase-session';
const ACHIEVEMENTS_KEY = 'webmu-achievements-cache';
const ACHIEVEMENTS_TOAST_KEY = 'webmu-achievements-toast';

const LEVEL_THRESHOLDS = [
  0,       // 1
  600,     // 2: 10 min
  1800,    // 3: 30 min
  3600,    // 4: 1h
  7200,    // 5: 2h
  18000,   // 6: 5h
  36000,   // 7: 10h
  72000,   // 8: 20h
  126000,  // 9: 35h
  180000,  // 10: 50h
  234000,  // 11: 65h
  288000,  // 12: 80h
  342000,  // 13: 95h
  414000,  // 14: 115h
  504000,  // 15: 140h
  594000,  // 16: 165h
  684000,  // 17: 190h
  774000,  // 18: 215h
  864000,  // 19: 240h
  954000,  // 20: 265h
  1116000, // 21: 310h
  1278000, // 22: 355h
  1440000, // 23: 400h
  1602000, // 24: 445h
  1764000, // 25: 490h
  1926000, // 26: 535h
  2088000, // 27: 580h
  2250000, // 28: 625h
  2412000, // 29: 670h
  2600000, // 30: 722h+
];

const LEVEL_TITLES = {
  1: 'Newcomer', 2: 'Casual Player', 3: 'Regular', 4: 'Experienced',
  5: 'Dedicated', 6: 'Expert', 7: 'Master', 8: 'Legend',
  9: 'Elite', 10: 'Champion', 11: 'Hero', 12: 'Hero',
  13: 'Hero', 14: 'Hero', 15: 'Hero',
  16: 'Legend', 17: 'Legend', 18: 'Legend', 19: 'Legend', 20: 'Legend',
  21: 'Mythic', 22: 'Mythic', 23: 'Mythic', 24: 'Mythic', 25: 'Mythic',
  26: 'Immortal', 27: 'Immortal', 28: 'Immortal', 29: 'Immortal', 30: 'Immortal',
};

const ALL_ACHIEVEMENTS = [
  {
    id: 'first_game',
    name: 'First Steps',
    description: 'Play your first game',
    icon: '👣',
  },
  {
    id: 'nes_first',
    name: 'Famicom Beginner',
    description: 'Play your first NES game',
    icon: '🎮',
    system: 'nes',
  },
  {
    id: 'snes_first',
    name: 'Super NES Debut',
    description: 'Play your first SNES game',
    icon: '🕹️',
    system: 'snes',
  },
  {
    id: 'gameboy_first',
    name: 'Game Boy Adventurer',
    description: 'Play your first Game Boy game',
    icon: '🟩',
    system: 'gameboy',
  },
  {
    id: 'gamewatch_first',
    name: 'Game & Watch Fan',
    description: 'Play your first Game & Watch',
    icon: '⌚',
    system: 'gamewatch',
  },
  {
    id: 'genesis_first',
    name: 'Genesis Supporter',
    description: 'Play your first Genesis game',
    icon: '🟥',
    system: 'genesis',
  },
  {
    id: 'gamegear_first',
    name: 'Game Gear Explorer',
    description: 'Play your first Game Gear game',
    icon: '🔋',
    system: 'gamegear',
  },
  {
    id: 'playstation_first',
    name: 'PS1 Veteran',
    description: 'Play your first PlayStation game',
    icon: '💿',
    system: 'playstation',
  },
  {
    id: 'psp_first',
    name: 'PSP Owner',
    description: 'Play your first PSP game',
    icon: '📀',
    system: 'psp',
  },
  {
    id: 'n64_first',
    name: 'N64 Pioneer',
    description: 'Play your first Nintendo 64 game',
    icon: '🃏',
    system: 'n64',
  },
  {
    id: 'nds_first',
    name: 'Dual Screen Novice',
    description: 'Play your first Nintendo DS game',
    icon: '📱',
    system: 'nds',
  },
  {
    id: 'hour_played',
    name: 'One Hour',
    description: 'Accumulate 1 hour of playtime',
    icon: '⏰',
    minSeconds: 3600,
  },
  {
    id: 'ten_hours',
    name: 'Dedicated Player',
    description: 'Accumulate 10 hours of playtime',
    icon: '🕐',
    minSeconds: 36000,
  },
  {
    id: 'hundred_games',
    name: 'Collector',
    description: 'Own 100 games in your collection',
    icon: '📚',
    minGames: 100,
  },
  {
    id: 'ten_public',
    name: 'Community Builder',
    description: 'Share 10 public games',
    icon: '🌐',
    minPublicGames: 10,
  },
  {
    id: 'speedrunner',
    name: 'Speedrunner',
    description: 'Complete a speedrun session',
    icon: '⚡',
    requireSpeedrun: true,
  },
  {
    id: 'first_public',
    name: 'Explorer',
    description: 'Play your first public game',
    icon: '🔭',
    requirePublicPlay: true,
  },
];

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

function calculateLevel(totalSeconds) {
  const s = Math.floor(totalSeconds);
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (s >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

function getLevelProgress(totalSeconds) {
  const s = Math.floor(totalSeconds);
  const level = calculateLevel(s);
  const currentThreshold = LEVEL_THRESHOLDS[level - 1] || 0;
  const nextThreshold = LEVEL_THRESHOLDS[level] || (currentThreshold + 180000);
  const progress = nextThreshold > currentThreshold
    ? Math.min(1, (s - currentThreshold) / (nextThreshold - currentThreshold))
    : 1;
  return {
    level,
    title: LEVEL_TITLES[level] || 'Immortal',
    progress,
    currentSeconds: s,
    currentThreshold,
    nextThreshold,
    isMax: level >= 30,
  };
}

function getLevelTitle(level) {
  return LEVEL_TITLES[level] || 'Immortal';
}

function fmtDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH > 0 ? `${d}d ${remH}h` : `${d}d`;
}

async function getUnlockedAchievements(userId, token) {
  try {
    const qs = new URLSearchParams({ filter: `user="${userId}"`, perPage: '200' });
    const res = await pbRequest(`/api/collections/${PB_ACHIEVEMENTS_COLLECTION}/records?${qs.toString()}`, { token });
    return (res.items || []).map(i => i.achievementId);
  } catch (_) {
    return [];
  }
}

async function unlockAchievement(userId, achievementId, token) {
  try {
    await pbRequest(`/api/collections/${PB_ACHIEVEMENTS_COLLECTION}/records`, {
      method: 'POST',
      token,
      body: {
        user: userId,
        achievementId,
        unlockedAt: new Date().toISOString(),
      },
    });
    return true;
  } catch (_) {
    return false;
  }
}

async function checkAndUnlockAchievements(userId, games, totalSeconds, opts = {}, token) {
  if (!userId || !token) return [];
  const unlocked = await getUnlockedAchievements(userId, token);
  const newlyUnlocked = [];
  const systemsPlayed = new Set(games.map(g => g.system).filter(Boolean));
  const gamesCount = games.length;
  const publicGames = games.filter(g => g.public).length;

  for (const ach of ALL_ACHIEVEMENTS) {
    if (unlocked.includes(ach.id)) continue;

    let earned = false;

    if (ach.id === 'first_game' && gamesCount >= 1) {
      earned = true;
    } else if (ach.system && systemsPlayed.has(ach.system)) {
      earned = true;
    } else if (ach.minSeconds && totalSeconds >= ach.minSeconds) {
      earned = true;
    } else if (ach.minGames && gamesCount >= ach.minGames) {
      earned = true;
    } else if (ach.minPublicGames && publicGames >= ach.minPublicGames) {
      earned = true;
    } else if (ach.requireSpeedrun && opts.speedrunActive) {
      earned = true;
    } else if (ach.requirePublicPlay && opts.playedPublicGame) {
      earned = true;
    }

    if (earned) {
      const ok = await unlockAchievement(userId, ach.id, token);
      if (ok) {
        newlyUnlocked.push(ach);
      }
    }
  }

  return newlyUnlocked;
}

async function updateUserLevel(userId, totalSeconds, token) {
  const level = calculateLevel(totalSeconds);
  try {
    await pbRequest(`/api/collections/${PB_AUTH_COLLECTION}/records/${userId}`, {
      method: 'PATCH',
      token,
      body: { level },
    });
  } catch (_) {}
}

function showAchievementToast(achievements) {
  if (!achievements || achievements.length === 0) return;
  const container = document.getElementById('achievement-toast-container') || createToastContainer();
  achievements.forEach((ach, i) => {
    const el = document.createElement('div');
    el.className = 'achievement-toast';
    el.style.animationDelay = `${i * 0.15}s`;
    el.innerHTML = `
      <div class="toast-icon">${ach.icon}</div>
      <div class="toast-text">
        <div class="toast-title">Achievement Unlocked!</div>
        <div class="toast-name">${ach.name}</div>
        <div class="toast-desc">${ach.description}</div>
      </div>
      <button class="toast-dismiss">&times;</button>
    `;
    el.querySelector('.toast-dismiss').addEventListener('click', () => dismissToast(el));
    container.appendChild(el);
    setTimeout(() => dismissToast(el), 5000);
  });
}

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'achievement-toast-container';
  container.innerHTML = `
    <style>
      #achievement-toast-container {
        position: fixed;
        top: 80px;
        right: 16px;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
      }
      .achievement-toast {
        background: rgba(15, 15, 15, 0.95);
        border: 1px solid rgba(255, 200, 50, 0.6);
        border-radius: 8px;
        padding: 12px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 280px;
        max-width: 360px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        animation: toastSlideIn 0.3s ease-out;
        pointer-events: all;
      }
      @keyframes toastSlideIn {
        from { transform: translateX(110%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      .achievement-toast.removing {
        animation: toastSlideOut 0.3s ease-in forwards;
      }
      @keyframes toastSlideOut {
        to { transform: translateX(110%); opacity: 0; }
      }
      .toast-icon { font-size: 32px; flex-shrink: 0; }
      .toast-text { flex: 1; min-width: 0; }
      .toast-title {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: #ffc832;
        font-weight: bold;
        margin-bottom: 2px;
      }
      .toast-name { font-size: 14px; font-weight: bold; color: #fff; }
      .toast-desc { font-size: 11px; color: #aaa; margin-top: 2px; }
      .toast-dismiss {
        background: none;
        border: none;
        color: #666;
        font-size: 18px;
        cursor: pointer;
        padding: 0;
        flex-shrink: 0;
        pointer-events: all;
      }
      .toast-dismiss:hover { color: #fff; }
    </style>
  `;
  document.body.appendChild(container);
  return container;
}

function dismissToast(el) {
  if (!el || el.classList.contains('removing')) return;
  el.classList.add('removing');
  setTimeout(() => el.remove(), 300);
}

window.WebMuAchievements = {
  calculateLevel,
  getLevelProgress,
  getLevelTitle,
  getUnlockedAchievements,
  unlockAchievement,
  checkAndUnlockAchievements,
  updateUserLevel,
  showAchievementToast,
  ALL_ACHIEVEMENTS,
  fmtDuration,
};