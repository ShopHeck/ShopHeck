import { addDays, differenceInDays, parseISO, subDays } from 'date-fns';
import type { AppState, CampFactorWeights, TrainingWeek } from '../types';
import { DEFAULT_FACTOR_WEIGHTS } from '../types';
import { formatWeightDelta } from './units';
import { getWeekNumberForDate } from './campGenerator';
import { latestComparableTrend } from './conditioningMetrics';
import { readinessColor } from './designTokens';
import { compareHRVToBaseline, HRV_SUPPRESSED_PCT, type HRVBaselineComparison } from './hrvBaseline';

export interface ReadinessBreakdownItem {
  label: string;
  score: number;
  max: number;
  detail: string;
  icon: 'scale' | 'activity' | 'flame' | 'zap' | 'timer' | 'droplets' | 'heart';
}

/**
 * Share of the readiness score carried by recovery vitals, once the fighter has
 * an HRV baseline to compare against.
 *
 * Every other input is something the fighter logged; this is the only one
 * measured from their body. It is held to 15% because a single morning reading
 * is noisy and the baseline smooths only so much — enough to move the score
 * when recovery is genuinely lagging, not enough for one bad reading to bury a
 * well-run camp.
 */
export const VITALS_WEIGHT = 15;

/**
 * Recovery vitals as a 0..1 ratio: HRV against baseline, with resting heart
 * rate folded in when the source recorded it.
 *
 * The HRV bands are derived from HRV_SUPPRESSED_PCT, the line camp adaptation
 * already uses to propose a deload, so the two features read the same week the
 * same way. Resting HR varies by 2–3 bpm day to day; a sustained rise of ~5 bpm
 * over a fighter's own baseline is the usual flag for accumulated fatigue,
 * illness or dehydration — the last one being live for a fighter mid-cut.
 * These are heuristic bands, not clinical thresholds.
 */
export function vitalsRatio(c: HRVBaselineComparison): number {
  const pct = c.deltaPct;
  const hrv =
    pct > HRV_SUPPRESSED_PCT / 2 ? 1 :
    pct > HRV_SUPPRESSED_PCT     ? 0.75 :
    pct > HRV_SUPPRESSED_PCT * 2 ? 0.45 : 0.2;
  if (!c.restingHR) return hrv;

  const bpm = c.restingHR.deltaBpm;
  const rhr =
    bpm <= 2 ? 1 :
    bpm <= 4 ? 0.75 :
    bpm <= 7 ? 0.45 : 0.2;
  return 0.7 * hrv + 0.3 * rhr;
}

function hrvPhrase(pct: number): string {
  if (pct === 0) return 'HRV at baseline';
  return `HRV ${Math.abs(pct)}% ${pct < 0 ? 'below' : 'above'} baseline`;
}

function restingHRPhrase(deltaBpm: number): string {
  const d = Math.round(deltaBpm);
  if (d === 0) return 'resting HR at baseline';
  return `resting HR ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} bpm`;
}

export interface ReadinessResult {
  overall: number;
  status: string;
  /** A `var(--token)` reference, not a hex literal — see designTokens.ts. */
  statusColor: string;
  breakdown: ReadinessBreakdownItem[];
  insights: string[];
  daysUntilFight: number;
  /** Current generated phase used to interpret load and sparring expectations. */
  phase: TrainingWeek['phase'] | 'Unscheduled';
  /** Percentage of the readiness inputs that contain usable athlete data. */
  dataCoverage: number;
  confidence: 'low' | 'medium' | 'high';
}

interface RpeTarget {
  min: number;
  max: number;
  label: string;
}

function rpeTargetForPhase(phase: ReadinessResult['phase']): RpeTarget {
  if (phase === 'Taper' || phase === 'Active Recovery') {
    return { min: 4, max: 6.5, label: 'recovery-range' };
  }
  if (phase === 'Base Building' || phase === 'Foundation') {
    return { min: 5.5, max: 7.5, label: 'base-building range' };
  }
  if (phase === 'Strength & Conditioning' || phase === 'Development') {
    return { min: 6.5, max: 8.5, label: 'development range' };
  }
  return { min: 7, max: 8.75, label: 'fight-specific range' };
}

function ratioFromRpe(avg: number, target: RpeTarget): number {
  if (avg >= target.min && avg <= target.max) return 1;
  const distance = avg < target.min ? target.min - avg : avg - target.max;
  if (distance <= 0.75) return 0.8;
  if (distance <= 1.5) return 0.6;
  return 0.35;
}

