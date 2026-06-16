    function getTodayISO() {
        return new Date().toISOString().slice(0, 10);
    }

    function offsetDateISO(daysAgo) {
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        return d.toISOString().slice(0, 10);
    }

    function formatDisplayDate(iso) {
        const [y, m, d] = iso.split('-');
        return `${m}/${d}/${y}`;
    }

    function formatHeaderDate() {
        const d = new Date();
        const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
    }

    const headerDateEl = document.getElementById('header-date');
    if (headerDateEl) headerDateEl.textContent = formatHeaderDate();

    const TARGET_WEIGHT = 160;
    const SAFE_RANGE_MIN = 158;
    const SAFE_RANGE_MAX = 163;
    const CUT_CALORIE_TARGET = 1250;
    const MAINTENANCE_KEY = 'cutting_maintenance';
    const REVERSE_WEEKLY_BUMPS = [150, 150, 125, 125];
    const FOODS_KEY = 'cutting_foods';
    const FOOD_ENTRIES_KEY = 'cutting_food_entries';
    const PROTEIN_LOG_KEY = 'cutting_protein_log';
    const NEAT_KEY = 'cutting_neat';

    const PROTEIN_MIN = 140;
    const PROTEIN_MAX = 160;
    const PROTEIN_DANGER = 120;
    const LEAN_MASS_STATS = {
        relativeSlowdownIncreasePct: 39,
        failRateUnder120: 79.6,
        failRate120Plus: 57.4,
        shieldZoneSuccessPct: 46.9
    };

    let proteinLog = JSON.parse(localStorage.getItem(PROTEIN_LOG_KEY)) || {};

    const DEFAULT_STEP_TARGET = 8000;
    const TDEE_BASELINE = 2250;
    const TDEE_NEAT_FLOOR = 1900;

    let neatData = JSON.parse(localStorage.getItem(NEAT_KEY)) || {
        stepTarget: DEFAULT_STEP_TARGET,
        logs: {}
    };
    if (!neatData.stepTarget) neatData.stepTarget = DEFAULT_STEP_TARGET;
    if (!neatData.logs) neatData.logs = {};

    let maintenance = JSON.parse(localStorage.getItem(MAINTENANCE_KEY)) || null;

    function getActiveCalorieTarget() {
        if (!maintenance || !maintenance.active) return CUT_CALORIE_TARGET;
        const week = getCurrentReverseWeek();
        if (maintenance.phase === 'maintenance') {
            return maintenance.weeks[3].targetCal;
        }
        return maintenance.weeks[week - 1].targetCal;
    }

    function daysBetween(isoStart, isoEnd) {
        const a = new Date(isoStart + 'T12:00:00');
        const b = new Date(isoEnd + 'T12:00:00');
        return Math.floor((b - a) / (1000 * 60 * 60 * 24));
    }

    function addDaysISO(iso, days) {
        const d = new Date(iso + 'T12:00:00');
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
    }

    function buildReversePlan(endCutCalories) {
        const weeks = [];
        let cal = endCutCalories;
        REVERSE_WEEKLY_BUMPS.forEach((bump, i) => {
            cal += bump;
            weeks.push({
                week: i + 1,
                bump,
                targetCal: cal,
                startDate: null,
                endDate: null
            });
        });
        const start = getTodayISO();
        weeks.forEach((w, i) => {
            w.startDate = addDaysISO(start, i * 7);
            w.endDate = addDaysISO(start, (i + 1) * 7 - 1);
        });
        return weeks;
    }

    function getCurrentReverseWeek() {
        if (!maintenance) return 1;
        const days = daysBetween(maintenance.initiatedAt, getTodayISO());
        if (days >= 28) return 4;
        return Math.min(Math.floor(days / 7) + 1, 4);
    }

    function saveMaintenance() {
        localStorage.setItem(MAINTENANCE_KEY, JSON.stringify(maintenance));
    }

    function isGoalReached() {
        const latest = getLatestLog();
        return latest && latest.weight <= TARGET_WEIGHT + 0.5;
    }

    function initiateMaintenance() {
        const latest = getLatestLog();
        if (!latest) {
            alert('Log your weight first before initiating maintenance.');
            return;
        }
        if (latest.weight > TARGET_WEIGHT + 0.5) {
            alert(`You need to reach ${TARGET_WEIGHT} lbs first. Current: ${latest.weight.toFixed(1)} lbs`);
            return;
        }
        if (!confirm(`Lock set-point at ${latest.weight.toFixed(1)} lbs and start your 4-week reverse diet?`)) return;

        const endCal = latest.calories || CUT_CALORIE_TARGET;
        maintenance = {
            active: true,
            initiatedAt: getTodayISO(),
            lockedWeight: latest.weight,
            lockedLogs: JSON.parse(JSON.stringify(userLogs)),
            endCutCalories: endCal,
            safeRangeMin: SAFE_RANGE_MIN,
            safeRangeMax: SAFE_RANGE_MAX,
            weeks: buildReversePlan(endCal),
            phase: 'reverse'
        };
        saveMaintenance();
        renderMaintenanceView();
        if (document.body.dataset.page !== 'plan') window.location.href = 'plan.html';
        updateCalorieTargets();
        checkGoalBanner();
    }

    function getLogsInRange(startDate, endDate) {
        return userLogs.filter(l => l.date >= startDate && l.date <= endDate);
    }

    function avgWeight(logs) {
        if (!logs.length) return null;
        return logs.reduce((s, l) => s + l.weight, 0) / logs.length;
    }

    function renderReverseWeeks() {
        const container = document.getElementById('reverse-weeks');
        if (!container || !maintenance) return;
        const currentWeek = getCurrentReverseWeek();
        container.innerHTML = '';

        maintenance.weeks.forEach(w => {
            const card = document.createElement('div');
            const isCurrent = maintenance.phase === 'reverse' && w.week === currentWeek;
            const isComplete = maintenance.phase === 'maintenance' || w.week < currentWeek;
            card.className = 'week-card' + (isCurrent ? ' current' : '') + (isComplete ? ' complete' : '');

            const weekLogs = getLogsInRange(w.startDate, w.endDate);
            const avg = avgWeight(weekLogs);
            const status = avg === null ? 'Log weight to track' :
                Math.abs(avg - maintenance.lockedWeight) <= 2 ? '✓ Stable' : '↑ Watch trend';

            card.innerHTML = `
                <div class="week-num">Week ${w.week}${isCurrent ? ' · Current' : ''}</div>
                <div class="week-cal">${w.targetCal.toLocaleString()}</div>
                <div class="week-bump">+${w.bump} cal from prior</div>
                <div class="week-status">${status}${avg !== null ? ` · avg ${avg.toFixed(1)} lbs` : ''}</div>
            `;
            container.appendChild(card);
        });
    }

    function renderSafeRange() {
        const zone = document.getElementById('safe-range-zone');
        if (!zone) return;
        const latest = getLatestLog();
        const weight = latest ? latest.weight : maintenance.lockedWeight;
        const barMin = 150;
        const barMax = 170;
        const pct = (v) => ((v - barMin) / (barMax - barMin)) * 100;

        zone.style.left = `${pct(SAFE_RANGE_MIN)}%`;
        zone.style.width = `${pct(SAFE_RANGE_MAX) - pct(SAFE_RANGE_MIN)}%`;

        const marker = document.getElementById('weight-marker');
        marker.style.left = `${Math.max(0, Math.min(100, pct(weight)))}%`;
        marker.setAttribute('data-label', `${weight.toFixed(1)}`);

        const alert = document.getElementById('mini-cut-alert');
        if (weight > SAFE_RANGE_MAX) {
            alert.classList.add('visible');
            document.getElementById('mini-cut-cal').textContent = CUT_CALORIE_TARGET.toLocaleString();
        } else {
            alert.classList.remove('visible');
        }
    }

    function renderStabilityTable() {
        const tbody = document.getElementById('stability-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        maintenance.weeks.forEach(w => {
            const weekLogs = getLogsInRange(w.startDate, w.endDate);
            const avg = avgWeight(weekLogs);
            const vsLock = avg !== null ? (avg - maintenance.lockedWeight).toFixed(1) : '—';
            const vsText = avg !== null ? (vsLock > 0 ? `+${vsLock}` : vsLock) + ' lbs' : '—';
            let status = 'Pending data';
            if (avg !== null) {
                if (avg > SAFE_RANGE_MAX) status = '⚠ Above safe range';
                else if (avg >= SAFE_RANGE_MIN && avg <= SAFE_RANGE_MAX) status = '✓ In safe zone';
                else if (avg < SAFE_RANGE_MIN) status = '↓ Below floor';
                else status = 'Tracking';
            }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>Week ${w.week}</td>
                <td><strong>${w.targetCal.toLocaleString()} cal</strong></td>
                <td>${avg !== null ? avg.toFixed(1) + ' lbs' : '—'}</td>
                <td>${vsText}</td>
                <td>${status}</td>
            `;
            tbody.appendChild(row);
        });
    }

    function renderMaintenanceView() {
        const setup = document.getElementById('maintenance-setup');
        if (!setup) return;
        const active = document.getElementById('maintenance-active');
        const lockBadge = document.getElementById('lock-badge');
        const stats = document.getElementById('maintenance-stats');
        const phaseBadge = document.getElementById('phase-badge');

        const latest = getLatestLog();
        document.getElementById('setup-current-weight').textContent =
            latest ? `${latest.weight.toFixed(1)} lbs` : '—';

        if (!maintenance || !maintenance.active) {
            setup.style.display = 'block';
            active.style.display = 'none';
            lockBadge.style.display = 'none';
            stats.innerHTML = '';
            if (isGoalReached()) {
                setup.innerHTML = `
                    <h2>Ready to Land</h2>
                    <p style="color:var(--text-muted);margin:12px 0 20px">You've hit ${TARGET_WEIGHT} lbs. Initiate maintenance to lock your set-point and start the 4-week reverse diet.</p>
                    <button type="button" class="btn-success" id="initiate-from-plan-btn">Initiate Maintenance</button>
                `;
                document.getElementById('initiate-from-plan-btn').addEventListener('click', initiateMaintenance);
            }
            return;
        }

        if (daysBetween(maintenance.initiatedAt, getTodayISO()) >= 28) {
            maintenance.phase = 'maintenance';
            saveMaintenance();
        }

        setup.style.display = 'none';
        active.style.display = 'block';
        lockBadge.style.display = 'inline-flex';
        phaseBadge.textContent = maintenance.phase === 'maintenance' ? 'Maintenance' : `Reverse Diet · Week ${getCurrentReverseWeek()}`;

        const target = getActiveCalorieTarget();
        stats.innerHTML = `
            <div class="maint-stat"><div class="label">Locked Weight</div><div class="value">${maintenance.lockedWeight.toFixed(1)}</div></div>
            <div class="maint-stat"><div class="label">Today's Target</div><div class="value">${target.toLocaleString()}</div></div>
            <div class="maint-stat"><div class="label">Safe Range</div><div class="value">${SAFE_RANGE_MIN}–${SAFE_RANGE_MAX}</div></div>
            <div class="maint-stat"><div class="label">Started</div><div class="value" style="font-size:0.9rem">${formatDisplayDate(maintenance.initiatedAt)}</div></div>
        `;

        renderReverseWeeks();
        renderSafeRange();
        renderStabilityTable();
    }

    function checkGoalBanner() {
        const banner = document.getElementById('goal-banner');
        if (!banner) return;
        if (maintenance && maintenance.active) {
            banner.style.display = 'none';
            return;
        }
        banner.style.display = isGoalReached() ? 'flex' : 'none';
    }

    function updateCalorieTargets() {
        const target = getActiveCalorieTarget();
        const dailyTarget = document.getElementById('daily-target-display');
        if (dailyTarget) dailyTarget.textContent = target.toLocaleString();
        const badge = document.getElementById('goal-badge');
        if (!badge) { syncCaloriesFromFoodTracker(); return; }
        if (maintenance && maintenance.active) {
            badge.textContent = maintenance.phase === 'maintenance'
                ? `Maintenance · ${target.toLocaleString()} cal`
                : `Reverse Wk ${getCurrentReverseWeek()} · ${target.toLocaleString()} cal`;
        } else {
            badge.textContent = `${CUT_CALORIE_TARGET.toLocaleString()} cal · 48h fast 2×/mo`;
        }
        syncCaloriesFromFoodTracker();
    }

    function bindClick(id, handler) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    }
    bindClick('initiate-maintenance-btn', initiateMaintenance);

    const defaultFoods = [
        { id: 'f1', name: 'Chicken breast', per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 } },
        { id: 'f2', name: 'Egg (whole)', per100g: { calories: 155, protein: 13, carbs: 1.1, fat: 11 } },
        { id: 'f3', name: 'White rice (cooked)', per100g: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 } },
        { id: 'f4', name: 'Greek yogurt', per100g: { calories: 97, protein: 9, carbs: 3.6, fat: 5 } },
        { id: 'f5', name: 'Protein shake', per100g: { calories: 80, protein: 16, carbs: 2, fat: 1 } }
    ];

    function normalizeFood(food) {
        if (food.per100g) return food;
        const defaultMatch = defaultFoods.find(d => d.name.toLowerCase() === (food.name || '').toLowerCase());
        if (defaultMatch) {
            return { ...food, per100g: { ...defaultMatch.per100g } };
        }
        const calPerGram = food.calPerGram || 1;
        return {
            ...food,
            per100g: {
                calories: Math.round(calPerGram * 100),
                protein: food.proteinPerGram ? Math.round(food.proteinPerGram * 100 * 10) / 10 : 0,
                carbs: food.carbsPerGram ? Math.round(food.carbsPerGram * 100 * 10) / 10 : 0,
                fat: food.fatPerGram ? Math.round(food.fatPerGram * 100 * 10) / 10 : 0
            }
        };
    }

    function calcMacrosForGrams(food, grams) {
        const f = normalizeFood(food);
        const factor = grams / 100;
        return {
            calories: Math.round(f.per100g.calories * factor),
            protein: Math.round(f.per100g.protein * factor * 10) / 10,
            carbs: Math.round(f.per100g.carbs * factor * 10) / 10,
            fat: Math.round(f.per100g.fat * factor * 10) / 10
        };
    }

    let foodLibrary = (JSON.parse(localStorage.getItem(FOODS_KEY)) || defaultFoods).map(normalizeFood);
    let foodEntries = JSON.parse(localStorage.getItem(FOOD_ENTRIES_KEY)) || {};
    let selectedFoodId = null;

    const foodLibraryEl = document.getElementById('food-library');
    const todayFoodLogEl = document.getElementById('today-food-log');
    const quickLogPanel = document.getElementById('quick-log-panel');
    const quickLogTitle = document.getElementById('quick-log-title');
    const quickLogPreview = document.getElementById('quick-log-preview');
    const inputGrams = document.getElementById('input-grams');
    const addFoodEntryBtn = document.getElementById('add-food-entry-btn');
    const saveFoodForm = document.getElementById('save-food-form');
    const foodRecommendList = document.getElementById('food-recommend-list');
    const remainingCalPill = document.getElementById('remaining-cal-pill');
    const calorieProgressText = document.getElementById('calorie-progress-text');
    const calorieBarFill = document.getElementById('calorie-bar-fill');
    const eatenTodayEl = document.getElementById('eaten-today');
    const proteinTodayEl = document.getElementById('protein-today');
    const proteinProgressText = document.getElementById('protein-progress-text');
    const proteinBarFill = document.getElementById('protein-bar-fill');
    const todayProteinLogEl = document.getElementById('today-protein-log');
    const leanMassInsight = document.getElementById('lean-mass-insight');
    const leanMassInsightText = document.getElementById('lean-mass-insight-text');
    const proteinLogForm = document.getElementById('protein-log-form');
    const stepsTodayEl = document.getElementById('steps-today');
    const tdeeEstimateEl = document.getElementById('tdee-estimate');
    const stepsProgressText = document.getElementById('steps-progress-text');
    const stepsBarFill = document.getElementById('steps-bar-fill');
    const neatInsight = document.getElementById('neat-insight');
    const neatInsightText = document.getElementById('neat-insight-text');
    const neatTdeeInline = document.getElementById('neat-tdee-inline');
    const neatStepsForm = document.getElementById('neat-steps-form');
    const stepTargetInput = document.getElementById('step-target-input');
    const inputSteps = document.getElementById('input-steps');

    function saveNeatData() {
        localStorage.setItem(NEAT_KEY, JSON.stringify(neatData));
    }

    function getStepTarget() {
        return neatData.stepTarget || DEFAULT_STEP_TARGET;
    }

    function getTodaySteps() {
        return neatData.logs[getTodayISO()] ?? null;
    }

    function getStepsForDate(date) {
        return neatData.logs[date] ?? null;
    }

    function estimateTdeeFromSteps(steps) {
        const target = getStepTarget();
        if (steps == null || steps === '') return TDEE_BASELINE;
        const ratio = Math.min(Math.max(steps, 0) / target, 1);
        return Math.round(TDEE_NEAT_FLOOR + ratio * (TDEE_BASELINE - TDEE_NEAT_FLOOR));
    }

    function evaluateNeatStatus(steps) {
        const target = getStepTarget();
        if (steps == null || steps === '') {
            return {
                level: 'caution',
                text: `No steps logged today. On a steep deficit your brain may already be cutting NEAT — daily burn can slip toward ${TDEE_NEAT_FLOOR.toLocaleString()} cal without you noticing.`
            };
        }
        const pct = (steps / target) * 100;
        const tdee = estimateTdeeFromSteps(steps);
        if (pct >= 100) {
            return {
                level: 'shield',
                text: `${steps.toLocaleString()} steps — target hit. Estimated TDEE ~${tdee.toLocaleString()} cal. You're actively countering the subconscious slowdown and protecting your deficit.`
            };
        }
        if (pct >= 75) {
            return {
                level: 'shield',
                text: `${steps.toLocaleString()} / ${target.toLocaleString()} steps (${Math.round(pct)}%). Close to target — est. TDEE ~${tdee.toLocaleString()} cal. A short walk can lock in the rest.`
            };
        }
        if (pct >= 50) {
            return {
                level: 'caution',
                text: `${steps.toLocaleString()} steps — only ${Math.round(pct)}% of target. NEAT may be dropping. Est. burn ~${tdee.toLocaleString()} cal vs ${TDEE_BASELINE.toLocaleString()} baseline. This is a common plateau trigger.`
            };
        }
        return {
            level: 'risk',
            text: `${steps.toLocaleString()} steps — NEAT crash zone. Your body may be conserving energy toward ~${TDEE_NEAT_FLOOR.toLocaleString()} cal/day. Push movement to break the "1,250 cal but not losing" stall.`
        };
    }

    function renderNeatTracker() {
        if (!stepsTodayEl) return;
        const target = getStepTarget();
        const todaySteps = getTodaySteps();
        const steps = todaySteps ?? 0;
        const displaySteps = todaySteps != null ? todaySteps : 0;

        if (stepTargetInput) stepTargetInput.value = target;
        if (todaySteps != null && inputSteps) inputSteps.value = todaySteps;

        const pct = Math.min((displaySteps / target) * 100, 100);
        stepsTodayEl.textContent = todaySteps != null ? displaySteps.toLocaleString() : '—';
        if (stepsProgressText) stepsProgressText.textContent = `${displaySteps.toLocaleString()} / ${target.toLocaleString()}`;
        if (stepsBarFill) {
            stepsBarFill.style.width = `${pct}%`;
            stepsBarFill.classList.remove('low', 'critical');
            if (todaySteps != null) {
                if (pct < 50) stepsBarFill.classList.add('critical');
                else if (pct < 75) stepsBarFill.classList.add('low');
            }
        }

        const tdee = estimateTdeeFromSteps(todaySteps);
        if (tdeeEstimateEl) tdeeEstimateEl.textContent = tdee.toLocaleString();
        if (neatTdeeInline) neatTdeeInline.textContent = tdee.toLocaleString();

        const status = evaluateNeatStatus(todaySteps);
        if (neatInsight) {
            neatInsight.className = `lean-mass-insight ${status.level}`;
            neatInsight.innerHTML = `<strong>NEAT Status</strong><span>${status.text}</span>`;
        }

        const protocolSteps = document.getElementById('protocol-steps-status');
        if (protocolSteps) {
            protocolSteps.textContent = todaySteps != null
                ? `${displaySteps.toLocaleString()} / ${target.toLocaleString()}`
                : `${target.toLocaleString()} target`;
        }
    }

    if (neatStepsForm) neatStepsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const target = parseInt(stepTargetInput.value, 10);
        const steps = parseInt(inputSteps.value, 10);
        if (target && target >= 1000) neatData.stepTarget = target;
        if (!isNaN(steps) && steps >= 0) neatData.logs[getTodayISO()] = steps;
        saveNeatData();
        renderNeatTracker();
    });

    function saveProteinLog() {
        localStorage.setItem(PROTEIN_LOG_KEY, JSON.stringify(proteinLog));
    }

    function getTodayProteinEntries() {
        return proteinLog[getTodayISO()] || [];
    }

    function getManualProteinTotal() {
        return getTodayProteinEntries().reduce((sum, e) => sum + e.grams, 0);
    }

    function getProteinForDate(date) {
        const manual = (proteinLog[date] || []).reduce((sum, e) => sum + e.grams, 0);
        const fromFood = (foodEntries[date] || []).reduce((sum, e) => sum + (e.protein || 0), 0);
        const total = manual + fromFood;
        return total > 0 ? Math.round(total * 10) / 10 : 0;
    }

    function evaluateLeanMassStatus(grams) {
        if (grams < PROTEIN_DANGER) {
            return {
                level: 'risk',
                title: 'Metabolic Slowdown Risk',
                text: `Only ${grams}g logged. Days under ${PROTEIN_DANGER}g correlate with a ${LEAN_MASS_STATS.relativeSlowdownIncreasePct}% higher chance of metabolic slowdown (${LEAN_MASS_STATS.failRateUnder120}% vs ${LEAN_MASS_STATS.failRate120Plus}% failure rate in model cohort). Flood your system with amino acids today.`,
                verdict: `⚠ Risk — Under ${PROTEIN_DANGER}g protein`
            };
        }
        if (grams < PROTEIN_MIN) {
            return {
                level: 'caution',
                title: 'Below Muscle-Shield',
                text: `${grams}g logged — above the ${PROTEIN_DANGER}g danger floor but below the ${PROTEIN_MIN}–${PROTEIN_MAX}g shield. Push toward ${PROTEIN_MIN}g+ to protect lean mass on a 1,250 cal deficit.`,
                verdict: `△ Caution — ${grams}g / ${PROTEIN_MIN}g minimum`
            };
        }
        if (grams <= PROTEIN_MAX) {
            return {
                level: 'shield',
                title: 'Muscle-Shield Active',
                text: `${grams}g hits the ${PROTEIN_MIN}–${PROTEIN_MAX}g target zone. Model cohort shows ${LEAN_MASS_STATS.shieldZoneSuccessPct}% success rate in this protein band. Lean mass protected.`,
                verdict: `✓ Shield Active — ${grams}g in zone`
            };
        }
        return {
            level: 'shield',
            title: 'Muscle-Shield Exceeded',
            text: `${grams}g exceeds the ${PROTEIN_MAX}g ceiling — excellent amino acid coverage for your 5'11" frame on a steep deficit.`,
            verdict: `✓ Optimal — ${grams}g protein`
        };
    }

    function renderProteinTracker() {
        if (!proteinTodayEl) return;
        const total = getTodayProteinTotal();
        const barMax = PROTEIN_MAX + 20;
        const pct = Math.min((total / barMax) * 100, 100);

        proteinTodayEl.textContent = `${total}g`;
        if (proteinProgressText) proteinProgressText.textContent = `${total}g / ${PROTEIN_MIN}g min (${PROTEIN_MIN}–${PROTEIN_MAX}g zone)`;
        if (proteinBarFill) {
            proteinBarFill.style.width = `${pct}%`;
            proteinBarFill.classList.remove('low', 'warn');
            if (total < PROTEIN_DANGER) proteinBarFill.classList.add('low');
            else if (total < PROTEIN_MIN) proteinBarFill.classList.add('warn');
        }

        const shieldZone = document.getElementById('protein-shield-zone');
        if (shieldZone) {
        shieldZone.style.left = `${(PROTEIN_MIN / barMax) * 100}%`;
        shieldZone.style.width = `${((PROTEIN_MAX - PROTEIN_MIN) / barMax) * 100}%`;
        }

        const status = evaluateLeanMassStatus(total);
        if (leanMassInsight) {
        leanMassInsight.className = `lean-mass-insight ${status.level}`;
        leanMassInsight.innerHTML = `
            <strong>Lean-Mass Predictor · ${status.title}</strong>
            <span>${status.text}</span>
        `;
        }

        const mlText = document.getElementById('ml-verdict-text');
        const mlNote = document.getElementById('ml-verdict-note');
        if (mlText) mlText.textContent = status.verdict;
        if (mlNote) mlNote.textContent =
            `Under ${PROTEIN_DANGER}g → ${LEAN_MASS_STATS.relativeSlowdownIncreasePct}% higher slowdown risk vs adequate protein. Run python3 cutting.py for full tree rules.`;

        const protocolStatus = document.getElementById('protocol-protein-status');
        if (protocolStatus) {
            protocolStatus.textContent = total >= PROTEIN_MIN ? `${total}g ✓` : `${total}g / ${PROTEIN_MIN}g`;
        }

        if (!todayProteinLogEl) return;
        todayProteinLogEl.innerHTML = '';
        const foodSources = getTodayFoodEntries().filter(e => (e.protein || 0) > 0);
        if (foodSources.length === 0) {
            todayProteinLogEl.innerHTML = '<li class="food-log-item food-log-item-muted">No protein yet — log food in the Food section above.</li>';
            return;
        }

        foodSources.forEach(entry => {
            const li = document.createElement('li');
            li.className = 'food-log-item';
            const protein = Math.round((entry.protein || 0) * 10) / 10;
            li.innerHTML = `
                <span><strong>${entry.name}</strong> · ${entry.grams}g → ${protein}g protein</span>
            `;
            todayProteinLogEl.appendChild(li);
        });
    }

    function addProteinEntry(grams, note) {
        const today = getTodayISO();
        const entry = {
            id: makeId(),
            grams,
            note: note || '',
            addedAt: new Date().toISOString()
        };
        if (!proteinLog[today]) proteinLog[today] = [];
        proteinLog[today].push(entry);
        saveProteinLog();
        renderProteinTracker();
        renderFoodRecommendations();
    }

    function removeProteinEntry(entryId) {
        const today = getTodayISO();
        if (!proteinLog[today]) return;
        proteinLog[today] = proteinLog[today].filter(e => e.id !== entryId);
        saveProteinLog();
        renderProteinTracker();
        renderFoodRecommendations();
    }

    const EXERCISE_TYPE_GUIDES = {
        SIT: {
            instruction: 'Sprint Interval Training: 8–30 second all-out bursts with full recovery between reps. Drives epinephrine fast — best when time is limited.',
            example: 'Bike or rower: 8 × 20 sec max sprint, 90 sec easy spin between. Warm up 5 min first.',
            duration: '15–20 min total (including warm-up)'
        },
        HIIT: {
            instruction: 'High-intensity intervals at submax effort (roughly 85–95% max). Longer work blocks than SIT with shorter relative rest.',
            example: 'Treadmill or assault bike: 6 × 90 sec hard / 2 min walk. Or 10 × 60 sec on / 60 sec off.',
            duration: '25–35 min'
        },
        MICT: {
            instruction: 'Moderate-intensity continuous training — Zone 2 at 55–70% max heart rate. Conversational pace; builds mitochondrial fat oxidation.',
            example: 'Brisk walk, easy jog, or bike: steady 45 min where you can speak in full sentences.',
            duration: '45–90 min (under 90 min fasted vs fed is similar)'
        },
        Accelerator: {
            instruction: 'Fat-loss accelerator: 20–60 min high-intensity work (weights, SIT, or HIIT) then immediately transition to Zone 2 without resting.',
            example: '30 min full-body circuit → 25 min incline walk at conversational pace. Fasted shifts to fat earlier if medically cleared.',
            duration: '45–60 min combined · target 3–4×/week'
        }
    };

    function updateExerciseTypeGuide() {
        const select = document.getElementById('exercise-type');
        const instructionEl = document.getElementById('exercise-guide-instruction');
        const exampleEl = document.getElementById('exercise-guide-example');
        const durationEl = document.getElementById('exercise-guide-duration');
        if (!select || !instructionEl) return;

        const guide = EXERCISE_TYPE_GUIDES[select.value] || EXERCISE_TYPE_GUIDES.SIT;
        instructionEl.textContent = guide.instruction;
        if (exampleEl) exampleEl.textContent = guide.example;
        if (durationEl) durationEl.textContent = guide.duration;
    }

    function bindExerciseTypeGuide() {
        const select = document.getElementById('exercise-type');
        if (!select || select.dataset.guideBound) return;
        select.dataset.guideBound = '1';
        select.addEventListener('change', updateExerciseTypeGuide);
        updateExerciseTypeGuide();
    }

    function makeId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function getTodayProteinFromFood() {
        return getTodayFoodEntries().reduce((sum, e) => sum + (e.protein || 0), 0);
    }

    function getTodayMacroTotals() {
        const entries = getTodayFoodEntries();
        return entries.reduce((acc, e) => ({
            calories: acc.calories + (e.calories || 0),
            protein: acc.protein + (e.protein || 0),
            carbs: acc.carbs + (e.carbs || 0),
            fat: acc.fat + (e.fat || 0)
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
    }

    function getRemainingCalories() {
        return Math.max(0, getActiveCalorieTarget() - getTodayCalorieTotal());
    }

    function getCombinedProteinTotal() {
        return Math.round((getTodayProteinFromFood() + getManualProteinTotal()) * 10) / 10;
    }

    function getTodayProteinTotal() {
        return getCombinedProteinTotal();
    }

    function recommendFoods(limit = 5) {
        const remainingCal = getRemainingCalories();
        const remainingProtein = Math.max(0, PROTEIN_MIN - getCombinedProteinTotal());

        if (remainingCal < 30) {
            return { empty: true, message: remainingCal <= 0 ? 'Calorie target reached for today.' : 'Less than 30 cal left — nearly at target.' };
        }
        if (foodLibrary.length === 0) {
            return { empty: true, message: 'Add foods to your library to get recommendations.' };
        }

        const recs = foodLibrary.map(food => {
            const f = normalizeFood(food);
            const calPerG = f.per100g.calories / 100;
            const protPerG = f.per100g.protein / 100;
            let grams = Math.round(remainingCal / calPerG);
            grams = Math.max(40, Math.min(grams, 450));
            const macros = calcMacrosForGrams(f, grams);
            const overflow = Math.max(0, macros.calories - remainingCal);
            const proteinHelp = Math.min(macros.protein, remainingProtein);
            const score = proteinHelp * 4 - overflow * 0.8 + (protPerG / calPerG) * 50;
            return { food: f, grams, ...macros, score, fits: macros.calories <= remainingCal };
        });

        return {
            empty: false,
            remainingCal,
            remainingProtein,
            items: recs.sort((a, b) => b.score - a.score).slice(0, limit)
        };
    }

    function renderFoodRecommendations() {
        if (!foodRecommendList) return;
        const result = recommendFoods();
        if (remainingCalPill) remainingCalPill.textContent = result.empty
            ? `${getRemainingCalories().toLocaleString()} cal left today`
            : `${result.remainingCal.toLocaleString()} cal left · ${Math.round(result.remainingProtein)}g protein to shield`;

        foodRecommendList.innerHTML = '';
        if (result.empty) {
            foodRecommendList.innerHTML = `<p class="empty-foods">${result.message}</p>`;
            return;
        }

        result.items.forEach(rec => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'recommend-card';
            const fitLabel = rec.fits ? 'fits budget' : 'slightly over';
            card.innerHTML = `
                <div>
                    <div class="rec-name">${rec.food.name}</div>
                    <div class="rec-detail">${rec.calories} cal · ${rec.protein}g P · ${rec.carbs}g C · ${rec.fat}g F · ${fitLabel}</div>
                </div>
                <div class="rec-grams">${rec.grams}g</div>
            `;
            card.addEventListener('click', () => {
                selectFood(rec.food.id);
                inputGrams.value = rec.grams;
                updateQuickLogPreview();
            });
            foodRecommendList.appendChild(card);
        });
    }

    function saveFoodLibrary() {
        foodLibrary = foodLibrary.map(normalizeFood);
        localStorage.setItem(FOODS_KEY, JSON.stringify(foodLibrary));
    }

    function saveFoodEntries() {
        localStorage.setItem(FOOD_ENTRIES_KEY, JSON.stringify(foodEntries));
    }

    function getTodayFoodEntries() {
        const today = getTodayISO();
        return foodEntries[today] || [];
    }

    function getCalorieTotalForDate(date) {
        return (foodEntries[date] || []).reduce((sum, e) => sum + (e.calories || 0), 0);
    }

    function getTodayCalorieTotal() {
        return getCalorieTotalForDate(getTodayISO());
    }

    function syncFoodToDailyLog(date = getTodayISO()) {
        const index = userLogs.findIndex(log => log.date === date);
        if (index === -1) return;

        const calories = getCalorieTotalForDate(date);
        const protein = getProteinForDate(date);
        const steps = date === getTodayISO()
            ? getTodaySteps()
            : (userLogs[index].steps ?? getStepsForDate(date));

        userLogs[index] = { ...userLogs[index], calories, protein, steps };
        saveLogs();
        renderTable();
        if (svg) renderGraph();
        updateMetrics();
    }

    function getFoodById(id) {
        return foodLibrary.find(f => f.id === id);
    }

    function syncCaloriesFromFoodTracker() {
        const total = getTodayCalorieTotal();
        const target = getActiveCalorieTarget();
        if (eatenTodayEl) eatenTodayEl.textContent = total.toLocaleString();

        if (calorieBarFill && calorieProgressText) {
            const pct = Math.min((total / target) * 100, 100);
            calorieBarFill.style.width = `${pct}%`;
            calorieBarFill.classList.toggle('over', total > target);
            calorieProgressText.textContent = `${total.toLocaleString()} / ${target.toLocaleString()} cal`;
        }

        const macros = getTodayMacroTotals();
        const mp = document.getElementById('macro-total-protein');
        const mc = document.getElementById('macro-total-carbs');
        const mf = document.getElementById('macro-total-fat');
        if (mp) mp.textContent = Math.round(macros.protein);
        if (mc) mc.textContent = Math.round(macros.carbs);
        if (mf) mf.textContent = Math.round(macros.fat);

        renderFoodRecommendations();
        renderProteinTracker();
        renderInsulinInsight();
        syncFoodToDailyLog(getTodayISO());
    }

    function selectFood(foodId) {
        selectedFoodId = foodId;
        const food = getFoodById(foodId);
        if (!food) return;

        quickLogPanel.classList.add('visible');
        quickLogTitle.textContent = `Log: ${food.name}`;
        inputGrams.value = '';
        inputGrams.focus();
        updateQuickLogPreview();
        renderFoodLibrary();
    }

    function updateQuickLogPreview() {
        const food = getFoodById(selectedFoodId);
        const grams = parseFloat(inputGrams.value);
        if (!food || !grams || grams <= 0) {
            if (food) {
                const p = normalizeFood(food).per100g;
                quickLogPreview.textContent = `Per 100g: ${p.calories} cal · ${p.protein}g P · ${p.carbs}g C · ${p.fat}g F`;
            } else {
                quickLogPreview.textContent = 'Select a food and enter grams';
            }
            return;
        }
        const m = calcMacrosForGrams(food, grams);
        quickLogPreview.textContent = `${grams}g → ${m.calories} cal · ${m.protein}g protein · ${m.carbs}g carbs · ${m.fat}g fat`;
    }

    function addFoodEntry() {
        const food = getFoodById(selectedFoodId);
        const grams = parseFloat(inputGrams.value);
        if (!food || !grams || grams <= 0) return;

        const today = getTodayISO();
        const macros = calcMacrosForGrams(food, grams);
        const entry = {
            id: makeId(),
            foodId: food.id,
            name: food.name,
            grams,
            ...macros,
            addedAt: new Date().toISOString()
        };

        if (!foodEntries[today]) foodEntries[today] = [];
        foodEntries[today].push(entry);
        saveFoodEntries();

        inputGrams.value = '';
        updateQuickLogPreview();
        renderTodayFoodLog();
        syncCaloriesFromFoodTracker();
    }

    function removeFoodEntry(entryId) {
        const today = getTodayISO();
        if (!foodEntries[today]) return;
        foodEntries[today] = foodEntries[today].filter(e => e.id !== entryId);
        saveFoodEntries();
        renderTodayFoodLog();
        syncCaloriesFromFoodTracker();
    }

    function deleteFoodFromLibrary(foodId) {
        if (!confirm('Remove this food from your saved library?')) return;
        foodLibrary = foodLibrary.filter(f => f.id !== foodId);
        if (selectedFoodId === foodId) {
            selectedFoodId = null;
            quickLogPanel.classList.remove('visible');
        }
        saveFoodLibrary();
        renderFoodLibrary();
        renderFoodRecommendations();
    }

    function renderFoodLibrary() {
        if (!foodLibraryEl) return;
        foodLibraryEl.innerHTML = '';
        if (foodLibrary.length === 0) {
            foodLibraryEl.innerHTML = '<p class="empty-foods">No saved foods yet. Add one below.</p>';
            return;
        }

        foodLibrary.forEach(food => {
            const f = normalizeFood(food);
            const wrap = document.createElement('div');
            wrap.className = 'food-tile-wrap';
            const tile = document.createElement('button');
            tile.type = 'button';
            tile.className = 'food-tile' + (selectedFoodId === food.id ? ' selected' : '');
            tile.innerHTML = `
                <div class="food-tile-name">${f.name}</div>
                <div class="food-tile-macros">${f.per100g.calories} cal · ${f.per100g.protein}g P<br>${f.per100g.carbs}g C · ${f.per100g.fat}g F <span style="opacity:0.7">/100g</span></div>
            `;
            tile.addEventListener('click', () => selectFood(food.id));

            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'delete-lib-btn';
            del.textContent = '×';
            del.title = 'Remove from library';
            del.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteFoodFromLibrary(food.id);
            });

            wrap.appendChild(tile);
            wrap.appendChild(del);
            foodLibraryEl.appendChild(wrap);
        });
    }

    function renderTodayFoodLog() {
        if (!todayFoodLogEl) return;
        const entries = getTodayFoodEntries();
        todayFoodLogEl.innerHTML = '';

        if (entries.length === 0) {
            todayFoodLogEl.innerHTML = '<li class="food-log-item" style="justify-content:center;color:var(--text-muted)">No food logged yet today</li>';
            return;
        }

        entries.forEach(entry => {
            const li = document.createElement('li');
            li.className = 'food-log-item';
            li.innerHTML = `
                <span><strong>${entry.name}</strong> · ${entry.grams}g<span class="item-cal">${entry.calories} cal</span>
                <span style="font-size:0.75rem;color:var(--text-muted);margin-left:6px">${entry.protein}g P · ${entry.carbs}g C · ${entry.fat}g F</span></span>
                <button type="button" class="remove-food-btn" data-id="${entry.id}">Remove</button>
            `;
            todayFoodLogEl.appendChild(li);
        });

        todayFoodLogEl.querySelectorAll('.remove-food-btn').forEach(btn => {
            btn.addEventListener('click', () => removeFoodEntry(btn.dataset.id));
        });
    }

    if (saveFoodForm) saveFoodForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('new-food-name').value.trim();
        const per100g = {
            calories: parseFloat(document.getElementById('new-food-cal').value),
            protein: parseFloat(document.getElementById('new-food-protein').value) || 0,
            carbs: parseFloat(document.getElementById('new-food-carbs').value) || 0,
            fat: parseFloat(document.getElementById('new-food-fat').value) || 0
        };
        if (!name || !per100g.calories || per100g.calories <= 0) return;

        const existing = foodLibrary.find(f => f.name.toLowerCase() === name.toLowerCase());
        if (existing) {
            existing.per100g = per100g;
        } else {
            foodLibrary.push({ id: makeId(), name, per100g });
        }

        saveFoodLibrary();
        saveFoodForm.reset();
        document.getElementById('new-food-carbs').value = '0';
        document.getElementById('new-food-fat').value = '0';
        renderFoodLibrary();
        renderFoodRecommendations();
    });

    if (inputGrams) inputGrams.addEventListener('input', updateQuickLogPreview);
    if (addFoodEntryBtn) addFoodEntryBtn.addEventListener('click', addFoodEntry);
    if (inputGrams) inputGrams.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addFoodEntry();
        }
    });

    const defaultData = [];

    let userLogs = normalizeLogs(JSON.parse(localStorage.getItem('cutting_logs')) || defaultData);
    let editingDate = null;

    const form = document.getElementById('log-form');
    const tableBody = document.getElementById('log-table-body');
    const svg = document.getElementById('weight-svg');
    const clearBtn = document.getElementById('clear-data-btn');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const submitBtn = document.getElementById('submit-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const formStatus = document.getElementById('form-status');
    const formTitle = document.getElementById('log-form-title');
    const inputDate = document.getElementById('input-date');
    const inputWeight = document.getElementById('input-weight');

    function normalizeLogs(logs) {
        const withDates = logs.map((log, index) => {
            const { type, ...rest } = log;
            return {
                ...rest,
                date: rest.date || offsetDateISO(logs.length - index)
            };
        });
        const sorted = [...withDates].sort((a, b) => a.date.localeCompare(b.date));
        return sorted.map((log, index) => ({ ...log, day: index + 1 }));
    }

    function saveLogs() {
        userLogs = normalizeLogs(userLogs);
        localStorage.setItem('cutting_logs', JSON.stringify(userLogs));
    }

    function csvEscape(value) {
        const str = value == null ? '' : String(value);
        if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
        return str;
    }

    function downloadCsv(filename, csvContent) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }

    function exportLogsCsv() {
        const headers = ['date', 'day', 'weight_lbs', 'calories', 'protein_g', 'steps', 'weight_delta_lbs'];
        const rows = userLogs.map((log, index) => {
            const protein = log.protein ?? getProteinForDate(log.date);
            const steps = log.steps ?? getStepsForDate(log.date);
            let delta = '';
            if (index > 0) {
                delta = (log.weight - userLogs[index - 1].weight).toFixed(1);
            }
            return [
                log.date,
                log.day,
                log.weight.toFixed(1),
                log.calories,
                protein || '',
                steps ?? '',
                delta
            ];
        });
        const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
        downloadCsv(`the-cut-history-${getTodayISO()}.csv`, csv);
    }

    function findLogByDate(date) {
        return userLogs.find(log => log.date === date);
    }

    function getLatestLog() {
        if (userLogs.length === 0) return null;
        return userLogs[userLogs.length - 1];
    }

    function suggestNextWeight() {
        const latest = getLatestLog();
        return latest ? (latest.weight - 0.1).toFixed(1) : '';
    }

    function setFormForNewDay() {
        if (!form) return;
        editingDate = null;
        const today = getTodayISO();
        const todayLog = findLogByDate(today);

        inputDate.value = today;
        inputDate.readOnly = true;
        cancelEditBtn.style.display = 'none';
        formTitle.textContent = 'Log Weight';

        if (todayLog) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Weight Logged Today';
            formStatus.textContent = 'Weight logged. Calories update automatically when you log food below. Use Edit in history to change weight.';
            formStatus.className = 'form-status blocked';
            inputWeight.value = todayLog.weight;
        } else {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Log Weight';
            formStatus.textContent = `Logging weight for ${formatDisplayDate(today)} — one entry per calendar day.`;
            formStatus.className = 'form-status';
            inputWeight.value = suggestNextWeight();
        }
    }

    function startEdit(date) {
        const log = findLogByDate(date);
        if (!log) return;

        if (!form) {
            sessionStorage.setItem('cutting_edit_date', date);
            window.location.href = 'daily.html#log';
            return;
        }

        editingDate = date;
        inputDate.value = log.date;
        inputDate.readOnly = true;
        inputWeight.value = log.weight;

        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Weight';
        if (cancelEditBtn) cancelEditBtn.style.display = 'block';
        if (formTitle) formTitle.textContent = `Edit Weight · Day ${log.day}`;
        formStatus.textContent = `Editing ${formatDisplayDate(log.date)}. Calories for this day come from food logged that day.`;
        formStatus.className = 'form-status editing';

        renderTable();
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function deleteLog(date) {
        const log = findLogByDate(date);
        if (!log) return;

        if (!confirm(`Delete log for ${formatDisplayDate(date)} (${log.weight.toFixed(1)} lbs)? This cannot be undone.`)) {
            return;
        }

        if (editingDate === date) {
            editingDate = null;
            setFormForNewDay();
        }

        userLogs = userLogs.filter(l => l.date !== date);
        saveLogs();
        renderTable();
        renderGraph();
        updateMetrics();
    }

    function cancelEdit() {
        setFormForNewDay();
        renderTable();
    }

    function updateMetrics() {
        const latest = getLatestLog();
        const lw = document.getElementById('latest-weight');
        const tl = document.getElementById('total-lost');

        if (!latest) {
            if (lw) lw.innerText = '—';
            if (tl) tl.innerText = '—';
            checkGoalBanner();
            updateCalorieTargets();
            renderMaintenanceView();
            return;
        }

        const baseline = userLogs[0].weight;
        const totalLost = (baseline - latest.weight).toFixed(1);
        if (lw) lw.innerText = `${latest.weight.toFixed(1)} lbs`;
        if (tl) tl.innerText = `${totalLost} lbs`;
        checkGoalBanner();
        updateCalorieTargets();
        if (maintenance && maintenance.active) {
            renderMaintenanceView();
        }
    }

    function renderTable() {
        if (!tableBody) return;
        tableBody.innerHTML = '';

        if (userLogs.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="table-empty">No log entries yet. Log your first day on the <a href="daily.html#log">Daily Hub</a>.</td>
                </tr>
            `;
            return;
        }

        userLogs.forEach((log, index) => {
            const row = document.createElement('tr');
            if (editingDate === log.date) row.classList.add('row-editing');

            let deltaText = 'Baseline';
            if (index > 0) {
                const diff = (log.weight - userLogs[index - 1].weight).toFixed(1);
                deltaText = diff > 0 ? `+${diff} lbs` : `${diff} lbs`;
            }

            const deltaColor = deltaText.includes('-') ? 'var(--success)' : (deltaText === 'Baseline' ? 'var(--text-muted)' : 'var(--fasting)');

            const p = log.protein ?? getProteinForDate(log.date);
            const s = log.steps ?? getStepsForDate(log.date);
            row.innerHTML = `
                <td>Day ${log.day} <span style="color:var(--text-muted);font-size:0.75rem">(${formatDisplayDate(log.date)})</span></td>
                <td><strong>${log.weight.toFixed(1)} lbs</strong></td>
                <td>${log.calories} kcal</td>
                <td>${p ? p + 'g' : '—'}</td>
                <td>${s != null ? s.toLocaleString() : '—'}</td>
                <td style="color:${deltaColor}">${deltaText}</td>
                <td class="row-actions">
                    <button type="button" class="edit-btn" data-date="${log.date}">Edit</button>
                    <button type="button" class="delete-log-btn" data-date="${log.date}">Delete</button>
                </td>
            `;
            tableBody.appendChild(row);
        });

        tableBody.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => startEdit(btn.dataset.date));
        });

        tableBody.querySelectorAll('.delete-log-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteLog(btn.dataset.date));
        });
    }

    function renderGraph() {
        if (!svg) return;
        svg.innerHTML = '';
        if (userLogs.length === 0) return;

        const width = 600;
        const height = 260;
        const padding = 40;

        const weights = userLogs.map(l => l.weight);
        const maxW = Math.max(...weights, TARGET_WEIGHT) + 1;
        const minW = Math.min(...weights, TARGET_WEIGHT) - 1;
        const stepX = (width - padding * 2) / Math.max(userLogs.length - 1, 1);

        function getX(index) { return padding + index * stepX; }
        function getY(weight) {
            return height - padding - ((weight - minW) / (maxW - minW)) * (height - padding * 2);
        }

        for (let w = Math.floor(minW); w <= maxW; w += 5) {
            if (w < minW || w > maxW) continue;
            const lineY = getY(w);
            svg.innerHTML += `
                <line class="grid-line" x1="${padding}" y1="${lineY}" x2="${width - padding}" y2="${lineY}" />
                <text class="graph-text" x="${padding - 30}" y="${lineY + 4}">${Math.round(w)}</text>
            `;
        }

        const goalY = getY(TARGET_WEIGHT);
        svg.innerHTML += `
            <line class="graph-goal-line" x1="${padding}" y1="${goalY}" x2="${width - padding}" y2="${goalY}" />
            <text class="graph-goal-label" x="${width - padding - 6}" y="${goalY - 8}" text-anchor="end">${TARGET_WEIGHT} goal</text>
        `;

        let pathD = '';
        userLogs.forEach((log, index) => {
            const x = getX(index);
            const y = getY(log.weight);
            pathD += index === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
        });

        if (userLogs.length > 1) {
            svg.innerHTML += `<path class="graph-line" d="${pathD}" />`;
        }

        userLogs.forEach((log, index) => {
            const x = getX(index);
            const y = getY(log.weight);
            svg.innerHTML += `
                <circle class="graph-dots" cx="${x}" cy="${y}" r="4" title="Day ${log.day}: ${log.weight} lbs" />
                <text class="graph-text" x="${x - 10}" y="${height - 15}">D${log.day}</text>
            `;
        });
    }

    if (form) form.addEventListener('submit', (e) => {
        e.preventDefault();

        const weight = parseFloat(inputWeight.value);
        const date = inputDate.value;
        const calories = getCalorieTotalForDate(date);
        const protein = getProteinForDate(date);
        const steps = date === getTodayISO() ? getTodaySteps() : getStepsForDate(date);

        if (editingDate) {
            const index = userLogs.findIndex(log => log.date === editingDate);
            if (index === -1) return;
            userLogs[index] = { ...userLogs[index], weight, calories, protein, steps };
            saveLogs();
            cancelEdit();
        } else {
            if (findLogByDate(date)) {
                formStatus.textContent = 'This date is already logged. Use Edit to change it.';
                formStatus.className = 'form-status blocked';
                return;
            }
            userLogs.push({
                day: userLogs.length + 1,
                date,
                weight,
                calories,
                protein,
                steps
            });
            saveLogs();
            setFormForNewDay();
        }

        renderTable();
        renderGraph();
        updateMetrics();
    });

    if (cancelEditBtn) cancelEditBtn.addEventListener('click', cancelEdit);

    function clearAllLogs() {
        userLogs = [];
        editingDate = null;
        localStorage.removeItem('cutting_logs');
        if (form) setFormForNewDay();
        renderTable();
        renderGraph();
        updateMetrics();
    }

    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => {
        if (userLogs.length === 0) {
            alert('No log entries to export yet.');
            return;
        }
        exportLogsCsv();
    });

    if (clearBtn) clearBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to completely flush out current timeline log history?')) {
            clearAllLogs();
        }
    });

    const WEEKLY_MAXES_KEY = 'cutting_weekly_maxes';

    const MAX_EXERCISES = [
        { id: 'pushups', label: 'Push-ups', kind: 'reps', higherBetter: true },
        { id: 'pullups', label: 'Pull-ups', kind: 'reps', higherBetter: true },
        { id: 'plank', label: 'Plank', kind: 'time', higherBetter: true },
        { id: 'mile', label: 'Mile Run', kind: 'time', higherBetter: false }
    ];

    let weeklyMaxes = JSON.parse(localStorage.getItem(WEEKLY_MAXES_KEY)) || [];
    let editingMaxWeek = null;

    const weeklyMaxForm = document.getElementById('weekly-max-form');
    const weeklyMaxTableBody = document.getElementById('weekly-max-table-body');
    const weeklyMaxStatus = document.getElementById('weekly-max-status');
    const weeklyMaxWeekLabel = document.getElementById('weekly-max-week-label');
    const maxPrStrip = document.getElementById('max-pr-strip');
    const clearMaxesBtn = document.getElementById('clear-maxes-btn');

    function getWeekStartISO(iso = getTodayISO()) {
        const d = new Date(iso + 'T12:00:00');
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return d.toISOString().slice(0, 10);
    }

    function getWeekEndISO(weekStart) {
        const d = new Date(weekStart + 'T12:00:00');
        d.setDate(d.getDate() + 6);
        return d.toISOString().slice(0, 10);
    }

    function formatWeekRange(weekStart) {
        const end = getWeekEndISO(weekStart);
        return `${formatDisplayDate(weekStart)} – ${formatDisplayDate(end)}`;
    }

    function parseTimeInput(str) {
        if (!str || !String(str).trim()) return null;
        const raw = String(str).trim();
        if (raw.includes(':')) {
            const parts = raw.split(':');
            const m = parseInt(parts[0], 10);
            const s = parseInt(parts[1], 10);
            if (isNaN(m) || isNaN(s) || s >= 60) return null;
            return m * 60 + s;
        }
        const sec = parseInt(raw, 10);
        return isNaN(sec) || sec < 0 ? null : sec;
    }

    function formatDuration(sec) {
        if (sec == null || sec === '') return '—';
        const m = Math.floor(sec / 60);
        const s = Math.round(sec % 60);
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    function formatExerciseValue(exercise, value) {
        if (value == null || value === '') return '—';
        return exercise.kind === 'time' ? formatDuration(value) : String(value);
    }

    function parseExerciseInput(exercise, raw) {
        if (exercise.kind === 'reps') {
            if (raw === '' || raw == null) return null;
            const n = parseInt(raw, 10);
            return isNaN(n) || n < 0 ? null : n;
        }
        return parseTimeInput(raw);
    }

    function saveWeeklyMaxes() {
        weeklyMaxes.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
        localStorage.setItem(WEEKLY_MAXES_KEY, JSON.stringify(weeklyMaxes));
    }

    function findMaxEntry(weekStart) {
        return weeklyMaxes.find(e => e.weekStart === weekStart);
    }

    function getAllTimePR(exerciseId) {
        const exercise = MAX_EXERCISES.find(e => e.id === exerciseId);
        let best = null;
        let bestWeek = null;
        weeklyMaxes.forEach(entry => {
            const val = entry[exerciseId];
            if (val == null) return;
            if (best == null) {
                best = val;
                bestWeek = entry.weekStart;
                return;
            }
            const isBetter = exercise.higherBetter ? val > best : val < best;
            if (isBetter) {
                best = val;
                bestWeek = entry.weekStart;
            }
        });
        return { value: best, weekStart: bestWeek };
    }

    function isWeekPR(exerciseId, value, weekStart) {
        const pr = getAllTimePR(exerciseId);
        return pr.value != null && pr.value === value && pr.weekStart === weekStart;
    }

    function mergeWeekValues(existing, incoming) {
        const merged = { ...existing };
        MAX_EXERCISES.forEach(ex => {
            const val = incoming[ex.id];
            if (val == null) return;
            const prev = merged[ex.id];
            if (prev == null) {
                merged[ex.id] = val;
                return;
            }
            merged[ex.id] = ex.higherBetter ? Math.max(prev, val) : Math.min(prev, val);
        });
        return merged;
    }

    function fillWeeklyMaxForm(entry) {
        const pushupsEl = document.getElementById('max-pushups');
        const pullupsEl = document.getElementById('max-pullups');
        const plankEl = document.getElementById('max-plank');
        const mileEl = document.getElementById('max-mile');
        if (!pushupsEl) return;

        pushupsEl.value = entry?.pushups ?? '';
        pullupsEl.value = entry?.pullups ?? '';
        plankEl.value = entry?.plank != null ? formatDuration(entry.plank) : '';
        mileEl.value = entry?.mile != null ? formatDuration(entry.mile) : '';
    }

    function renderMaxPRStrip() {
        if (!maxPrStrip) return;
        maxPrStrip.innerHTML = MAX_EXERCISES.map(ex => {
            const pr = getAllTimePR(ex.id);
            const valueText = pr.value != null ? formatExerciseValue(ex, pr.value) : '—';
            const weekText = pr.weekStart ? `Week of ${formatDisplayDate(pr.weekStart)}` : 'No data yet';
            return `
                <div class="max-pr-card">
                    <div class="pr-label">${ex.label} PR</div>
                    <div class="pr-value">${valueText}</div>
                    <div class="pr-week">${weekText}</div>
                </div>
            `;
        }).join('');
    }

    function renderWeeklyMaxTable() {
        if (!weeklyMaxTableBody) return;
        weeklyMaxTableBody.innerHTML = '';

        if (weeklyMaxes.length === 0) {
            weeklyMaxTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">No weekly maxes logged yet</td></tr>';
            return;
        }

        [...weeklyMaxes].reverse().forEach(entry => {
            const row = document.createElement('tr');
            if (editingMaxWeek === entry.weekStart) row.classList.add('row-editing');

            const cells = MAX_EXERCISES.map(ex => {
                const val = entry[ex.id];
                const text = formatExerciseValue(ex, val);
                const isPr = val != null && isWeekPR(ex.id, val, entry.weekStart);
                const cls = isPr ? `pr-cell${ex.kind === 'time' ? ' time-pr' : ''}` : '';
                return `<td${cls ? ` class="${cls}"` : ''}>${text}${isPr ? ' ★' : ''}</td>`;
            }).join('');

            row.innerHTML = `
                <td><strong>${formatWeekRange(entry.weekStart)}</strong></td>
                ${cells}
                <td><button type="button" class="edit-btn" data-week="${entry.weekStart}">Edit</button></td>
            `;
            weeklyMaxTableBody.appendChild(row);
        });

        weeklyMaxTableBody.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => startEditMaxWeek(btn.dataset.week));
        });
    }

    function startEditMaxWeek(weekStart) {
        editingMaxWeek = weekStart;
        const entry = findMaxEntry(weekStart);
        fillWeeklyMaxForm(entry);
        if (weeklyMaxWeekLabel) weeklyMaxWeekLabel.textContent = `Editing ${formatWeekRange(weekStart)}`;
        if (weeklyMaxStatus) {
            weeklyMaxStatus.textContent = 'Update values and save to replace this week.';
            weeklyMaxStatus.className = 'form-status editing';
        }
        renderWeeklyMaxTable();
        weeklyMaxForm?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function resetWeeklyMaxForm() {
        editingMaxWeek = null;
        const weekStart = getWeekStartISO();
        fillWeeklyMaxForm(findMaxEntry(weekStart));
        if (weeklyMaxWeekLabel) weeklyMaxWeekLabel.textContent = `Week of ${formatWeekRange(weekStart)}`;
        if (weeklyMaxStatus) {
            weeklyMaxStatus.textContent = '';
            weeklyMaxStatus.className = 'form-status';
        }
    }

    function renderWeeklyMaxes() {
        if (!weeklyMaxForm) return;
        const weekStart = editingMaxWeek || getWeekStartISO();
        if (!editingMaxWeek) {
            fillWeeklyMaxForm(findMaxEntry(weekStart));
            if (weeklyMaxWeekLabel) weeklyMaxWeekLabel.textContent = `Week of ${formatWeekRange(weekStart)}`;
        }
        renderMaxPRStrip();
        renderWeeklyMaxTable();
    }

    if (weeklyMaxForm) weeklyMaxForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const weekStart = editingMaxWeek || getWeekStartISO();
        const incoming = {
            pushups: parseExerciseInput(MAX_EXERCISES[0], document.getElementById('max-pushups').value),
            pullups: parseExerciseInput(MAX_EXERCISES[1], document.getElementById('max-pullups').value),
            plank: parseExerciseInput(MAX_EXERCISES[2], document.getElementById('max-plank').value),
            mile: parseExerciseInput(MAX_EXERCISES[3], document.getElementById('max-mile').value)
        };

        const hasAny = MAX_EXERCISES.some(ex => incoming[ex.id] != null);
        if (!hasAny) {
            if (weeklyMaxStatus) {
                weeklyMaxStatus.textContent = 'Enter at least one result to save.';
                weeklyMaxStatus.className = 'form-status blocked';
            }
            return;
        }

        const existing = findMaxEntry(weekStart);
        const merged = mergeWeekValues(existing || { weekStart }, incoming);
        const entry = { weekStart, ...merged };
        const idx = weeklyMaxes.findIndex(e => e.weekStart === weekStart);
        if (idx === -1) weeklyMaxes.push(entry);
        else weeklyMaxes[idx] = entry;

        saveWeeklyMaxes();
        resetWeeklyMaxForm();
        if (weeklyMaxStatus) {
            weeklyMaxStatus.textContent = `Saved for week of ${formatDisplayDate(weekStart)}.`;
            weeklyMaxStatus.className = 'form-status';
        }
        renderWeeklyMaxes();
    });

    if (clearMaxesBtn) clearMaxesBtn.addEventListener('click', () => {
        if (!confirm('Clear all weekly max history?')) return;
        weeklyMaxes = [];
        editingMaxWeek = null;
        localStorage.removeItem(WEEKLY_MAXES_KEY);
        fillWeeklyMaxForm(null);
        renderWeeklyMaxes();
    });

    const PROTOCOLS_KEY = 'cutting_protocols';

    let protocolData = JSON.parse(localStorage.getItem(PROTOCOLS_KEY)) || {
        medicalAck: false,
        shiver: {},
        exercise: {},
        supplements: {},
        fidget: {}
    };
    if (!protocolData.shiver) protocolData.shiver = {};
    if (!protocolData.exercise) protocolData.exercise = {};
    if (!protocolData.supplements) protocolData.supplements = {};
    if (!protocolData.fidget) protocolData.fidget = {};

    function saveProtocolData() {
        localStorage.setItem(PROTOCOLS_KEY, JSON.stringify(protocolData));
    }

    function getDatesInWeek(weekStart) {
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart + 'T12:00:00');
            d.setDate(d.getDate() + i);
            dates.push(d.toISOString().slice(0, 10));
        }
        return dates;
    }

    function countShiverThisWeek() {
        const weekStart = getWeekStartISO();
        return getDatesInWeek(weekStart).filter(d => protocolData.shiver[d]).length;
    }

    function renderMedicalBanner() {
        if (protocolData.medicalAck) return;
        if (document.getElementById('medical-banner')) return;

        document.body.classList.add('medical-pending');
        const banner = document.createElement('div');
        banner.id = 'medical-banner';
        banner.className = 'medical-banner';
        banner.innerHTML = `
            <div class="medical-banner-inner">
                <p><strong>Medical disclaimer:</strong> Consult a physician before fasted exercise, cold exposure (Shiver Protocol), or aggressive calorie deficits. Cold water can shock the heart if you are not adapted. Prescription GLP-1 drugs, Berberine, and Metformin require medical supervision. This app is educational—not medical advice.</p>
                <button type="button" class="btn-primary" id="medical-ack-btn">I Understand</button>
            </div>
        `;
        document.body.appendChild(banner);
        document.getElementById('medical-ack-btn').addEventListener('click', () => {
            protocolData.medicalAck = true;
            saveProtocolData();
            banner.remove();
            document.body.classList.remove('medical-pending');
        });
    }

    function renderFidgetPrompts() {
        const list = document.getElementById('fidget-checklist');
        if (!list) return;

        const today = getTodayISO();
        const saved = protocolData.fidget[today] || {};

        ['knee', 'pacing', 'standing'].forEach(key => {
            const input = document.getElementById(`fidget-${key}`);
            const item = list.querySelector(`[data-fidget="${key}"]`);
            if (!input) return;
            input.checked = !!saved[key];
            if (item) item.classList.toggle('done', !!saved[key]);
        });

        const done = ['knee', 'pacing', 'standing'].filter(k => saved[k]).length;
        const status = document.getElementById('fidget-status');
        if (status) {
            status.textContent = done === 3
                ? 'All fidget prompts done — epinephrine pathway active today.'
                : `${done}/3 prompts — subtle movement mobilizes fat without a gym.`;
            status.className = 'form-status' + (done === 3 ? '' : '');
        }
    }

    function bindFidgetPrompts() {
        const list = document.getElementById('fidget-checklist');
        if (!list || list.dataset.bound) return;
        list.dataset.bound = '1';

        list.querySelectorAll('input[type="checkbox"]').forEach(input => {
            input.addEventListener('change', () => {
                const today = getTodayISO();
                if (!protocolData.fidget[today]) protocolData.fidget[today] = {};
                const key = input.id.replace('fidget-', '');
                protocolData.fidget[today][key] = input.checked;
                saveProtocolData();
                renderFidgetPrompts();
            });
        });
    }

    function renderInsulinInsight() {
        const el = document.getElementById('insulin-insight-text');
        if (!el) return;

        const macros = getTodayMacroTotals();
        const carbs = Math.round(macros.carbs);
        const cals = getTodayCalorieTotal();
        const target = getActiveCalorieTarget();

        let level = 'shield';
        let text = '';
        if (cals === 0 && carbs === 0) {
            text = 'No food logged yet. Steady protein + moderate carbs support lower insulin swings on a cut.';
        } else if (carbs <= 80 && cals <= target) {
            text = `${carbs}g carbs today on ${cals.toLocaleString()} cal — relatively low insulin load. System is positioned to oxidize more fat between meals.`;
        } else if (carbs > 120) {
            level = 'caution';
            text = `${carbs}g carbs today — higher glycemic load may blunt fat oxidation windows. Prioritize protein, fiber, and fewer refined carbs at remaining meals.`;
        } else {
            text = `${carbs}g carbs · ${cals.toLocaleString()} / ${target.toLocaleString()} cal — moderate intake. Pair carbs with protein to blunt insulin spikes.`;
        }

        const wrap = document.getElementById('insulin-insight');
        if (wrap) wrap.className = `lean-mass-insight ${level}`;
        el.textContent = text;
    }

    function renderShiverSection() {
        const stat = document.getElementById('shiver-week-stat');
        if (!stat) return;

        const count = countShiverThisWeek();
        const today = getTodayISO();
        const todayLog = protocolData.shiver[today];

        stat.innerHTML = `
            <div class="protocol-stat-pill">This week: <strong>${count} / 5</strong> sessions</div>
            <div class="protocol-stat-pill">Today: <strong>${todayLog ? 'Logged' : '—'}</strong></div>
        `;

        const repsInput = document.getElementById('shiver-reps');
        const tempInput = document.getElementById('shiver-temp');
        if (todayLog && repsInput) {
            repsInput.value = todayLog.reps || 3;
            if (tempInput && todayLog.temp) tempInput.value = todayLog.temp;
        }

        const summary = document.getElementById('protocol-week-summary');
        if (summary) {
            summary.innerHTML = `
                <li><strong>Shiver</strong> — ${count}/5 sessions (target 1–5×/week)</li>
                <li><strong>Exercise</strong> — 3–4×/week (see reference above)</li>
                <li><strong>Fidget</strong> — check prompts on <a href="daily.html#track">NEAT</a> section</li>
            `;
        }
    }

    function renderSupplementLog() {
        const list = document.getElementById('supplement-today-log');
        if (!list) return;

        const today = getTodayISO();
        const entries = protocolData.supplements[today] || [];
        list.innerHTML = '';

        if (entries.length === 0) {
            list.innerHTML = '<li class="food-log-item" style="justify-content:center;color:var(--text-muted)">Nothing logged today</li>';
            return;
        }

        entries.forEach((e, i) => {
            const li = document.createElement('li');
            li.className = 'food-log-item';
            const label = e.type === 'caffeine' ? `Caffeine ${e.amount}mg` : `Yerba maté ${e.amount} cup(s)`;
            li.innerHTML = `
                <span><strong>${label}</strong></span>
                <button type="button" class="remove-food-btn" data-idx="${i}">Remove</button>
            `;
            list.appendChild(li);
        });

        list.querySelectorAll('.remove-food-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx, 10);
                protocolData.supplements[today].splice(idx, 1);
                if (protocolData.supplements[today].length === 0) delete protocolData.supplements[today];
                saveProtocolData();
                renderSupplementLog();
            });
        });
    }

    function updateSupplementLabel() {
        const type = document.getElementById('supplement-type');
        const label = document.getElementById('supplement-amount-label');
        const input = document.getElementById('supplement-amount');
        if (!type || !label) return;
        if (type.value === 'caffeine') {
            label.textContent = 'Amount (mg)';
            if (input) input.placeholder = 'e.g. 200';
        } else {
            label.textContent = 'Cups';
            if (input) input.placeholder = 'e.g. 1';
        }
    }

    function bindProtocolForms() {
        const shiverForm = document.getElementById('shiver-form');
        if (shiverForm && !shiverForm.dataset.bound) {
            shiverForm.dataset.bound = '1';
            shiverForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const today = getTodayISO();
                const reps = parseInt(document.getElementById('shiver-reps').value, 10) || 3;
                const temp = parseInt(document.getElementById('shiver-temp').value, 10) || null;
                protocolData.shiver[today] = { reps, temp, loggedAt: new Date().toISOString() };
                saveProtocolData();
                const status = document.getElementById('shiver-status');
                if (status) {
                    status.textContent = `Shiver session logged — ${reps} cycles.`;
                    status.className = 'form-status';
                }
                renderShiverSection();
            });
        }

        const supplementForm = document.getElementById('supplement-form');
        if (supplementForm && !supplementForm.dataset.bound) {
            supplementForm.dataset.bound = '1';
            const suppType = document.getElementById('supplement-type');
            if (suppType) suppType.addEventListener('change', updateSupplementLabel);
            updateSupplementLabel();

            supplementForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const today = getTodayISO();
                const type = document.getElementById('supplement-type').value;
                const amount = parseInt(document.getElementById('supplement-amount').value, 10);
                if (!amount || amount <= 0) return;
                if (type === 'caffeine' && amount > 400) {
                    if (!confirm('Over 400mg caffeine in one dose can cause jitters. Log anyway?')) return;
                }

                if (!protocolData.supplements[today]) protocolData.supplements[today] = [];
                protocolData.supplements[today].push({ type, amount, loggedAt: new Date().toISOString() });
                saveProtocolData();
                supplementForm.reset();
                updateSupplementLabel();
                renderSupplementLog();
            });
        }
    }

    function renderProtocols() {
        renderShiverSection();
        bindProtocolForms();
        bindExerciseTypeGuide();
    }

    function initCuttingApp() {
        renderFoodLibrary();
        renderTodayFoodLog();
        renderProteinTracker();
        renderNeatTracker();
        updateCalorieTargets();
        checkGoalBanner();
        renderMaintenanceView();
        setFormForNewDay();
        renderTable();
        renderGraph();
        updateMetrics();
        renderWeeklyMaxes();
        renderMedicalBanner();
        bindFidgetPrompts();
        renderFidgetPrompts();
        renderProtocols();

        const pendingEdit = sessionStorage.getItem('cutting_edit_date');
        if (pendingEdit && form) {
            sessionStorage.removeItem('cutting_edit_date');
            startEdit(pendingEdit);
        }
    }

    initCuttingApp();
