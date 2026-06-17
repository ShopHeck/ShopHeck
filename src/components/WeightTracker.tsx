import { useState } from 'react';
import { Plus, TrendingDown, Scale, AlertTriangle, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { triggerHaptic, HAPTIC } from '../hooks/useHaptics';
import { format, parseISO, differenceInDays } from 'date-fns';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import Modal from './shared/Modal';
import ProGate from './shared/ProGate';
import CutCoach from './CutCoach';
import { computeCutProjection, idealWeightAt } from '../utils/weightCut';

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: { date: string } }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-dark-700 border border-dark-400 rounded-lg px-3 py-2 text-xs">
        <p className="text-gray-400">{payload[0].payload.date}</p>
        <p className="text-white font-bold">{payload[0].value} lbs</p>
      </div>
    );
  }
  return null;
}

export default function WeightTracker() {
  const { state, dispatch } = useApp();
  const { activeCamp, weightEntries, currentUser } = state;
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');

  if (!activeCamp) return null;

  const campEntries = weightEntries
    .filter(e => e.campId === activeCamp.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const latestEntry = campEntries[campEntries.length - 1];
  const currentW = latestEntry ? latestEntry.weight : activeCamp.currentWeight;
  const targetW = activeCamp.targetWeight;
  const startW = activeCamp.currentWeight;
  const toGo = currentW - targetW;
  const totalCut = startW - targetW;
  const cutProgress = totalCut > 0 ? Math.min(100, Math.max(0, ((startW - currentW) / totalCut) * 100)) : 100;

  const daysUntilFight = differenceInDays(parseISO(activeCamp.fightDate ?? ''), new Date());

  // Cut pace projection — on pace / ahead / behind + projected weigh-in.
  const proj = computeCutProjection(activeCamp, weightEntries);
  const paceUi = {
    ahead:      { label: 'Ahead of pace', text: 'text-green-400',  border: 'border-green-800/50' },
    'on-pace':  { label: 'On pace',       text: 'text-blue-400',   border: 'border-blue-800/50' },
    behind:     { label: 'Behind pace',   text: 'text-yellow-400', border: 'border-yellow-800/50' },
    made:       { label: 'On weight ✓',   text: 'text-green-400',  border: 'border-green-800/50' },
    'no-fight': { label: '',              text: '',                border: '' },
  }[proj.status];

  // Build chart data: include camp start, all entries, target, and the ideal
  // "pace" line a steady cut would follow.
  const chartData = (() => {
    const data: { date: string; weight: number; target: number; pace: number }[] = [];

    // Add a start point
    data.push({
      date: format(parseISO(activeCamp.startDate), 'MMM d'),
      weight: activeCamp.currentWeight,
      target: activeCamp.targetWeight,
      pace: idealWeightAt(activeCamp, parseISO(activeCamp.startDate)),
    });

    campEntries.forEach(e => {
      data.push({
        date: format(parseISO(e.date), 'MMM d'),
        weight: e.weight,
        target: activeCamp.targetWeight,
        pace: idealWeightAt(activeCamp, parseISO(e.date)),
      });
    });

    return data;
  })();


  const weightTrend = campEntries.length >= 2
    ? campEntries[campEntries.length - 1].weight - campEntries[campEntries.length - 2].weight
    : 0;

  function logWeight() {
    if (!weight) return;
    triggerHaptic(HAPTIC.sessionComplete);
    dispatch({
      type: 'LOG_WEIGHT',
      payload: {
        campId: activeCamp!.id,
        date,
        weight: parseFloat(weight),
        notes,
      },
    });
    setWeight('');
    setNotes('');
    setShowModal(false);
  }

  const isOnTrack = toGo <= (daysUntilFight * 0.3);
  const isCritical = toGo > 10 && daysUntilFight < 14;

  return (
    <div className="space-y-4 pb-4">
      {/* Header Stats */}
      <div className="mx-4 mt-4 grid grid-cols-3 gap-3">
        <div className="stat-card">
          <Scale size={16} className="text-blue-400" />
          <div className="text-xl font-black text-white">{currentW}</div>
          <div className="text-xs text-gray-500">current (lbs)</div>
        </div>
        <div className="stat-card">
          <TrendingDown size={16} className="text-brand-500" />
          <div className={`text-xl font-black ${toGo > 0 ? 'text-brand-400' : 'text-green-400'}`}>
            {toGo > 0 ? toGo.toFixed(1) : '✓'}
          </div>
          <div className="text-xs text-gray-500">lbs to cut</div>
        </div>
        <div className="stat-card">
          <div className={`w-4 h-4 rounded-full ${isOnTrack && !isCritical ? 'bg-green-500' : isCritical ? 'bg-red-500' : 'bg-yellow-500'}`} />
          <div className={`text-xl font-black ${isOnTrack ? 'text-green-400' : 'text-yellow-400'}`}>
            {Math.round(cutProgress)}%
          </div>
          <div className="text-xs text-gray-500">cut done</div>
        </div>
      </div>

      {/* Alert if critical */}
      {isCritical && (
        <div className="mx-4 bg-red-900/30 border border-red-800 rounded-xl p-3 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-300">Weight Cut Concern</p>
            <p className="text-xs text-red-400/80 mt-0.5">
              You have {toGo.toFixed(1)} lbs to cut with only {daysUntilFight} days until fight. Consult your coach.
            </p>
          </div>
        </div>
      )}

      {/* Progress Arc */}
      <div className="mx-4">
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Weight Cut Progress</p>
              <p className="text-sm text-white font-semibold">{startW} → {targetW} lbs</p>
            </div>
            <div className="text-right">
              {weightTrend !== 0 && (
                <span className={`badge ${weightTrend < 0 ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                  {weightTrend > 0 ? '↑' : '↓'} {Math.abs(weightTrend).toFixed(1)} lbs
                </span>
              )}
              <p className="text-xs text-gray-500 mt-1">{daysUntilFight} days out</p>
            </div>
          </div>
          <div className="h-3 bg-dark-500 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${cutProgress >= 100 ? 'bg-green-500' : 'bg-gradient-to-r from-blue-700 to-blue-500'}`}
              style={{ width: `${cutProgress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-600 mt-1.5">
            <span>Start: {startW} lbs</span>
            <span>Target: {targetW} lbs</span>
          </div>
        </div>
      </div>

      {/* Cut Pace projection */}
      {proj.trackable && proj.status !== 'made' && (
        <div className="mx-4">
          <div className={`card border ${paceUi.border}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Cut Pace</p>
                <p className={`text-lg font-black ${paceUi.text}`}>{paceUi.label}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Projected weigh-in</p>
                <p className="text-lg font-black text-white">
                  {proj.projectedWeighIn}<span className="text-xs text-gray-500"> lbs</span>
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="bg-dark-600 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500">Need / day</p>
                <p className="text-sm text-white font-semibold">{proj.lbsPerDayNeeded} lbs</p>
              </div>
              <div className="bg-dark-600 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500">Avg so far / day</p>
                <p className="text-sm text-white font-semibold">{proj.lbsPerDayActual} lbs</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2.5">
              {proj.projectedMiss > 0
                ? `At your current rate you'll be ~${proj.projectedMiss} lbs over on fight day (${proj.daysRemaining} days out).`
                : `At your current rate you'll make weight with ~${Math.abs(proj.projectedMiss)} lbs to spare.`}
            </p>
          </div>
        </div>
      )}

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="mx-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Weight Over Camp</p>
          <div className="card p-2">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#666', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[Math.min(targetW - 2, currentW - 2), Math.max(startW + 2, currentW + 2)]}
                  tick={{ fill: '#666', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={targetW} stroke="#f97316" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: 'Target', fill: '#f97316', fontSize: 10 }} />
                {activeCamp.fightDate && (
                  <Line
                    type="monotone"
                    dataKey="pace"
                    stroke="#9ca3af"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    activeDot={false}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="#60a5fa"
                  strokeWidth={2.5}
                  dot={{ fill: '#60a5fa', strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 6, fill: '#fff' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* AI Cut Coach — Fighter Pro */}
      {activeCamp.fightDate && proj.status !== 'made' && (
        <div className="mx-4">
          <ProGate required="fighter_pro">
            <CutCoach camp={activeCamp} user={currentUser} proj={proj} entries={weightEntries} />
          </ProGate>
        </div>
      )}

      {/* Log Weight Button */}
      <div className="mx-4">
        <button onClick={() => setShowModal(true)} className="btn-primary w-full flex items-center justify-center gap-2">
          <Plus size={18} /> Log Weight
        </button>
      </div>

      {/* History */}
      {campEntries.length > 0 && (
        <div className="mx-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Weight Log</p>
          <div className="space-y-2">
            {[...campEntries].reverse().map((entry, i) => {
              const prev = [...campEntries].reverse()[i + 1];
              const change = prev ? entry.weight - prev.weight : null;
              return (
                <div key={entry.id} className="card flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{entry.weight} lbs</p>
                    <p className="text-xs text-gray-500">{format(parseISO(entry.date), 'EEEE, MMM d')}</p>
                    {entry.notes && <p className="text-xs text-gray-600 italic mt-0.5">{entry.notes}</p>}
                  </div>
                  <div className="text-right">
                    {change !== null && (
                      <span className={`badge text-xs ${change < 0 ? 'bg-green-900/40 text-green-400' : change > 0 ? 'bg-red-900/40 text-red-400' : 'bg-dark-500 text-gray-500'}`}>
                        {change > 0 ? '+' : ''}{change.toFixed(1)} lbs
                      </span>
                    )}
                    <p className="text-xs text-gray-600 mt-1">{(entry.weight - targetW).toFixed(1)} to go</p>
                  </div>
                  <button onClick={() => setDeleteConfirmId(entry.id)} className="text-gray-600 hover:text-red-400 transition-colors p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Log Weight Modal */}
      {showModal && (
        <Modal
          title="Log Weight"
          onClose={() => setShowModal(false)}
          footer={
            <button onClick={logWeight} disabled={!weight} className="btn-primary w-full disabled:opacity-50">
              Save Weight
            </button>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="label">Date</label>
              <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Weight (lbs) *</label>
              <input
                className="input text-2xl font-bold"
                type="number"
                step="0.1"
                min="100"
                max="400"
                placeholder="e.g. 158.5"
                value={weight}
                onChange={e => setWeight(e.target.value)}
              />
            </div>
            {weight && (
              <div className={`rounded-xl p-3 border ${parseFloat(weight) <= targetW ? 'bg-green-900/30 border-green-700' : 'bg-dark-600 border-dark-400'}`}>
                <p className={`text-sm font-medium ${parseFloat(weight) <= targetW ? 'text-green-400' : 'text-gray-300'}`}>
                  {parseFloat(weight) <= targetW
                    ? '✓ At or below fight weight!'
                    : `${(parseFloat(weight) - targetW).toFixed(1)} lbs above target (${targetW} lbs)`
                  }
                </p>
              </div>
            )}
            <div>
              <label className="label">Notes (optional)</label>
              <textarea
                className="input resize-none"
                rows={2}
                placeholder="Morning weight, after workout, etc."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Weight Entry Confirm */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative bg-dark-700 rounded-2xl border border-dark-400 p-5 w-full max-w-sm">
            <div className="w-12 h-12 bg-red-900/40 rounded-xl flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={22} className="text-red-400" />
            </div>
            <h3 className="text-base font-bold text-white text-center mb-2">Delete Weight Entry?</h3>
            <p className="text-sm text-gray-400 text-center mb-6">This weight entry will be permanently deleted.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
              <button
                onClick={() => { dispatch({ type: 'DELETE_WEIGHT', payload: deleteConfirmId }); setDeleteConfirmId(null); }}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-red-700 hover:bg-red-600 text-white transition-all active:scale-95"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
