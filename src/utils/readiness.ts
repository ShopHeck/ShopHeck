import { addDays, differenceInDays, parseISO, subDays } from 'date-fns';
import type { AppState, CampFactorWeights, TrainingWeek } from '../types';
import { DEFAULT_FACTOR_WEIGHTS } from '../types';
import { formatWeightDelta } from './units';
import { getCurrentWeekNumber } from './campGenerator';
import { latestComparableTrend } from './conditioningMetrics';

export interface ReadinessBreakdownItem {
  label: string;
  score: number;
  max: number;
  detail: string;
  icon: 'scale' | 'activity' | 'flame' | 'zap' | 'timer' | 'droplets';
}

export interface ReadinessResult {
  overall: number;
  status: string;
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

export function computeReadiness(state: AppState): ReadinessResult | null {
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

  const now = new Date();
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

  const currentWeekNumber = getCurrentWeekNumber(activeCamp);
  const currentWeek = trainingSchedule[currentWeekNumber - 1];
  const phase: ReadinessResult['phase'] = currentWeek?.phase ?? 'Unscheduled';
  const sparringPrescribed = currentWeek
    ? currentWeek.days.some(day => day.sessions.some(session => session.type === 'sparring'))
    : phase !== 'Taper' && phase !== 'Active Recovery';

  const campWorkouts = workoutLogs.filter(log => log.campId === activeCamp.id);
  const campSparring = sparringLogs.filter(log => log.campId === activeCamp.id);
  const campWeights = weightEntries
    .filter(entry => entry.campId === activeCamp.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const campTests = conditioningTests
    .filter(test => test.campId === activeCamp.id)
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
    log => log.campId === activeCamp.id && parseISO(log.date) >= recent7,
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

  // ── Overall + data confidence ─────────────────────────────────────────────
  const overall = Math.min(
    100,
    weightScore + volumeScore + qualityScore + sparScore + condScore + nutritionScore,
  );

  const breakdown: ReadinessBreakdownItem[] = [
    { label: 'Weight Cut',      score: weightScore,    max: w.weightCut,       detail: weightDetail,    icon: 'scale' },
    { label: 'Training Volume', score: volumeScore,    max: w.trainingVolume,  detail: volumeDetail,    icon: 'activity' },
    { label: 'Session Quality', score: qualityScore,   max: w.sessionQuality,  detail: qualityDetail,   icon: 'flame' },
    { label: 'Sparring',        score: sparScore,      max: w.sparring,        detail: sparDetail,       icon: 'zap' },
    { label: 'Conditioning',    score: condScore,      max: w.conditioning,    detail: condDetail,       icon: 'timer' },
    { label: 'Nutrition',       score: nutritionScore, max: w.nutrition,       detail: nutritionDetail,  icon: 'droplets' },
  ];

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

  const statusColor =
    overall >= 90 ? '#10b981' :
    overall >= 75 ? '#22c55e' :
    overall >= 60 ? '#eab308' :
    overall >= 40 ? '#f97316' :
    '#ef4444';

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
