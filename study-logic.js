/**
 * Utah study tracker — pure logic (no DOM).
 * America/Denver via Intl; Sunday-start week; no external deps.
 */
const UTAH_TZ = 'America/Denver';
const POMODORO_MINUTES = 45;
const POMODORO_HOURS = POMODORO_MINUTES / 60;
const STATE_KEY = 'utah_study_tracker_state';

/** Code-defined courses; edit goals here. */
const COURSES = [
  { name: 'Calculus', weekly_goal_hours: 14 },
  { name: 'Algorithms', weekly_goal_hours: 8 },
  { name: 'Massively Parallel Computation', weekly_goal_hours: 8 },
  { name: 'Old Testament', weekly_goal_hours: 6 },
];

function ymdInDenver(ms) {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: UTAH_TZ });
}

/** Any UTC instant whose calendar date in Denver is `ymd` (YYYY-MM-DD). */
function utcNoonForDenverYmd(ymd) {
  const [Y, M, D] = ymd.split('-').map(Number);
  let lo = Date.UTC(Y, M - 1, D - 1, 0, 0, 0);
  let hi = Date.UTC(Y, M - 1, D + 2, 23, 59, 59, 999);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const s = ymdInDenver(mid);
    if (s < ymd) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function previousDenverYmd(ymd) {
  let t = utcNoonForDenverYmd(ymd);
  for (let h = 1; h <= 48; h++) {
    t -= 3600000;
    const y2 = ymdInDenver(t);
    if (y2 !== ymd) return y2;
  }
  const [Y, M, D] = ymd.split('-').map(Number);
  return ymdInDenver(Date.UTC(Y, M - 1, D - 1, 14, 0, 0));
}

function nextDenverYmd(ymd) {
  let t = utcNoonForDenverYmd(ymd);
  for (let h = 1; h <= 48; h++) {
    t += 3600000;
    const y2 = ymdInDenver(t);
    if (y2 !== ymd) return y2;
  }
  const [Y, M, D] = ymd.split('-').map(Number);
  return ymdInDenver(Date.UTC(Y, M - 1, D + 1, 14, 0, 0));
}

function weekdayShortInDenver(ms) {
  return new Date(ms).toLocaleDateString('en-US', { timeZone: UTAH_TZ, weekday: 'short' });
}

function todayUtahStr() {
  return ymdInDenver(Date.now());
}

function weekStartSundayIso() {
  let y = todayUtahStr();
  for (let i = 0; i < 14; i++) {
    if (weekdayShortInDenver(utcNoonForDenverYmd(y)) === 'Sun') return y;
    const prev = previousDenverYmd(y);
    if (prev === y) break;
    y = prev;
  }
  return y;
}

function denverDayIndexSun0() {
  const t = utcNoonForDenverYmd(todayUtahStr());
  const wd = weekdayShortInDenver(t);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

function emptyCourseState() {
  return {
    daily_hours: {},
    running: false,
    running_start_iso: null,
    daily_target_sessions: {},
    daily_completed_sessions: {},
  };
}

function buildDefaultState() {
  const courses = {};
  for (const c of COURSES) {
    courses[c.name] = emptyCourseState();
  }
  return {
    last_seen_date: todayUtahStr(),
    week_start: weekStartSundayIso(),
    courses,
  };
}

function ensureStateShape(raw) {
  const base = buildDefaultState();
  if (!raw || typeof raw !== 'object') return base;
  const out = {
    last_seen_date: typeof raw.last_seen_date === 'string' ? raw.last_seen_date : base.last_seen_date,
    week_start: typeof raw.week_start === 'string' ? raw.week_start : base.week_start,
    courses: { ...base.courses },
  };
  for (const c of COURSES) {
    const src = raw.courses && raw.courses[c.name] ? raw.courses[c.name] : {};
    out.courses[c.name] = {
      daily_hours: { ...(src.daily_hours || {}) },
      running: Boolean(src.running),
      running_start_iso: src.running_start_iso == null ? null : String(src.running_start_iso),
      daily_target_sessions: { ...(src.daily_target_sessions || {}) },
      daily_completed_sessions: { ...(src.daily_completed_sessions || {}) },
    };
  }
  return out;
}

function loadState() {
  try {
    const s = localStorage.getItem(STATE_KEY);
    if (!s) return buildDefaultState();
    return ensureStateShape(JSON.parse(s));
  } catch {
    return buildDefaultState();
  }
}

function saveState(state) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function resetForNewWeekIfNeeded(state) {
  const current = weekStartSundayIso();
  if (state.week_start === current) return false;
  state.week_start = current;
  for (const c of COURSES) {
    const co = state.courses[c.name];
    co.daily_hours = {};
    co.running = false;
    co.running_start_iso = null;
  }
  return true;
}

function rolloverDailyRuntimeIfNeeded(state) {
  const today = todayUtahStr();
  if (state.last_seen_date === today) return false;
  state.last_seen_date = today;
  for (const c of COURSES) {
    const co = state.courses[c.name];
    co.running = false;
    co.running_start_iso = null;
  }
  return true;
}

function _elapsedMsSince(iso) {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Date.now() - t);
}

function currentRunningElapsedHours(courseState) {
  if (!courseState.running || !courseState.running_start_iso) return 0;
  return _elapsedMsSince(courseState.running_start_iso) / 3600000;
}

function accumulateRuntimeIntoToday(state, courseName) {
  const co = state.courses[courseName];
  if (!co || !co.running) return;
  const today = todayUtahStr();
  const h = currentRunningElapsedHours(co);
  co.daily_hours[today] = (co.daily_hours[today] || 0) + h;
  co.running = false;
  co.running_start_iso = null;
}

function clearRunningTimer(courseState) {
  courseState.running = false;
  courseState.running_start_iso = null;
}

function weekDateStrings(weekStartYmd) {
  const out = [];
  let cur = weekStartYmd;
  for (let i = 0; i < 7; i++) {
    out.push(cur);
    cur = nextDenverYmd(cur);
  }
  return out;
}

function weeklyTotalHours(courseState, weekStartYmd) {
  let sum = 0;
  for (const date of weekDateStrings(weekStartYmd)) {
    sum += courseState.daily_hours[date] || 0;
  }
  return sum;
}

function dayNameFromIso(isoYmd) {
  const t = utcNoonForDenverYmd(isoYmd);
  return new Date(t).toLocaleDateString('en-US', { timeZone: UTAH_TZ, weekday: 'long' });
}

function coreDaysRemainingIncludingToday() {
  const d = denverDayIndexSun0();
  if (d === 0) return 6;
  return 7 - d;
}

function recommendedTodayHours(remainingWeeklyHours) {
  const rem = Math.max(0, remainingWeeklyHours);
  const div = Math.max(1, coreDaysRemainingIncludingToday());
  return rem / div;
}

function recommendedTodaySessions(remainingWeeklyHours) {
  const h = recommendedTodayHours(remainingWeeklyHours);
  return Math.ceil(h / POMODORO_HOURS);
}

function targetSessionsForCourse(state, courseName, recommendedSessions) {
  const co = state.courses[courseName];
  const today = todayUtahStr();
  if (co.daily_target_sessions[today] == null) {
    co.daily_target_sessions[today] = Math.max(0, recommendedSessions);
  }
  return co.daily_target_sessions[today];
}

function setTargetSessionsForCourse(state, courseName, value) {
  const co = state.courses[courseName];
  const today = todayUtahStr();
  const n = Math.max(0, Math.floor(Number(value)) || 0);
  co.daily_target_sessions[today] = n;
}

function completedSessionsForCourse(state, courseName) {
  const co = state.courses[courseName];
  const today = todayUtahStr();
  return co.daily_completed_sessions[today] || 0;
}

function setCompletedSessionsForCourse(state, courseName, n) {
  const co = state.courses[courseName];
  const today = todayUtahStr();
  co.daily_completed_sessions[today] = Math.max(0, Math.floor(n));
}

function addCompletedSession(state, courseName, delta) {
  const cur = completedSessionsForCourse(state, courseName);
  setCompletedSessionsForCourse(state, courseName, cur + delta);
}

function renderSessionCircles(completed, target) {
  const t = Math.max(0, Math.floor(target));
  const c = Math.min(Math.max(0, Math.floor(completed)), t);
  const parts = [];
  for (let i = 0; i < t; i++) {
    parts.push(`<span class="session-dot${i < c ? ' session-dot--done' : ''}"></span>`);
  }
  return `<div class="session-circles" role="img" aria-label="${c} of ${t} sessions completed">${parts.join('')}</div>`;
}

function formatUtahDateTime() {
  return new Date().toLocaleString('en-US', {
    timeZone: UTAH_TZ,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function setManualTodayHours(state, courseName, hours, minutes) {
  const co = state.courses[courseName];
  const today = todayUtahStr();
  const h = Math.max(0, (Number(hours) || 0) + (Number(minutes) || 0) / 60);
  co.daily_hours[today] = h;
}

function dailyBreakdownRows(courseState, weekStartYmd) {
  const dates = weekDateStrings(weekStartYmd);
  const order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const rows = dates.map((iso) => ({
    iso,
    weekday: dayNameFromIso(iso),
    hours: courseState.daily_hours[iso] || 0,
  }));
  rows.sort((a, b) => order.indexOf(a.weekday) - order.indexOf(b.weekday));
  return rows;
}

function startTimer(state, courseName) {
  const co = state.courses[courseName];
  if (!co || co.running) return;
  co.running = true;
  co.running_start_iso = new Date().toISOString();
}
