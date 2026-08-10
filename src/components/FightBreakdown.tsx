import { useMemo, useState } from 'react';
import { ChevronLeft, Trophy, XCircle, Minus, TrendingUp, TrendingDown, Target, Zap, Scale, Flame, Activity, Trash2, Pencil, Share2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { triggerHaptic, HAPTIC } from '../hooks/useHaptics';
import { format, parseISO } from 'date-fns';
import { computeCampKpis } from '../utils/campKpis';
import { analyzeFight } from '../utils/fightAnalysis';
import { proposeFactorWeights } from '../utils/factorTuner';
import PostFightInsights from './PostFightInsights';
import ProGate from './shared/ProGate';
import ShareCard, { type MilestoneShare } from './ShareCard';
import ConfirmDialog from './shared/ConfirmDialog';
import { formatWeightDelta } from '../utils/units';

// Fight results are the most shareable artifact in combat sports; the card
// headline states the outcome plainly (a loss shared is a comeback story, not
// a boast — the copy stays respectful).
const SHARE_META = {
  win: { title: 'VICTORY' },
  loss: { title: 'LESSONS TAKEN' },
  draw: { title: 'DRAW' },
  'no-contest': { title: 'NO CONTEST' },
} as const;

interface Props {
  fightId: string;
  onBack: () => void;
  onEdit: (fightId: string) => void;
}

// Raw engine values never reach the UI — every enum gets display copy.
const CARDIO_LABELS = {
  'held-up': 'Held up',
  'faded-late': 'Faded late',
  'faded-early': 'Faded early',
  inconsistent: 'Inconsistent',
} as const;

const CUT_IMPACT_LABELS = {
  none: 'No impact',
  mild: 'Mild impact',
  severe: 'Severe impact',
} as const;

const PRESSURE_LABELS = {
  dominated: 'Dominated',
  neutral: 'Held ground',
  overwhelmed: 'Overwhelmed',
} as const;

const HRV_TREND_LABELS = {
  improving: 'Improving',
  stable: 'Stable',
  declining: 'Declining',
  'no-data': '—',
} as const;

const FACTOR_LABELS = {
  weightCut: 'Weight cut',
  trainingVolume: 'Training volume',
  sessionQuality: 'Session quality',
  sparring: 'Sparring',
  conditioning: 'Conditioning',
  nutrition: 'Nutrition',
} as const;

const OUTCOME_LABELS = {
  win: 'Win',
  loss: 'Loss',
  draw: 'Draw',
  'no-contest': 'No Contest',
} as const;

const OUTCOME_ICON = {
  win: Trophy,
  loss: XCircle,
  draw: Minus,
  'no-contest': Minus,
} as const;

const OUTCOME_COLOR = {
  win: 'text-green-400 bg-green-900/30 border-green-800',
  loss: 'text-red-400 bg-red-900/30 border-red-800',
  draw: 'text-yellow-400 bg-yellow-900/30 border-yellow-800',
  'no-contest': 'text-gray-400 bg-gray-800 border-gray-600',
} as const;

export default function FightBreakdown({ fightId, onBack, onEdit }: Props) {
  const { state, dispatch } = useApp();
  const unit = state.dashboardPrefs?.weightUnit ?? 'lbs';
  const fight = state.fightResults.find(r => r.id === fightId);
  const camp = fight ? state.camps.find(c => c.id === fight.campId) : undefined;
  const fighter = fight ? (state.fighters.find(f => f.id === fight.fighterId) ?? state.currentUser) : state.currentUser;
  const [shareMilestone, setShareMilestone] = useState<MilestoneShare | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const { kpis, analysis, proposal } = useMemo(() => {
    if (!fight || !camp) return { kpis: null, analysis: null, proposal: null };
    const k = computeCampKpis(state, camp.id, fight);
    const a = analyzeFight(fight, k, unit);
    const p = proposeFactorWeights(fighter?.factorWeights, fight, k, a);
    return { kpis: k, analysis: a, proposal: p };
  }, [fight, camp, state, fighter, unit]);

  if (!fight || !camp || !kpis || !analysis || !proposal) {
    return (
      <div className="mx-4 mt-10 text-center text-gray-400">
        Fight result not found.
        <button onClick={onBack} className="btn-secondary mt-4 mx-auto block">Back</button>
      </div>
    );
  }

  // Stable narrowed locals so closures don't lose narrowing.
  const fightRef = fight;
  const proposalRef = proposal;
  const fighterRef = fighter;

  const Icon = OUTCOME_ICON[fightRef.outcome];
  const chipColor = OUTCOME_COLOR[fightRef.outcome];

  function applyWeights() {
    if (!fighterRef || !proposalRef) return;
    triggerHaptic(HAPTIC.sessionComplete);
    dispatch({
      type: 'APPLY_FACTOR_WEIGHTS',
      payload: { fighterId: fighterRef.id, weights: proposalRef.next },
    });
  }

  function deleteResult() {
    dispatch({ type: 'DELETE_FIGHT_RESULT', payload: fightRef.id });
    onBack();
  }

  const alreadyApplied = fighterRef?.factorWeights?.derivedFromFightId === fightRef.id;

  function shareResult() {
    const meta = SHARE_META[fightRef.outcome];
    const opponent = fightRef.opponent || 'Opponent';
    const method = `${fightRef.method}${fightRef.roundStopped ? ` · R${fightRef.roundStopped}` : ''}`;
    setShareMilestone({
      title: meta.title,
      subtitle: `${method} · vs ${opponent}`,
      slug: `fight-${fightRef.outcome}`,
      // The outcome is the headline; the round it ended in is the only figure
      // a fight card has, and only when it ended early.
      headline: meta.title,
      descriptor: `vs ${opponent}`,
      statValue: fightRef.roundStopped ? String(fightRef.roundStopped) : undefined,
      statLabel: fightRef.roundStopped ? 'Round' : undefined,
      footnote: method,
    });
  }

  return (
    <div className="pb-8">
      {confirmingDelete && (
        <ConfirmDialog
          title="Delete fight result?"
          message="The result, round scores and breakdown for this fight will be removed. This cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={() => { setConfirmingDelete(false); deleteResult(); }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
      {shareMilestone && fighterRef && (
        <ShareCard
          content={{ kind: 'milestone', milestone: shareMilestone }}
          user={fighterRef}
          onClose={() => setShareMilestone(null)}
        />
      )}
      {/* Header */}
      <div className="mx-4 mt-4 flex items-center gap-3">
        <button onClick={onBack} aria-label="Go back" className="text-gray-400 hover:text-white p-3 -m-2">
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1">
          <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Fight Breakdown</p>
          <p className="text-white font-bold truncate">vs {fight.opponent || 'Opponent'} · {format(parseISO(fight.fightDate), 'MMM d, yyyy')}</p>
        </div>
        {fighterRef && (
          <button onClick={shareResult} className="text-gray-400 hover:text-brand-400 p-3 -m-2" aria-label="Share result">
            <Share2 size={18} />
          </button>
        )}
        <button onClick={() => onEdit(fight.id)} className="text-gray-400 hover:text-white p-3 -m-2" aria-label="Edit">
          <Pencil size={18} />
        </button>
        <button onClick={() => setConfirmingDelete(true)} className="text-gray-400 hover:text-red-400 p-3 -m-2" aria-label="Delete">
          <Trash2 size={18} />
        </button>
      </div>

      {/* Outcome card */}
      <div className="mx-4 mt-4 card flex items-center gap-4">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${chipColor}`}>
          <Icon size={28} />
        </div>
        <div className="flex-1">
          <p className={`text-xs font-bold uppercase tracking-wider ${fight.outcome === 'win' ? 'text-green-400' : fight.outcome === 'loss' ? 'text-red-400' : 'text-yellow-400'}`}>
            {OUTCOME_LABELS[fight.outcome]}
          </p>
          <p className="text-white font-bold text-lg">{fight.method}{fight.roundStopped ? ` (R${fight.roundStopped})` : ''}</p>
          <p className="text-xs text-gray-400">
            {fight.totalRounds} rounds planned · style plan {fight.stylePlanFollowed}/5
          </p>
        </div>
      </div>

      {/* Rules-engine verdict */}
      <div className="mx-4 mt-4 grid grid-cols-2 gap-2">
        <VerdictTile icon={Activity} label="Cardio" value={CARDIO_LABELS[analysis.cardioVerdict]} accent={analysis.cardioVerdict === 'held-up' ? 'good' : 'bad'} />
        <VerdictTile icon={Scale} label="Weight Cut" value={CUT_IMPACT_LABELS[analysis.weightCutImpact]} accent={analysis.weightCutImpact === 'none' ? 'good' : analysis.weightCutImpact === 'severe' ? 'bad' : 'warn'} />
        <VerdictTile icon={Target} label="Gameplan" value={`${Math.round(analysis.gameplanAdherence * 100)}%`} accent={analysis.gameplanAdherence >= 0.7 ? 'good' : analysis.gameplanAdherence >= 0.5 ? 'warn' : 'bad'} />
        <VerdictTile icon={Zap} label="Pressure" value={PRESSURE_LABELS[analysis.pressureHandling]} accent={analysis.pressureHandling === 'dominated' ? 'good' : analysis.pressureHandling === 'overwhelmed' ? 'bad' : 'warn'} />
      </div>

      {/* Strengths */}
      {analysis.strengths.length > 0 && (
        <div className="mx-4 mt-4 card">
          <p className="text-xs font-bold uppercase tracking-wider text-green-400 mb-2 flex items-center gap-1"><TrendingUp size={14} /> What Worked</p>
          <ul className="space-y-1.5">
            {analysis.strengths.map((s, i) => (
              <li key={i} className="text-sm text-gray-300 flex gap-2"><span className="text-green-500">•</span>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Weaknesses */}
      {analysis.weaknesses.length > 0 && (
        <div className="mx-4 mt-3 card">
          <p className="text-xs font-bold uppercase tracking-wider text-red-400 mb-2 flex items-center gap-1"><TrendingDown size={14} /> Weaknesses</p>
          <ul className="space-y-1.5">
            {analysis.weaknesses.map((s, i) => (
              <li key={i} className="text-sm text-gray-300 flex gap-2"><span className="text-red-500">•</span>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Camp KPIs */}
      <div className="mx-4 mt-4 card">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1"><Flame size={14} /> Camp KPIs</p>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <KV label="Sessions" value={`${kpis.totalSessions}`} />
          {/* Em dash for "no schedule to score against", matching avgRpe below
              and the no-data handling elsewhere in this grid. */}
          <KV label="Adherence" value={kpis.adherence === null ? '—' : `${Math.round(kpis.adherence * 100)}%`} />
          <KV label="Avg RPE" value={kpis.avgRpe ? kpis.avgRpe.toFixed(1) : '—'} />
          <KV label="Training" value={`${Math.round(kpis.totalMinutes / 60)}h`} />
          <KV label="Sparring rounds" value={`${kpis.sparringRoundsTotal}`} />
          <KV label="Sparring sessions" value={`${kpis.sparringSessionsCount}`} />
          <KV label="Weight cut" value={formatWeightDelta(kpis.weightCutLbs, unit)} />
          <KV label="Cut pace" value={`${formatWeightDelta(kpis.weightCutPaceLbsPerWeek, unit)}/wk`} />
          <KV label="Conditioning" value={kpis.conditioningDelta === null ? '—' : `${kpis.conditioningDelta >= 0 ? '+' : ''}${kpis.conditioningDelta.toFixed(1)}%`} />
          <KV label="HRV trend" value={HRV_TREND_LABELS[kpis.hrvTrend]} />
          <KV label="Nutrition" value={`${Math.round(kpis.nutritionAdherence * 100)}%`} />
          <KV label="Readiness at fight" value={kpis.readinessAtFight !== null ? `${kpis.readinessAtFight}/100` : '—'} />
        </div>
      </div>

      {/* Rounds */}
      <div className="mx-4 mt-4">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Round-by-Round</p>
        <div className="space-y-2">
          {fight.rounds.map(r => (
            <div key={r.roundNumber} className="card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white font-bold">R{r.roundNumber}</p>
                <div className="flex gap-2 text-xs text-gray-400">
                  <span>Self {r.selfScore}/5</span>
                  <span>Cardio {r.cardio}/5</span>
                  <span>Pressure {r.opponentPressure}/5</span>
                </div>
              </div>
              <div className="flex gap-2 text-[11px] text-gray-400 mb-2">
                <span className="px-2 py-0.5 rounded bg-dark-700">Dealt: {r.damageDealt}</span>
                <span className="px-2 py-0.5 rounded bg-dark-700">Taken: {r.damageTaken}</span>
              </div>
              {r.workedWell && <p className="text-xs text-green-300">✓ {r.workedWell}</p>}
              {r.didntWork && <p className="text-xs text-red-300">✗ {r.didntWork}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Takeaways */}
      {analysis.campTakeaways.length > 0 && (
        <div className="mx-4 mt-4 card border-brand-700/50 bg-brand-900/10">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-300 mb-2">Camp → Fight Takeaways</p>
          <ul className="space-y-1.5">
            {analysis.campTakeaways.map((t, i) => (
              <li key={i} className="text-sm text-gray-300 flex gap-2"><span className="text-brand-400">→</span>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Weight proposal */}
      <div className="mx-4 mt-4 card">
        <p className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-2">Proposed Next-Camp Weights</p>
        {proposal.rationale.length === 0 ? (
          <p className="text-sm text-gray-400">No major changes suggested — current weights look dialed.</p>
        ) : (
          <>
            <ul className="space-y-1.5 mb-3">
              {proposal.rationale.map((r, i) => (
                <li key={i} className="text-sm text-gray-300 flex gap-2"><span className="text-purple-400">•</span>{r}</li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {(['weightCut', 'trainingVolume', 'sessionQuality', 'sparring', 'conditioning', 'nutrition'] as const).map(k => {
                const d = proposal.diff[k];
                if (d === 0) return null;
                return (
                  <div key={k} className="flex items-center justify-between text-xs bg-dark-700 px-2.5 py-1.5 rounded-lg">
                    <span className="text-gray-400">{FACTOR_LABELS[k]}</span>
                    <span className={`font-bold ${d > 0 ? 'text-green-400' : 'text-red-400'}`}>{d > 0 ? '+' : ''}{d}</span>
                  </div>
                );
              })}
            </div>
            {alreadyApplied ? (
              <div className="flex items-center gap-2 bg-green-900/20 border border-green-800 rounded-xl px-3 py-2 text-sm text-green-300">
                <Trophy size={14} /> Applied to your profile — next camp will use these.
              </div>
            ) : (
              /* The proposal above stays fully visible to everyone — that IS the
                 preview. Carrying it into the next camp is the Pro loop. */
              <ProGate required="fighter_pro" inline>
                <button onClick={applyWeights} className="btn-primary w-full">Apply to Next Camp</button>
              </ProGate>
            )}
          </>
        )}
      </div>

      {/* AI narrative */}
      <div className="mx-4 mt-5">
        <PostFightInsights camp={camp} fight={fight} kpis={kpis} analysis={analysis} proposal={proposal} />
      </div>

      {/* Lessons text */}
      {(fight.overallNotes || fight.lessons) && (
        <div className="mx-4 mt-4 card">
          {fight.overallNotes && (
            <div className="mb-3">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Overall Notes</p>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{fight.overallNotes}</p>
            </div>
          )}
          {fight.lessons && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Lessons</p>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{fight.lessons}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VerdictTile({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string; accent: 'good' | 'warn' | 'bad' }) {
  const color = accent === 'good' ? 'text-green-400 bg-green-900/20 border-green-800' : accent === 'warn' ? 'text-yellow-400 bg-yellow-900/20 border-yellow-800' : 'text-red-400 bg-red-900/20 border-red-800';
  return (
    <div className={`rounded-xl border p-3 ${color}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={14} />
        <span className="text-[10px] uppercase tracking-wider font-semibold opacity-80">{label}</span>
      </div>
      <p className="text-sm font-bold capitalize">{value}</p>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-gray-400 text-xs">{label}</span>
      <span className="text-white text-sm font-semibold text-right">{value}</span>
    </>
  );
}
