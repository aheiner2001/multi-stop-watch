let watches = [];
let idCounter = 0;

// Load saved watches from localStorage
function loadWatches() {
  const saved = localStorage.getItem('watches');
  if (!saved) return;

  const savedWatches = JSON.parse(saved);

  savedWatches.forEach(w => {

    const watch = {
      ...w,
      interval: null
    };

    watches.push(watch);

    if (watch.id > idCounter) idCounter = watch.id;

    renderCard(watch);

    // If it was running before refresh
    if (watch.running && watch.startTime) {

      // Recalculate elapsed time
      const delta = Date.now() - watch.startTime;
      watch.elapsed += delta;

      // Restart it cleanly
      watch.startTime = Date.now();
      watch.interval = setInterval(() => tick(watch.id), 50);
    }

    updateDisplay(watch.id);
    updateToggleBtn(watch);
  });

  document.getElementById('empty')?.remove();
}
// Save watches to localStorage
function saveWatches() {
  const dataToSave = watches.map(w => ({
    id: w.id,
    label: w.label,
    goal: w.goal,
    elapsed: w.elapsed,
    running: w.running,
    startTime: w.running ? w.startTime : null
  }));
  localStorage.setItem('watches', JSON.stringify(dataToSave));
}

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

// Parse goal text like "30min", "2 hours", "45s"
function find_time(id){
  const w = watches.find(w => w.id === id);
  if (!w) return 0;
  const input = document.getElementById(`goal-${id}`);
  if (!input) return 0;
  const timeText = input.value.trim();

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

function addWatch() {
  const id = ++idCounter;
  const watch = { id, label: '', goal: '', elapsed: 0, running: false, startTime: null, interval: null };
  watches.push(watch);
  renderCard(watch);
  document.getElementById('empty')?.remove();
  saveWatches();
}

function renderCard(watch) {
  const grid = document.getElementById('grid');
  const card = document.createElement('div');
  card.className = 'watch-card';
  card.id = `card-${watch.id}`;
  card.innerHTML = `
    <div class="watch-top">
      <input class="label-input" placeholder="Label…" value="${watch.label}" 
        oninput="watches.find(w=>w.id===${watch.id}).label=this.value; saveWatches()">
      <input class="label-input goal" id="goal-${watch.id}" placeholder="Goal" value="${watch.goal}" 
        oninput="watches.find(w=>w.id===${watch.id}).goal=this.value; saveWatches()">
      <button class="delete-btn" onclick="removeWatch(${watch.id})">X</button>
    </div>
    <div class="display-wrapper">
      <div class="display" id="display-${watch.id}">
        <span class="time">00:00</span><span class="ms">.00</span>
      </div>
      <div class="progress-circle" id="circle-${watch.id}"></div>
    </div>
    <div class="controls">
      <button class="btn btn-start" id="toggle-${watch.id}" onclick="toggle(${watch.id})">Start</button>
      <button class="btn btn-reset" onclick="reset(${watch.id})">Reset</button>
    </div>
  `;
  grid.appendChild(card);
}

function toggle(id) {
  const w = watches.find(w => w.id === id);
  if (!w) return;

  if (w.running) {
    clearInterval(w.interval);
    w.elapsed += Date.now() - w.startTime;
    w.running = false;
  } else {
    w.startTime = Date.now();
    w.running = true;
    w.interval = setInterval(() => tick(id), 50);
  }
  updateToggleBtn(w);
  document.getElementById(`card-${id}`).classList.toggle('running', w.running);
  saveWatches();
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
  if (circle && totalGoal > 0) {
    let percent = Math.min((totalElapsed / totalGoal) * 100, 100);
    circle.style.setProperty('--percentage', percent + '%');
    circle.style.background = percent >= 100 ? '#1a3e45' : `conic-gradient(var(--accent) ${percent}%, var(--surface2) 0)`;
   circle.style.border = percent >= 100 ? '3px solid #3ed68d' : '2px solid var(--surface2)';
  }
}

function reset(id) {
  const w = watches.find(w => w.id === id);
  if (!w) return;

  clearInterval(w.interval);
  w.elapsed = 0;
  w.running = false;
  w.startTime = null;

  updateDisplay(id);
  updateToggleBtn(w);
  document.getElementById(`card-${id}`)?.classList.remove('running');
  saveWatches();
}

function updateToggleBtn(w) {
  const btn = document.getElementById(`toggle-${w.id}`);
  if (!btn) return;
  btn.textContent = w.running ? 'Pause' : 'Start';
  btn.className = `btn ${w.running ? 'btn-pause' : 'btn-start'}`;
}

function removeWatch(id) {
  const w = watches.find(w => w.id === id);
  if (w) clearInterval(w.interval);
  watches = watches.filter(w => w.id !== id);
  document.getElementById(`card-${id}`)?.remove();
  if (watches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.id = 'empty';
    empty.textContent = 'No stopwatches yet. Add one above.';
    document.getElementById('grid').appendChild(empty);
  }
  saveWatches();
}

// Initial load
loadWatches();
if (watches.length === 0) {
  addWatch();
  addWatch();
  addWatch();
}