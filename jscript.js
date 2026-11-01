/**
 * Multi Stopwatch — Complete Engine
 * Stopwatches, Canvas Drag-and-Drop, Themes & Custom Colors, and Firebase Cloud Sync
 */

// Global State
let watches = [];
let notes = [];
let idCounter = 0;
let noteIdCounter = 0;
let currentLayout = 'grid'; // 'grid' | 'inline' | 'canvas'
let currentTheme = 'dark';
let customColors = {};
let db = null;
let cloudSyncActive = false;
let initialCloudCheckComplete = false;
let saveDebounceTimer = null;

const THEME_DEFAULTS = {
  dark: {
    '--bg': '#0d1b2a',
    '--surface': '#132236',
    '--accent': '#4a9eff',
    '--text': '#e8f0fe'
  },
  light: {
    '--bg': '#f5f7fa',
    '--surface': '#ffffff',
    '--accent': '#2563eb',
    '--text': '#0f172a'
  },
  notebook: {
    '--bg': '#f6f1e7',
    '--surface': '#fffdf9',
    '--accent': '#b45309',
    '--text': '#2d2621'
  },
  cyber: {
    '--bg': '#090a0f',
    '--surface': '#11131c',
    '--accent': '#00f0ff',
    '--text': '#f0f4fc'
  }
};

/* ========================================================= */
/* Firebase Cloud Initialization */
/* ========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyCyXhVv05H51JMmtZ3gQ_zSWPQ_3PIHwfk",
  authDomain: "sandbox-ed1e2.firebaseapp.com",
  projectId: "sandbox-ed1e2",
  storageBucket: "sandbox-ed1e2.firebasestorage.app",
  messagingSenderId: "741844679458",
  appId: "1:741844679458:web:ee17e13df00069fcac837b"
};

function initFirebase() {
  const dot = document.getElementById('cloud-status-dot');
  const text = document.getElementById('cloud-status-text');

  if (typeof firebase === 'undefined') {
    initialCloudCheckComplete = true;
    if (dot) dot.classList.add('offline');
    if (text) text.textContent = 'Local Mode (Firebase offline)';
    return;
  }

  // Fallback timer: if cloud doesn't respond within 3 seconds, allow local saves
  setTimeout(() => {
    if (!initialCloudCheckComplete) {
      initialCloudCheckComplete = true;
    }
  }, 3000);

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();

    // Listen for remote real-time updates on workspace document
    db.collection('workspaces').doc('main_workspace').onSnapshot(doc => {
      cloudSyncActive = true;
      if (dot) dot.classList.remove('offline');
      if (text) text.textContent = 'Cloud Synced (Firebase)';

      if (!initialCloudCheckComplete) {
        initialCloudCheckComplete = true;
        // On initial startup: if cloud has data, cloud ALWAYS wins over fresh unseeded local devices
        if (doc.exists && doc.data() && Array.isArray(doc.data().watches) && doc.data().watches.length > 0) {
          applyRemoteState(doc.data());
          return;
        } else if (watches.length > 0 && localStorage.getItem('watches')) {
          // Cloud document is empty or new, but this client already has real saved watches
          saveAllState();
          return;
        }
      }

      // Subsequent live updates from other devices while app is open
      if (doc.exists) {
        const data = doc.data();
        if (data.watches && Array.isArray(data.watches) && data.updatedAt) {
          const localUpdated = Number(localStorage.getItem('stopwatch_last_updated') || 0);
          if (data.updatedAt > localUpdated) {
            applyRemoteState(data);
          }
        }
      }
    }, err => {
      console.warn('Firebase sync warning:', err);
      initialCloudCheckComplete = true;
      if (dot) dot.classList.add('offline');
      if (text) text.textContent = 'Local Mode (Permission/Offline)';
    });
  } catch (err) {
    console.error('Firebase initialization error:', err);
    initialCloudCheckComplete = true;
    if (dot) dot.classList.add('offline');
    if (text) text.textContent = 'Local Mode';
  }
}

function applyRemoteState(data) {
  if (data.watches && Array.isArray(data.watches)) {
    watches.forEach(w => { if (w.interval) clearInterval(w.interval); });
    watches = [];
    document.querySelectorAll('.watch-card').forEach(c => c.remove());
    data.watches.forEach(w => {
      const watch = { ...w, interval: null };
      watches.push(watch);
      if (watch.id > idCounter) idCounter = watch.id;
      renderCard(watch);
      if (watch.running && watch.startTime) {
        const delta = Date.now() - watch.startTime;
        watch.elapsed += delta;
        watch.startTime = Date.now();
        watch.interval = setInterval(() => tick(watch.id), 50);
      }
      updateDisplay(watch.id);
      updateToggleBtn(watch);
    });
    document.getElementById('empty')?.remove();
    localStorage.setItem('watches', JSON.stringify(data.watches));
  }

  if (data.notes && Array.isArray(data.notes)) {
    notes = data.notes;
    document.querySelectorAll('.canvas-note').forEach(n => n.remove());
    notes.forEach(n => renderCanvasNote(n));
    localStorage.setItem('stopwatch_notes', JSON.stringify(notes));
  }

  if (data.theme && data.theme !== currentTheme) {
    selectTheme(data.theme, false);
    localStorage.setItem('stopwatch_theme', data.theme);
  }
  if (data.customColors) {
    customColors = data.customColors;
    applyAllCustomColors();
    localStorage.setItem('stopwatch_custom_colors', JSON.stringify(customColors));
  }
  if (data.layout && data.layout !== currentLayout) {
    switchLayout(data.layout, false);
    localStorage.setItem('stopwatch_layout', data.layout);
  }
  if (data.updatedAt) {
    localStorage.setItem('stopwatch_last_updated', String(data.updatedAt));
  }
}

/* ========================================================= */
/* Core Timing Utilities */
/* ========================================================= */
function pad(n) { return String(n).padStart(2, '0'); }

function formatTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return {
    main: h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`,
    ms: pad(cs)
  };
}

function find_time(id) {
  const w = watches.find(w => w.id === id);
  if (!w) return 0;
  const input = document.getElementById(`goal-${id}`);
  const timeText = input ? input.value.trim() : (w.goal || '');

  const regex = /([0-9]+(?:\.[0-9]+)?)\s*(s(ec(onds)?)?|m(in(utes)?)?|h(our(s)?)?)/i;
  const match = timeText.match(regex);

  let totalTime = 0;
  if (match) {
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith("h")) totalTime = value * 60 * 60 * 1000;
    else if (unit.startsWith("m")) totalTime = value * 60 * 1000;
    else totalTime = value * 1000;
  }
  return totalTime;
}

/* ========================================================= */
/* Stopwatch Operations */
/* ========================================================= */
function addWatch(shouldSave = true) {
  const id = ++idCounter;
  // Calculate canvas placement
  const col = (watches.length % 3);
  const row = Math.floor(watches.length / 3);
  const defaultX = 24 + col * 320;
  const defaultY = 24 + row * 220;

  const watch = {
    id,
    label: '',
    goal: '',
    elapsed: 0,
    running: false,
    startTime: null,
    interval: null,
    x: defaultX,
    y: defaultY
  };
  watches.push(watch);
  renderCard(watch);
  document.getElementById('empty')?.remove();
  if (shouldSave) scheduleSave();
}

function renderCard(watch) {
  const grid = document.getElementById('grid');
  const card = document.createElement('div');
  card.className = 'watch-card';
  card.id = `card-${watch.id}`;
  card.setAttribute('data-id', watch.id);

  if (currentLayout === 'canvas') {
    card.style.left = `${watch.x || 20}px`;
    card.style.top = `${watch.y || 20}px`;
  }

  card.innerHTML = `
    <div class="card-drag-handle" title="Drag to move card"></div>
    <div class="watch-top">
      <input class="label-input" placeholder="Label…" value="${escapeHtml(watch.label || '')}" 
        oninput="updateWatchLabel(${watch.id}, this.value)">
      <input class="label-input goal" id="goal-${watch.id}" placeholder="Goal" value="${escapeHtml(watch.goal || '')}" 
        oninput="updateWatchGoal(${watch.id}, this.value)">
      <button type="button" class="delete-btn" onclick="removeWatch(${watch.id})" title="Delete stopwatch">✕</button>
    </div>
    <div class="display-wrapper" onclick="toggle(${watch.id})" title="Tap to Start/Pause" role="button" tabindex="0">
      <div class="display" id="display-${watch.id}">
        <span class="time">00:00</span><span class="ms">.00</span>
      </div>
      <div class="progress-circle" id="circle-${watch.id}"></div>
    </div>
    <div class="controls">
      <button type="button" class="btn btn-start" id="toggle-${watch.id}" onclick="toggle(${watch.id})">Start</button>
      <button type="button" class="btn btn-reset" onclick="reset(${watch.id})">Reset</button>
    </div>
  `;

  // Attach drag listener for canvas mode
  attachDraggable(card, (newX, newY) => {
    watch.x = newX;
    watch.y = newY;
    scheduleSave();
  });

  grid.appendChild(card);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updateWatchLabel(id, val) {
  const w = watches.find(w => w.id === id);
  if (w) {
    w.label = val;
    scheduleSave();
  }
}

function updateWatchGoal(id, val) {
  const w = watches.find(w => w.id === id);
  if (w) {
    w.goal = val;
    updateDisplay(id);
    scheduleSave();
  }
}

function toggle(id) {
  const w = watches.find(w => w.id === id);
  if (!w) return;

  if (navigator.vibrate) {
    try { navigator.vibrate(25); } catch(e) {}
  }

  if (w.running) {
    clearInterval(w.interval);
    w.elapsed += Date.now() - w.startTime;
    w.running = false;
    w.startTime = null;
  } else {
    w.startTime = Date.now();
    w.running = true;
    w.interval = setInterval(() => tick(id), 50);
  }
  updateToggleBtn(w);
  document.getElementById(`card-${id}`)?.classList.toggle('running', w.running);
  scheduleSave();
}

function tick(id) {
  updateDisplay(id);
}

function updateDisplay(id) {
  const w = watches.find(w => w.id === id);
  if (!w) return;

  const totalElapsed = w.elapsed + (w.running ? (Date.now() - w.startTime) : 0);
  const totalGoal = find_time(id);

  const { main, ms } = formatTime(totalElapsed);
  const disp = document.getElementById(`display-${id}`);
  if (disp) disp.innerHTML = `<span class="time">${main}</span><span class="ms">.${ms}</span>`;

  const circle = document.getElementById(`circle-${id}`);
  if (circle) {
    if (totalGoal > 0) {
      let percent = Math.min((totalElapsed / totalGoal) * 100, 100);
      circle.style.setProperty('--percentage', percent + '%');
      circle.style.background = percent >= 100 
        ? 'var(--green)' 
        : `conic-gradient(var(--accent) ${percent}%, var(--surface2) 0)`;
      circle.style.border = percent >= 100 ? '2px solid var(--green)' : 'none';
    } else {
      circle.style.background = 'var(--surface2)';
      circle.style.border = 'none';
    }
  }
}

function reset(id) {
  const w = watches.find(w => w.id === id);
  if (!w) return;

  if (navigator.vibrate) {
    try { navigator.vibrate([15, 30, 15]); } catch(e) {}
  }

  clearInterval(w.interval);
  w.elapsed = 0;
  w.running = false;
  w.startTime = null;

  updateDisplay(id);
  updateToggleBtn(w);
  document.getElementById(`card-${id}`)?.classList.remove('running');
  scheduleSave();
}

function updateToggleBtn(w) {
  const btn = document.getElementById(`toggle-${w.id}`);
  if (!btn) return;
  btn.textContent = w.running ? 'Pause' : 'Start';
  btn.className = `btn ${w.running ? 'btn-pause' : 'btn-start'}`;
}

function removeWatch(id) {
  const w = watches.find(w => w.id === id);
  if (w && w.interval) clearInterval(w.interval);
  watches = watches.filter(w => w.id !== id);
  document.getElementById(`card-${id}`)?.remove();

  if (watches.length === 0 && notes.length === 0) {
    const grid = document.getElementById('grid');
    if (!document.getElementById('empty')) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.id = 'empty';
      empty.textContent = 'No stopwatches yet. Add one above.';
      grid.appendChild(empty);
    }
  }
  scheduleSave();
}

/* ========================================================= */
/* Canvas Notes & Freeform Dragging */
/* ========================================================= */
function addCanvasNote(savedNote = null) {
  const id = savedNote ? savedNote.id : ++noteIdCounter;
  const note = savedNote || {
    id,
    text: '',
    x: 40 + (notes.length * 30),
    y: 260 + (notes.length * 20)
  };
  if (!savedNote) notes.push(note);
  renderCanvasNote(note);
  if (!savedNote) scheduleSave();
}

function renderCanvasNote(note) {
  const grid = document.getElementById('grid');
  const el = document.createElement('div');
  el.className = 'canvas-note';
  el.id = `note-${note.id}`;

  if (currentLayout === 'canvas') {
    el.style.left = `${note.x}px`;
    el.style.top = `${note.y}px`;
  }

  el.innerHTML = `
    <div class="canvas-note-header">
      <span>NOTE</span>
      <button type="button" class="delete-btn" onclick="removeCanvasNote(${note.id})" title="Delete note">✕</button>
    </div>
    <textarea class="canvas-note-textarea" placeholder="Type notes here…">${escapeHtml(note.text || '')}</textarea>
  `;

  const textarea = el.querySelector('textarea');
  textarea.addEventListener('input', (e) => {
    note.text = e.target.value;
    scheduleSave();
  });

  attachDraggable(el, (newX, newY) => {
    note.x = newX;
    note.y = newY;
    scheduleSave();
  });

  grid.appendChild(el);
}

function removeCanvasNote(id) {
  notes = notes.filter(n => n.id !== id);
  document.getElementById(`note-${id}`)?.remove();
  scheduleSave();
}

function resetCanvasPositions() {
  const cols = 3;
  const startX = 24;
  const startY = 24;
  const cardWidth = 320;
  const cardHeight = 220;

  watches.forEach((w, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    w.x = startX + c * cardWidth;
    w.y = startY + r * cardHeight;
    const card = document.getElementById(`card-${w.id}`);
    if (card) {
      card.style.left = `${w.x}px`;
      card.style.top = `${w.y}px`;
    }
  });

  const notesStartY = startY + (Math.ceil(watches.length / cols) * cardHeight) + 20;
  notes.forEach((n, i) => {
    n.x = startX + (i % 4) * 240;
    n.y = notesStartY + Math.floor(i / 4) * 160;
    const el = document.getElementById(`note-${n.id}`);
    if (el) {
      el.style.left = `${n.x}px`;
      el.style.top = `${n.y}px`;
    }
  });

  scheduleSave();
}

/* ========================================================= */
/* Drag-and-Drop Handler Engine (Mouse + Touch Support) */
/* ========================================================= */
function attachDraggable(element, onMoveCallback) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  function getClientCoords(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.changedTouches && e.changedTouches.length > 0) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  function onDragStart(e) {
    if (currentLayout !== 'canvas') return;
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'button' || e.target.closest('button')) {
      return;
    }

    const coords = getClientCoords(e);
    isDragging = true;
    startX = coords.x;
    startY = coords.y;

    const rect = element.getBoundingClientRect();
    const parentRect = element.parentElement.getBoundingClientRect();
    initialLeft = rect.left - parentRect.left;
    initialTop = rect.top - parentRect.top;

    element.style.zIndex = '1000';

    function onDragMove(moveEvent) {
      if (!isDragging) return;
      const moveCoords = getClientCoords(moveEvent);
      const dx = moveCoords.x - startX;
      const dy = moveCoords.y - startY;

      let nextX = Math.max(10, initialLeft + dx);
      let nextY = Math.max(10, initialTop + dy);

      element.style.left = `${nextX}px`;
      element.style.top = `${nextY}px`;
      if (moveEvent.cancelable) moveEvent.preventDefault();
    }

    function onDragEnd(upEvent) {
      if (!isDragging) return;
      isDragging = false;
      element.style.zIndex = element.classList.contains('canvas-note') ? '5' : '10';

      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('mouseup', onDragEnd);
      window.removeEventListener('touchmove', onDragMove);
      window.removeEventListener('touchend', onDragEnd);

      const endCoords = getClientCoords(upEvent);
      const dx = endCoords.x - startX;
      const dy = endCoords.y - startY;
      const finalX = Math.max(10, initialLeft + dx);
      const finalY = Math.max(10, initialTop + dy);
      onMoveCallback(finalX, finalY);
    }

    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('touchmove', onDragMove, { passive: false });
    window.addEventListener('touchend', onDragEnd);
  }

  element.addEventListener('mousedown', onDragStart);
  element.addEventListener('touchstart', onDragStart, { passive: true });
}

/* ========================================================= */
/* Layout Switcher */
/* ========================================================= */
function switchLayout(layout, shouldSave = true) {
  currentLayout = layout;
  const grid = document.getElementById('grid');
  document.body.classList.toggle('is-canvas-mode', layout === 'canvas');

  // Update button active states
  document.querySelectorAll('.layout-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`btn-layout-${layout}`)?.classList.add('active');

  grid.classList.remove('layout-inline', 'layout-canvas');

  if (layout === 'inline') {
    grid.classList.add('layout-inline');
    // Clear inline absolute positions
    document.querySelectorAll('.watch-card, .canvas-note').forEach(el => {
      el.style.left = '';
      el.style.top = '';
    });
  } else if (layout === 'canvas') {
    grid.classList.add('layout-canvas');
    // Restore saved coordinates
    watches.forEach(w => {
      const card = document.getElementById(`card-${w.id}`);
      if (card) {
        card.style.left = `${w.x || 20}px`;
        card.style.top = `${w.y || 20}px`;
      }
    });
    notes.forEach(n => {
      const noteEl = document.getElementById(`note-${n.id}`);
      if (noteEl) {
        noteEl.style.left = `${n.x || 30}px`;
        noteEl.style.top = `${n.y || 30}px`;
      }
    });
  } else {
    // Grid mode
    document.querySelectorAll('.watch-card, .canvas-note').forEach(el => {
      el.style.left = '';
      el.style.top = '';
    });
  }

  if (shouldSave) scheduleSave();
}

/* ========================================================= */
/* Theme & Styling Engine */
/* ========================================================= */
function selectTheme(themeName, shouldSave = true) {
  currentTheme = themeName;
  document.documentElement.setAttribute('data-theme', themeName);

  document.querySelectorAll('.theme-card').forEach(card => card.classList.remove('active'));
  document.getElementById(`theme-card-${themeName}`)?.classList.add('active');

  // Sync color pickers with theme defaults if not customized
  const defaults = THEME_DEFAULTS[themeName] || THEME_DEFAULTS.dark;
  syncPickersToValues(defaults);

  if (shouldSave) scheduleSave();
}

function updateCustomColor(cssVar, value, shouldSave = true) {
  customColors[cssVar] = value;
  document.documentElement.style.setProperty(cssVar, value);

  // Compute complementary derived variables
  if (cssVar === '--accent') {
    document.documentElement.style.setProperty('--accent-dim', hexToRgba(value, 0.16));
  }
  if (cssVar === '--surface') {
    document.documentElement.style.setProperty('--surface2', adjustBrightness(value, 15));
  }

  if (shouldSave) scheduleSave();
}

function resetCustomColors() {
  customColors = {};
  ['--bg', '--surface', '--surface2', '--accent', '--accent-dim', '--text'].forEach(v => {
    document.documentElement.style.removeProperty(v);
  });
  const defaults = THEME_DEFAULTS[currentTheme] || THEME_DEFAULTS.dark;
  syncPickersToValues(defaults);
  localStorage.removeItem('stopwatch_custom_colors');
  scheduleSave();
}

function syncPickersToValues(palette) {
  const bgInput = document.getElementById('color-bg');
  const surfInput = document.getElementById('color-surface');
  const accInput = document.getElementById('color-accent');
  const textInput = document.getElementById('color-text');

  if (bgInput) bgInput.value = customColors['--bg'] || palette['--bg'];
  if (surfInput) surfInput.value = customColors['--surface'] || palette['--surface'];
  if (accInput) accInput.value = customColors['--accent'] || palette['--accent'];
  if (textInput) textInput.value = customColors['--text'] || palette['--text'];
}

function applyAllCustomColors() {
  for (const [v, val] of Object.entries(customColors)) {
    if (val) {
      document.documentElement.style.setProperty(v, val);
      if (v === '--accent') document.documentElement.style.setProperty('--accent-dim', hexToRgba(val, 0.16));
      if (v === '--surface') document.documentElement.style.setProperty('--surface2', adjustBrightness(val, 15));
    }
  }
  syncPickersToValues(THEME_DEFAULTS[currentTheme] || THEME_DEFAULTS.dark);
}

function hexToRgba(hex, alpha) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

function adjustBrightness(hex, percent) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  let r = Math.min(255, Math.max(0, ((num >> 16) & 255) + percent));
  let g = Math.min(255, Math.max(0, ((num >> 8) & 255) + percent));
  let b = Math.min(255, Math.max(0, (num & 255) + percent));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function toggleSettingsDrawer(open) {
  const drawer = document.getElementById('settings-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  if (drawer && backdrop) {
    drawer.classList.toggle('open', open);
    backdrop.classList.toggle('open', open);
  }
}

// Close drawer on Escape
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') toggleSettingsDrawer(false);
});

/* ========================================================= */
/* Persistence & State Sync */
/* ========================================================= */
function scheduleSave() {
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    saveAllState();
  }, 250);
}

function saveAllState() {
  const timestamp = Date.now();
  const dataToSave = watches.map(w => ({
    id: w.id,
    label: w.label || '',
    goal: w.goal || '',
    elapsed: w.elapsed,
    running: w.running,
    startTime: w.running ? w.startTime : null,
    x: w.x || 20,
    y: w.y || 20
  }));

  const payload = {
    watches: dataToSave,
    notes,
    theme: currentTheme,
    customColors,
    layout: currentLayout,
    updatedAt: timestamp
  };

  // Local Storage
  localStorage.setItem('watches', JSON.stringify(dataToSave));
  localStorage.setItem('stopwatch_notes', JSON.stringify(notes));
  localStorage.setItem('stopwatch_theme', currentTheme);
  localStorage.setItem('stopwatch_custom_colors', JSON.stringify(customColors));
  localStorage.setItem('stopwatch_layout', currentLayout);
  localStorage.setItem('stopwatch_last_updated', String(timestamp));

  // Firebase Cloud Storage (only save if initial cloud check has completed)
  if (db && initialCloudCheckComplete) {
    db.collection('workspaces').doc('main_workspace').set(payload, { merge: true })
      .catch(err => console.warn('Could not save to Firebase:', err));
  }
}

function manualSync() {
  const text = document.getElementById('cloud-status-text');
  if (text) text.textContent = 'Syncing…';
  initialCloudCheckComplete = true;
  saveAllState();
  setTimeout(() => {
    if (text) text.textContent = cloudSyncActive ? 'Cloud Synced' : 'Saved to Local Storage';
  }, 400);
}

function loadLocalState() {
  // Theme & Colors
  const savedTheme = localStorage.getItem('stopwatch_theme') || 'dark';
  selectTheme(savedTheme, false);

  const savedColors = localStorage.getItem('stopwatch_custom_colors');
  if (savedColors) {
    try {
      customColors = JSON.parse(savedColors);
      applyAllCustomColors();
    } catch (e) {}
  }

  // Layout
  const savedLayout = localStorage.getItem('stopwatch_layout') || 'grid';
  switchLayout(savedLayout, false);

  // Watches
  const savedWatches = localStorage.getItem('watches');
  if (savedWatches) {
    try {
      const parsed = JSON.parse(savedWatches);
      parsed.forEach(w => {
        const watch = { ...w, interval: null };
        watches.push(watch);
        if (watch.id > idCounter) idCounter = watch.id;
        renderCard(watch);
        if (watch.running && watch.startTime) {
          const delta = Date.now() - watch.startTime;
          watch.elapsed += delta;
          watch.startTime = Date.now();
          watch.interval = setInterval(() => tick(watch.id), 50);
        }
        updateDisplay(watch.id);
        updateToggleBtn(watch);
      });
      document.getElementById('empty')?.remove();
    } catch (e) {
      console.error(e);
    }
  }

  // Notes
  const savedNotes = localStorage.getItem('stopwatch_notes');
  if (savedNotes) {
    try {
      notes = JSON.parse(savedNotes);
      notes.forEach(n => {
        if (n.id > noteIdCounter) noteIdCounter = n.id;
        renderCanvasNote(n);
      });
    } catch (e) {}
  }

  if (watches.length === 0) {
    // Populate placeholder cards locally without scheduling a cloud overwrite
    addWatch(false);
    addWatch(false);
    addWatch(false);
  }
}

/* ========================================================= */
/* Initialization */
/* ========================================================= */
loadLocalState();
initFirebase();
