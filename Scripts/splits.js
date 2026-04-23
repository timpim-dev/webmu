const SPLITS_KEY = 'webmu-splits';
const SPLITS_SETTINGS_KEY = 'webmu-splits-settings';

const DEFAULT_SETTINGS = {
  position: 'bottom-left',
  fontSize: 'medium',
  visible: false
};

const DEFAULT_PROFILE = {
  name: 'Default',
  gameFilter: '',
  segments: [
    { name: 'Any%', personalBest: 0 }
  ]
};

function getSettings() {
  const raw = localStorage.getItem(SPLITS_SETTINGS_KEY);
  try {
    return raw ? JSON.parse(raw) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings) {
  localStorage.setItem(SPLITS_SETTINGS_KEY, JSON.stringify(settings));
}

function getProfiles() {
  const raw = localStorage.getItem(SPLITS_KEY);
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveProfiles(profiles) {
  localStorage.setItem(SPLITS_KEY, JSON.stringify(profiles));
}

function getOrCreateProfiles() {
  let profiles = getProfiles();
  if (profiles.length === 0) {
    profiles = [{ ...DEFAULT_PROFILE }];
    saveProfiles(profiles);
  }
  return profiles;
}

let currentProfileIndex = 0;
let profiles = [];
let isRunning = false;
let startTime = 0;
let currentSegment = 0;
let segmentTimes = [];
let pausedTime = 0;

let speedrunMode = false;

const splitsPanel = document.createElement('div');
splitsPanel.id = 'splits-panel';
splitsPanel.className = 'game-overlay';
splitsPanel.style.display = 'none';
splitsPanel.innerHTML = `
  <style>
    #splits-panel {
      flex-direction: column;
      gap: 10px;
      min-width: 220px;
      background: rgba(10, 10, 10, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-family: monospace;
      position: relative;
    }
    .splits-titlebar { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 5px; }
    .splits-profile-name { font-weight: bold; color: var(--accent, #fff); font-size: 12px; }
    .splits-actions { display: flex; gap: 8px; align-items: center; }
    .speedrun-toggle { background: #333; border: 1px solid #555; color: #aaa; font-size: 9px; padding: 2px 4px; border-radius: 3px; cursor: pointer; text-transform: uppercase; }
    .speedrun-toggle.active { background: #f87171; border-color: #ef4444; color: #fff; }
    .splits-close { background: none; border: none; color: #fff; cursor: pointer; font-size: 16px; padding: 0 5px; }
    .splits-timer { font-size: 28px; font-weight: bold; text-align: center; color: #fff; margin: 5px 0; }
    .splits-delta-total { text-align: center; font-size: 14px; height: 1.2em; }
    .splits-delta-total.ahead { color: #4ade80; }
    .splits-delta-total.behind { color: #f87171; }
    .splits-segment-list { display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto; }
    .split-segment { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
    .split-segment.current { background: rgba(255, 255, 255, 0.1); }
    .seg-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .seg-time { width: 80px; text-align: right; }
    .seg-delta { width: 70px; text-align: right; font-size: 11px; }
    .seg-delta.ahead { color: #4ade80; }
    .seg-delta.behind { color: #f87171; }
    .splits-footer { font-size: 10px; color: #888; text-align: center; margin-top: 5px; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 5px; }
    .speedrun-watermark { 
      display: none; position: absolute; top: -20px; right: 0; 
      font-size: 10px; font-weight: bold; color: #f87171; text-transform: uppercase; 
      letter-spacing: 0.1em; pointer-events: none;
    }
    #splits-panel.speedrun-active .speedrun-watermark { display: block; }
  </style>
  <div class="speedrun-watermark">Speedrun Active</div>
  <div class="splits-titlebar">
    <span class="splits-profile-name">Default</span>
    <div class="splits-actions">
      <button class="speedrun-toggle" title="Toggle Speedrun Mode">Speedrun</button>
      <button class="splits-close">&times;</button>
    </div>
  </div>
  <div class="splits-timer">00:00.000</div>
  <div class="splits-delta-total"></div>
  <div class="splits-segment-list"></div>
  <div class="splits-footer">
    <span class="splits-key-hint">1 Start · 2 Split · 3 Reset · 4 Skip · 5 Prof · 6 View</span>
  </div>
`;

function toggleSpeedrun() {
  speedrunMode = !speedrunMode;
  window.WebMuSpeedrunActive = speedrunMode;
  const btn = splitsPanel.querySelector('.speedrun-toggle');
  btn.classList.toggle('active', speedrunMode);
  splitsPanel.classList.toggle('speedrun-active', speedrunMode);
}

splitsPanel.querySelector('.speedrun-toggle').addEventListener('click', toggleSpeedrun);

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

function renderSegments() {
  const profile = profiles[currentProfileIndex];
  if (!profile) return;
  
  const container = splitsPanel.querySelector('.splits-segment-list');
  container.innerHTML = '';
  
  profile.segments.forEach((seg, idx) => {
    const el = document.createElement('div');
    el.className = 'split-segment';
    if (idx === currentSegment) el.classList.add('current');
    if (segmentTimes[idx] !== undefined) el.classList.add('completed');
    
    const time = segmentTimes[idx] || 0;
    const pb = seg.personalBest || 0;
    const delta = time > 0 && pb > 0 ? time - pb : 0;
    
    el.innerHTML = `
      <span class="seg-name">${seg.name}</span>
      <span class="seg-time">${formatTime(time)}</span>
      <span class="seg-delta">${formatDelta(delta)}</span>
    `;
    container.appendChild(el);
  });
}

function renderSplits() {
  const settings = getSettings();
  if (!settings.visible) return;

  const profile = profiles[currentProfileIndex];
  if (!profile) return;
  
  splitsPanel.querySelector('.splits-profile-name').textContent = profile.name;
  
  const totalTime = isRunning ? Date.now() - startTime + pausedTime : pausedTime;
  splitsPanel.querySelector('.splits-timer').textContent = formatTime(totalTime);
  
  if (profile && profile.segments.length > 0) {
    const pbTotal = profile.segments.reduce((sum, s) => sum + (s.personalBest || 0), 0);
    const deltaEl = splitsPanel.querySelector('.splits-delta-total');
    
    if (totalTime > 0) {
      const delta = totalTime - pbTotal;
      deltaEl.textContent = formatDelta(delta);
      deltaEl.className = 'splits-delta-total ' + (delta > 0 ? 'behind' : delta < 0 ? 'ahead' : '');
    } else {
      deltaEl.textContent = '';
      deltaEl.className = 'splits-delta-total';
    }
  }
  
  renderSegments();
}

// Continuous update loop
function updateLoop() {
  if (isRunning) {
    renderSplits();
  }
  requestAnimationFrame(updateLoop);
}
requestAnimationFrame(updateLoop);

function initSplits(gameName) {
  profiles = getOrCreateProfiles();
  currentProfileIndex = 0;
  segmentTimes = [];
  currentSegment = 0;
  isRunning = false;
  startTime = 0;
  pausedTime = 0;
  
  const settings = getSettings();
  updateSplitsPosition(settings.position);
  updateSplitsFontSize(settings.fontSize);
  splitsPanel.style.display = settings.visible ? 'flex' : 'none';
  
  if (gameName) {
    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      if (profile.gameFilter) {
        try {
          const regex = new RegExp(profile.gameFilter, 'i');
          if (regex.test(gameName)) {
            currentProfileIndex = i;
            break;
          }
        } catch {
          if (profile.gameFilter.toLowerCase().includes(gameName.toLowerCase())) {
            currentProfileIndex = i;
            break;
          }
        }
      }
    }
  }
  
  renderSplits();
}

function startSplits() {
  if (isRunning) return;
  isRunning = true;
  startTime = Date.now();
  pausedTime = 0;
  currentSegment = 0;
  segmentTimes = [];
  renderSplits();
}

function split() {
  if (!isRunning) return;
  const profile = profiles[currentProfileIndex];
  if (!profile) return;
  
  const now = Date.now() - startTime + pausedTime;
  segmentTimes[currentSegment] = now;
  
  if (profile.segments[currentSegment]) {
    profile.segments[currentSegment].personalBest = Math.min(
      profile.segments[currentSegment].personalBest || now,
      now
    );
    saveProfiles(profiles);
  }
  
  if (currentSegment < profile.segments.length - 1) {
    currentSegment++;
  } else {
    isRunning = false;
    pausedTime = now;
  }
  
  renderSplits();
}

function resetSplits() {
  isRunning = false;
  currentSegment = 0;
  segmentTimes = [];
  pausedTime = 0;
  renderSplits();
}

function skipSegment() {
  if (!isRunning) return;
  const profile = profiles[currentProfileIndex];
  if (!profile) return;
  
  segmentTimes[currentSegment] = -1;
  
  if (currentSegment < profile.segments.length - 1) {
    currentSegment++;
  } else {
    isRunning = false;
  }
  
  renderSplits();
}

function switchProfile(delta) {
  if (profiles.length <= 1) return;
  currentProfileIndex = (currentProfileIndex + delta + profiles.length) % profiles.length;
  resetSplits();
  renderSplits();
}

function toggleSplits() {
  const settings = getSettings();
  settings.visible = !settings.visible;
  saveSettings(settings);
  
  if (!document.getElementById('splits-panel')) {
    document.body.appendChild(splitsPanel);
  }
  
  splitsPanel.style.display = settings.visible ? 'flex' : 'none';
  if (settings.visible) {
    updateSplitsPosition(settings.position);
    updateSplitsFontSize(settings.fontSize);
    renderSplits();
  }
}

function updateSplitsPosition(position) {
  const settings = getSettings();
  settings.position = position;
  saveSettings(settings);
  
  // Use classList instead of overwriting className to preserve speedrun-active
  splitsPanel.classList.remove('top-left', 'top-right', 'bottom-left', 'bottom-right');
  splitsPanel.classList.add(position);
}

function updateSplitsFontSize(size) {
  const settings = getSettings();
  settings.fontSize = size;
  saveSettings(settings);
  
  splitsPanel.style.fontSize = size === 'small' ? '12px' : size === 'large' ? '16px' : '14px';
}

splitsPanel.querySelector('.splits-close').addEventListener('click', () => {
  const settings = getSettings();
  settings.visible = false;
  saveSettings(settings);
  splitsPanel.style.display = 'none';
});

document.addEventListener('keydown', e => {
  if (!window.WebMuGameActive) return;
  
  // Ignore if user is typing in an input
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

  switch (e.key) {
    case '1':
      e.preventDefault();
      if (!isRunning) startSplits();
      break;
    case '2':
      e.preventDefault();
      if (isRunning) split();
      break;
    case '3':
      e.preventDefault();
      resetSplits();
      break;
    case '4':
      e.preventDefault();
      skipSegment();
      break;
    case '5':
      e.preventDefault();
      switchProfile(e.shiftKey ? -1 : 1);
      break;
    case '6':
      e.preventDefault();
      toggleSplits();
      break;
  }
});

document.body.appendChild(splitsPanel);

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('controls-overlay');
  if (overlay) {
    const sep = document.createElement('div');
    sep.className = 'ov-sep';
    const btn = document.createElement('button');
    btn.className = 'ov-btn';
    btn.textContent = 'Splits';
    btn.addEventListener('click', toggleSplits);
    const actions = overlay.querySelector('.overlay-actions');
    if (actions) {
      actions.appendChild(sep);
      actions.appendChild(btn);
    }
  }
});

window.WebMuSplits = {
  initSplits,
  startSplits,
  split,
  resetSplits,
  skipSegment,
  switchProfile,
  toggleSplits,
  getProfiles,
  saveProfiles,
  getSettings,
  saveSettings,
  updateSplitsPosition,
  updateSplitsFontSize
};