import { addDays, differenceInDays, parseISO, subDays } from 'date-fns';
import type { AppState, CampFactorWeights } from '../types';
import { DEFAULT_FACTOR_WEIGHTS } from '../types';

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
  // block (start + campWeeks) so every day-count below stays finite instead of
  // NaN-ing the whole readiness score (parseISO('') is an Invalid Date).
  const fightDate = activeCamp.fightDate
    ? parseISO(activeCamp.fightDate)
    : addDays(campStart, activeCamp.campWeeks * 7);
  const daysUntilFight = Math.max(1, differenceInDays(fightDate, now));
  const daysIntoCamp = Math.max(0, differenceInDays(now, campStart));
  const totalCampDays = Math.max(1, differenceInDays(fightDate, campStart));
  const campProgress = Math.min(1, daysIntoCamp / totalCampDays);

  const campWorkouts = workoutLogs.filter(w => w.campId === activeCamp.id);
  const campSparring = sparringLogs.filter(s => s.campId === activeCamp.id);
  const campWeights = weightEntries
    .filter(w => w.campId === activeCamp.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const campTests = conditioningTests
    .filter(t => t.campId === activeCamp.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const recent14 = subDays(now, 14);
  const recent7 = subDays(now, 7);
  const recentWorkouts = campWorkouts.filter(w => parseISO(w.date) >= recent14);

  // Each section computes a 0..1 ratio, then scales to its per-fighter max.
  const scale = (ratio: number, max: number) => Math.round(ratio * max);

  // ── 1. Weight Cut (max = w.weightCut) ────────────────────────────────────
  const latestWeight = campWeights[campWeights.length - 1];
  const currentW = latestWeight ? latestWeight.weight : activeCamp.currentWeight;
  const targetW = activeCamp.targetWeight;
  const lbsToGo = Math.max(0, currentW - targetW);

  let weightRatio: number;
  let weightDetail: string;
  if (!latestWeight) {
    weightRatio = 0.5;
    weightDetail = 'No weigh-ins logged yet';
  } else if (lbsToGo <= 0) {
    weightRatio = 1;
    weightDetail = 'At or below fight weight ✓';
  } else {
    const pace = lbsToGo / daysUntilFight;
    if (pace <= 0.3)      { weightRatio = 0.9;  weightDetail = `${lbsToGo.toFixed(1)} lbs to go — comfortable pace`; }
    else if (pace <= 0.5) { weightRatio = 0.7;  weightDetail = `${lbsToGo.toFixed(1)} lbs to go — manageable`; }
    else if (pace <= 0.8) { weightRatio = 0.45; weightDetail = `${lbsToGo.toFixed(1)} lbs to go — tight timeline`; }
    else if (pace <= 1.2) { weightRatio = 0.2;  weightDetail = `${lbsToGo.toFixed(1)} lbs to go — very difficult`; }
    else                  { weightRatio = 0.05; weightDetail = `${lbsToGo.toFixed(1)} lbs to go — critical`; }
  }
  const weightScore = scale(weightRatio, w.weightCut);

  // ── 2. Training Volume (max = w.trainingVolume) ──────────────────────────
  // No Math.max(1, …) floor here: a camp that starts tomorrow has a progress of
  // 0, and forcing "1 session expected" told a fighter they were already a
  // session behind — and scored them 0 on volume — before day one of camp. With
  // nothing expected yet, volume is unscored (neutral 0.5), like every other
  // "no data yet" branch in this file.
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
  const recentRPEs = recentWorkouts.map(wl => wl.rpe).filter(r => r > 0);
  let qualityRatio: number;
  let qualityDetail: string;
  if (recentRPEs.length === 0) {
    qualityRatio = 0.5;
    qualityDetail = 'Log sessions with RPE to score this';
  } else {
    const avg = recentRPEs.reduce((a, b) => a + b, 0) / recentRPEs.length;
    if (avg >= 7 && avg <= 8.5)       { qualityRatio = 1;    qualityDetail = `Avg RPE ${avg.toFixed(1)} — ideal intensity`; }
    else if (avg >= 6 && avg < 7)     { qualityRatio = 0.75; qualityDetail = `Avg RPE ${avg.toFixed(1)} — could push harder`; }
    else if (avg > 8.5 && avg <= 9.5) { qualityRatio = 0.65; qualityDetail = `Avg RPE ${avg.toFixed(1)} — monitor recovery`; }
    else if (avg < 6)                  { qualityRatio = 0.33; qualityDetail = `Avg RPE ${avg.toFixed(1)} — intensity too low`; }
    else                               { qualityRatio = 0.45; qualityDetail = `Avg RPE ${avg.toFixed(1)} — overtraining risk`; }
  }
  const qualityScore = scale(qualityRatio, w.sessionQuality);

  // ── 4. Sparring (max = w.sparring) ───────────────────────────────────────
  const sortedSpar = [...campSparring].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const lastSpar = sortedSpar[0];
  const daysSinceSpar = lastSpar
    ? Math.max(0, differenceInDays(now, parseISO(lastSpar.date)))
    : 999;
  const totalSparRounds = campSparring.reduce((sum, s) => sum + s.rounds, 0);

  let sparRatio: number;
  let sparDetail: string;
  if (campSparring.length === 0) {
    sparRatio = 0;
    sparDetail = 'No sparring logged yet';
  } else {
    const baseRatio = Math.min(0.75, campSparring.length * 0.15);
    const recencyBonus = daysSinceSpar <= 7 ? 0.25 : daysSinceSpar <= 14 ? 0.1 : daysSinceSpar > 21 ? -0.15 : 0;
    sparRatio = Math.max(0, Math.min(1, baseRatio + recencyBonus));
    sparDetail = `${campSparring.length} session${campSparring.length > 1 ? 's' : ''} · ${totalSparRounds} rounds · last ${daysSinceSpar}d ago`;
  }
  const sparScore = scale(sparRatio, w.sparring);

  // ── 5. Conditioning (max = w.conditioning) ───────────────────────────────
  let condRatio: number;
  let condDetail: string;
  if (campTests.length === 0) {
    condRatio = 0.5;
    condDetail = 'Log a test to benchmark fitness';
  } else if (campTests.length === 1) {
    condRatio = 0.7;
    condDetail = `${campTests[0].testType}: ${campTests[0].value} ${campTests[0].unit}`;
  } else {
    const first = campTests[0].value;
    const last = campTests[campTests.length - 1].value;
    const pct = ((last - first) / Math.abs(Math.max(1, first))) * 100;
    if (pct > 2)        { condRatio = 1;   condDetail = `${campTests[0].testType} improving ↑`; }
    else if (pct >= -2) { condRatio = 0.7; condDetail = `${campTests[0].testType} stable`; }
    else                { condRatio = 0.4; condDetail = `${campTests[0].testType} declining ↓`; }
  }
  const condScore = scale(condRatio, w.conditioning);

  // ── 6. Nutrition & Recovery (max = w.nutrition) ──────────────────────────
  const recentNutrition = nutritionLogs.filter(
    n => n.campId === activeCamp.id && parseISO(n.date) >= recent7
  );
  let nutritionRatio: number;
  let nutritionDetail: string;
  if (recentNutrition.length === 0) {
    nutritionRatio = 0.5;
    nutritionDetail = 'Log nutrition to score this';
  } else {
    let mealPts = 0, mealTotal = 0, goodHydration = 0;
    for (const log of recentNutrition) {
      for (const r of Object.values(log.mealRatings).filter(Boolean) as string[]) {
        mealPts += r === 'good' ? 2 : r === 'ok' ? 1 : 0;
        mealTotal += 2;
      }
      if ((log.waterOz ?? 0) >= 80) goodHydration++;
    }
    const mealRatio = mealTotal > 0 ? mealPts / mealTotal : 0.5;
    const waterRatio = goodHydration / recentNutrition.length;
    nutritionRatio = (mealRatio + waterRatio) / 2;
    const hydPct = Math.round(waterRatio * 100);
    nutritionDetail = `${hydPct}% hydration days · ${recentNutrition.length}d tracked`;
  }
  const nutritionScore = scale(nutritionRatio, w.nutrition);

  // ── Overall ─────────────────────────────────────────────────────────────
  const overall = Math.min(
    100,
    weightScore + volumeScore + qualityScore + sparScore + condScore + nutritionScore
  );

  const breakdown: ReadinessBreakdownItem[] = [
    { label: 'Weight Cut',      score: weightScore,    max: w.weightCut,       detail: weightDetail,    icon: 'scale' },
    { label: 'Training Volume', score: volumeScore,    max: w.trainingVolume,  detail: volumeDetail,    icon: 'activity' },
    { label: 'Session Quality', score: qualityScore,   max: w.sessionQuality,  detail: qualityDetail,   icon: 'flame' },
    { label: 'Sparring',        score: sparScore,      max: w.sparring,        detail: sparDetail,       icon: 'zap' },
    { label: 'Conditioning',    score: condScore,      max: w.conditioning,    detail: condDetail,       icon: 'timer' },
    { label: 'Nutrition',       score: nutritionScore, max: w.nutrition,       detail: nutritionDetail,  icon: 'droplets' },
  ];

  // ── Insights (flag weakest areas) ───────────────────────────────────────
  const insights: string[] = [];
  const byRatio = [...breakdown].sort((a, b) => a.score / a.max - b.score / b.max);
  for (const item of byRatio.slice(0, 3)) {
    if (item.score / item.max >= 0.75) continue;
    if (item.label === 'Weight Cut' && lbsToGo > 0) {
      insights.push(`Log your weight daily — you need to cut ${lbsToGo.toFixed(1)} lbs in ${daysUntilFight} days.`);
    } else if (item.label === 'Training Volume') {
      // gap can legitimately be 0 (nothing due yet, or logging is on pace but
      // the neutral no-data score still lands in the bottom three) — don't tell
      // a fighter they're "0 sessions behind".
      insights.push(gap > 0
        ? `You're ${gap} session${gap > 1 ? 's' : ''} behind pace — push consistency this week.`
        : 'Log every session as you train — training volume is what drives this score.');
    } else if (item.label === 'Session Quality') {
      insights.push('Aim for RPE 7–8 in most sessions for peak fight-readiness gains.');
    } else if (item.label === 'Sparring') {
      insights.push('Schedule sparring soon — live rounds are essential for fight readiness.');
    } else if (item.label === 'Conditioning') {
      insights.push('Log a conditioning test to benchmark your fitness and track improvement.');
    } else if (item.label === 'Nutrition') {
      insights.push('Track meals and hit 80+ oz of water daily — nutrition drives recovery speed.');
    }
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

  return { overall, status, statusColor, breakdown, insights, daysUntilFight };
}
