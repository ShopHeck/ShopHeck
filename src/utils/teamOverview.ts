import { differenceInCalendarDays, parseISO } from 'date-fns';
import { generateTrainingCamp } from './campGenerator';
import { scheduleAdherence } from './adherence';
import { computeCutProjection } from './weightCut';
import type { TeamFighterSnapshot } from '../lib/coachLinks';
import type { CutStatus } from './weightCut';

/**
 * The Coach Pro roster table — one row per linked fighter.
 *
 * Deliberately built on the app's existing definitions rather than new ones:
 * adherence comes from `scheduleAdherence` (the single definition that replaced
 * six disagreeing copies) and cut pace from `computeCutProjection`. A coach and
 * their fighter must not be able to read two different numbers for the same
 * camp, which is exactly what a convenient local re-implementation here would
 * produce.
 */

/** A condition worth a coach's attention, ordered most urgent first. */
export type TeamFlag =
  | 'quiet'
  | 'behind-cut'
  | 'low-adherence'
  | 'fight-week';

export const FLAG_LABELS: Record<TeamFlag, string> = {
  quiet: 'Gone quiet',
  'behind-cut': 'Behind on cut',
  'low-adherence': 'Missing sessions',
  'fight-week': 'Fight week',
};

export interface TeamOverviewRow {
  fighterId: string;
  name: string;
  sport: string;
  /** Null when the fighter has no camp, or an off-season plan with no date. */
  daysOut: number | null;
  isOffSeason: boolean;
  hasCamp: boolean;
  /** 0–100, or null when there is no schedule to score against. */
  adherencePct: number | null;
  adherenceDone: number;
  adherencePlanned: number;
  sessionsLast7: number;
  /** Null when they have never logged a session in this camp. */
  daysSinceLastSession: number | null;
  latestWeight: number | null;
  targetWeight: number | null;
  cutStatus: CutStatus;
  flags: TeamFlag[];
}

/** Days with no logged session before a fighter counts as "gone quiet". */
const QUIET_AFTER_DAYS = 5;
/** Adherence below this is worth surfacing rather than leaving in a column. */
const LOW_ADHERENCE_PCT = 60;
/** Days out at which the camp is in its final week. */
const FIGHT_WEEK_DAYS = 7;

function scoreOne(snap: TeamFighterSnapshot, now: Date): TeamOverviewRow {
  const { camp } = snap;

  const base = {
    fighterId: snap.fighterId,
    name: snap.name,
    sport: snap.sport,
    isOffSeason: camp?.isOffSeason ?? false,
    hasCamp: camp !== null,
  };

  if (!camp) {
    return {
      ...base,
      daysOut: null,
      adherencePct: null,
      adherenceDone: 0,
      adherencePlanned: 0,
      sessionsLast7: 0,
      daysSinceLastSession: null,
      latestWeight: null,
      targetWeight: null,
      cutStatus: 'no-fight',
      flags: [],
    };
  }

  // The same pure generator the reducer uses, so the coach scores against the
  // exact weeks the fighter has been ticking.
  const schedule = generateTrainingCamp(camp);
  const adherence = scheduleAdherence(snap.completedSessions, camp.id, schedule);

  const sessionsLast7 = snap.workoutDates.filter(d => {
    const diff = differenceInCalendarDays(now, parseISO(d));
    return diff >= 0 && diff < 7;
  }).length;

  // workoutDates arrives newest-first, but a fighter can back-date a log, so
  // the most recent DATE is taken rather than the first element.
  const lastSession = snap.workoutDates.reduce<string | null>(
    (best, d) => (best === null || d > best ? d : best),
    null,
  );
  const daysSinceLastSession = lastSession
    ? Math.max(0, differenceInCalendarDays(now, parseISO(lastSession)))
    : null;

  const cut = computeCutProjection(camp, snap.weights, now);
  const daysOut = camp.fightDate
    ? Math.max(0, differenceInCalendarDays(parseISO(camp.fightDate), now))
    : null;

  const flags: TeamFlag[] = [];
  // "Never logged anything" counts as quiet only once the camp has been running
  // long enough for that to mean something — a camp created today has no
  // sessions yet by definition, and flagging it on day one is noise.
  const campAgeDays = differenceInCalendarDays(now, parseISO(camp.startDate));
  if (daysSinceLastSession === null
    ? campAgeDays >= QUIET_AFTER_DAYS
    : daysSinceLastSession >= QUIET_AFTER_DAYS) {
    flags.push('quiet');
  }
  if (cut.status === 'behind') flags.push('behind-cut');
  if (adherence.pct !== null && adherence.pct < LOW_ADHERENCE_PCT) flags.push('low-adherence');
  if (daysOut !== null && daysOut <= FIGHT_WEEK_DAYS) flags.push('fight-week');

  return {
    ...base,
    daysOut,
    adherencePct: adherence.pct,
    adherenceDone: adherence.done,
    adherencePlanned: adherence.planned,
    sessionsLast7,
    daysSinceLastSession,
    // `currentWeight` on the projection is the latest weigh-in, falling back to
    // the camp's starting weight when nothing has been logged yet.
    latestWeight: cut.currentWeight,
    targetWeight: camp.targetWeight,
    cutStatus: cut.status,
    flags,
  };
}

/**
 * Score and order the roster.
 *
 * Sorted by "who needs the coach first", not alphabetically: most flags first,
 * then nearest fight. A coach opening this screen is triaging, and a name-sorted
 * table makes them read every row to find the one that matters.
 */
export function buildTeamOverview(
  snapshots: TeamFighterSnapshot[],
  now: Date = new Date(),
): TeamOverviewRow[] {
  return snapshots
    .map(s => scoreOne(s, now))
    .sort((a, b) => {
      if (b.flags.length !== a.flags.length) return b.flags.length - a.flags.length;
      // A fighter with no fight date sorts after everyone who has one.
      const aDays = a.daysOut ?? Number.POSITIVE_INFINITY;
      const bDays = b.daysOut ?? Number.POSITIVE_INFINITY;
      if (aDays !== bDays) return aDays - bDays;
      return a.name.localeCompare(b.name);
    });
}
