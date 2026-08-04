import type { AppState, TrainingWeek } from '../types';
import { generateTrainingCamp } from './campGenerator';

/**
 * Schedule adherence — one definition, one semantic.
 *
 * This used to be computed independently in six places, and they did not agree:
 *
 *   - WeeklyPlanner / ProgressCharts / AIInsights built the session keys from
 *     non-rest days and counted ticks against them (correct, but duplicated
 *     three times).
 *   - Dashboard and OffSeasonDashboard counted "done" with a PREFIX SCAN over
 *     completedSessions, which also counts ticks whose session no longer exists
 *     — the schedule is regenerated on every camp edit, so shrinking a week
 *     leaves orphaned `true` entries behind and the dashboard could render
 *     "7/5 sessions". OffSeasonDashboard additionally excluded `type === 'rest'`
 *     sessions from the planned count while the key builder still numbered them,
 *     so its denominator was too small on top of that.
 *   - campKpis measured something else entirely — LOGGED WORKOUTS against a
 *     `campWeeks * 4.5` estimate — while every label rendering it (and its own
 *     docstring) called it "schedule adherence".
 *
 * Everything now goes through here: ticked sessions ÷ sessions the schedule
 * actually defines, counted only over keys the current schedule generates.
 */

/**
 * The canonical completed-session key.
 *
 * MUST stay identical to the key WeeklyPlanner dispatches on TOGGLE_SESSION —
 * it is the persisted identity of a tick, so changing the shape silently
 * orphans every existing one.
 */
export function sessionKey(
  campId: string,
  weekNumber: number,
  dayOfWeek: number,
  sessionIndex: number,
): string {
  return `${campId}-${weekNumber}-${dayOfWeek}-${sessionIndex}`;
}

/**
 * Every session key one scheduled week defines.
 *
 * Rest DAYS contribute nothing. A session inside a working day is counted even
 * if its own type is 'rest' (an active-recovery slot), because the key builder
 * indexes the full `day.sessions` array — excluding it here would make the
 * denominator disagree with the keys the planner actually ticks.
 */
export function weekSessionKeys(campId: string, week: TrainingWeek): string[] {
  return week.days.flatMap(day =>
    day.isRestDay
      ? []
      : day.sessions.map((_, index) => sessionKey(campId, week.weekNumber, day.dayOfWeek, index)),
  );
}

export interface Adherence {
  /** Sessions ticked complete. Never exceeds `planned`. */
  done: number;
  /** Sessions the schedule defines. */
  planned: number;
  /**
   * 0–100, rounded. `null` when nothing is planned — "no schedule to measure
   * against" is not the same as "0% adherence", and callers that drive advice
   * or weighting must be able to tell them apart.
   */
  pct: number | null;
}

function score(completedSessions: Record<string, boolean>, keys: string[]): Adherence {
  const planned = keys.length;
  // Counting only keys the CURRENT schedule generates is what keeps `done`
  // bounded by `planned` — a stale tick from a longer previous schedule has no
  // key here and simply does not count.
  const done = keys.filter(key => completedSessions[key]).length;
  return {
    done,
    planned,
    pct: planned > 0 ? Math.round((done / planned) * 100) : null,
  };
}

/** Adherence for a single scheduled week. */
export function weekAdherence(
  completedSessions: Record<string, boolean>,
  campId: string,
  week: TrainingWeek | undefined,
): Adherence {
  if (!week) return { done: 0, planned: 0, pct: null };
  return score(completedSessions, weekSessionKeys(campId, week));
}

/** Adherence across an entire schedule. */
export function scheduleAdherence(
  completedSessions: Record<string, boolean>,
  campId: string,
  schedule: TrainingWeek[],
): Adherence {
  return score(completedSessions, schedule.flatMap(week => weekSessionKeys(campId, week)));
}

/** Per-week adherence across a whole schedule, for the progress charts. */
export function weeklyAdherenceSeries(
  completedSessions: Record<string, boolean>,
  campId: string,
  schedule: TrainingWeek[],
): (Adherence & { week: number })[] {
  return schedule.map(week => ({
    week: week.weekNumber,
    ...weekAdherence(completedSessions, campId, week),
  }));
}

/**
 * Adherence for any camp in the account, active or not.
 *
 * `state.trainingSchedule` only ever holds the ACTIVE camp's weeks, so scoring a
 * past camp (camp comparison, post-fight breakdown) has to rebuild its
 * schedule. generateTrainingCamp is pure and deterministic — the same function
 * and inputs the reducer uses — so the rebuilt weeks are the ones the fighter
 * was ticking against.
 */
export function campAdherence(state: AppState, campId: string): Adherence {
  const camp = state.camps.find(c => c.id === campId);
  if (!camp) return { done: 0, planned: 0, pct: null };

  const schedule = state.activeCamp?.id === campId && state.trainingSchedule.length > 0
    ? state.trainingSchedule
    : generateTrainingCamp(camp, state.currentUser?.factorWeights);

  return scheduleAdherence(state.completedSessions ?? {}, campId, schedule);
}
