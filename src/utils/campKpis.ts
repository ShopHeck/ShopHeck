import { differenceInDays, parseISO } from 'date-fns';
import type { AppState, FightResult } from '../types';
import { campAdherence } from './adherence';

export interface CampKpis {
  campId: string;
  totalSessions: number;
  /**
   * Ticked sessions ÷ sessions this camp's schedule defines, 0..1.
   * `null` when the camp has no schedule to score against — not the same as 0.
   */
  adherence: number | null;
  avgRpe: number;
  totalMinutes: number;
  sparringRoundsTotal: number;
  sparringSessionsCount: number;
  /** Lbs from start weight to latest/fight-night weight. Positive = cut. */
  weightCutLbs: number;
  weightCutPaceLbsPerWeek: number;
  /** % change from first to last conditioning test. Positive = improving. */
  conditioningDelta: number | null;
  /** Fraction of camp days with any nutrition log (0..1). */
  nutritionAdherence: number;
  hrvTrend: 'improving' | 'stable' | 'declining' | 'no-data';
  /** Optional snapshot. Populated post-fight via FightResult.readinessAtFight. */
  readinessAtFight: number | null;
  phaseIntensityDistribution: Record<string, number>;
}

export function computeCampKpis(state: AppState, campId: string, fight?: FightResult): CampKpis {
  const camp = state.camps.find(c => c.id === campId);

  const workouts = state.workoutLogs.filter(w => w.campId === campId);
  const sparring = state.sparringLogs.filter(s => s.campId === campId);
  const weights = state.weightEntries
    .filter(w => w.campId === campId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const tests = state.conditioningTests
    .filter(t => t.campId === campId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const nutrition = state.nutritionLogs.filter(n => n.campId === campId);
  const hrv = (state.hrvEntries ?? [])
    .filter(h => h.campId === campId)
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalSessions = workouts.length;
  const totalMinutes = workouts.reduce((s, w) => s + w.duration, 0);
  const rpes = workouts.map(w => w.rpe).filter(r => r > 0);
  const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : 0;

  const sparringSessionsCount = sparring.length;
  const sparringRoundsTotal = sparring.reduce((s, r) => s + r.rounds, 0);

  // Schedule adherence — the shared definition (utils/adherence.ts).
  //
  // This used to count LOGGED WORKOUTS against a `campWeeks * 4.5` estimate,
  // while the field's own docstring and every label rendering it called it
  // "schedule adherence". It now measures what it claims: sessions ticked
  // complete against the sessions the camp's schedule actually defines.
  //
  // `null` (no schedule to score against) is distinct from 0 — consumers that
  // generate advice or tune factor weights must not read "unmeasurable" as
  // "the fighter missed everything".
  const adherenceScore = campAdherence(state, campId);
  const adherence = adherenceScore.pct === null ? null : adherenceScore.pct / 100;

  // Weight cut: start → weigh-in (the low point). Prefer weigh-in weight, then a
  // logged weigh-in-morning entry, over fight-night weight — that's the
  // post-rehydration number, so a real 15-lb cut that rehydrates 13 lbs would
  // read as a 2-lb cut and defeat severe-cut detection downstream. Fight-night
  // weight is still kept as a fallback (a rough end measurement beats reporting
  // a 0-lb cut off startWeight).
  const startWeight = camp?.currentWeight ?? weights[0]?.weight ?? 0;
  const endWeight = fight?.weighInWeight ?? weights[weights.length - 1]?.weight ?? fight?.fightNightWeight ?? startWeight;
  const weightCutLbs = Math.max(0, startWeight - endWeight);
  const campWeeksElapsed = camp
    ? Math.max(1, Math.round(camp.campWeeks))
    : Math.max(1, weights.length > 1
        ? differenceInDays(parseISO(weights[weights.length - 1].date), parseISO(weights[0].date)) / 7
        : 1);
  const weightCutPaceLbsPerWeek = weightCutLbs / campWeeksElapsed;

  // Conditioning delta: first → last test, percent.
  let conditioningDelta: number | null = null;
  if (tests.length >= 2) {
    const first = tests[0].value;
    const last = tests[tests.length - 1].value;
    if (Math.abs(first) > 0.0001) {
      conditioningDelta = ((last - first) / Math.abs(first)) * 100;
    }
  }

  // Nutrition adherence — % of camp days with a log.
  let nutritionAdherence = 0;
  if (camp) {
    const campDays = Math.max(1, camp.campWeeks * 7);
    const uniqueDates = new Set(nutrition.map(n => n.date));
    nutritionAdherence = Math.min(1, uniqueDates.size / campDays);
  }

  // HRV trend: compare first third vs last third avg.
  let hrvTrend: CampKpis['hrvTrend'] = 'no-data';
  if (hrv.length >= 4) {
    const third = Math.max(1, Math.floor(hrv.length / 3));
    const early = hrv.slice(0, third);
    const late = hrv.slice(-third);
    const avg = (xs: typeof hrv) => xs.reduce((s, h) => s + h.rmssd, 0) / xs.length;
    const delta = avg(late) - avg(early);
    if (delta > 2) hrvTrend = 'improving';
    else if (delta < -2) hrvTrend = 'declining';
    else hrvTrend = 'stable';
  } else if (hrv.length > 0) {
    hrvTrend = 'stable';
  }

  // Phase intensity distribution — % of weeks at each intensity level, from schedule.
  const phaseIntensityDistribution: Record<string, number> = {};
  const schedule = state.trainingSchedule;
  if (schedule.length > 0) {
    const counts: Record<string, number> = {};
    for (const week of schedule) counts[week.intensity] = (counts[week.intensity] ?? 0) + 1;
    for (const k of Object.keys(counts)) {
      phaseIntensityDistribution[k] = counts[k] / schedule.length;
    }
  }

  return {
    campId,
    totalSessions,
    adherence,
    avgRpe,
    totalMinutes,
    sparringRoundsTotal,
    sparringSessionsCount,
    weightCutLbs,
    weightCutPaceLbsPerWeek,
    conditioningDelta,
    nutritionAdherence,
    hrvTrend,
    readinessAtFight: fight?.readinessAtFight ?? null,
    phaseIntensityDistribution,
  };
}
