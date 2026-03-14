import { differenceInDays, parseISO, subDays } from 'date-fns';
import type { AppState } from '../types';

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
  } = state;

  if (!activeCamp) return null;

  const now = new Date();
  const fightDate = parseISO(activeCamp.fightDate);
  const campStart = parseISO(activeCamp.startDate);
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

  // ── 1. Weight Cut (20 pts) ───────────────────────────────────────────────
  const latestWeight = campWeights[campWeights.length - 1];
  const currentW = latestWeight ? latestWeight.weight : activeCamp.currentWeight;
  const targetW = activeCamp.targetWeight;
  const lbsToGo = Math.max(0, currentW - targetW);

  let weightScore: number;
  let weightDetail: string;
  if (!latestWeight) {
    weightScore = 10;
    weightDetail = 'No weigh-ins logged yet';
  } else if (lbsToGo <= 0) {
    weightScore = 20;
    weightDetail = 'At or below fight weight ✓';
  } else {
    const pace = lbsToGo / daysUntilFight;
    if (pace <= 0.3)      { weightScore = 18; weightDetail = `${lbsToGo.toFixed(1)} lbs to go — comfortable pace`; }
    else if (pace <= 0.5) { weightScore = 14; weightDetail = `${lbsToGo.toFixed(1)} lbs to go — manageable`; }
    else if (pace <= 0.8) { weightScore = 9;  weightDetail = `${lbsToGo.toFixed(1)} lbs to go — tight timeline`; }
    else if (pace <= 1.2) { weightScore = 4;  weightDetail = `${lbsToGo.toFixed(1)} lbs to go — very difficult`; }
    else                  { weightScore = 1;  weightDetail = `${lbsToGo.toFixed(1)} lbs to go — critical`; }
  }

  // ── 2. Training Volume (25 pts) ─────────────────────────────────────────
  // Expected sessions based on average 4.5/week and how far into camp we are
  const expectedSessions = Math.max(1, Math.round(campProgress * activeCamp.campWeeks * 4.5));
  const totalLogged = campWorkouts.length;
  const volumeRatio = Math.min(1, totalLogged / expectedSessions);
  const volumeScore = Math.round(volumeRatio * 25);
  const gap = Math.max(0, expectedSessions - totalLogged);
  const volumeDetail = gap > 0
    ? `${totalLogged} logged · ${gap} behind pace`
    : `${totalLogged} sessions logged · on pace`;

  // ── 3. Session Quality / RPE (15 pts) ───────────────────────────────────
  const recentRPEs = recentWorkouts.map(w => w.rpe).filter(r => r > 0);
  let qualityScore: number;
  let qualityDetail: string;
  if (recentRPEs.length === 0) {
    qualityScore = 8;
    qualityDetail = 'Log sessions with RPE to score this';
  } else {
    const avg = recentRPEs.reduce((a, b) => a + b, 0) / recentRPEs.length;
    if (avg >= 7 && avg <= 8.5)   { qualityScore = 15; qualityDetail = `Avg RPE ${avg.toFixed(1)} — ideal intensity`; }
    else if (avg >= 6 && avg < 7) { qualityScore = 11; qualityDetail = `Avg RPE ${avg.toFixed(1)} — could push harder`; }
    else if (avg > 8.5 && avg <= 9.5) { qualityScore = 10; qualityDetail = `Avg RPE ${avg.toFixed(1)} — monitor recovery`; }
    else if (avg < 6)             { qualityScore = 5;  qualityDetail = `Avg RPE ${avg.toFixed(1)} — intensity too low`; }
    else                          { qualityScore = 7;  qualityDetail = `Avg RPE ${avg.toFixed(1)} — overtraining risk`; }
  }

  // ── 4. Sparring (20 pts) ────────────────────────────────────────────────
  const sortedSpar = [...campSparring].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const lastSpar = sortedSpar[0];
  const daysSinceSpar = lastSpar
    ? Math.max(0, differenceInDays(now, parseISO(lastSpar.date)))
    : 999;
  const totalSparRounds = campSparring.reduce((sum, s) => sum + s.rounds, 0);

  let sparScore: number;
  let sparDetail: string;
  if (campSparring.length === 0) {
    sparScore = 0;
    sparDetail = 'No sparring logged yet';
  } else {
    const base = Math.min(15, campSparring.length * 3);
    const recency = daysSinceSpar <= 7 ? 5 : daysSinceSpar <= 14 ? 2 : daysSinceSpar > 21 ? -3 : 0;
    sparScore = Math.max(0, Math.min(20, base + recency));
    sparDetail = `${campSparring.length} session${campSparring.length > 1 ? 's' : ''} · ${totalSparRounds} rounds · last ${daysSinceSpar}d ago`;
  }

  // ── 5. Conditioning (10 pts) ────────────────────────────────────────────
  let condScore: number;
  let condDetail: string;
  if (campTests.length === 0) {
    condScore = 5;
    condDetail = 'Log a test to benchmark fitness';
  } else if (campTests.length === 1) {
    condScore = 7;
    condDetail = `${campTests[0].testType}: ${campTests[0].value} ${campTests[0].unit}`;
  } else {
    const first = campTests[0].value;
    const last = campTests[campTests.length - 1].value;
    const pct = ((last - first) / Math.abs(Math.max(1, first))) * 100;
    if (pct > 2)        { condScore = 10; condDetail = `${campTests[0].testType} improving ↑`; }
    else if (pct >= -2) { condScore = 7;  condDetail = `${campTests[0].testType} stable`; }
    else                { condScore = 4;  condDetail = `${campTests[0].testType} declining ↓`; }
  }

  // ── 6. Nutrition & Recovery (10 pts) ────────────────────────────────────
  const recentNutrition = nutritionLogs.filter(
    n => n.campId === activeCamp.id && parseISO(n.date) >= recent7
  );
  let nutritionScore: number;
  let nutritionDetail: string;
  if (recentNutrition.length === 0) {
    nutritionScore = 5;
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
    const mealScore = mealTotal > 0 ? (mealPts / mealTotal) * 5 : 2.5;
    const waterScore = (goodHydration / recentNutrition.length) * 5;
    nutritionScore = Math.min(10, Math.round(mealScore + waterScore));
    const hydPct = Math.round((goodHydration / recentNutrition.length) * 100);
    nutritionDetail = `${hydPct}% hydration days · ${recentNutrition.length}d tracked`;
  }

  // ── Overall ─────────────────────────────────────────────────────────────
  const overall = Math.min(
    100,
    weightScore + volumeScore + qualityScore + sparScore + condScore + nutritionScore
  );

  const breakdown: ReadinessBreakdownItem[] = [
    { label: 'Weight Cut',      score: weightScore,    max: 20, detail: weightDetail,    icon: 'scale' },
    { label: 'Training Volume', score: volumeScore,    max: 25, detail: volumeDetail,    icon: 'activity' },
    { label: 'Session Quality', score: qualityScore,   max: 15, detail: qualityDetail,   icon: 'flame' },
    { label: 'Sparring',        score: sparScore,      max: 20, detail: sparDetail,       icon: 'zap' },
    { label: 'Conditioning',    score: condScore,      max: 10, detail: condDetail,       icon: 'timer' },
    { label: 'Nutrition',       score: nutritionScore, max: 10, detail: nutritionDetail,  icon: 'droplets' },
  ];

  // ── Insights (flag weakest areas) ───────────────────────────────────────
  const insights: string[] = [];
  const byRatio = [...breakdown].sort((a, b) => a.score / a.max - b.score / b.max);
  for (const item of byRatio.slice(0, 3)) {
    if (item.score / item.max >= 0.75) continue;
    if (item.label === 'Weight Cut' && lbsToGo > 0) {
      insights.push(`Log your weight daily — you need to cut ${lbsToGo.toFixed(1)} lbs in ${daysUntilFight} days.`);
    } else if (item.label === 'Training Volume') {
      insights.push(`You're ${gap} session${gap > 1 ? 's' : ''} behind pace — push consistency this week.`);
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
