import type { FightResult, FightRound } from '../types';
import type { CampKpis } from './campKpis';
import { formatWeightDelta, type WeightUnit } from './units';

export interface FightAnalysis {
  /** 0..1. Used as a correlation target when tuning factor weights. */
  outcomeScore: number;
  cardioVerdict: 'held-up' | 'faded-late' | 'faded-early' | 'inconsistent';
  weightCutImpact: 'none' | 'mild' | 'severe';
  /** 0..1 — how closely the fighter executed the camp's gameplan. */
  gameplanAdherence: number;
  pressureHandling: 'dominated' | 'neutral' | 'overwhelmed';
  strengths: string[];
  weaknesses: string[];
  /** High-signal takeaways that feed both the Claude prompt and the UI. */
  campTakeaways: string[];
}

function avg(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function outcomeToScore(r: FightResult): number {
  // Dominant KO/TKO win → 1; decision loss → ~0.2; draw → 0.5.
  if (r.outcome === 'win') {
    if (r.method === 'KO' || r.method === 'TKO' || r.method === 'Submission') return 1;
    if (r.method === 'Unanimous Decision') return 0.85;
    return 0.75;
  }
  if (r.outcome === 'draw') return 0.5;
  if (r.outcome === 'no-contest') return 0.5;
  // Loss
  if (r.method === 'KO' || r.method === 'TKO' || r.method === 'Submission') return 0;
  if (r.method === 'Unanimous Decision') return 0.15;
  return 0.25;
}

function cardioVerdict(rounds: FightRound[]): FightAnalysis['cardioVerdict'] {
  if (rounds.length === 0) return 'held-up';
  if (rounds.length === 1) return rounds[0].cardio >= 3 ? 'held-up' : 'faded-early';

  const firstHalf = rounds.slice(0, Math.ceil(rounds.length / 2));
  const lastHalf = rounds.slice(Math.floor(rounds.length / 2));
  const firstAvg = avg(firstHalf.map(r => r.cardio));
  const lastAvg = avg(lastHalf.map(r => r.cardio));

  if (firstAvg < 3 && lastAvg < 3) return 'faded-early';
  if (firstAvg - lastAvg >= 1.5) return 'faded-late';
  if (Math.abs(firstAvg - lastAvg) < 0.5 && firstAvg >= 3.5) return 'held-up';
  return 'inconsistent';
}

function damageWeight(d: FightRound['damageTaken']): number {
  return { none: 0, light: 1, moderate: 2, heavy: 3 }[d];
}

export function analyzeFight(result: FightResult, kpis: CampKpis, unit: WeightUnit = 'lbs'): FightAnalysis {
  const rounds = [...result.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  const outcomeScore = outcomeToScore(result);
  const cardio = cardioVerdict(rounds);
  const gameplanAdherence = result.stylePlanFollowed / 5;

  const avgPressure = avg(rounds.map(r => r.opponentPressure));
  const pressureHandling: FightAnalysis['pressureHandling'] =
    avgPressure >= 4 ? 'overwhelmed' :
    avgPressure <= 2 ? 'dominated' : 'neutral';

  // Weight-cut impact: if we cut ≥3 lbs in the last week AND round-1 cardio was poor → severe.
  let weightCutImpact: FightAnalysis['weightCutImpact'] = 'none';
  const round1Cardio = rounds[0]?.cardio ?? 5;
  if (kpis.weightCutLbs >= 3 && round1Cardio <= 2) weightCutImpact = 'severe';
  else if (kpis.weightCutPaceLbsPerWeek >= 2 && round1Cardio <= 3) weightCutImpact = 'mild';

  // Strengths: aggregate "workedWell" notes + rounds with selfScore ≥ 4.
  const strengths: string[] = [];
  const strongRounds = rounds.filter(r => r.selfScore >= 4);
  if (strongRounds.length >= Math.ceil(rounds.length / 2)) {
    strengths.push(`Consistently high performance (${strongRounds.length}/${rounds.length} rounds at 4+ self-score)`);
  }
  const workedNotes = rounds
    .map(r => r.workedWell.trim())
    .filter(Boolean)
    .slice(0, 3);
  strengths.push(...workedNotes.map(n => `What worked: ${n}`));
  if (cardio === 'held-up') strengths.push('Cardio held through the fight');
  if (result.outcome === 'win' && (result.method === 'KO' || result.method === 'TKO' || result.method === 'Submission')) {
    strengths.push('Finished the fight — power/technique translated');
  }

  // Weaknesses: damage taken + didntWork notes + cardio/pressure issues.
  const weaknesses: string[] = [];
  const heavyDamageRounds = rounds.filter(r => damageWeight(r.damageTaken) >= 2);
  if (heavyDamageRounds.length > 0) {
    weaknesses.push(`Absorbed moderate+ damage in ${heavyDamageRounds.length} round${heavyDamageRounds.length > 1 ? 's' : ''}`);
  }
  const didntNotes = rounds
    .map(r => r.didntWork.trim())
    .filter(Boolean)
    .slice(0, 3);
  weaknesses.push(...didntNotes.map(n => `Didn't work: ${n}`));
  if (cardio === 'faded-late') weaknesses.push('Gassed late — cardio wasn\'t fight-ready');
  if (cardio === 'faded-early') weaknesses.push('Came out flat — possibly overtrained or weight-cut drained');
  if (pressureHandling === 'overwhelmed') weaknesses.push('Struggled under opponent\'s pressure');
  if (weightCutImpact === 'severe') weaknesses.push('Weight cut compromised round-1 output');

  // Camp takeaways — link fight outcome back to camp metrics.
  const campTakeaways: string[] = [];
  if (cardio === 'faded-late' && kpis.sparringRoundsTotal < 40) {
    campTakeaways.push(`Low sparring volume (${kpis.sparringRoundsTotal} rounds) correlates with late-round fade — increase live rounds next camp.`);
  }
  if (pressureHandling === 'overwhelmed' && kpis.sparringSessionsCount < 8) {
    campTakeaways.push(`Only ${kpis.sparringSessionsCount} sparring sessions — more varied partners needed to handle pressure.`);
  }
  if (weightCutImpact === 'severe') {
    campTakeaways.push(`Weight-cut pace of ${formatWeightDelta(kpis.weightCutPaceLbsPerWeek, unit)}/wk was too aggressive — start cut earlier next camp.`);
  }
  // `null` adherence means there was no schedule to score against, which is not
  // evidence of missed sessions — stay silent rather than inventing a finding.
  if (kpis.adherence !== null && kpis.adherence < 0.7) {
    campTakeaways.push(`Only ${Math.round(kpis.adherence * 100)}% schedule adherence — missed sessions show up on fight night.`);
  }
  if (kpis.conditioningDelta !== null && kpis.conditioningDelta < 0 && cardio !== 'held-up') {
    campTakeaways.push('Conditioning tests declined across camp and cardio struggled — rebuild aerobic base earlier.');
  }
  if (result.outcome === 'win' && kpis.adherence !== null && kpis.adherence >= 0.8 && cardio === 'held-up') {
    campTakeaways.push(`Strong adherence (${Math.round(kpis.adherence * 100)}%) + cardio held — this camp blueprint worked.`);
  }

  return {
    outcomeScore,
    cardioVerdict: cardio,
    weightCutImpact,
    gameplanAdherence,
    pressureHandling,
    strengths: strengths.slice(0, 5),
    weaknesses: weaknesses.slice(0, 5),
    campTakeaways,
  };
}
