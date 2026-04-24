import type { CampFactorWeights, FightResult } from '../types';
import { DEFAULT_FACTOR_WEIGHTS } from '../types';
import type { CampKpis } from './campKpis';
import type { FightAnalysis } from './fightAnalysis';

type ScoredKey = 'weightCut' | 'trainingVolume' | 'sessionQuality' | 'sparring' | 'conditioning' | 'nutrition';
const SCORED_KEYS: ScoredKey[] = ['weightCut', 'trainingVolume', 'sessionQuality', 'sparring', 'conditioning', 'nutrition'];

const MAX_DRIFT_PCT = 0.20; // Hard cap: no factor may drift more than ±20% from its default.
const DEFAULTS_SUM = Object.values(DEFAULT_FACTOR_WEIGHTS).reduce((a, b) => a + b, 0); // 100

export interface WeightProposal {
  next: CampFactorWeights;
  diff: Record<ScoredKey, number>;
  rationale: string[];
}

export function proposeFactorWeights(
  prev: CampFactorWeights | undefined,
  fight: FightResult,
  kpis: CampKpis,
  analysis: FightAnalysis,
): WeightProposal {
  const base: Record<ScoredKey, number> = {
    weightCut: prev?.weightCut ?? DEFAULT_FACTOR_WEIGHTS.weightCut,
    trainingVolume: prev?.trainingVolume ?? DEFAULT_FACTOR_WEIGHTS.trainingVolume,
    sessionQuality: prev?.sessionQuality ?? DEFAULT_FACTOR_WEIGHTS.sessionQuality,
    sparring: prev?.sparring ?? DEFAULT_FACTOR_WEIGHTS.sparring,
    conditioning: prev?.conditioning ?? DEFAULT_FACTOR_WEIGHTS.conditioning,
    nutrition: prev?.nutrition ?? DEFAULT_FACTOR_WEIGHTS.nutrition,
  };

  const nudges: Record<ScoredKey, number> = {
    weightCut: 0, trainingVolume: 0, sessionQuality: 0, sparring: 0, conditioning: 0, nutrition: 0,
  };
  const rationale: string[] = [];

  // ── Rules ────────────────────────────────────────────────────────────
  if (analysis.weightCutImpact === 'severe') {
    nudges.weightCut += 3;
    rationale.push('Severe weight-cut impact on fight performance → weightCut +3');
  } else if (analysis.weightCutImpact === 'mild') {
    nudges.weightCut += 1;
    rationale.push('Mild weight-cut impact detected → weightCut +1');
  }

  if (analysis.cardioVerdict === 'faded-late') {
    nudges.sparring += 2;
    nudges.conditioning += 2;
    rationale.push('Faded in late rounds → sparring +2, conditioning +2');
  } else if (analysis.cardioVerdict === 'faded-early') {
    nudges.conditioning += 2;
    nudges.sessionQuality -= 1;
    rationale.push('Came out flat → conditioning +2, reduce peak-RPE emphasis');
  } else if (analysis.cardioVerdict === 'held-up' && fight.outcome === 'win') {
    // Camp worked, nudge toward defaults by small amount only.
    rationale.push('Cardio held + win → lock in current weights');
  }

  if (analysis.pressureHandling === 'overwhelmed') {
    nudges.sparring += 2;
    rationale.push('Struggled under pressure → sparring +2 (prioritise live rounds & varied partners)');
  }

  if (kpis.adherence < 0.7) {
    nudges.trainingVolume += 2;
    rationale.push(`Schedule adherence ${Math.round(kpis.adherence * 100)}% → trainingVolume weight raised`);
  } else if (kpis.adherence >= 0.9 && fight.outcome === 'win') {
    nudges.trainingVolume -= 1;
    rationale.push('High adherence already — redistribute weight toward weaker factors');
  }

  // Damage taken ties to session quality / defensive sharpness.
  const heavyDamageRounds = fight.rounds.filter(r => r.damageTaken === 'moderate' || r.damageTaken === 'heavy').length;
  if (heavyDamageRounds >= 2) {
    nudges.sessionQuality += 1;
    rationale.push('Took heavy damage across multiple rounds → sessionQuality +1 (defensive drilling focus)');
  }

  // Nutrition rule: if weight cut was rough AND nutrition adherence low, nudge nutrition up.
  if (analysis.weightCutImpact !== 'none' && kpis.nutritionAdherence < 0.5) {
    nudges.nutrition += 1;
    rationale.push('Nutrition logging was sparse during a tough cut → nutrition +1');
  }

  // Apply nudges with ±20% drift cap vs defaults.
  const capped: Record<ScoredKey, number> = { ...base };
  for (const k of SCORED_KEYS) {
    const def = DEFAULT_FACTOR_WEIGHTS[k];
    const minV = def * (1 - MAX_DRIFT_PCT);
    const maxV = def * (1 + MAX_DRIFT_PCT);
    capped[k] = Math.max(minV, Math.min(maxV, base[k] + nudges[k]));
  }

  // Renormalize so the six scored weights sum to 100, preserving ratios post-cap.
  const sum = SCORED_KEYS.reduce((s, k) => s + capped[k], 0);
  const scale = DEFAULTS_SUM / sum;
  const normalized: Record<ScoredKey, number> = {
    weightCut: 0, trainingVolume: 0, sessionQuality: 0, sparring: 0, conditioning: 0, nutrition: 0,
  };
  for (const k of SCORED_KEYS) {
    normalized[k] = Math.round(capped[k] * scale);
  }
  // Fix rounding drift so sum is exactly 100.
  const normSum = SCORED_KEYS.reduce((s, k) => s + normalized[k], 0);
  if (normSum !== DEFAULTS_SUM) {
    // Add the remainder to the largest factor.
    const biggest = SCORED_KEYS.reduce<ScoredKey>((a, b) => normalized[a] >= normalized[b] ? a : b, 'trainingVolume');
    normalized[biggest] += DEFAULTS_SUM - normSum;
  }

  // Derive sparringRoundsTarget + conditioning focus from the verdict.
  let sparringRoundsTarget = prev?.sparringRoundsTarget;
  if (analysis.cardioVerdict === 'faded-late') {
    const baseline = sparringRoundsTarget ?? Math.max(60, kpis.sparringRoundsTotal);
    sparringRoundsTarget = Math.round(baseline * 1.25);
  } else if (analysis.cardioVerdict === 'held-up' && fight.outcome === 'win') {
    sparringRoundsTarget = sparringRoundsTarget ?? kpis.sparringRoundsTotal;
  }

  let conditioningFocus: CampFactorWeights['conditioningFocus'] = prev?.conditioningFocus;
  if (analysis.cardioVerdict === 'faded-late') conditioningFocus = 'aerobic';
  else if (analysis.cardioVerdict === 'faded-early') conditioningFocus = 'mixed';

  const strengthEmphasis: CampFactorWeights['strengthEmphasis'] = prev?.strengthEmphasis ?? 'normal';

  const next: CampFactorWeights = {
    weightCut: normalized.weightCut,
    trainingVolume: normalized.trainingVolume,
    sessionQuality: normalized.sessionQuality,
    sparring: normalized.sparring,
    conditioning: normalized.conditioning,
    nutrition: normalized.nutrition,
    sparringRoundsTarget,
    conditioningFocus,
    strengthEmphasis,
    updatedAt: new Date().toISOString(),
    derivedFromFightId: fight.id,
  };

  const diff: Record<ScoredKey, number> = {
    weightCut: normalized.weightCut - base.weightCut,
    trainingVolume: normalized.trainingVolume - base.trainingVolume,
    sessionQuality: normalized.sessionQuality - base.sessionQuality,
    sparring: normalized.sparring - base.sparring,
    conditioning: normalized.conditioning - base.conditioning,
    nutrition: normalized.nutrition - base.nutrition,
  };

  return { next, diff, rationale };
}
