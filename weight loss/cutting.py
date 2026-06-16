"""
The Cutting Engine - Machine Learning Performance Analysis Block
===================================================================
Context Profile:
Target Objective: Maintain muscle structures via explicit high-deficit parameter configurations.
Workflow Mechanics: Utilizes structured Decision Tree modeling pipelines to identify
underlying behavioral clusters maximizing localized metric success conditions.
"""

import numpy as np
import pandas as pd
from sklearn.tree import DecisionTreeClassifier, export_text

PROTEIN_DANGER_THRESHOLD = 120
PROTEIN_SHIELD_MIN = 140
PROTEIN_SHIELD_MAX = 160


def simulate_historical_cutting_cohort():
    """
    Synthesizes custom historical profile patterns for individuals in proximity
    to a 217-lb baseline profile across adaptive calorie-reduction parameters.
    """
    np.random.seed(42)
    sample_size = 350

    daily_calories = np.random.choice([1250, 1500, 1800], size=sample_size, p=[0.4, 0.4, 0.2])
    fasting_hours = np.random.choice([0, 24, 48], size=sample_size, p=[0.3, 0.4, 0.3])
    weekly_resistance_sessions = np.random.choice([0, 2, 3, 4], size=sample_size, p=[0.1, 0.3, 0.4, 0.2])
    protein_intake_g = np.random.normal(loc=140, scale=25, size=sample_size).astype(int)

    data = pd.DataFrame({
        'daily_calories': daily_calories,
        'fasting_hours': fasting_hours,
        'resistance_sessions': weekly_resistance_sessions,
        'protein_intake_g': protein_intake_g
    })

    def evaluate_success(row):
        score = 0
        if row['daily_calories'] <= 1300:
            score += 3
        if row['fasting_hours'] == 48:
            score += 3
        elif row['fasting_hours'] == 24:
            score += 1
        if row['resistance_sessions'] >= 3:
            score += 2
        if row['protein_intake_g'] >= 130:
            score += 2

        if row['daily_calories'] <= 1300 and score < 6:
            return 0

        return 1 if score >= 6 else 0

    data['successful_cut_cycle'] = data.apply(evaluate_success, axis=1)
    return data


def analyze_lean_mass_predictor(df):
    """
    Lean-Mass Predictor: quantifies metabolic slowdown risk by daily protein intake.
    Metabolic slowdown is proxied by unsuccessful_cut_cycle (muscle loss / crash).
    """
    low_protein = df[df['protein_intake_g'] < PROTEIN_DANGER_THRESHOLD]
    adequate_protein = df[df['protein_intake_g'] >= PROTEIN_DANGER_THRESHOLD]

    fail_low = 1 - low_protein['successful_cut_cycle'].mean() if len(low_protein) else 0
    fail_adequate = 1 - adequate_protein['successful_cut_cycle'].mean() if len(adequate_protein) else 0

    if fail_adequate > 0:
        relative_increase = ((fail_low - fail_adequate) / fail_adequate) * 100
    else:
        relative_increase = 0.0

    shield_hits = df[df['protein_intake_g'] >= PROTEIN_SHIELD_MIN]
    shield_success = shield_hits['successful_cut_cycle'].mean() if len(shield_hits) else 0

    return {
        'fail_rate_under_120g': round(fail_low * 100, 1),
        'fail_rate_120g_plus': round(fail_adequate * 100, 1),
        'relative_slowdown_increase_pct': round(max(relative_increase, 0), 0),
        'shield_zone_success_pct': round(shield_success * 100, 1),
        'n_under_120': len(low_protein),
        'n_120_plus': len(adequate_protein),
    }


