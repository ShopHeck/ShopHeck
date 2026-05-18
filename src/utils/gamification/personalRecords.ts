import type { AppState, PersonalRecord, PRType, WorkoutLog } from '../../types';
import { getWeekKey } from './challenges';

export const PR_LABELS: Record<PRType, string> = {
  longest_workout: 'Longest workout',
  highest_weekly_mep: 'Highest weekly MEP',
  most_workouts_week: 'Most workouts in a week',
  highest_rpe: 'Highest RPE session',
};

export const PR_UNITS: Record<PRType, string> = {
  longest_workout: 'min',
  highest_weekly_mep: 'MEP',
  most_workouts_week: 'sessions',
  highest_rpe: 'RPE',
};

interface PRComputation {
  type: PRType;
  value: number;
  sourceLogId?: string;
}

function computeCurrentPRs(state: AppState): PRComputation[] {
  const logs = state.workoutLogs;
  if (logs.length === 0) return [];

  // Longest workout
  let longest: WorkoutLog | null = null;
  for (const l of logs) {
    if (!longest || l.duration > longest.duration) longest = l;
  }

  // Highest RPE
  let highestRpe: WorkoutLog | null = null;
  for (const l of logs) {
    if (!highestRpe || l.rpe > highestRpe.rpe) highestRpe = l;
  }

  // Weekly buckets. Parse log dates as local midnight ('YYYY-MM-DDT00:00:00')
  // because `new Date('YYYY-MM-DD')` parses as UTC, which mis-buckets days
  // around midnight for non-UTC users.
  const weekMep = new Map<string, number>();
  const weekCount = new Map<string, number>();
  for (const l of logs) {
    const wk = getWeekKey(new Date(l.date.slice(0, 10) + 'T00:00:00'));
    weekMep.set(wk, (weekMep.get(wk) ?? 0) + (l.mep ?? 0));
    weekCount.set(wk, (weekCount.get(wk) ?? 0) + 1);
  }
  let highestMep = 0;
  for (const v of weekMep.values()) if (v > highestMep) highestMep = v;
  let mostWorkouts = 0;
  for (const v of weekCount.values()) if (v > mostWorkouts) mostWorkouts = v;

  const out: PRComputation[] = [];
  if (longest && longest.duration > 0) {
    out.push({ type: 'longest_workout', value: longest.duration, sourceLogId: longest.id });
  }
  if (highestMep > 0) {
    out.push({ type: 'highest_weekly_mep', value: highestMep });
  }
  if (mostWorkouts > 0) {
    out.push({ type: 'most_workouts_week', value: mostWorkouts });
  }
  if (highestRpe && highestRpe.rpe > 0) {
    out.push({ type: 'highest_rpe', value: highestRpe.rpe, sourceLogId: highestRpe.id });
  }
  return out;
}

export function computePRs(
  state: AppState,
  prev: Partial<Record<PRType, PersonalRecord>>
): {
  records: Partial<Record<PRType, PersonalRecord>>;
  newlyBroken: PersonalRecord[];
} {
  const current = computeCurrentPRs(state);
  const records: Partial<Record<PRType, PersonalRecord>> = { ...prev };
  const newlyBroken: PersonalRecord[] = [];
  const nowIso = new Date().toISOString();

  for (const c of current) {
    const existing = records[c.type];
    if (!existing) {
      records[c.type] = {
        type: c.type,
        value: c.value,
        achievedAt: nowIso,
        previousValue: null,
        sourceLogId: c.sourceLogId,
      };
      // Not "newly broken" — first-ever record. Surface as celebration only if value is meaningful.
    } else if (c.value > existing.value) {
      const rec: PersonalRecord = {
        type: c.type,
        value: c.value,
        achievedAt: nowIso,
        previousValue: existing.value,
        sourceLogId: c.sourceLogId,
      };
      records[c.type] = rec;
      newlyBroken.push(rec);
    }
  }

  return { records, newlyBroken };
}
