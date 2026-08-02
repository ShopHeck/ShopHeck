import { useMemo, useState } from 'react';
import { ChevronRight, Trophy, XCircle, Minus, History, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { isPro } from '../utils/subscription';
import UpgradeModal from './shared/UpgradeModal';
import { format, parseISO } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { computeCampKpis } from '../utils/campKpis';

interface Props {
  onOpenFight: (fightId: string) => void;
}

const OUTCOME_META = {
  win: { icon: Trophy, color: 'text-green-400 bg-green-900/30 border-green-800', label: 'W' },
  loss: { icon: XCircle, color: 'text-red-400 bg-red-900/30 border-red-800', label: 'L' },
  draw: { icon: Minus, color: 'text-yellow-400 bg-yellow-900/30 border-yellow-800', label: 'D' },
  'no-contest': { icon: Minus, color: 'text-gray-400 bg-gray-800 border-gray-600', label: 'NC' },
} as const;

export default function CampComparison({ onOpenFight }: Props) {
  const { state } = useApp();
  const pro = isPro(state.subscription);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const rows = useMemo(() => {
    // Join camps with their fight results (if any) and compute KPIs.
    const camps = state.camps
      .filter(c => !c.isOffSeason)
      .sort((a, b) => (b.fightDate ?? '').localeCompare(a.fightDate ?? ''));

    return camps.map(camp => {
      const fight = state.fightResults.find(r => r.campId === camp.id) ?? null;
      const kpis = computeCampKpis(state, camp.id, fight ?? undefined);
      return { camp, fight, kpis };
    });
  }, [state]);

  const chartData = useMemo(() => {
    return rows
      .filter(r => r.fight)
      .reverse() // oldest first for chart flow
      .map((r, i) => ({
        name: r.fight ? `${r.fight.outcome[0].toUpperCase()} #${i + 1}` : `#${i + 1}`,
        Sparring: r.kpis.sparringRoundsTotal,
        Adherence: Math.round(r.kpis.adherence * 100),
        Readiness: r.kpis.readinessAtFight ?? 0,
      }));
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="mx-4 mt-10 text-center">
        <History size={40} className="text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400 font-semibold">No camps yet</p>
        <p className="text-xs text-gray-500 mt-1">Your past camps will appear here for comparison.</p>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <div className="mx-4 mt-4">
        <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Camp History</p>
        <p className="text-white font-bold">Compare camps vs outcomes</p>
      </div>

      {/* Free tier is capped at one camp, so comparison is structurally out of
          reach — say what this screen becomes with Pro instead of showing an
          unexplained one-row list forever. */}
      {!pro && (
        <div className="mx-4 mt-4 bg-gradient-to-br from-brand-900/40 to-dark-700 border border-brand-700/50 rounded-xl p-4">
          <p className="text-sm font-bold text-white mb-1">Camps that learn from every fight</p>
          <p className="text-xs text-gray-400 leading-relaxed mb-3">
            With Fighter Pro, every camp you run lands here — sparring volume, adherence and
            readiness charted side by side, and each fight's lessons carried into the next camp.
            Free covers one camp; Pro removes the limit.
          </p>
          <button
            onClick={() => setShowUpgrade(true)}
            className="btn-primary w-full text-sm py-2.5 flex items-center justify-center gap-2"
          >
            <Zap size={14} /> Unlock with Fighter Pro
          </button>
        </div>
      )}

      {chartData.length >= 2 && (
        <div className="mx-4 mt-4 card">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">KPIs by Fight</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#1f1f1f', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#fff' }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Sparring" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Adherence" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Readiness" fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-gray-500 mt-2">Labels on x-axis use the outcome letter (W/L/D) for quick scan.</p>
        </div>
      )}

      <div className="mx-4 mt-4 space-y-2">
        {rows.map(({ camp, fight, kpis }) => {
          const meta = fight ? OUTCOME_META[fight.outcome] : null;
          const OutcomeIcon = meta?.icon;
          return (
            <button
              key={camp.id}
              onClick={() => fight && onOpenFight(fight.id)}
              disabled={!fight}
              className={`w-full card text-left flex items-center gap-3 ${fight ? 'hover:border-brand-700' : 'opacity-60 cursor-not-allowed'}`}
            >
              {meta && OutcomeIcon ? (
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${meta.color}`}>
                  <OutcomeIcon size={18} />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-xl bg-dark-700 flex items-center justify-center text-xs text-gray-500">
                  —
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold truncate">
                  {camp.opponent || 'No opponent'} · {camp.weightClass}
                </p>
                <p className="text-xs text-gray-500">
                  {camp.fightDate ? format(parseISO(camp.fightDate), 'MMM d, yyyy') : 'No fight date'} · {camp.campWeeks}wk · {kpis.sparringRoundsTotal} spar rds · {Math.round(kpis.adherence * 100)}% adherence
                </p>
                {fight && (
                  <p className="text-[11px] text-gray-400 mt-0.5">{fight.method}{fight.roundStopped ? ` R${fight.roundStopped}` : ''}</p>
                )}
                {!fight && camp.fightDate && parseISO(camp.fightDate) < new Date() && (
                  <p className="text-[11px] text-brand-400 mt-0.5">Log fight result →</p>
                )}
              </div>
              {fight && <ChevronRight size={18} className="text-gray-500 flex-shrink-0" />}
            </button>
          );
        })}
      </div>

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
