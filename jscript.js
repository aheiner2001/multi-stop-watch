let state = null;
/** Per-course high-frequency UI tick (like original stopwatch); not a full page refresh. */
const courseTimerIntervals = {};

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Format milliseconds as mm:ss or hh:mm:ss + centiseconds (matches original app). */
function formatTimeMs(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return {
    main: h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`,
    ms: pad(cs),
  };
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function fmtHours(n) {
  const x = Number(n) || 0;
  return (Math.round(x * 100) / 100).toFixed(2);
}

/** Human-friendly hours for UI (e.g. course totals, running caption). */
function formatHoursMinutes(h) {
  const x = Number(h) || 0;
  const totalMin = Math.round(x * 60);
  const H = Math.floor(totalMin / 60);
  const M = totalMin % 60;
  const parts = [];
  if (H > 0) parts.push(`${H} h`);
  if (M > 0 || H === 0) parts.push(`${M} min`);
  return parts.join(' ');
}

function mutateLifecycleFromMemory() {
  if (!state) return false;
  const w = resetForNewWeekIfNeeded(state);
  const d = rolloverDailyRuntimeIfNeeded(state);
  if (w || d) saveState(state);
  return w || d;
}

function runLifecycle() {
  state = loadState();
  mutateLifecycleFromMemory();
}

function updateClockStrip() {
  const clock = document.getElementById('utah-clock');
  const meta = document.getElementById('day-metrics');
  if (!clock || !meta) return;
  clock.textContent = formatUtahDateTime() + ' (Utah)';
  const today = todayUtahStr();
  const ws = weekStartSundayIso();
  const core = coreDaysRemainingIncludingToday();
  meta.textContent = `Today (Utah): ${today} · Week starts ${ws} · Core study days left (incl. today): ${core}`;
}

function stopCourseTimerUI(idx) {
  const id = courseTimerIntervals[idx];
  if (id != null) {
    clearInterval(id);
    delete courseTimerIntervals[idx];
  }
}

function stopAllCourseTimerIntervals() {
  for (const idx of Object.keys(courseTimerIntervals)) {
    clearInterval(courseTimerIntervals[idx]);
    delete courseTimerIntervals[idx];
  }
}

function updateCourseTimerUI(idx) {
  if (!state) return;
  const name = courseNameFromIndex(idx);
  if (!name) return;
  const co = state.courses[name];
  const wrap = document.getElementById(`timer-display-${idx}`);
  const fill = document.getElementById(`timer-progress-fill-${idx}`);
  const cap = document.getElementById(`timer-caption-${idx}`);
  if (!wrap) {
    stopCourseTimerUI(idx);
    return;
  }
  if (!co.running) {
    stopCourseTimerUI(idx);
    return;
  }
  const ms = Math.round(currentRunningElapsedHours(co) * 3600000);
  const { main, ms: cs } = formatTimeMs(ms);
  wrap.innerHTML = `<span class="time">${main}</span><span class="ms">.${cs}</span>`;
  if (fill) {
    const h = currentRunningElapsedHours(co);
    fill.style.width = `${Math.min(100, (h / POMODORO_HOURS) * 100)}%`;
  }
  if (cap) {
    // cap.textContent = `Running — ${formatHoursMinutes(currentRunningElapsedHours(co))} this block (saved when you stop).`;
  }
}

/** Start 50ms ticks only for courses whose timers are running (original stopwatch behavior). */
function syncCourseTimerIntervals() {
  if (!state) return;
  COURSES.forEach((c, idx) => {
    const co = state.courses[c.name];
    if (co.running) {
      if (courseTimerIntervals[idx] == null) {
        courseTimerIntervals[idx] = setInterval(() => updateCourseTimerUI(idx), 50);
      }
      updateCourseTimerUI(idx);
    } else {
      stopCourseTimerUI(idx);
    }
  });
}

function buildCourseArticleHtml(idx) {
  const course = COURSES[idx];
  const name = course.name;
  const co = state.courses[name];
  const weekStart = state.week_start;
  const today = todayUtahStr();
  const goal = course.weekly_goal_hours;
  const done = weeklyTotalHours(co, weekStart);
  const remaining = Math.max(0, goal - done);
  const recH = recommendedTodayHours(remaining);
  const recS = recommendedTodaySessions(remaining);
  const targetS = targetSessionsForCourse(state, name, recS);
  const completedS = completedSessionsForCourse(state, name);
  const todayLogged = co.daily_hours[today] || 0;
  const totalMin = Math.round((todayLogged || 0) * 60);
  const manualH = Math.floor(totalMin / 60);
  const manualM = totalMin % 60;
  const pct = goal > 0 ? Math.min(100, (done / goal) * 100) : 0;
  const runningH = currentRunningElapsedHours(co);
  const timerPct = Math.min(100, (runningH / POMODORO_HOURS) * 100);
  const circles = renderSessionCircles(completedS, targetS);
  const rows = dailyBreakdownRows(co, weekStart);
  const tableBody = rows
    .map(
      (r) =>
        `<tr><td>${esc(r.weekday)}</td><td class="muted">${esc(r.iso)}</td><td class="num">${formatHoursMinutes(r.hours)}</td></tr>`
    )
    .join('');

  const timerCaptionIdle =
    'Timer idle. Start to accrue time into today’s log when you stop.';
  const timerCaptionRunning = `Running — ${formatHoursMinutes(runningH)} this block (saved when you stop).`;
  const ft0 = formatTimeMs(Math.round(runningH * 3600000));
  const timeMain = co.running ? ft0.main : '00:00';
  const timeCs = co.running ? ft0.ms : '00';

  return `
<article class="course-card${co.running ? ' running' : ''}" data-course-index="${idx}">
  <header class="course-card__head">
    <h2 class="course-card__title">${esc(name)}</h2>
    <span class="course-card__goal">${formatHoursMinutes(goal)} / week goal</span>
  </header>
  <div class="metrics-grid">
    <div class="metric"><span class="metric__label">Completed this week</span><span class="metric__val">${formatHoursMinutes(done)}</span></div>
    <div class="metric"><span class="metric__label">Remaining</span><span class="metric__val">${formatHoursMinutes(remaining)}</span></div>
    <div class="metric"><span class="metric__label">Recommended today</span><span class="metric__val">${formatHoursMinutes(recH)} · ~${recS} sessions</span></div>
    <div class="metric"><span class="metric__label">Today logged</span><span class="metric__val">${formatHoursMinutes(todayLogged)}</span></div>
  </div>
  <div class="sessions-block">
    <label class="field-label" for="target-${idx}">Session target today (${POMODORO_MINUTES} min blocks)</label>
    <input type="number" min="0" step="1" class="num-input" id="target-${idx}" value="${targetS}" data-field="target" data-course-index="${idx}" />
    ${circles}
    <div class="session-actions">
      <span class="session-count">Completed: <strong>${completedS}</strong> / ${targetS}</span>
      <div class="btn-row">
        <button type="button" class="btn-small" data-action="session-minus" data-course-index="${idx}">− Session</button>
        <button type="button" class="btn-small" data-action="session-plus" data-course-index="${idx}">+ Session</button>
      </div>
    </div>
  </div>
  <div class="weekly-progress">
    <div class="weekly-progress__label"><span>Weekly progress</span><span>${formatHoursMinutes(done)} / ${formatHoursMinutes(goal)}</span></div>
    <div class="weekly-progress__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}">
      <div class="weekly-progress__fill" style="width:${pct}%"></div>
    </div>
  </div>
  <div class="timer-block">
    <div class="timer-display-wrapper">
      <div class="timer-display" id="timer-display-${idx}" aria-live="off">
        <span class="time">${timeMain}</span><span class="ms">.${timeCs}</span>
      </div>
    </div>
    <p class="timer-block__caption" id="timer-caption-${idx}">${esc(co.running ? timerCaptionRunning : timerCaptionIdle)}</p>
    <div class="timer-progress" aria-hidden="true"><div class="timer-progress__fill" id="timer-progress-fill-${idx}" style="width:${timerPct}%"></div></div>
    <div class="btn-row timer-btns controls">
      <button type="button" class="btn btn-secondary" data-action="timer-refresh" data-course-index="${idx}">Refresh</button>
      <button type="button" class="btn btn-start" data-action="timer-start" data-course-index="${idx}" ${co.running ? 'disabled' : ''}>Start</button>
      <button type="button" class="btn btn-pause" data-action="timer-stop" data-course-index="${idx}" ${co.running ? '' : 'disabled'}>Stop</button>
    </div>
  </div>
  <div class="manual-block">
    <p class="field-label">Manual edit for today (Utah)</p>
    <div class="manual-row">
      <label class="sr-only" for="mh-${idx}">Hours</label>
      <input type="number" min="0" step="1" class="num-input num-input--sm" id="mh-${idx}" value="${manualH}" data-field="manual-h" data-course-index="${idx}" />
      <span class="manual-sep">h</span>
      <label class="sr-only" for="mm-${idx}">Minutes</label>
      <input type="number" min="0" max="59" step="1" class="num-input num-input--sm" id="mm-${idx}" value="${manualM}" data-field="manual-m" data-course-index="${idx}" />
      <span class="manual-sep">m</span>
      <button type="button" class="btn-secondary" data-action="manual-save" data-course-index="${idx}">Save</button>
    </div>
  </div>
  <details class="daily-details">
    <summary>Daily breakdown (this week, weekday order)</summary>
    <table class="daily-table">
      <thead><tr><th>Day</th><th>Date</th><th>Hours</th></tr></thead>
      <tbody>${tableBody}</tbody>
    </table>
  </details>
</article>`;
}

function renderCourses() {
  const root = document.getElementById('courses');
  if (!root || !state) return;
  stopAllCourseTimerIntervals();
  const blocks = COURSES.map((_, idx) => buildCourseArticleHtml(idx));
  root.innerHTML = blocks.join('');
  syncCourseTimerIntervals();
}

function courseNameFromIndex(i) {
  return COURSES[i] && COURSES[i].name;
}

function runningCourseIndices(exceptIdx) {
  if (!state) return [];
  const out = [];
  COURSES.forEach((c, i) => {
    if (i === exceptIdx) return;
    const co = state.courses[c.name];
    if (co && co.running) out.push(i);
  });
  return out;
}

function startExclusiveTimerByIndex(idx) {
  const switched = runningCourseIndices(idx);
  switched.forEach((i) => {
    const n = courseNameFromIndex(i);
    if (n) {
      creditPomoFocusStudyBeforeFlushCourse(n);
      accumulateRuntimeIntoToday(state, n);
    }
  });
  const name = courseNameFromIndex(idx);
  if (name) startTimer(state, name);
  maybeCompleteFocusFromStudy();
  return switched;
}

function replaceCourseCard(idx) {
  const root = document.getElementById('courses');
  if (!root || !state) return;
  const art = root.querySelector(`article[data-course-index="${idx}"]`);
  if (!art) {
    renderCourses();
    return;
  }
  art.outerHTML = buildCourseArticleHtml(idx);
  syncCourseTimerIntervals();
}

function refreshAfterCourseAction(idx) {
  mutateLifecycleFromMemory();
  replaceCourseCard(idx);
  syncPomodoroFromCourseTimers();
  updatePomoStripUI();
}

/* ---------- Pomodoro (localStorage + course timer sync) ---------- */

const POMO_SETTINGS_KEY = 'utah_pomo_settings';
const POMO_RUNTIME_KEY = 'utah_pomo_runtime';

let pomoSettings = { focusMin: 45, breakMin: 10 };
/** @type {'idle'|'focus'|'break_ready'|'break'} */
let pomoMode = 'idle';
let pomoBreakEndsAt = null;
/** ms of course-timer runtime already credited toward the current focus block (stops / switches). */
let pomoFocusAccumulatedStudyMs = 0;
let pomoFocusBlockDurationMs = 0;
let pomoBreakBlockDurationMs = 0;
let pomoNotifyEnabled = false;

function loadPomoSettingsFromStorage() {
  try {
    const raw = localStorage.getItem(POMO_SETTINGS_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (o && typeof o.focusMin === 'number') pomoSettings.focusMin = Math.max(1, Math.min(180, o.focusMin));
    if (o && typeof o.breakMin === 'number') pomoSettings.breakMin = Math.max(1, Math.min(90, o.breakMin));
  } catch (_) {}
}

function savePomoSettingsToStorage() {
  try {
    localStorage.setItem(POMO_SETTINGS_KEY, JSON.stringify(pomoSettings));
  } catch (_) {}
}

function savePomoRuntime() {
  try {
    localStorage.setItem(
      POMO_RUNTIME_KEY,
      JSON.stringify({
        mode: pomoMode,
        breakEndsAt: pomoBreakEndsAt,
        focusBlockMs: pomoFocusBlockDurationMs,
        breakBlockMs: pomoBreakBlockDurationMs,
        focusAccStudyMs: pomoFocusAccumulatedStudyMs,
      })
    );
  } catch (_) {}
}

function loadPomoRuntime() {
  try {
    const raw = localStorage.getItem(POMO_RUNTIME_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (!o) return;
    if (o.mode === 'idle' || o.mode === 'focus' || o.mode === 'break_ready' || o.mode === 'break') pomoMode = o.mode;
    pomoBreakEndsAt = typeof o.breakEndsAt === 'number' ? o.breakEndsAt : null;
    pomoFocusBlockDurationMs = typeof o.focusBlockMs === 'number' ? o.focusBlockMs : 0;
    pomoBreakBlockDurationMs = typeof o.breakBlockMs === 'number' ? o.breakBlockMs : 0;
    pomoFocusAccumulatedStudyMs =
      typeof o.focusAccStudyMs === 'number' && Number.isFinite(o.focusAccStudyMs)
        ? Math.max(0, o.focusAccStudyMs)
        : 0;
    if (
      pomoMode === 'focus' &&
      typeof o.focusAccStudyMs !== 'number' &&
      typeof o.focusEndsAt === 'number' &&
      pomoFocusBlockDurationMs > 0
    ) {
      const now = Date.now();
      if (now >= o.focusEndsAt) {
        pomoMode = 'break_ready';
        pomoFocusAccumulatedStudyMs = pomoFocusBlockDurationMs;
      } else {
        pomoFocusAccumulatedStudyMs = Math.max(0, pomoFocusBlockDurationMs - (o.focusEndsAt - now));
      }
    }
  } catch (_) {}
}

function anyCourseTimerRunning() {
  if (!state) return false;
  return COURSES.some((c) => state.courses[c.name] && state.courses[c.name].running);
}

/** Course-timer ms counted toward the current focus block: finished segments + active running elapsed. */
function pomoFocusConsumedStudyMs() {
  let run = 0;
  if (state) {
    for (const c of COURSES) {
      const co = state.courses[c.name];
      if (co && co.running) run += Math.round(currentRunningElapsedHours(co) * 3600000);
    }
  }
  return pomoFocusAccumulatedStudyMs + run;
}

function creditPomoFocusStudyBeforeFlushCourse(courseName) {
  if (!state || pomoMode !== 'focus') return;
  const co = state.courses[courseName];
  if (!co || !co.running) return;
  const seg = Math.round(currentRunningElapsedHours(co) * 3600000);
  const budget = pomoFocusBlockDurationMs || 0;
  const headroom = Math.max(0, budget - pomoFocusAccumulatedStudyMs);
  pomoFocusAccumulatedStudyMs += Math.min(seg, headroom);
  savePomoRuntime();
}

/**
 * When credited study time reaches the focus budget, move to break_ready.
 * @returns {boolean} true if state transitioned
 */
function maybeCompleteFocusFromStudy(opts = {}) {
  const silent = Boolean(opts.silent);
  if (pomoMode !== 'focus') return false;
  const budget = pomoFocusBlockDurationMs;
  if (!(budget > 0)) return false;
  if (pomoFocusConsumedStudyMs() < budget - 250) return false;
  pomoFocusAccumulatedStudyMs = budget;
  pomoMode = 'break_ready';
  savePomoRuntime();
  if (!silent) {
    pomoBeep();
    pomoMaybeNotify('Focus block finished', 'Start a break when you are ready.');
  }
  return true;
}

function beginPomoFocusFromSettings() {
  const ms = Math.max(60000, Math.round(pomoSettings.focusMin * 60000));
  pomoMode = 'focus';
  pomoFocusBlockDurationMs = ms;
  pomoFocusAccumulatedStudyMs = 0;
  pomoBreakEndsAt = null;
  savePomoRuntime();
}

function reconcilePomoRuntimeAfterLoad() {
  loadPomoRuntime();
  const now = Date.now();
  if (pomoMode === 'break' && pomoBreakEndsAt != null && now >= pomoBreakEndsAt) {
    pomoBreakEndsAt = null;
    pomoMode = 'idle';
    savePomoRuntime();
    pomoBeep();
    pomoMaybeNotify('Break finished', 'Ready for another focus round.');
  }
  maybeCompleteFocusFromStudy({ silent: true });
}

function syncPomodoroFromCourseTimers() {
  if (!state) return;
  const any = anyCourseTimerRunning();
  if (any && (pomoMode === 'idle' || pomoMode === 'break_ready')) {
    beginPomoFocusFromSettings();
  }
}

function pomoBeepOscillator() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.15);
  } catch (_) {}
}

/** Plays custom sound from #pomo-alarm if present and loadable; otherwise the built-in beep. */
function pomoBeep() {
  const el = document.getElementById('pomo-alarm');
  const src = el && typeof el.getAttribute === 'function' ? el.getAttribute('src') : null;
  if (!el || !src || !String(src).trim()) {
    pomoBeepOscillator();
    return;
  }
  try {
    el.currentTime = 0;
    const p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => pomoBeepOscillator());
    }
  } catch (_) {
    pomoBeepOscillator();
  }
}

function pomoMaybeNotify(title, body) {
  if (!pomoNotifyEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body });
  } catch (_) {}
}

function formatCountdownMs(ms) {
  const x = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(x / 60);
  const s = x % 60;
  return `${pad(m)}:${pad(s)}`;
}

function getFocusMinEffective() {
  const el = document.getElementById('pomo-focus-min');
  if (!el) return pomoSettings.focusMin;
  if (typeof el.valueAsNumber === 'number' && Number.isFinite(el.valueAsNumber) && el.value !== '') {
    const vn = el.valueAsNumber;
    if (vn >= 1 && vn <= 180) return Math.round(vn);
  }
  const raw = String(el.value).trim();
  if (raw === '') return pomoSettings.focusMin;
  const n = Number(raw);
  if (!Number.isFinite(n)) return pomoSettings.focusMin;
  return Math.max(1, Math.min(180, n));
}

function getBreakMinEffective() {
  const el = document.getElementById('pomo-break-min');
  if (!el) return pomoSettings.breakMin;
  if (typeof el.valueAsNumber === 'number' && Number.isFinite(el.valueAsNumber) && el.value !== '') {
    const vn = el.valueAsNumber;
    if (vn >= 1 && vn <= 90) return Math.round(vn);
  }
  const raw = String(el.value).trim();
  if (raw === '') return pomoSettings.breakMin;
  const n = Number(raw);
  if (!Number.isFinite(n)) return pomoSettings.breakMin;
  return Math.max(1, Math.min(90, n));
}

function applyFocusLengthToActivePomo() {
  const newMs = Math.max(60000, Math.round(getFocusMinEffective() * 60000));
  if (pomoMode !== 'focus') return;
  pomoFocusBlockDurationMs = newMs;
  if (pomoFocusConsumedStudyMs() >= newMs - 250) {
    maybeCompleteFocusFromStudy();
  } else {
    savePomoRuntime();
  }
}

function applyBreakLengthToActivePomo() {
  const newMs = Math.max(60000, Math.round(getBreakMinEffective() * 60000));
  if (pomoMode === 'break' && pomoBreakEndsAt != null) {
    pomoBreakEndsAt = Date.now() + newMs;
    pomoBreakBlockDurationMs = newMs;
    savePomoRuntime();
  }
}

function refreshPomoCountdown() {
  if (state) {
    mutateLifecycleFromMemory();
    reconcilePomoRuntimeAfterLoad();
    syncPomodoroFromCourseTimers();
  }
  updatePomoStripUI();
}

function updatePomoStripUI() {
  const phaseEl = document.getElementById('pomo-phase-label');
  const cdEl = document.getElementById('pomo-countdown');
  const barEl = document.getElementById('pomo-bar-fill');
  const breakBtn = document.getElementById('pomo-break-start');
  const skipBtn = document.getElementById('pomo-skip-break');
  const hintEl = document.getElementById('pomo-box-hint');

  const focusPreviewMs = Math.max(60000, Math.round(getFocusMinEffective() * 60000));
  const breakPreviewMs = Math.max(60000, Math.round(getBreakMinEffective() * 60000));
  if (hintEl) {
    hintEl.textContent = `Next focus preview ${getFocusMinEffective()} min · break ${getBreakMinEffective()} min. Focus counts down from course timer runtime (saved when you leave the field).`;
  }

  let phase = 'Idle';
  let cd = formatCountdownMs(focusPreviewMs);
  let barPct = 0;

  if (pomoMode === 'focus') {
    phase = anyCourseTimerRunning() ? 'Focus' : 'Focus (paused)';
    const total = pomoFocusBlockDurationMs || focusPreviewMs;
    const consumed = pomoFocusConsumedStudyMs();
    const leftMs = Math.max(0, total - consumed);
    cd = formatCountdownMs(leftMs);
    barPct = total > 0 ? Math.min(100, Math.max(0, (100 * consumed) / total)) : 0;
  } else if (pomoMode === 'break_ready') {
    phase = 'Break ready';
    cd = '00:00';
    barPct = 100;
  } else if (pomoMode === 'break' && pomoBreakEndsAt != null) {
    phase = 'Break';
    const left = pomoBreakEndsAt - Date.now();
    cd = formatCountdownMs(left);
    const total = pomoBreakBlockDurationMs || breakPreviewMs;
    barPct = total > 0 ? Math.min(100, Math.max(0, (100 * (total - left)) / total)) : 0;
  }

  if (phaseEl) phaseEl.textContent = phase;
  if (cdEl) cdEl.textContent = cd;
  if (barEl) barEl.style.width = `${barPct}%`;

  if (breakBtn) {
    breakBtn.disabled = pomoMode !== 'break_ready';
  }
  if (skipBtn) {
    skipBtn.hidden = pomoMode !== 'break';
  }
}

function pomoOnTick() {
  const now = Date.now();
  maybeCompleteFocusFromStudy();
  if (pomoMode === 'break' && pomoBreakEndsAt != null && now >= pomoBreakEndsAt) {
    pomoBreakEndsAt = null;
    pomoMode = 'idle';
    savePomoRuntime();
    pomoBeep();
    pomoMaybeNotify('Break finished', 'Ready for another focus round.');
  }
  updatePomoStripUI();
}

function startPomoBreak() {
  const ms = Math.max(60000, Math.round(getBreakMinEffective() * 60000));
  pomoMode = 'break';
  pomoBreakEndsAt = Date.now() + ms;
  pomoBreakBlockDurationMs = ms;
  savePomoRuntime();
  updatePomoStripUI();
}

function skipPomoBreak() {
  pomoBreakEndsAt = null;
  pomoMode = 'idle';
  savePomoRuntime();
  updatePomoStripUI();
}

function restartPomoFocus() {
  beginPomoFocusFromSettings();
  updatePomoStripUI();
}

function initPomoStripControls() {
  loadPomoSettingsFromStorage();
  const fm = document.getElementById('pomo-focus-min');
  const bm = document.getElementById('pomo-break-min');
  if (fm) {
    fm.value = String(pomoSettings.focusMin);
    fm.addEventListener('input', () => {
      updatePomoStripUI();
    });
    fm.addEventListener('change', () => {
      pomoSettings.focusMin = Math.max(1, Math.min(180, Number(fm.value) || 45));
      fm.value = String(pomoSettings.focusMin);
      savePomoSettingsToStorage();
      applyFocusLengthToActivePomo();
      updatePomoStripUI();
    });
  }
  if (bm) {
    bm.value = String(pomoSettings.breakMin);
    bm.addEventListener('input', () => {
      updatePomoStripUI();
    });
    bm.addEventListener('change', () => {
      pomoSettings.breakMin = Math.max(1, Math.min(90, Number(bm.value) || 10));
      bm.value = String(pomoSettings.breakMin);
      savePomoSettingsToStorage();
      applyBreakLengthToActivePomo();
      updatePomoStripUI();
    });
  }

  document.getElementById('pomo-refresh')?.addEventListener('click', refreshPomoCountdown);
  document.getElementById('pomo-restart')?.addEventListener('click', restartPomoFocus);
  document.getElementById('pomo-break-start')?.addEventListener('click', startPomoBreak);
  document.getElementById('pomo-skip-break')?.addEventListener('click', skipPomoBreak);

  const notifyBtn = document.getElementById('pomo-notify-btn');
  notifyBtn?.addEventListener('click', async () => {
    if (typeof Notification === 'undefined') {
      notifyBtn.textContent = 'Alerts not supported';
      return;
    }
    const p = await Notification.requestPermission();
    pomoNotifyEnabled = p === 'granted';
    notifyBtn.textContent = pomoNotifyEnabled ? 'Browser alerts on' : 'Alerts denied — using beeps only';
  });
}

function startPomoTick() {
  setInterval(pomoOnTick, 250);
}

function fullRender() {
  runLifecycle();
  reconcilePomoRuntimeAfterLoad();
  updateClockStrip();
  renderCourses();
  syncPomodoroFromCourseTimers();
  updatePomoStripUI();
}

function onCoursesClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn || !state) return;
  const idx = Number(btn.dataset.courseIndex);
  const name = courseNameFromIndex(idx);
  if (!name) return;
  const action = btn.dataset.action;

  if (action === 'timer-start') {
    const switchedFrom = startExclusiveTimerByIndex(idx);
    saveState(state);
    mutateLifecycleFromMemory();
    replaceCourseCard(idx);
    switchedFrom.forEach((i) => replaceCourseCard(i));
    syncPomodoroFromCourseTimers();
    updatePomoStripUI();
    return;
  }
  if (action === 'timer-stop') {
    creditPomoFocusStudyBeforeFlushCourse(name);
    accumulateRuntimeIntoToday(state, name);
    saveState(state);
    maybeCompleteFocusFromStudy();
    refreshAfterCourseAction(idx);
    return;
  }
  if (action === 'timer-refresh') {
    fullRender();
    return;
  }
  if (action === 'session-plus') {
    addCompletedSession(state, name, 1);
    saveState(state);
    refreshAfterCourseAction(idx);
    return;
  }
  if (action === 'session-minus') {
    addCompletedSession(state, name, -1);
    saveState(state);
    refreshAfterCourseAction(idx);
    return;
  }
  if (action === 'manual-save') {
    const hEl = document.getElementById(`mh-${idx}`);
    const mEl = document.getElementById(`mm-${idx}`);
    setManualTodayHours(state, name, hEl && hEl.value, mEl && mEl.value);
    saveState(state);
    refreshAfterCourseAction(idx);
    return;
  }
}

function onCoursesChange(e) {
  const el = e.target;
  if (!el.matches('[data-field="target"]') || !state) return;
  const idx = Number(el.dataset.courseIndex);
  const name = courseNameFromIndex(idx);
  if (!name) return;
  setTargetSessionsForCourse(state, name, el.value);
  saveState(state);
  mutateLifecycleFromMemory();
  replaceCourseCard(idx);
}

function onResetWeek() {
  if (!confirm('Clear this week’s logged hours and timers for all courses? This cannot be undone.')) return;
  state = buildDefaultState();
  saveState(state);
  fullRender();
}

document.getElementById('btn-refresh-time')?.addEventListener('click', () => {
  fullRender();
});

document.getElementById('btn-reset-week')?.addEventListener('click', onResetWeek);

document.getElementById('courses')?.addEventListener('click', onCoursesClick);
document.getElementById('courses')?.addEventListener('change', onCoursesChange);

initPomoStripControls();
fullRender();
startPomoTick();
