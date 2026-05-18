import type { StreakState, WorkoutLog } from '../../types';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

export function computeStreak(workoutLogs: WorkoutLog[], now: Date = new Date()): StreakState {
  if (workoutLogs.length === 0) {
    return {
      current: 0,
      best: 0,
      lastWorkoutDate: null,
      lastWorkoutAt: null,
      atRisk: false,
      expired: false,
    };
  }

  const sortedDesc = [...workoutLogs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const latest = sortedDesc[0];
  const latestAt = new Date(latest.createdAt);
  const hoursSinceLast = (now.getTime() - latestAt.getTime()) / MS_PER_HOUR;

  const uniqueDays = Array.from(new Set(workoutLogs.map(l => toDateKey(l.date)))).sort();

  let best = 0;
  let run = 0;
  for (let i = 0; i < uniqueDays.length; i++) {
    if (i === 0) {
      run = 1;
    } else {
      const prev = new Date(uniqueDays[i - 1] + 'T00:00:00');
      const curr = new Date(uniqueDays[i] + 'T00:00:00');
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / MS_PER_DAY);
      run = diffDays === 1 ? run + 1 : 1;
    }
    if (run > best) best = run;
  }

  const expired = hoursSinceLast > 48;
  if (expired) {
    return {
      current: 0,
      best,
      lastWorkoutDate: toDateKey(latest.date),
      lastWorkoutAt: latest.createdAt,
      atRisk: false,
      expired: true,
    };
  }

  // Walk back from today (or yesterday if today not logged) counting consecutive days.
  const todayKey = toDateKey(now.toISOString());
  const loggedSet = new Set(uniqueDays);
  let current = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!loggedSet.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (loggedSet.has(toDateKey(cursor.toISOString()))) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const atRisk = hoursSinceLast >= 24 && hoursSinceLast <= 48;

  return {
    current,
    best: Math.max(best, current),
    lastWorkoutDate: toDateKey(latest.date),
    lastWorkoutAt: latest.createdAt,
    atRisk,
    expired: false,
  };
}
