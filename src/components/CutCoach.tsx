import { useState } from 'react';
import { Sparkles, RefreshCw, AlertCircle, User, Zap } from 'lucide-react';
import { streamAiCoach, AiCoachError, type AiCoachErrorCode } from '../lib/aiCoach';
import AuthScreen from './AuthScreen';
import UpgradeModal from './shared/UpgradeModal';
import { format, parseISO } from 'date-fns';
import { cutPhase, type CutPhase, type CutProjection } from '../utils/weightCut';
import type { FightCamp, FighterProfile, WeightEntry } from '../types';
import { useWeightUnit } from '../hooks/useWeightUnit';
import { toDisplayWeight, formatWeight, formatWeightDelta, type WeightUnit } from '../utils/units';

const PHASE_COPY: Record<CutPhase, { title: string; blurb: string; cta: string }> = {
  cut: {
    title: 'AI Cut Coach',
    blurb: 'Personalised guidance to hit your weigh-in safely, based on your current pace.',
    cta: 'Get Cut Guidance',
  },
  hold: {
    title: 'AI Cut Coach',
    blurb: 'You are at or under target. Guidance on holding it there without stalling your training — tick "official weigh-in" when you log the real one and this switches to rehydration.',
    cta: 'Get Hold Plan',
  },
  rehydrate: {
    title: 'AI Fight Week Coach',
    blurb: 'You made weight. Guidance on rehydrating and refuelling between the scale and the first bell.',
    cta: 'Get Rehydration Plan',
  },
};

interface Props {
  camp: FightCamp;
  user: FighterProfile | null;
  proj: CutProjection;
  entries: WeightEntry[];
}

