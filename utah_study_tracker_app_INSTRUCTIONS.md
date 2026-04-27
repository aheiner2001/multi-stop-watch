# Utah Study Hours Tracker — integration instructions

This document describes `utah_study_tracker_app.py` so you can reuse its behaviors in another Streamlit (or other) app.

## What the app does

- Tracks **weekly study hours per course** with a fixed **weekly goal** per course.
- Uses **America/Denver** for “today”, week boundaries, and timer timestamps.
- Persists everything to a **JSON file** beside the script: `.utah_study_tracker_state.json`.
- Combines **logged hours** (`daily_hours`), **optional start/stop timer** that adds elapsed time to today, **session targets** (Pomodoro-style blocks), and **recommended hours today** derived from remaining goal and “core” study days.

## Stack and entry behavior

| Item | Detail |
|------|--------|
| Framework | Streamlit |
| Layout | `st.set_page_config(..., layout="wide")` |
| Styling | `apply_dusty_theme()` injects CSS via `st.markdown(..., unsafe_allow_html=True)` |
| Session HTML | `render_session_circles()` returns HTML for `st.markdown(..., unsafe_allow_html=True)` |

On each run, the script: `load_state` → `ensure_state_shape` → `reset_for_new_week_if_needed` → `rollover_daily_runtime_if_needed` → `save_state`, then renders UI. Any mutation calls `save_state(state)` and often `st.rerun()`.

## Course configuration

Courses are **code-defined**, not edited in the UI:

```python
@dataclass(frozen=True)
class Course:
    name: str
    weekly_goal_hours: float

COURSES = [Course(...), ...]
```

To add or change courses in this app, edit `COURSES`. In another app, replace this with your own list, DB rows, or config file.

## Persisted state shape (`dict`)

Top level:

| Key | Type | Meaning |
|-----|------|---------|
| `last_seen_date` | `str` (ISO date) | Last app “calendar day” in Utah; used for daily rollover |
| `week_start` | `str` (ISO date, Sunday) | Start of current week; when it changes, week data resets |
| `courses` | `dict[str, dict]` | Key = course name |

Per-course object:

| Key | Type | Meaning |
|-----|------|---------|
| `daily_hours` | `dict[str, float]` | ISO date → hours logged that day |
| `running` | `bool` | Timer active |
| `running_start_iso` | `str \| None` | `datetime.isoformat()` when timer started (timezone-aware string) |
| `daily_target_sessions` | `dict[str, int]` | ISO date → target session count for that day |
| `daily_completed_sessions` | `dict[str, int]` | ISO date → completed sessions that day |

**Week reset:** If `week_start` ≠ Sunday-start of “this week” in Utah, `reset_for_new_week_if_needed` clears each course’s `daily_hours`, sets `running` false, and clears `running_start_iso`.

**Day rollover:** If `last_seen_date` ≠ today (Utah), `rollover_daily_runtime_if_needed` updates `last_seen_date` and clears all running timers (does not auto-flush elapsed time into `daily_hours`; that only happens on explicit stop or bad parse in `accumulate_runtime_into_today`).

## Pomodoro / session math

- `POMODORO_MINUTES = 45` → `POMODORO_HOURS = 0.75`.
- **Recommended sessions today** = `ceil(recommended_today_hours / POMODORO_HOURS)`.
- Timer progress bar in the UI uses the same 45-minute block as “one session” visually.

## “Core study days” and recommendations

- **Core days:** Monday–Saturday (Sunday is special).
- **`recommended_today_hours`:** Spreads **remaining weekly hours** over **remaining core days including today** (`core_days_remaining_including_today`). On Sunday it divides remaining by 6 (planning for Mon–Sat).
- **`target_sessions_for_course`:** First time today is seen, sets `daily_target_sessions[today]` from `recommended_today_sessions`; user can override via number input, which writes back to state.

Porting tip: if your app uses a different week (e.g. Monday start), replace `week_start_sunday_iso` and `reset_for_new_week_if_needed` + `core_days_remaining_including_today` consistently.

## Timer semantics

- **Start:** Sets `running=True`, `running_start_iso=now_utah().isoformat()`.
- **Stop:** `accumulate_runtime_into_today`: adds `(now - start)` in hours to `daily_hours[today]`, then clears running flags.
- **Display while running:** `current_running_elapsed_hours` for live elapsed; does not write to `daily_hours` until stop.
- **Invalid `running_start_iso`:** Treated as stopped / zero elapsed where parsed.

## UI feature checklist (for parity)

1. **Header:** Title + caption explaining Utah time and Sunday week reset.
2. **Clock strip:** Current Utah datetime (`st.info`), day metrics, “Refresh time” button (`st.rerun`).
3. **Policy caption:** Fri target / Sat carry-over / Sun bonus (copy or adapt).
4. **Per course (bordered container):**
   - Metrics: weekly goal, completed, remaining, recommended today (hours + session count).
   - Session target `st.number_input` bound to `daily_target_sessions[today]`.
   - Session circles (HTML): green filled vs gray empty for completed vs target.
   - Completed count + add/remove session buttons.
   - “Today logged” hours metric.
   - Weekly progress `st.progress(total_done / goal)`.
   - Timer: refresh, start, stop; progress toward 45 min; caption for running vs idle.
   - Manual edit: hours + minutes number inputs + save → `daily_hours[today]`.
   - Expander: daily breakdown sorted by weekday order.
5. **Global:** “Reset this week” → `build_default_state()` + save + rerun.

## Pure logic you can copy verbatim or adapt

These functions have **no Streamlit dependency** (good for a `study_tracker_logic.py` module):

- `now_utah`, `today_utah_str`, `week_start_sunday_iso`
- `load_state`, `save_state`, `build_default_state`, `ensure_state_shape`
- `reset_for_new_week_if_needed`, `rollover_daily_runtime_if_needed`
- `accumulate_runtime_into_today`, `clear_running_timer`, `current_running_elapsed_hours`
- `weekly_total_hours`, `day_name_from_iso`
- `core_days_remaining_including_today`, `recommended_today_hours`, `recommended_today_sessions`
- `target_sessions_for_course`, `completed_sessions_for_course`, `set_completed_sessions_for_course`
- `_elapsed_seconds_since` (helper)
- `render_session_circles` (returns HTML string only)

Keep **`STATE_FILE`** path strategy consistent in your app (same folder as script, or a single user data path).

## Integrating into your other app

Suggested order:

1. **Shared constants:** `UTAH_TZ` (or your TZ), `POMODORO_MINUTES`, `CORE_STUDY_DAYS` / weekday order if you keep the same scheduling idea.
2. **State I/O:** Same JSON shape or a **subset** (e.g. only `daily_hours` + goals if you skip sessions).
3. **Lifecycle on each run:** load → shape → week reset → day rollover → save (same as here).
4. **Wire UI** to the same state keys so you can merge data or migrate JSON once.
5. **Optional:** Extract the “dusty” CSS into a shared helper if both apps should look alike.

If your app already has different field names, write a small **adapter** that maps your model ↔ this shape for migration, then simplify.

## File locations

| File | Role |
|------|------|
| `sandbox/utah_study_tracker_app.py` | Full Streamlit app |
| `sandbox/.utah_study_tracker_state.json` | Created at runtime; gitignored if you add it to `.gitignore` |

## Dependencies

- Python 3.10+ style (`dict[str, Any]`, `str | None`).
- Packages: `streamlit`, stdlib (`json`, `dataclasses`, `datetime`, `pathlib`, `zoneinfo`, `math`, `typing`).

No `.env` or secrets required.
