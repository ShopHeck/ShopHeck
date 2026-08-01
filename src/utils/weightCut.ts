import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { FightCamp, WeightEntry } from '../types';

export type CutStatus = 'ahead' | 'on-pace' | 'behind' | 'made' | 'no-fight';

export interface CutProjection {
  /** False when there's no fight date (off-season) or no cut required. */
  trackable: boolean;
  status: CutStatus;
  startWeight: number;
  targetWeight: number;
  currentWeight: number;
  /** Current weight minus target (lbs still to lose; <= 0 means made it). */
  toGo: number;
  totalDays: number;
  daysElapsed: number;
  daysRemaining: number;
  /** Where a steady linear cut says you should be today. */
  idealToday: number;
  /** current − idealToday. Positive = behind pace, negative = ahead. */
  paceDelta: number;
  /** lbs/day still required to hit target by fight day. */
  lbsPerDayNeeded: number;
  /** lbs/day actually achieved recently (positive = losing). */
  lbsPerDayActual: number;
  /**
   * Projected weigh-in weight if the current rate holds, floored at the target
   * — a fighter on a cut stops at their target rather than sailing past it.
   */
  projectedWeighIn: number;
  /** projectedWeighIn − target. Positive = projected to miss weight. */
  projectedMiss: number;
  /**
   * Days before weigh-in the current rate would reach target, or null when the
   * trend never gets there (or there's no trend yet). Lets the UI say "you'd be
   * on weight ~9 days early" instead of implying the fighter keeps dropping.
   */
  daysEarlyAtRate: number | null;
  /**
   * True once there are at least two weigh-ins spanning at least one day, i.e.
   * there is a real observed rate. While false, lbsPerDayActual is 0 and
   * projectedWeighIn just echoes the current weight — display a "log more
   * weigh-ins" hint instead of presenting those as a prediction.
   */
  trendEstablished: boolean;
}

/**
 * Weigh-ins considered "recent" when measuring the achieved rate. Long enough
 * to smooth out day-to-day water swings, short enough that a bulk earlier in
 * camp doesn't drag the current cut rate toward zero.
 */
const RATE_WINDOW_DAYS = 21;

/**
 * Least-squares lbs/day from a weigh-in series, sign-flipped so a positive
 * result means weight is coming OFF. Uses every point in the window rather than
 * just the endpoints, so one bloated weigh-in can't define the trend.
 */
function ratePerDay(points: { day: number; weight: number }[]): number {
  const n = points.length;
  const meanDay = points.reduce((s, p) => s + p.day, 0) / n;
  const meanWeight = points.reduce((s, p) => s + p.weight, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.day - meanDay) * (p.weight - meanWeight);
    den += (p.day - meanDay) ** 2;
  }
  return den === 0 ? 0 : -(num / den);
}

/** Weight on a straight-line cut from start→target between the given dates. */
export function idealWeightAt(camp: FightCamp, date: Date): number {
  if (!camp.fightDate) return camp.targetWeight;
  const start = parseISO(camp.startDate);
  const fight = parseISO(camp.fightDate);
  const total = Math.max(1, differenceInCalendarDays(fight, start));
  const elapsed = Math.min(total, Math.max(0, differenceInCalendarDays(date, start)));
  const frac = elapsed / total;
  return +(camp.currentWeight - (camp.currentWeight - camp.targetWeight) * frac).toFixed(1);
}

/**
 * Project a fighter's weight cut: are they ahead, on pace, or behind, and what
 * will they weigh in at if the current trend holds. Pure + side-effect free.
 */