function buildCutPrompt(camp: FightCamp, user: FighterProfile | null, proj: CutProjection, entries: WeightEntry[], unit: WeightUnit): string {
  const recent = entries
    .filter(e => e.campId === camp.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  return `You are an experienced combat-sports strength & conditioning coach advising on a weight cut. Be practical, specific, and SAFETY-FIRST. Never recommend dangerous dehydration; flag medically risky cuts and say to involve a coach/doctor.

## Fighter
- ${user?.name ?? 'Athlete'} | ${camp.sport} | ${camp.weightClass} | ${user?.experienceLevel ?? 'unknown level'}

## Cut status
- Start ${formatWeight(proj.startWeight, unit)} → target ${formatWeight(proj.targetWeight, unit)}
- Current ${formatWeight(proj.currentWeight, unit)} (${formatWeightDelta(proj.toGo, unit)} to go)
- Fight ${camp.fightDate ? format(parseISO(camp.fightDate), 'MMM d') : 'n/a'} · ${proj.daysRemaining} days out
- Pace: ${proj.status} (${proj.paceDelta > 0 ? `${formatWeightDelta(proj.paceDelta, unit)} behind` : `${formatWeightDelta(proj.paceDelta, unit)} ahead of`} a steady cut)
- Need ~${toDisplayWeight(proj.lbsPerDayNeeded, unit)} ${unit}/day${proj.trendEstablished
    ? `; averaging ${toDisplayWeight(proj.lbsPerDayActual, unit)} ${unit}/day
- Projected weigh-in at current rate: ${formatWeight(proj.projectedWeighIn, unit)} (${proj.projectedMiss > 0 ? `${formatWeightDelta(proj.projectedMiss, unit)} OVER` : 'on/under target'})`
    : `; no observed rate yet (weigh-ins don't span multiple days)`}

## Recent weigh-ins
${recent.length ? recent.map(e => `${format(parseISO(e.date), 'M/d')}: ${toDisplayWeight(e.weight, unit)}${unit}`).join(' · ') : 'none logged'}

Respond in under 180 words using these exact headers:
**Verdict** — one line: on track, needs adjustment, or unsafe pace.
**This week** — 2-3 concrete daily actions (training/water/sodium/food levers).
**Fight week** — the water-cut + rehydration plan in 1-2 lines.
**Watch out** — one risk to avoid.`;
}

/**
 * "On weight, still weeks out." The risk here is the opposite of a cut's — a
 * fighter who hit target early and now under-eats through the hardest training
 * block of the camp, arriving at the scale on time and empty.
 */
function buildHoldPrompt(camp: FightCamp, user: FighterProfile | null, proj: CutProjection, unit: WeightUnit): string {
  return `You are an experienced combat-sports strength & conditioning coach. This fighter is ALREADY at or under their target weight, with time still to run. Advise on holding weight without compromising training quality. Be practical and SAFETY-FIRST — never recommend prolonged under-eating or chronic dehydration, and say to involve a coach/doctor if weight is being held by starving.

## Fighter
- ${user?.name ?? 'Athlete'} | ${camp.sport} | ${camp.weightClass} | ${user?.experienceLevel ?? 'unknown level'}

## Status
- Target ${formatWeight(proj.targetWeight, unit)}; currently ${formatWeight(proj.currentWeight, unit)} (${formatWeightDelta(Math.abs(proj.toGo), unit)} under)
- Fight ${camp.fightDate ? format(parseISO(camp.fightDate), 'MMM d') : 'n/a'} · ${proj.daysRemaining} days out
- Started camp at ${formatWeight(proj.startWeight, unit)}

Respond in under 180 words using these exact headers:
**Verdict** — one line: is holding here safe, or is this fighter too light too early?
**This block** — 2-3 concrete actions to train hard while staying on weight.
**Fight week** — what changes in the last 7 days, in 1-2 lines.
**Watch out** — one risk to avoid.`;
}

/**
 * "Made weight, fight is days away." The single highest-leverage window in a
 * camp, and the one the app used to go quiet for.
 */
function buildRehydratePrompt(camp: FightCamp, user: FighterProfile | null, proj: CutProjection, unit: WeightUnit): string {
  const cutSize = Math.max(0, proj.startWeight - proj.targetWeight);

  return `You are an experienced combat-sports strength & conditioning coach advising on REHYDRATION AND REFUELLING after a made weight cut. Be practical, specific, and SAFETY-FIRST: warn against aggressive fluid loading, and say to involve a coach/doctor if the fighter shows signs of a severe cut (cramping, dizziness, dark urine, no urine).

## Fighter
- ${user?.name ?? 'Athlete'} | ${camp.sport} | ${camp.weightClass} | ${user?.experienceLevel ?? 'unknown level'}
- Fight format: ${camp.rounds} × ${camp.roundDuration} min rounds

## Cut just completed (fighter has confirmed the official weigh-in)
- ${formatWeight(proj.startWeight, unit)} → ${formatWeight(proj.targetWeight, unit)} over the camp (${formatWeightDelta(cutSize, unit)} total)
- On the scale now at ${formatWeight(proj.currentWeight, unit)}
- Fight ${camp.fightDate ? format(parseISO(camp.fightDate), 'MMM d') : 'n/a'} · ${proj.daysRemaining} day${proj.daysRemaining === 1 ? '' : 's'} out

Respond in under 180 words using these exact headers:
**Verdict** — one line: how much weight is realistic to put back on before the bell, given the time left.
**First 4 hours** — fluids, electrolytes and food immediately after the scale, in 2-3 concrete steps.
**Fight day** — what to eat and drink on the day, and how late to stop.
**Watch out** — one rehydration risk to avoid.`;
}

function buildPrompt(
  phase: CutPhase,
  camp: FightCamp,
  user: FighterProfile | null,
  proj: CutProjection,
  entries: WeightEntry[],
  unit: WeightUnit,
): string {
  if (phase === 'rehydrate') return buildRehydratePrompt(camp, user, proj, unit);
  if (phase === 'hold') return buildHoldPrompt(camp, user, proj, unit);
  return buildCutPrompt(camp, user, proj, entries, unit);
}

function render(text: string) {
  return text.split('\n').map((line, i) => {
    const header = line.match(/^\*\*(.+?)\*\*/);
    if (header) {
      const rest = line.replace(/^\*\*(.+?)\*\*/, '').trim();
      return (
        <p key={i} className="mt-3 mb-1">
          <span className="text-brand-400 font-bold text-sm uppercase tracking-wide">{header[1]}</span>
          {rest && <span className="text-gray-300 text-sm"> {rest.replace(/^—\s*/, '')}</span>}
        </p>
      );
    }
    if (!line.trim()) return <div key={i} className="h-1" />;
    return <p key={i} className="text-gray-300 text-sm leading-relaxed">{line}</p>;
  });
}

export default function CutCoach({ camp, user, proj, entries }: Props) {
  const unit = useWeightUnit();
  const phase = cutPhase(proj);
  const copy = PHASE_COPY[phase];
  const [advice, setAdvice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<AiCoachErrorCode | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  // Logging the weigh-in that makes weight changes the question this panel is
  // answering. Without this, cut advice generated an hour ago would sit under
  // a "Fight Week Coach" heading telling the fighter to keep losing.
  const [lastPhase, setLastPhase] = useState(phase);
  if (lastPhase !== phase) {
    setLastPhase(phase);
    setAdvice('');
    setError('');
    setErrorCode(null);
  }

  async function generate() {
    setLoading(true);
    setError('');
    setErrorCode(null);
    setAdvice('');
    try {
      // Still the `cut` feature server-side: same Fighter Pro gate, same token
      // budget, same safety framing. Only the question changes.
      await streamAiCoach('cut', buildPrompt(phase, camp, user, proj, entries, unit), text => {
        setAdvice(prev => prev + text);
      });
    } catch (e) {
      if (e instanceof AiCoachError) {
        setError(e.message);
        setErrorCode(e.code);
      } else {
        setError('Failed to generate guidance. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-brand-400" />
        <p className="text-sm font-bold text-white">{copy.title}</p>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-gray-450">Included with Pro</span>
      </div>

      {!advice && !loading && (
        <p className="text-xs text-gray-400">{copy.blurb}</p>
      )}
      {advice && <div>{render(advice)}</div>}
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle size={12} /> {error}</p>
      )}
      {errorCode === 'signin_required' && (
        <button onClick={() => setShowAuth(true)} className="btn-secondary w-full text-sm flex items-center justify-center gap-2">
          <User size={14} /> Sign in
        </button>
      )}
      {errorCode === 'upgrade_required' && (
        <button onClick={() => setShowUpgrade(true)} className="btn-secondary w-full text-sm flex items-center justify-center gap-2">
          <Zap size={14} /> Unlock with Fighter Pro
        </button>
      )}
      <button
        onClick={generate}
        disabled={loading}
        className="btn-primary w-full text-sm flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {loading ? <><RefreshCw size={14} className="animate-spin" /> Analysing…</> : <><Sparkles size={14} /> {advice ? 'Regenerate' : copy.cta}</>}
      </button>

      {showAuth && <AuthScreen onClose={() => setShowAuth(false)} />}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
