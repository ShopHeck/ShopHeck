import type { AppState } from '../types';

export interface WeekReportStats {
  /** Workouts logged in the current Monday-anchored week, all camps. */
  sessions: number;
  /** Training hours this week, one decimal. */
  hours: number;
  /** Current daily streak (from gamification). */
  streak: number;
}

/**
 * This week's training numbers for the Sunday-evening Fight Ready recap
 * notification. Week runs Monday→now (matching the planner's Monday anchor);
 * counts every camp's logs — the recap is about the athlete, not one camp.
 */
export function computeWeekReportStats(state: AppState, now: Date = new Date()): WeekReportStats {
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  let sessions = 0;
  let minutes = 0;
  for (const log of state.workoutLogs ?? []) {
    const d = new Date(`${log.date}T00:00:00`);
    if (d >= monday && d <= now) {
      sessions++;
      minutes += log.duration || 0;
    }
  }

  return {
    sessions,
    hours: Math.round(minutes / 6) / 10,
    streak: state.gamification?.streak.current ?? 0,
  };
}