export function computeCutProjection(
  camp: FightCamp,
  entries: WeightEntry[],
  now: Date = new Date(),
): CutProjection {
  const startWeight = camp.currentWeight;
  const targetWeight = camp.targetWeight;

  const campEntries = entries
    .filter(e => e.campId === camp.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = campEntries[campEntries.length - 1];
  const currentWeight = latest ? latest.weight : startWeight;
  const toGo = +(currentWeight - targetWeight).toFixed(1);

  const base: CutProjection = {
    trackable: false,
    status: 'no-fight',
    startWeight,
    targetWeight,
    currentWeight,
    toGo,
    totalDays: 0,
    daysElapsed: 0,
    daysRemaining: 0,
    idealToday: targetWeight,
    paceDelta: 0,
    lbsPerDayNeeded: 0,
    lbsPerDayActual: 0,
    projectedWeighIn: currentWeight,
    projectedMiss: toGo,
    daysEarlyAtRate: null,
    trendEstablished: false,
  };

  // Off-season / no scheduled weigh-in → nothing to project against.
  if (!camp.fightDate) return base;
  // Already at or under target.
  if (currentWeight <= targetWeight) return { ...base, trackable: true, status: 'made' };
  // No cut configured.
  if (startWeight <= targetWeight) return base;

  const start = parseISO(camp.startDate);
  const fight = parseISO(camp.fightDate);
  const totalDays = Math.max(1, differenceInCalendarDays(fight, start));
  const daysElapsed = Math.min(totalDays, Math.max(0, differenceInCalendarDays(now, start)));
  const daysRemaining = Math.max(0, differenceInCalendarDays(fight, now));

  const idealToday = +(startWeight - (startWeight - targetWeight) * (daysElapsed / totalDays)).toFixed(1);
  const paceDelta = +(currentWeight - idealToday).toFixed(1);

  const lbsPerDayNeeded = daysRemaining > 0 ? +(toGo / daysRemaining).toFixed(2) : toGo;

  // The achieved rate comes from the weigh-in series itself, over a recent
  // window. Two earlier approaches both misreported it: anchoring on
  // camp.startDate read "0 lbs/day" for a camp created today, and anchoring the
  // series on camp.currentWeight let a stale self-reported start weight cancel
  // out the real trend — a fighter who logged 148 → 142 over two weeks against
  // a recorded start of 142 was told they were losing 0 lbs/day and would miss
  // weight by 7 lbs. Regressing over the recent weigh-ins measures what the
  // fighter is actually doing right now.
  const observed = campEntries.map(e => ({
    day: differenceInCalendarDays(parseISO(e.date), start),
    weight: e.weight,
  }));
  const lastDay = observed.length > 0 ? observed[observed.length - 1].day : 0;
  const windowed = observed.filter(p => lastDay - p.day <= RATE_WINDOW_DAYS);
  // Prefer the recent window; widen to the whole camp when it holds too little.
  let series = windowed.length >= 2 ? windowed : observed;
  // With a single weigh-in there is no series at all — the camp's recorded
  // start weight is the only other data point we have, and it does describe the
  // gap between camp start and that weigh-in. It is never used to dilute a real
  // multi-weigh-in trend.
  if (series.length < 2 && observed.length === 1 && observed[0].day > 0) {
    series = [{ day: 0, weight: startWeight }, observed[0]];
  }
  const spanDays = series.length >= 2 ? series[series.length - 1].day - series[0].day : 0;
  const trendEstablished = series.length >= 2 && spanDays >= 1;
  const lbsPerDayActual = trendEstablished ? +ratePerDay(series).toFixed(2) : 0;

  // A fighter on a cut stops at their target, so the projection is floored
  // there; daysEarlyAtRate carries the "how much room is left" signal instead.
  const rawProjection = trendEstablished
    ? +(currentWeight - lbsPerDayActual * daysRemaining).toFixed(1)
    : currentWeight;
  const projectedWeighIn = Math.max(rawProjection, targetWeight);
  const projectedMiss = +(projectedWeighIn - targetWeight).toFixed(1);
  const daysToTarget = trendEstablished && lbsPerDayActual > 0 ? toGo / lbsPerDayActual : null;
  const daysEarlyAtRate =
    daysToTarget !== null && daysToTarget <= daysRemaining
      ? Math.round(daysRemaining - daysToTarget)
      : null;

  // Tolerance scales a little with the size of the cut, min 1 lb.
  const tolerance = Math.max(1, (startWeight - targetWeight) * 0.05);
  let status: CutStatus;
  if (paceDelta <= -tolerance) status = 'ahead';
  else if (paceDelta >= tolerance) status = 'behind';
  else status = 'on-pace';

  return {
    ...base,
    trackable: true,
    status,
    totalDays,
    daysElapsed,
    daysRemaining,
    idealToday,
    paceDelta,
    lbsPerDayNeeded,
    lbsPerDayActual,
    projectedWeighIn,
    projectedMiss,
    daysEarlyAtRate,
    trendEstablished,
  };
}
