import type { OffSeasonGoal } from '../../types';

/**
 * The non-component half of onboarding: the option lists, the two accents the
 * flow can be in, and the plan-summary derivation.
 *
 * Kept out of the component files so a fast-refresh boundary is not the thing
 * deciding where a constant lives — and so the goal list and the accent pair
 * have exactly one home each rather than one per screen that renders them.
 */

export const OFF_SEASON_GOALS: { value: OffSeasonGoal; label: string; desc: string }[] = [
  { value: 'base-building', label: 'Base Building', desc: 'Aerobic engine, technical drilling, volume work' },
  { value: 'strength',      label: 'Build Strength', desc: 'Power, hypertrophy, functional strength' },
  { value: 'maintain',      label: 'Maintain & Sharpen', desc: 'Balanced training to stay competition-ready' },
  { value: 'recovery',      label: 'Active Recovery', desc: 'Light training, deload, coming back from injury' },
];

export const CAMP_ACCENT = 'var(--accent-flame)';
export const OFF_SEASON_ACCENT = 'var(--accent-teal)';

/**
 * The CTA colour pair for the mode the user is in.
 *
 * Foreground differs per accent rather than always being white: white on flame
 * is the app's existing convention, and white on teal would land near 1.9:1.
 */
export function ctaColors(isOffSeason: boolean): { accent: string; foreground: string } {
  return isOffSeason
    ? { accent: OFF_SEASON_ACCENT, foreground: 'var(--bg-obsidian)' }
    : { accent: CAMP_ACCENT, foreground: '#FFFFFF' };
}

export interface SummaryRow {
  label: string;
  value: string;
  /** `var(--token)` reference. Defaults to primary text. */
  accent?: string;
}

export interface PlanSummaryInput {
  isOffSeason: boolean;
  /** Included as the first row when set. */
  name?: string;
  offSeasonGoalLabel?: string;
  fightDate?: string;
  weightClass?: string;
  campWeeks?: string;
  currentWeight?: string;
  targetWeight?: string;
  unit: string;
}

/**
 * The rows shown for a freshly-built plan.
 *
 * Onboarding rendered this list three times — the "New Camp" modal, the review
 * step and the finish step — and the three had drifted into confirming
 * different facts about the same camp: one included the weight class, one the
 * starting weight, one neither, and two of them labelled the camp length
 * differently. Derived once here so all three agree.
 */
export function planSummaryRows(input: PlanSummaryInput): SummaryRow[] {
  const {
    isOffSeason, name, offSeasonGoalLabel, fightDate, weightClass,
    campWeeks, currentWeight, targetWeight, unit,
  } = input;

  const rows: SummaryRow[] = [];

  if (name) {
    rows.push({ label: isOffSeason ? 'Athlete' : 'Fighter', value: name });
  }

  if (isOffSeason) {
    rows.push({ label: 'Mode', value: 'Off Season', accent: OFF_SEASON_ACCENT });
    if (offSeasonGoalLabel) rows.push({ label: 'Goal', value: offSeasonGoalLabel });
    rows.push({ label: 'Duration', value: '12 Weeks · 3 Cycles', accent: OFF_SEASON_ACCENT });
    if (currentWeight) {
      rows.push({ label: 'Starting Weight', value: `${currentWeight} ${unit}` });
    }
    return rows;
  }

  if (fightDate) {
    rows.push({
      label: 'Fight Date',
      value: new Date(fightDate).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      }),
    });
  }
  if (weightClass) rows.push({ label: 'Weight Class', value: weightClass });
  if (campWeeks) {
    rows.push({ label: 'Camp Length', value: `${campWeeks} Weeks`, accent: CAMP_ACCENT });
  }
  if (currentWeight && targetWeight) {
    rows.push({ label: 'Weight Cut', value: `${currentWeight} → ${targetWeight} ${unit}` });
  }

  return rows;
}
