const SPLITS_KEY = 'webmu-splits';
const SPLITS_SETTINGS_KEY = 'webmu-splits-settings';

const DEFAULT_SETTINGS = {
  position: 'bottom-left',
  fontSize: 'medium',
  visible: true
};

function getSettings() {
  const raw = localStorage.getItem(SPLITS_SETTINGS_KEY);
  try { return raw ? JSON.parse(raw) : DEFAULT_SETTINGS; } catch { return DEFAULT_SETTINGS; }
}

function saveSettings(settings) { localStorage.setItem(SPLITS_SETTINGS_KEY, JSON.stringify(settings)); }

function getProfiles() {
  const raw = localStorage.getItem(SPLITS_KEY);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

function getOrCreateProfiles() {
  let profiles = getProfiles();
  if (profiles.length === 0) {
    profiles = [{ name: 'Default', gameFilter: '', segments: [{ name: 'Any%', personalBest: 0 }] }];
    localStorage.setItem(SPLITS_KEY, JSON.stringify(profiles));
  }
  return profiles;
}

const splitsPanel = document.createElement('div');
splitsPanel.id = 'splits-panel';
splitsPanel.className = 'splits-overlay';
splitsPanel.innerHTML = `
  <div class="splits-header">
    <span class="splits-profile-name">Default</span>
  </div>
  <div class="splits-time">00:00.000</div>
  <div class="splits-delta"></div>
  <div class="splits-segments"></div>
  <div class="splits-controls">
    <span>F7 Start | F8 Split | F9 Reset | F10 Skip | F5 Profile</span>
  </div>
`;

let currentProfileIndex = 0;
let profiles = [];
let isRunning = false;
let startTime = 0;
let currentSegment = 0;
let segmentTimes = [];
let pausedTime = 0;

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

function renderSplits() {
  const profile = profiles[currentProfileIndex];
  if (!profile) return;
  
  splitsPanel.querySelector('.splits-profile-name').textContent = profile.name;
  
  const totalTime = isRunning ? Date.now() - startTime + pausedTime : pausedTime;
  splitsPanel.querySelector('.splits-time').textContent = formatTime(totalTime);
  
  if (profile.segments.length > 0) {
    const pbTotal = profile.segments.reduce((sum, s) => sum + (s.personalBest || 0), 0);
    const delta = totalTime - pbTotal;
    const deltaEl = splitsPanel.querySelector('.splits-delta');
    deltaEl.textContent = formatDelta(delta);
    deltaEl.className = 'splits-delta ' + (delta > 0 ? 'behind' : delta < 0 ? 'ahead' : '');
  }
  
  const container = splitsPanel.querySelector('.splits-segments');
  container.innerHTML = '';
  profile.segments.forEach((seg, idx) => {
    const el = document.createElement('div');
    el.className = 'split-segment';
    if (idx === currentSegment) el.classList.add('current');
    if (segmentTimes[idx] !== undefined) el.classList.add('completed');
    const time = segmentTimes[idx] || 0;
    el.innerHTML = `<span class="seg-name">${seg.name}</span><span class="seg-time">${formatTime(time)}</span>`;
    container.appendChild(el);
  });
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
    profile.segments[currentSegment].personalBest = Math.min(profile.segments[currentSegment].personalBest || now, now);
    localStorage.setItem(SPLITS_KEY, JSON.stringify(profiles));
  }
  if (currentSegment < profile.segments.length - 1) currentSegment++;
  else isRunning = false;
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
  if (currentSegment < profile.segments.length - 1) currentSegment++;
  else isRunning = false;
  renderSplits();
}

function switchProfile(delta) {
  if (profiles.length <= 1) return;
  currentProfileIndex = (currentProfileIndex + delta + profiles.length) % profiles.length;
  resetSplits();
  renderSplits();
}

document.addEventListener('keydown', e => {
  if (!window.WebMuGameActive) return;
  
  switch (e.key) {
    case '1': e.preventDefault(); if (!isRunning) startSplits(); break;
    case '2': e.preventDefault(); if (isRunning) split(); break;
    case '3': e.preventDefault(); resetSplits(); break;
    case '4': e.preventDefault(); skipSegment(); break;
    case '5': e.preventDefault(); switchProfile(e.shiftKey ? -1 : 1); break;
    case '6': e.preventDefault(); 
      splitsPanel.style.display = splitsPanel.style.display === 'none' ? 'block' : 'none';
      break;
  }
});

document.body.appendChild(splitsPanel);

function initSplitsOverlay(gameName) {
  profiles = getOrCreateProfiles();
  currentProfileIndex = 0;
  splitsPanel.style.display = 'block';
  if (gameName) {
    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      if (profile.gameFilter) {
        try {
          const regex = new RegExp(profile.gameFilter, 'i');
          if (regex.test(gameName)) { currentProfileIndex = i; break; }
        } catch {
          if (profile.gameFilter.toLowerCase().includes(gameName.toLowerCase())) { currentProfileIndex = i; break; }
        }
      }
    }
  }
  renderSplits();
}

function cleanupOverlay() {
  isRunning = false;
  currentSegment = 0;
  segmentTimes = [];
  pausedTime = 0;
}

window.WebMuOverlay = { initOverlay: initSplitsOverlay, cleanupOverlay: cleanupOverlay };