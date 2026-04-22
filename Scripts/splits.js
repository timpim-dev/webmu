const SPLITS_KEY = 'webmu-splits';
const SPLITS_SETTINGS_KEY = 'webmu-splits-settings';

const DEFAULT_SETTINGS = {
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
  try { return raw ? JSON.parse(raw) : DEFAULT_SETTINGS; } catch { return DEFAULT_SETTINGS; }
}

function saveSettings(settings) {
  localStorage.setItem(SPLITS_SETTINGS_KEY, JSON.stringify(settings));
}

function getProfiles() {
  const raw = localStorage.getItem(SPLITS_KEY);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
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
let rafId = null;
let panelOpen = false;

const PANEL_WIDTH = 280;

const panel = document.createElement('div');
panel.id = 'splits-panel';
panel.innerHTML = `
  <div class="splits-header">
    <span class="splits-profile-name">Default</span>
    <button class="splits-close" id="splits-close-btn" title="Close">&times;</button>
  </div>
  <div class="splits-body">
    <div class="splits-timer">00:00.000</div>
    <div class="splits-delta"></div>
    <div class="splits-segments"></div>
  </div>
  <div class="splits-footer">
    <span>1 Start &nbsp; 2 Split &nbsp; 3 Reset &nbsp; 4 Skip &nbsp; 5 Profile &nbsp; 6 Toggle</span>
  </div>
`;

function formatTime(ms) {
  if (!ms || ms <= 0) return '00:00.000';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function formatDelta(ms) {
  if (!ms || ms === 0) return '';
  return (ms > 0 ? '+' : '-') + formatTime(Math.abs(ms));
}

function renderSegments() {
  const profile = profiles[currentProfileIndex];
  if (!profile) return;
  const container = panel.querySelector('.splits-segments');
  container.innerHTML = '';
  profile.segments.forEach((seg, idx) => {
    const el = document.createElement('div');
    el.className = 'split-segment';
    if (idx === currentSegment) el.classList.add('current');
    if (segmentTimes[idx] !== undefined && segmentTimes[idx] >= 0) el.classList.add('completed');
    if (segmentTimes[idx] === -1) el.classList.add('skipped');
    const time = segmentTimes[idx] || 0;
    const pb = seg.personalBest || 0;
    const delta = time > 0 && pb > 0 ? time - pb : 0;
    el.innerHTML = `<span class="seg-name">${seg.name}</span><span class="seg-time">${formatTime(time)}</span><span class="seg-delta">${formatDelta(delta)}</span>`;
    container.appendChild(el);
  });
}

function renderSplits() {
  const profile = profiles[currentProfileIndex];
  if (!profile) return;
  panel.querySelector('.splits-profile-name').textContent = profile.name;
  const totalTime = isRunning ? Date.now() - startTime + pausedTime : pausedTime;
  panel.querySelector('.splits-timer').textContent = formatTime(totalTime);
  if (profile.segments.length > 0) {
    const pbTotal = profile.segments.reduce((sum, s) => sum + (s.personalBest || 0), 0);
    const delta = totalTime - pbTotal;
    const deltaEl = panel.querySelector('.splits-delta');
    deltaEl.textContent = formatDelta(delta);
    deltaEl.className = 'splits-delta ' + (delta > 0 ? 'behind' : delta < 0 ? 'ahead' : '');
  }
  renderSegments();
}

function tick() {
  if (!isRunning) return;
  panel.querySelector('.splits-timer').textContent = formatTime(Date.now() - startTime + pausedTime);
  const profile = profiles[currentProfileIndex];
  if (profile && profile.segments.length > 0) {
    const pbTotal = profile.segments.reduce((sum, s) => sum + (s.personalBest || 0), 0);
    const delta = Date.now() - startTime + pausedTime - pbTotal;
    const deltaEl = panel.querySelector('.splits-delta');
    deltaEl.textContent = formatDelta(delta);
    deltaEl.className = 'splits-delta ' + (delta > 0 ? 'behind' : delta < 0 ? 'ahead' : '');
  }
  rafId = requestAnimationFrame(tick);
}

function initSplits(gameName) {
  profiles = getOrCreateProfiles();
  currentProfileIndex = 0;
  segmentTimes = [];
  currentSegment = 0;
  isRunning = false;
  startTime = 0;
  pausedTime = 0;
  if (rafId) cancelAnimationFrame(rafId);
  if (gameName) {
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      if (p.gameFilter) {
        try {
          if (new RegExp(p.gameFilter, 'i').test(gameName)) { currentProfileIndex = i; break; }
        } catch {
          if (p.gameFilter.toLowerCase().includes(gameName.toLowerCase())) { currentProfileIndex = i; break; }
        }
      }
    }
  }
  const settings = getSettings();
  panelOpen = settings.visible;
  panel.classList.toggle('open', panelOpen);
  document.body.classList.toggle('splits-open', panelOpen);
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
  tick();
}

function split() {
  if (!isRunning) return;
  const profile = profiles[currentProfileIndex];
  if (!profile) return;
  const now = Date.now() - startTime + pausedTime;
  segmentTimes[currentSegment] = now;
  if (profile.segments[currentSegment]) {
    const seg = profile.segments[currentSegment];
    seg.personalBest = seg.personalBest === 0 ? now : Math.min(seg.personalBest, now);
    saveProfiles(profiles);
  }
  if (currentSegment < profile.segments.length - 1) {
    currentSegment++;
  } else {
    isRunning = false;
    pausedTime = now;
    if (rafId) cancelAnimationFrame(rafId);
  }
  renderSplits();
}

function resetSplits() {
  isRunning = false;
  currentSegment = 0;
  segmentTimes = [];
  pausedTime = 0;
  if (rafId) cancelAnimationFrame(rafId);
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
    if (rafId) cancelAnimationFrame(rafId);
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
  panelOpen = !panelOpen;
  const settings = getSettings();
  settings.visible = panelOpen;
  saveSettings(settings);
  panel.classList.toggle('open', panelOpen);
  document.body.classList.toggle('splits-open', panelOpen);
}

panel.querySelector('.splits-close').addEventListener('click', () => {
  if (!panelOpen) return;
  toggleSplits();
});

document.addEventListener('keydown', e => {
  if (!window.WebMuGameActive) return;
  switch (e.key) {
    case '1':
      e.preventDefault();
      startSplits();
      break;
    case '2':
      e.preventDefault();
      split();
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

document.head.insertAdjacentHTML('beforeend', `
<style>
#splits-panel {
  position: fixed;
  top: 0;
  right: -${PANEL_WIDTH}px;
  width: ${PANEL_WIDTH}px;
  height: 100vh;
  background: var(--card);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  z-index: 9001;
  transition: right 0.2s ease;
  font-size: 13px;
  overflow: hidden;
}
#splits-panel.open {
  right: 0;
}
.splits-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.splits-profile-name {
  color: var(--accent);
  font-weight: 600;
  font-size: 14px;
}
.splits-close {
  background: none;
  border: none;
  color: var(--muted2);
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.splits-close:hover { color: var(--accent); }
.splits-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.splits-timer {
  font-family: monospace;
  font-size: 22px;
  color: var(--accent);
  letter-spacing: 0.5px;
  text-align: center;
  margin-bottom: 4px;
}
.splits-delta {
  text-align: center;
  font-size: 12px;
  font-family: monospace;
  margin-bottom: 12px;
  min-height: 16px;
}
.splits-delta.ahead { color: #4ade80; }
.splits-delta.behind { color: #f87171; }
.splits-segments {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.split-segment {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
  padding: 5px 8px;
  border-radius: 4px;
  border: 1px solid transparent;
}
.split-segment.current {
  background: var(--bg);
  border-color: var(--accent);
}
.split-segment.completed .seg-time { color: var(--accent); }
.split-segment.skipped { opacity: 0.4; }
.seg-name { color: var(--muted2); }
.seg-time { font-family: monospace; color: var(--accent); font-size: 12px; }
.seg-delta { font-family: monospace; font-size: 11px; min-width: 70px; text-align: right; }
.seg-delta.ahead { color: #4ade80; }
.seg-delta.behind { color: #f87171; }
.splits-footer {
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--muted2);
  text-align: center;
  flex-shrink: 0;
}
</style>
`);

document.body.appendChild(panel);

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
  saveSettings
};