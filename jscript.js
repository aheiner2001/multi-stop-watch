/**
 * Multi Stopwatch — Complete Engine
 * Stopwatches, Canvas Drag-and-Drop, Themes & Custom Colors, and Firebase Cloud Sync
 */

// Global State
let watches = [];
let notes = [];
let idCounter = 0;
let noteIdCounter = 0;
const CANVAS_STEP = 24;
const canvasSelection = new Set();
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
  canvasSelection.clear();
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
    notes.forEach(note => {
      noteIdCounter = Math.max(noteIdCounter, note.id);
      renderCanvasNote(note);
    });
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
  refreshCanvas();
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
  const defaultX = CANVAS_STEP + col * 336;
  const defaultY = CANVAS_STEP + row * 264;

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

  card.innerHTML = `
    <button type="button" class="card-drag-handle" aria-label="Move stopwatch" title="Drag or use arrow keys to move"></button>
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

  grid.appendChild(card);
  attachCanvasControls(card, watch, card.querySelector('.card-drag-handle'));
  refreshCanvas();
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
  refreshCanvas();

  if (watches.length === 0) {
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
/* Canvas layout */
function addCanvasNote() {
  const note = {
    id: ++noteIdCounter,
    text: '',
    x: CANVAS_STEP + (notes.length % 4) * 240,
    y: CANVAS_STEP + Math.ceil(watches.length / 3) * 264 + Math.floor(notes.length / 4) * 168
  };
  notes.push(note);
  renderCanvasNote(note);
  scheduleSave();
}

function renderCanvasNote(note) {
  const grid = document.getElementById('grid');
  const el = document.createElement('div');
  el.className = 'canvas-note';
  el.id = `note-${note.id}`;
  el.innerHTML = `
    <div class="canvas-note-header">
      <button type="button" class="note-drag-handle" aria-label="Move note" title="Drag or use arrow keys to move">NOTE</button>
      <button type="button" class="delete-btn" onclick="removeCanvasNote(${note.id})" title="Delete note">✕</button>
    </div>
    <textarea class="canvas-note-textarea" placeholder="Type notes here…">${escapeHtml(note.text || '')}</textarea>
  `;

  el.querySelector('textarea').addEventListener('input', (event) => {
    note.text = event.target.value;
    scheduleSave();
  });

  grid.appendChild(el);
  attachCanvasControls(el, note, el.querySelector('.note-drag-handle'));
  refreshCanvas();
}

function removeCanvasNote(id) {
  notes = notes.filter(note => note.id !== id);
  document.getElementById(`note-${id}`)?.remove();
  refreshCanvas();
  scheduleSave();
}

function canvasItems() {
  return [
    ...watches.map(data => ({ data, key: `card-${data.id}`, type: 'stopwatch' })),
    ...notes.map(data => ({ data, key: `note-${data.id}`, type: 'note' }))
  ];
}

function canvasBounds(item) {
  const { data, type } = item;
  const timer = type === 'stopwatch';
  return {
    x: Math.max(0, data.x ?? CANVAS_STEP),
    y: Math.max(0, data.y ?? CANVAS_STEP),
    width: data.width ?? (timer ? 288 : 216),
    height: data.height ?? (timer ? 240 : 144)
  };
}

function snapCanvas(value, minimum = 0) {
  return Math.max(minimum, Math.round(value / CANVAS_STEP) * CANVAS_STEP);
}

function paintCanvasItem(element, bounds) {
  element.style.left = bounds ? `${bounds.x}px` : '';
  element.style.top = bounds ? `${bounds.y}px` : '';
  element.style.width = bounds ? `${bounds.width}px` : '';
  element.style.height = bounds ? `${bounds.height}px` : '';
}

function fitCanvas(items, preview = new Map()) {
  const grid = document.getElementById('grid');
  grid.style.setProperty('--canvas-step', `${CANVAS_STEP}px`);
  const bounds = items.map(item => preview.get(item.key) ?? canvasBounds(item));
  grid.style.setProperty('--canvas-width', `${Math.max(0, ...bounds.map(box => box.x + box.width)) + CANVAS_STEP}px`);
  grid.style.setProperty('--canvas-height', `${Math.max(0, ...bounds.map(box => box.y + box.height)) + CANVAS_STEP}px`);
}

function refreshCanvas() {
  const items = canvasItems();
  const isCanvas = currentLayout === 'canvas';
  for (const key of canvasSelection) {
    if (!items.some(item => item.key === key)) canvasSelection.delete(key);
  }

  for (const item of items) {
    const element = document.getElementById(item.key);
    if (!element) continue;
    const selected = canvasSelection.has(item.key);
    const grouped = Boolean(item.data.groupId);
    element.classList.toggle('canvas-selected', selected);
    element.classList.toggle('canvas-grouped', grouped);
    const button = element.querySelector('.canvas-select');
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `Select ${grouped ? 'grouped ' : ''}${item.type}`);
    button.textContent = selected ? 'Selected' : grouped ? 'Grouped' : 'Select';
    paintCanvasItem(element, isCanvas ? canvasBounds(item) : null);
  }

  document.getElementById('canvas-group').disabled = canvasSelection.size < 2;
  document.getElementById('canvas-ungroup').disabled = !items.some(item => canvasSelection.has(item.key) && item.data.groupId);
  if (isCanvas) fitCanvas(items);
}

function groupCanvasSelection() {
  if (canvasSelection.size < 2) return;
  const items = canvasItems();
  const selectedGroups = new Set(items.filter(item => canvasSelection.has(item.key)).map(item => item.data.groupId).filter(Boolean));
  const groupId = 'group-' + (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
  for (const item of items) {
    if (canvasSelection.has(item.key) || selectedGroups.has(item.data.groupId)) {
      const { x, y } = canvasBounds(item);
      Object.assign(item.data, { groupId, x: snapCanvas(x), y: snapCanvas(y) });
    }
  }
  canvasSelection.clear();
  refreshCanvas();
  scheduleSave();
}

function ungroupCanvasSelection() {
  const items = canvasItems();
  const selectedGroups = new Set(items.filter(item => canvasSelection.has(item.key)).map(item => item.data.groupId).filter(Boolean));
  for (const { data } of items) {
    if (selectedGroups.has(data.groupId)) delete data.groupId;
  }
  canvasSelection.clear();
  refreshCanvas();
  scheduleSave();
}

function resetCanvasPositions() {
  const items = canvasItems();
  const units = new Map();
  for (const item of items) {
    const key = item.data.groupId ?? item.key;
    if (!units.has(key)) units.set(key, []);
    units.get(key).push(item);
  }

  const availableWidth = document.querySelector('.workspace-container').clientWidth;
  let x = CANVAS_STEP;
  let y = CANVAS_STEP;
  let rowHeight = 0;
  for (const members of units.values()) {
    const bounds = members.map(canvasBounds);
    const left = Math.min(...bounds.map(box => box.x));
    const top = Math.min(...bounds.map(box => box.y));
    const width = Math.max(...bounds.map(box => box.x + box.width)) - left;
    const height = Math.max(...bounds.map(box => box.y + box.height)) - top;
    if (x > CANVAS_STEP && x + width + CANVAS_STEP > availableWidth) {
      x = CANVAS_STEP;
      y += rowHeight;
      rowHeight = 0;
    }
    members.forEach(({ data }, index) => {
      data.x = x + bounds[index].x - left;
      data.y = y + bounds[index].y - top;
    });
    x += Math.ceil(width / CANVAS_STEP) * CANVAS_STEP + CANVAS_STEP;
    rowHeight = Math.max(rowHeight, Math.ceil(height / CANVAS_STEP) * CANVAS_STEP + CANVAS_STEP);
  }
  refreshCanvas();
  scheduleSave();
}

function attachCanvasControls(element, data, moveHandle) {
  const type = element.classList.contains('watch-card') ? 'stopwatch' : 'note';
  const select = document.createElement('button');
  select.type = 'button';
  select.className = 'canvas-select';
  select.addEventListener('click', () => {
    if (canvasSelection.has(element.id)) canvasSelection.delete(element.id);
    else canvasSelection.add(element.id);
    refreshCanvas();
  });

  const resize = document.createElement('button');
  resize.type = 'button';
  resize.className = 'canvas-resize';
  resize.setAttribute('aria-label', `Resize ${type}`);
  resize.title = 'Drag or use arrow keys to resize';
  element.append(select, resize);

  bindCanvasHandle(moveHandle, element, data, false);
  bindCanvasHandle(resize, element, data, true);
}

function bindCanvasHandle(handle, element, data, resize) {
  let gesture;
  const workspace = element.closest('.workspace-container');
  const scrollOffset = () => [workspace.scrollLeft, window.scrollY];

  function start(clientX, clientY, pointerId) {
    const items = canvasItems();
    const anchor = items.find(item => item.key === element.id);
    const members = items.filter(item => item === anchor || (!resize && data.groupId && item.data.groupId === data.groupId));
    const initial = new Map(members.map(item => [item.key, canvasBounds(item)]));
    gesture = { clientX, clientY, pointerId, scroll: scrollOffset(), items, anchor, members, initial, preview: initial };
  }

  function update(dx, dy) {
    const { anchor, initial, members, items } = gesture;
    const origin = initial.get(anchor.key);
    const left = Math.min(...Array.from(initial.values(), box => box.x));
    const top = Math.min(...Array.from(initial.values(), box => box.y));
    const deltaX = Math.max(-left, snapCanvas(origin.x + dx) - origin.x);
    const deltaY = Math.max(-top, snapCanvas(origin.y + dy) - origin.y);
    const timer = anchor.type === 'stopwatch';
    gesture.preview = new Map(members.map(item => {
      const box = initial.get(item.key);
      const next = resize
        ? { ...box, width: dx === 0 ? box.width : snapCanvas(box.width + dx, timer ? 288 : 168),
                    height: dy === 0 ? box.height : snapCanvas(box.height + dy, timer ? 240 : 96) }
        : { ...box, x: box.x + (dx === 0 ? 0 : deltaX), y: box.y + (dy === 0 ? 0 : deltaY) };
      const member = document.getElementById(item.key);
      if (member) paintCanvasItem(member, next);
      return [item.key, next];
    }));
    fitCanvas(items, gesture.preview);
  }

  function finish(commit) {
    const canCommit = commit && element.isConnected && currentLayout === 'canvas';
    if (canCommit) {
      for (const item of gesture.members) Object.assign(item.data, gesture.preview.get(item.key));
      scheduleSave();
    }
    gesture = null;
    element.classList.remove('canvas-manipulating');
    refreshCanvas();
  }

  handle.addEventListener('pointerdown', event => {
    if (gesture || currentLayout !== 'canvas' || event.button !== 0) return;
    start(event.clientX, event.clientY, event.pointerId);
    handle.setPointerCapture(event.pointerId);
    element.classList.add('canvas-manipulating');
  });
  function track(event) {
    const [scrollX, scrollY] = scrollOffset();
    update(event.clientX - gesture.clientX + scrollX - gesture.scroll[0],
      event.clientY - gesture.clientY + scrollY - gesture.scroll[1]);
  }
  handle.addEventListener('pointermove', event => {
    if (gesture?.pointerId === event.pointerId && currentLayout === 'canvas') track(event);
  });
  handle.addEventListener('pointerup', event => {
    if (gesture?.pointerId !== event.pointerId) return;
    if (currentLayout === 'canvas') track(event);
    finish(true);
  });
  for (const type of ['pointercancel', 'lostpointercapture']) {
    handle.addEventListener(type, event => {
      if (gesture?.pointerId === event.pointerId) finish(false);
    });
  }

  handle.addEventListener('keydown', event => {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!Array.isArray(direction) || gesture || currentLayout !== 'canvas') return;
    event.preventDefault();
    start(0, 0, null);
    update(direction[0] * CANVAS_STEP, direction[1] * CANVAS_STEP);
    finish(true);
  });
}

/* Layout switcher */
function switchLayout(layout, shouldSave = true) {
  if (currentLayout !== layout) canvasSelection.clear();
  currentLayout = layout;
  const grid = document.getElementById('grid');
  document.body.classList.toggle('is-canvas-mode', layout === 'canvas');

  document.querySelectorAll('.layout-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`btn-layout-${layout}`)?.classList.add('active');

  grid.classList.toggle('layout-inline', layout === 'inline');
  grid.classList.toggle('layout-canvas', layout === 'canvas');
  if (layout !== 'canvas') grid.parentElement.scrollLeft = 0;
  refreshCanvas();

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
    x: w.x ?? CANVAS_STEP,
    y: w.y ?? CANVAS_STEP,
    width: w.width ?? null,
    height: w.height ?? null,
    groupId: w.groupId ?? null
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
