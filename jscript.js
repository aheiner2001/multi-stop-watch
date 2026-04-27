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
    cap.textContent = `Running — ${fmtHours(currentRunningElapsedHours(co))} h this block (saved when you stop).`;
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

function renderCourses() {
  const root = document.getElementById('courses');
  if (!root || !state) return;

  stopAllCourseTimerIntervals();

  const weekStart = state.week_start;
  const today = todayUtahStr();

  const blocks = COURSES.map((course, idx) => {
    const name = course.name;
    const co = state.courses[name];
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
          `<tr><td>${esc(r.weekday)}</td><td class="muted">${esc(r.iso)}</td><td class="num">${fmtHours(r.hours)} h</td></tr>`
      )
      .join('');

    const timerCaptionIdle =
      'Timer idle. Start to accrue time into today’s log when you stop.';
    const timerCaptionRunning = `Running — ${fmtHours(runningH)} h this block (saved when you stop).`;
    const ft0 = formatTimeMs(Math.round(runningH * 3600000));
    const timeMain = co.running ? ft0.main : '00:00';
    const timeCs = co.running ? ft0.ms : '00';

    return `
<article class="course-card${co.running ? ' running' : ''}" data-course-index="${idx}">
  <header class="course-card__head">
    <h2 class="course-card__title">${esc(name)}</h2>
    <span class="course-card__goal">${goal} h / week goal</span>
  </header>
  <div class="metrics-grid">
    <div class="metric"><span class="metric__label">Completed this week</span><span class="metric__val">${fmtHours(done)} h</span></div>
    <div class="metric"><span class="metric__label">Remaining</span><span class="metric__val">${fmtHours(remaining)} h</span></div>
    <div class="metric"><span class="metric__label">Recommended today</span><span class="metric__val">${fmtHours(recH)} h · ~${recS} sessions</span></div>
    <div class="metric"><span class="metric__label">Today logged</span><span class="metric__val">${fmtHours(todayLogged)} h</span></div>
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
    <div class="weekly-progress__label"><span>Weekly progress</span><span>${fmtHours(done)} / ${goal} h</span></div>
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
  });

  root.innerHTML = blocks.join('');
  syncCourseTimerIntervals();
}

function fullRender() {
  runLifecycle();
  updateClockStrip();
  renderCourses();
}

function courseNameFromIndex(i) {
  return COURSES[i] && COURSES[i].name;
}

function onCoursesClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn || !state) return;
  const idx = Number(btn.dataset.courseIndex);
  const name = courseNameFromIndex(idx);
  if (!name) return;
  const action = btn.dataset.action;

  if (action === 'timer-start') {
    startTimer(state, name);
    saveState(state);
    fullRender();
    return;
  }
  if (action === 'timer-stop') {
    accumulateRuntimeIntoToday(state, name);
    saveState(state);
    fullRender();
    return;
  }
  if (action === 'timer-refresh') {
    fullRender();
    return;
  }
  if (action === 'session-plus') {
    addCompletedSession(state, name, 1);
    saveState(state);
    fullRender();
    return;
  }
  if (action === 'session-minus') {
    addCompletedSession(state, name, -1);
    saveState(state);
    fullRender();
    return;
  }
  if (action === 'manual-save') {
    const hEl = document.getElementById(`mh-${idx}`);
    const mEl = document.getElementById(`mm-${idx}`);
    setManualTodayHours(state, name, hEl && hEl.value, mEl && mEl.value);
    saveState(state);
    fullRender();
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
  renderCourses();
  updateClockStrip();
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

fullRender();
