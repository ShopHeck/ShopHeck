import { useState } from 'react';
import { Sparkles, RefreshCw, AlertCircle, User, Zap } from 'lucide-react';
import { streamAiCoach, AiCoachError, type AiCoachErrorCode } from '../lib/aiCoach';
import AuthScreen from './AuthScreen';
import UpgradeModal from './shared/UpgradeModal';
import { format, parseISO } from 'date-fns';
import type { CutProjection } from '../utils/weightCut';
import type { FightCamp, FighterProfile, WeightEntry } from '../types';

interface Props {
  camp: FightCamp;
  user: FighterProfile | null;
  proj: CutProjection;
  entries: WeightEntry[];
}

function buildCutPrompt(camp: FightCamp, user: FighterProfile | null, proj: CutProjection, entries: WeightEntry[]): string {
  const recent = entries
    .filter(e => e.campId === camp.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  return `You are an experienced combat-sports strength & conditioning coach advising on a weight cut. Be practical, specific, and SAFETY-FIRST. Never recommend dangerous dehydration; flag medically risky cuts and say to involve a coach/doctor.

## Fighter
- ${user?.name ?? 'Athlete'} | ${camp.sport} | ${camp.weightClass} | ${user?.experienceLevel ?? 'unknown level'}

## Cut status
- Start ${proj.startWeight} lbs → target ${proj.targetWeight} lbs
- Current ${proj.currentWeight} lbs (${proj.toGo} lbs to go)
- Fight ${camp.fightDate ? format(parseISO(camp.fightDate), 'MMM d') : 'n/a'} · ${proj.daysRemaining} days out
- Pace: ${proj.status} (${proj.paceDelta > 0 ? `${proj.paceDelta} lbs behind` : `${Math.abs(proj.paceDelta)} lbs ahead of`} a steady cut)
- Need ~${proj.lbsPerDayNeeded} lbs/day${proj.trendEstablished
    ? `; averaging ${proj.lbsPerDayActual} lbs/day
- Projected weigh-in at current rate: ${proj.projectedWeighIn} lbs (${proj.projectedMiss > 0 ? `${proj.projectedMiss} lbs OVER` : 'on/under target'})`
    : `; no observed rate yet (weigh-ins don't span multiple days)`}

## Recent weigh-ins
${recent.length ? recent.map(e => `${format(parseISO(e.date), 'M/d')}: ${e.weight}lbs`).join(' · ') : 'none logged'}

Respond in under 180 words using these exact headers:
**Verdict** — one line: on track, needs adjustment, or unsafe pace.
**This week** — 2-3 concrete daily actions (training/water/sodium/food levers).
**Fight week** — the water-cut + rehydration plan in 1-2 lines.
**Watch out** — one risk to avoid.`;
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
  const [advice, setAdvice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<AiCoachErrorCode | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  async function generate() {
    setLoading(true);
    setError('');
    setErrorCode(null);
    setAdvice('');
    try {
      await streamAiCoach('cut', buildCutPrompt(camp, user, proj, entries), text => {
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
        <p className="text-sm font-bold text-white">AI Cut Coach</p>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-gray-600">Included with Pro</span>
      </div>

      {!advice && !loading && (
        <p className="text-xs text-gray-500">
          Personalised guidance to hit your weigh-in safely, based on your current pace.
        </p>
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
        {loading ? <><RefreshCw size={14} className="animate-spin" /> Analysing…</> : <><Sparkles size={14} /> {advice ? 'Regenerate' : 'Get Cut Guidance'}</>}
      </button>

      {showAuth && <AuthScreen onClose={() => setShowAuth(false)} />}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