def print_lean_mass_report(stats):
    print("\n------------------------------------------------------------------")
    print(" LEAN-MASS PREDICTOR · MUSCLE-SHIELD ANALYSIS")
    print("------------------------------------------------------------------")
    print(
        f" Days with protein under {PROTEIN_DANGER_THRESHOLD}g correlate with a "
        f"{stats['relative_slowdown_increase_pct']:.0f}% higher chance of metabolic slowdown"
        f" vs {PROTEIN_DANGER_THRESHOLD}g+ days."
    )
    print(
        f"   · Under {PROTEIN_DANGER_THRESHOLD}g failure rate: {stats['fail_rate_under_120g']}%"
        f" (n={stats['n_under_120']})"
    )
    print(
        f"   · {PROTEIN_DANGER_THRESHOLD}g+ failure rate: {stats['fail_rate_120g_plus']}%"
        f" (n={stats['n_120_plus']})"
    )
    print(
        f" Muscle-Shield zone ({PROTEIN_SHIELD_MIN}–{PROTEIN_SHIELD_MAX}g) success rate: "
        f"{stats['shield_zone_success_pct']}%"
    )
    print("------------------------------------------------------------------")


def evaluate_daily_protein(protein_g, stats):
    """Score a single day's protein intake against model thresholds."""
    if protein_g < PROTEIN_DANGER_THRESHOLD:
        return (
            f"RISK — Under {PROTEIN_DANGER_THRESHOLD}g. "
            f"~{stats['relative_slowdown_increase_pct']:.0f}% higher metabolic slowdown risk."
        )
    if protein_g < PROTEIN_SHIELD_MIN:
        return f"CAUTION — {protein_g}g logged. Muscle-Shield target is {PROTEIN_SHIELD_MIN}–{PROTEIN_SHIELD_MAX}g."
    if protein_g <= PROTEIN_SHIELD_MAX:
        return f"SHIELD ACTIVE — {protein_g}g hits the {PROTEIN_SHIELD_MIN}–{PROTEIN_SHIELD_MAX}g lean-mass zone."
    return f"OPTIMAL — {protein_g}g exceeds Muscle-Shield minimum. Lean mass protected."


def build_cut_analysis_model():
    print("==================================================================")
    print(" INITIALIZING DATA MATRICES FOR THE CUTTING STRATEGY")
    print("==================================================================")

    df = simulate_historical_cutting_cohort()
    lean_stats = analyze_lean_mass_predictor(df)

    X = df[['daily_calories', 'fasting_hours', 'resistance_sessions', 'protein_intake_g']]
    y = df['successful_cut_cycle']

    clf = DecisionTreeClassifier(max_depth=3, random_state=42, criterion='entropy')
    clf.fit(X, y)

    print("\n[Success Log] Model built using a clear, reliable Decision Tree Classifier.")
    print("Analyzing what parameters actually drive long-term maintenance & drop success:\n")

    tree_rules = export_text(clf, feature_names=list(X.columns))
    print("------------------------------------------------------------------")
    print(" DECISION TREE COMPLIANCE RULES MATRIX:")
    print("------------------------------------------------------------------")
    print(tree_rules)
    print_lean_mass_report(lean_stats)

    current_protein = 150
    print("\n[Simulation Engine Evaluation] Testing your current personalized 10-Week Blueprint:")
    current_plan_features = pd.DataFrame([{
        'daily_calories': 1250,
        'fasting_hours': 48,
        'resistance_sessions': 3,
        'protein_intake_g': current_protein
    }])

    prediction = clf.predict(current_plan_features)[0]
    probabilities = clf.predict_proba(current_plan_features)[0]

    print(
        f" -> Predicted Vector Configuration Outcome: "
        f"{'SUCCESSFUL COMPLIANCE (High Fat Loss / Maintained Lean Mass)' if prediction == 1 else 'RISK WARNING (Metabolic Crash / Low Protein Retention)'}"
    )
    print(f" -> Structural Confidence Rating: {probabilities[prediction]*100:.1f}%")
    print(f" -> Daily Protein Assessment: {evaluate_daily_protein(current_protein, lean_stats)}")
    print("==================================================================")


if __name__ == '__main__':
    build_cut_analysis_model()
