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
  /** lbs/day actually achieved so far. */
  lbsPerDayActual: number;
  /** Projected weigh-in weight if the current rate holds. */
  projectedWeighIn: number;
  /** projectedWeighIn − target. Positive = projected to miss weight. */
  projectedMiss: number;
  /**
   * True once the weigh-in history spans at least one day, i.e. there is a
   * real observed rate. While false, lbsPerDayActual is 0 and projectedWeighIn
   * just echoes the current weight — display a "log more weigh-ins" hint
   * instead of presenting those as a prediction.
   */
  trendEstablished: boolean;
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

  // The achieved rate comes from the weigh-in series itself — never from
  // calendar-days-since-camp-start. Anchoring on camp.startDate made a camp
  // created today read "0 lbs/day" (and project the current weight straight
  // onto fight day) no matter how much weight was actually lost, and diluted
  // the rate whenever the first weigh-in came days into camp.
  const observed = campEntries.map(e => ({ date: parseISO(e.date), weight: e.weight }));
  // The starting weight anchors the series only when camp start genuinely
  // predates the first weigh-in (it describes that gap); a same-day or later
  // start date adds no information.
  if (observed.length > 0 && differenceInCalendarDays(observed[0].date, start) > 0) {
    observed.unshift({ date: start, weight: startWeight });
  }
  const spanDays = observed.length >= 2
    ? differenceInCalendarDays(observed[observed.length - 1].date, observed[0].date)
    : 0;
  const trendEstablished = spanDays >= 1;
  const lbsPerDayActual = trendEstablished
    ? +((observed[0].weight - observed[observed.length - 1].weight) / spanDays).toFixed(2)
    : 0;
  const projectedWeighIn = trendEstablished
    ? +(currentWeight - lbsPerDayActual * daysRemaining).toFixed(1)
    : currentWeight;
  const projectedMiss = +(projectedWeighIn - targetWeight).toFixed(1);

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
    trendEstablished,
  };
}