/**
 * Score fight readiness from the camp's logged data.
 *
 * `asOf` is the evaluation moment — it defaults to now for the live dashboard,
 * and callers snapshotting a historical moment (readiness at fight time on a
 * result logged days later) pass that moment instead. Every recency window is
 * anchored to it, and entries dated after it are excluded so data logged later
 * cannot leak into the snapshot.
 */
export function computeReadiness(state: AppState, asOf: Date = new Date()): ReadinessResult | null {
  const {
    activeCamp,
    workoutLogs,
    sparringLogs,
    weightEntries,
    conditioningTests,
    nutritionLogs,
    currentUser,
    trainingSchedule,
  } = state;

  if (!activeCamp) return null;

  const w: Pick<CampFactorWeights, 'weightCut' | 'trainingVolume' | 'sessionQuality' | 'sparring' | 'conditioning' | 'nutrition'> = {
    weightCut: currentUser?.factorWeights?.weightCut ?? DEFAULT_FACTOR_WEIGHTS.weightCut,
    trainingVolume: currentUser?.factorWeights?.trainingVolume ?? DEFAULT_FACTOR_WEIGHTS.trainingVolume,
    sessionQuality: currentUser?.factorWeights?.sessionQuality ?? DEFAULT_FACTOR_WEIGHTS.sessionQuality,
    sparring: currentUser?.factorWeights?.sparring ?? DEFAULT_FACTOR_WEIGHTS.sparring,
    conditioning: currentUser?.factorWeights?.conditioning ?? DEFAULT_FACTOR_WEIGHTS.conditioning,
    nutrition: currentUser?.factorWeights?.nutrition ?? DEFAULT_FACTOR_WEIGHTS.nutrition,
  };

  const now = asOf;
  const campStart = parseISO(activeCamp.startDate);
  // Off-season camps have no fight date — anchor on the scheduled end of the
  // block so every day-count below stays finite.
  const fightDate = activeCamp.fightDate
    ? parseISO(activeCamp.fightDate)
    : addDays(campStart, activeCamp.campWeeks * 7);
  const daysUntilFight = Math.max(1, differenceInDays(fightDate, now));
  const daysIntoCamp = Math.max(0, differenceInDays(now, campStart));
  const totalCampDays = Math.max(1, differenceInDays(fightDate, campStart));
  const campProgress = Math.min(1, daysIntoCamp / totalCampDays);

  const currentWeekNumber = getWeekNumberForDate(activeCamp, now);
  const currentWeek = trainingSchedule[currentWeekNumber - 1];
  const phase: ReadinessResult['phase'] = currentWeek?.phase ?? 'Unscheduled';
  const sparringPrescribed = currentWeek
    ? currentWeek.days.some(day => day.sessions.some(session => session.type === 'sparring'))
    : phase !== 'Taper' && phase !== 'Active Recovery';

  // Entries dated after the evaluation moment are excluded everywhere: for a
  // historical snapshot they hadn't happened yet, and for the live dashboard a
  // future-dated entry is dirty data that must not move the score.
  const onOrBefore = (date: string) => parseISO(date) <= now;
  const campWorkouts = workoutLogs.filter(log => log.campId === activeCamp.id && onOrBefore(log.date));
  const campSparring = sparringLogs.filter(log => log.campId === activeCamp.id && onOrBefore(log.date));
  const campWeights = weightEntries
    .filter(entry => entry.campId === activeCamp.id && onOrBefore(entry.date))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const campTests = conditioningTests
    .filter(test => test.campId === activeCamp.id && onOrBefore(test.date))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const recent14 = subDays(now, 14);
  const recent7 = subDays(now, 7);
  const recentWorkouts = campWorkouts.filter(log => parseISO(log.date) >= recent14);

  // Each section computes a 0..1 ratio, then scales to its per-fighter max.
  const scale = (ratio: number, max: number) => Math.round(Math.max(0, Math.min(1, ratio)) * max);
  const ratioOf = (item: ReadinessBreakdownItem) => item.max > 0 ? item.score / item.max : 1;

  // User-facing detail strings speak the display unit; all math stays lbs.
  const unit = state.dashboardPrefs?.weightUnit ?? 'lbs';

  // ── 1. Weight Cut (max = w.weightCut) ────────────────────────────────────
  const latestWeight = campWeights[campWeights.length - 1];
  const currentW = latestWeight ? latestWeight.weight : activeCamp.currentWeight;
  const targetW = activeCamp.targetWeight;
  const lbsToGo = Math.max(0, currentW - targetW);
  const hasFightWeightTarget = Boolean(
    activeCamp.fightDate && targetW > 0 && activeCamp.currentWeight > targetW,
  );

  let weightRatio: number;
  let weightDetail: string;
  if (!hasFightWeightTarget) {
    weightRatio = 1;
    weightDetail = activeCamp.isOffSeason
      ? 'No fight-weight cut required in this block'
      : 'No cut required for this camp';
  } else if (!latestWeight) {
    weightRatio = 0.5;
    weightDetail = 'No weigh-ins logged yet';
  } else if (lbsToGo <= 0) {
    weightRatio = 1;
    weightDetail = 'At or below fight weight ✓';
  } else {
    const pace = lbsToGo / daysUntilFight;
    if (pace <= 0.3)      { weightRatio = 0.9;  weightDetail = `${formatWeightDelta(lbsToGo, unit)} to go — comfortable pace`; }
    else if (pace <= 0.5) { weightRatio = 0.7;  weightDetail = `${formatWeightDelta(lbsToGo, unit)} to go — manageable`; }
    else if (pace <= 0.8) { weightRatio = 0.45; weightDetail = `${formatWeightDelta(lbsToGo, unit)} to go — tight timeline`; }
    else if (pace <= 1.2) { weightRatio = 0.2;  weightDetail = `${formatWeightDelta(lbsToGo, unit)} to go — very difficult`; }
    else                  { weightRatio = 0.05; weightDetail = `${formatWeightDelta(lbsToGo, unit)} to go — critical`; }
  }
  const weightScore = scale(weightRatio, w.weightCut);

  // ── 2. Training Volume (max = w.trainingVolume) ──────────────────────────
  const expectedSessions = Math.round(campProgress * activeCamp.campWeeks * 4.5);
  const totalLogged = campWorkouts.length;
  const gap = Math.max(0, expectedSessions - totalLogged);
  const volumeRatio = expectedSessions > 0 ? Math.min(1, totalLogged / expectedSessions) : 0.5;
  const volumeScore = scale(volumeRatio, w.trainingVolume);
  const volumeDetail = expectedSessions === 0
    ? (totalLogged > 0 ? `${totalLogged} logged · camp hasn't started` : 'Camp starts soon — nothing due yet')
    : gap > 0
      ? `${totalLogged} logged · ${gap} behind pace`
      : `${totalLogged} sessions logged · on pace`;

  // ── 3. Session Quality / RPE (max = w.sessionQuality) ────────────────────
  const recentRPEs = recentWorkouts.map(log => log.rpe).filter(rpe => rpe > 0);
  const rpeTarget = rpeTargetForPhase(phase);
  let qualityRatio: number;
  let qualityDetail: string;
  if (recentRPEs.length === 0) {
    qualityRatio = 0.5;
    qualityDetail = `Log session RPE · ${phase} target ${rpeTarget.min}–${rpeTarget.max}`;
  } else {
    const avg = recentRPEs.reduce((sum, rpe) => sum + rpe, 0) / recentRPEs.length;
    qualityRatio = ratioFromRpe(avg, rpeTarget);
    if (qualityRatio === 1) {
      qualityDetail = `Avg RPE ${avg.toFixed(1)} — on target for ${phase}`;
    } else if (avg < rpeTarget.min) {
      qualityDetail = `Avg RPE ${avg.toFixed(1)} — below ${rpeTarget.label}`;
    } else {
      qualityDetail = `Avg RPE ${avg.toFixed(1)} — above ${rpeTarget.label}; monitor recovery`;
    }
  }
  const qualityScore = scale(qualityRatio, w.sessionQuality);

  // ── 4. Sparring (max = w.sparring) ───────────────────────────────────────
  const sortedSpar = [...campSparring].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const lastSpar = sortedSpar[0];
  const daysSinceSpar = lastSpar
    ? Math.max(0, differenceInDays(now, parseISO(lastSpar.date)))
    : 999;
  const totalSparRounds = campSparring.reduce((sum, log) => sum + log.rounds, 0);

  let sparRatio: number;
  let sparDetail: string;
  if (!sparringPrescribed) {
    sparRatio = 1;
    sparDetail = `No sparring prescribed during ${phase}`;
  } else if (campSparring.length === 0) {
    sparRatio = 0.25;
    sparDetail = `Sparring is prescribed in ${phase}, but none is logged`;
  } else {
    const baseRatio = Math.min(0.75, campSparring.length * 0.15);
    const recencyBonus = daysSinceSpar <= 7 ? 0.25 : daysSinceSpar <= 14 ? 0.1 : daysSinceSpar > 21 ? -0.15 : 0;
    sparRatio = Math.max(0, Math.min(1, baseRatio + recencyBonus));
    sparDetail = `${campSparring.length} session${campSparring.length > 1 ? 's' : ''} · ${totalSparRounds} rounds · last ${daysSinceSpar}d ago`;
  }
  const sparScore = scale(sparRatio, w.sparring);

  // ── 5. Conditioning (max = w.conditioning) ───────────────────────────────
  const conditioningTrend = latestComparableTrend(campTests);
  let condRatio: number;
  let condDetail: string;
  if (campTests.length === 0) {
    condRatio = 0.5;
    condDetail = 'Log a repeatable test to benchmark fitness';
  } else if (!conditioningTrend) {
    const latest = campTests[campTests.length - 1];
    condRatio = 0.7;
    condDetail = `${latest.testType}: ${latest.value} ${latest.unit} · repeat it to show a trend`;
  } else {
    const change = Math.abs(conditioningTrend.improvementPct).toFixed(1);
    if (conditioningTrend.improvementPct > 2) {
      condRatio = 1;
      condDetail = `${conditioningTrend.testType} improved ${change}% ↑`;
    } else if (conditioningTrend.improvementPct >= -2) {
      condRatio = 0.75;
      condDetail = `${conditioningTrend.testType} stable (${conditioningTrend.sampleCount} tests)`;
    } else {
      condRatio = 0.4;
      condDetail = `${conditioningTrend.testType} declined ${change}% ↓`;
    }
  }
  const condScore = scale(condRatio, w.conditioning);

  // ── 6. Nutrition & Recovery (max = w.nutrition) ──────────────────────────
  const recentNutrition = nutritionLogs.filter(
    log => log.campId === activeCamp.id && parseISO(log.date) >= recent7 && onOrBefore(log.date),
  );
  let nutritionRatio: number;
  let nutritionDetail: string;
  if (recentNutrition.length === 0) {
    nutritionRatio = 0.5;
    nutritionDetail = 'Log nutrition to score this';
  } else {
    let mealPts = 0;
    let mealTotal = 0;
    let goodHydration = 0;
    for (const log of recentNutrition) {
      for (const rating of Object.values(log.mealRatings).filter(Boolean) as string[]) {
        mealPts += rating === 'good' ? 2 : rating === 'ok' ? 1 : 0;
        mealTotal += 2;
      }
      if ((log.waterOz ?? 0) >= 80) goodHydration += 1;
    }
    const mealRatio = mealTotal > 0 ? mealPts / mealTotal : 0.5;
    const waterRatio = goodHydration / recentNutrition.length;
    nutritionRatio = (mealRatio + waterRatio) / 2;
    const hydPct = Math.round(waterRatio * 100);
    nutritionDetail = `${hydPct}% hydration days · ${recentNutrition.length}d tracked`;
  }
  const nutritionScore = scale(nutritionRatio, w.nutrition);

  // ── 7. Recovery Vitals (blended, max = VITALS_WEIGHT) ────────────────────
  // Present only once the fighter has an HRV baseline. Without one this
  // section does not exist at all — no breakdown card, no coverage signal, no
  // effect on the score — so a fighter on the web, on an older iPhone, or who
  // simply never measures gets exactly the score they always did. Absence is
  // not scored as a weakness: nothing else in the app asks for vitals, so
  // marking a fighter down for not having them would penalise the hardware
  // they own rather than how their camp is going.
  const vitals = compareHRVToBaseline(
    (state.hrvEntries ?? []).filter(e => e.campId === activeCamp.id),
    now,
  );
  const vitalsScore = vitals ? scale(vitalsRatio(vitals), VITALS_WEIGHT) : 0;

  // ── Overall + data confidence ─────────────────────────────────────────────
  const baseOverall = Math.min(
    100,
    weightScore + volumeScore + qualityScore + sparScore + condScore + nutritionScore,
  );
  // Vitals are blended rather than added as a seventh weight, because the six
  // weights are the fighter's own and need not sum to 100: adding 15 points of
  // headroom would let a custom-weighted fighter's score jump the moment their
  // baseline completed. The blend moves the score at most VITALS_WEIGHT points
  // in either direction, whatever the weights.
  const overall = vitals
    ? Math.min(100, Math.round(
        (1 - VITALS_WEIGHT / 100) * baseOverall + VITALS_WEIGHT * vitalsRatio(vitals),
      ))
    : baseOverall;

  const breakdown: ReadinessBreakdownItem[] = [
    { label: 'Weight Cut',      score: weightScore,    max: w.weightCut,       detail: weightDetail,    icon: 'scale' },
    { label: 'Training Volume', score: volumeScore,    max: w.trainingVolume,  detail: volumeDetail,    icon: 'activity' },
    { label: 'Session Quality', score: qualityScore,   max: w.sessionQuality,  detail: qualityDetail,   icon: 'flame' },
    { label: 'Sparring',        score: sparScore,      max: w.sparring,        detail: sparDetail,       icon: 'zap' },
    { label: 'Conditioning',    score: condScore,      max: w.conditioning,    detail: condDetail,       icon: 'timer' },
    { label: 'Nutrition',       score: nutritionScore, max: w.nutrition,       detail: nutritionDetail,  icon: 'droplets' },
  ];
  if (vitals) {
    const detail = vitals.restingHR
      ? `${hrvPhrase(vitals.deltaPct)} · ${restingHRPhrase(vitals.restingHR.deltaBpm)}`
      : hrvPhrase(vitals.deltaPct);
    breakdown.push({ label: 'Recovery Vitals', score: vitalsScore, max: VITALS_WEIGHT, detail, icon: 'heart' });
  }

  const coverageSignals = [
    !hasFightWeightTarget || Boolean(latestWeight),
    campWorkouts.length > 0,
    recentRPEs.length > 0,
    !sparringPrescribed || campSparring.length > 0,
    campTests.length > 0,
    recentNutrition.length > 0,
  ];
  const dataCoverage = Math.round(
    coverageSignals.filter(Boolean).length / coverageSignals.length * 100,
  );
  const confidence: ReadinessResult['confidence'] =
    dataCoverage >= 80 ? 'high' : dataCoverage >= 50 ? 'medium' : 'low';

  // ── Insights (flag weakest areas) ────────────────────────────────────────
  const insights: string[] = [];
  const byRatio = [...breakdown].sort((a, b) => ratioOf(a) - ratioOf(b));
  for (const item of byRatio.slice(0, 3)) {
    if (ratioOf(item) >= 0.75) continue;
    if (item.label === 'Weight Cut' && hasFightWeightTarget && lbsToGo > 0) {
      insights.push(`Log your weight consistently — ${formatWeightDelta(lbsToGo, unit)} remains with ${daysUntilFight} days to the fight-date target.`);
    } else if (item.label === 'Training Volume') {
      insights.push(gap > 0
        ? `You're ${gap} session${gap > 1 ? 's' : ''} behind the current camp pace.`
        : 'Log each completed session so training volume reflects the work you are doing.');
    } else if (item.label === 'Session Quality') {
      insights.push(`For ${phase}, keep most session RPEs around ${rpeTarget.min}–${rpeTarget.max}; do not chase peak intensity in a recovery phase.`);
    } else if (item.label === 'Sparring' && sparringPrescribed) {
      insights.push(`Sparring is scheduled during ${phase}; coordinate the next live-work session with your coach.`);
    } else if (item.label === 'Conditioning') {
      insights.push('Repeat the same conditioning test under similar conditions to establish a trustworthy trend.');
    } else if (item.label === 'Nutrition') {
      insights.push('Track meals and hydration consistently so the recovery component is based on current data.');
    } else if (item.label === 'Recovery Vitals' && vitals) {
      const rhrUp = vitals.restingHR !== null && vitals.restingHR.deltaBpm > 4;
      if (vitals.deltaPct <= HRV_SUPPRESSED_PCT) {
        insights.push(`HRV is ${Math.abs(vitals.deltaPct)}% below your baseline${rhrUp ? ' and resting heart rate is up' : ''} — you are not absorbing recent work yet. Protect sleep and keep intensity in check until it recovers.`);
      } else if (rhrUp) {
        insights.push(`Resting heart rate is up ${Math.round(vitals.restingHR!.deltaBpm)} bpm on your baseline — check sleep, hydration and illness before pushing intensity.`);
      } else {
        insights.push('Recovery vitals are drifting below your baseline; prioritise sleep and hydration this week.');
      }
    }
  }

  if (confidence === 'low') {
    insights.unshift(`Readiness confidence is low (${dataCoverage}% data coverage). Log current training, recovery and benchmark data before making camp changes from this score.`);
  }

  // ── Status label & colour ────────────────────────────────────────────────
  const status =
    overall >= 90 ? 'Peak Condition' :
    overall >= 75 ? 'Fight Ready' :
    overall >= 60 ? 'On Track' :
    overall >= 40 ? 'Building Base' : 'Needs Work';

  // Delegated to the design system's tier table rather than restating the five
  // thresholds in hex. The bands were previously written out here, again in the
  // gauge, and again in the gauge's legend — three copies of one legend, which
  // is how the legend ends up labelling bands the score no longer uses.
  const statusColor = readinessColor(overall);

  return {
    overall,
    status,
    statusColor,
    breakdown,
    insights,
    daysUntilFight,
    phase,
    dataCoverage,
    confidence,
  };
}
