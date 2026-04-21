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

const splitsPanel = document.createElement('div');
splitsPanel.id = 'splits-panel';
splitsPanel.className = 'game-overlay';
splitsPanel.style.display = 'none';
splitsPanel.innerHTML = `
  <div class="splits-header">
    <span class="splits-profile-name">Default</span>
    <button class="splits-close">&times;</button>
  </div>
  <div class="splits-time">00:00.000</div>
  <div class="splits-delta"></div>
  <div class="splits-segments"></div>
`;

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
  
  const container = splitsPanel.querySelector('.splits-segments');
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
  const profile = profiles[currentProfileIndex];
  if (!profile) return;
  
  splitsPanel.querySelector('.splits-profile-name').textContent = profile.name;
  
  const totalTime = isRunning ? Date.now() - startTime + pausedTime : pausedTime;
  splitsPanel.querySelector('.splits-time').textContent = formatTime(totalTime);
  
  if (profile && profile.segments.length > 0) {
    const pbTotal = profile.segments.reduce((sum, s) => sum + (s.personalBest || 0), 0);
    const delta = totalTime - pbTotal;
    const deltaEl = splitsPanel.querySelector('.splits-delta');
    deltaEl.textContent = formatDelta(delta);
    deltaEl.className = 'splits-delta ' + (delta > 0 ? 'behind' : delta < 0 ? 'ahead' : '');
  }
  
  renderSegments();
}

function initSplits(gameName) {
  profiles = getOrCreateProfiles();
  currentProfileIndex = 0;
  segmentTimes = [];
  currentSegment = 0;
  isRunning = false;
  startTime = 0;
  pausedTime = 0;
  
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
  splitsPanel.style.display = settings.visible ? 'block' : 'none';
  if (settings.visible) renderSplits();
}

function updateSplitsPosition(position) {
  const settings = getSettings();
  settings.position = position;
  saveSettings(settings);
  
  splitsPanel.className = 'game-overlay splits-' + position;
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
  
  switch (e.key) {
    case 'F7':
      e.preventDefault();
      if (!isRunning) startSplits();
      break;
    case 'F8':
      e.preventDefault();
      if (isRunning) split();
      break;
    case 'F9':
      e.preventDefault();
      resetSplits();
      break;
    case 'F10':
      e.preventDefault();
      skipSegment();
      break;
    case 'F5':
      e.preventDefault();
      switchProfile(e.shiftKey ? -1 : 1);
      break;
  }
});

document.body.appendChild(splitsPanel);

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