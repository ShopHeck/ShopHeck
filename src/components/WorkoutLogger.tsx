import { useState, useEffect } from 'react';
import { Plus, Dumbbell, Trash2, Clock, Zap, Activity, Share2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getWeekNumberForDate } from '../utils/campGenerator';
import { format, parseISO } from 'date-fns';
import ConfirmDialog from './shared/ConfirmDialog';
import Modal from './shared/Modal';
import ShareCard from './ShareCard';
import type { SessionType, WorkoutLog } from '../types';
import { writeWorkoutToHealth } from '../utils/healthSync';
import { todayISO, isFutureISODate } from '../utils/dates';
import type { LogPrefill } from '../App';

const SESSION_TYPES: { value: SessionType; label: string; emoji: string }[] = [
  { value: 'conditioning', label: 'Conditioning', emoji: '🔥' },
  { value: 'skill', label: 'Skill Training', emoji: '🥊' },
  { value: 'sparring', label: 'Sparring', emoji: '⚡' },
  { value: 'strength', label: 'Strength', emoji: '💪' },
  { value: 'recovery', label: 'Recovery', emoji: '🧘' },
];

const TAB_CONFIG = [
  { id: 'workout',      label: 'Workouts', Icon: Dumbbell  },
  { id: 'sparring',     label: 'Sparring', Icon: Zap       },
  { id: 'conditioning', label: 'Tests',    Icon: Activity  },
];

interface Props {
  prefill?: LogPrefill | null;
  onPrefillConsumed?: () => void;
}

export default function WorkoutLogger({ prefill, onPrefillConsumed }: Props) {
  const { state, dispatch } = useApp();
  const { activeCamp, workoutLogs, sparringLogs, conditioningTests } = state;
  const [tab, setTab] = useState<'workout' | 'sparring' | 'conditioning'>('workout');
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteSparConfirmId, setDeleteSparConfirmId] = useState<string | null>(null);
  const [deleteCondConfirmId, setDeleteCondConfirmId] = useState<string | null>(null);
  const [showSparModal, setShowSparModal] = useState(false);
  const [showCondModal, setShowCondModal] = useState(false);
  // Sharing is explicit (the icon on each logged session) — the modal used to
  // force-open after every log, which turns a brag into a chore. The object is
  // held in state so ShareCard's canvas effect sees a stable reference.
  const [shareLog, setShareLog] = useState<WorkoutLog | null>(null);

  // Workout form
  const [wDate, setWDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [wType, setWType] = useState<SessionType>('skill');
  const [wTitle, setWTitle] = useState('');
  const [wDuration, setWDuration] = useState('60');
  const [wRpe, setWRpe] = useState('7');
  const [wNotes, setWNotes] = useState('');

  // Sparring form
  const [sDate, setSDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [sRounds, setSRounds] = useState('5');
  const [sRoundDur, setSRoundDur] = useState('3');
  const [sPartner, setSPartner] = useState('');
  const [sPartnerLevel, setSPartnerLevel] = useState('Similar');
  const [sFocus, setSFocus] = useState('');
  const [sPerf, setSPerf] = useState<1|2|3|4|5>(3);
  const [sNotes, setSNotes] = useState('');

  // Apply prefill from planner shortcut
  useEffect(() => {
    if (prefill) {
      setWType(prefill.sessionType);
      setWTitle(prefill.title);
      setWDuration(String(prefill.duration));
      setShowModal(true);
      onPrefillConsumed?.();
    }
  }, [prefill]);

  // Conditioning form
  const [cDate, setCDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [cType, setCType] = useState('3-Mile Run');
  const [cValue, setCValue] = useState('');
  const [cUnit, setCUnit] = useState('minutes');
  const [cNotes, setCNotes] = useState('');

  const COND_TESTS = [
    { label: '3-Mile Run', unit: 'minutes' },
    { label: '1-Mile Run', unit: 'minutes' },
    { label: 'Beep Test', unit: 'level' },
    { label: '400m Sprint', unit: 'seconds' },
    { label: 'Push-up Max', unit: 'reps' },
    { label: 'Pull-up Max', unit: 'reps' },
    { label: 'Burpee 1-min', unit: 'reps' },
    { label: 'Jump Rope (5min)', unit: 'misses' },
    { label: 'VO2 Max (est)', unit: 'ml/kg/min' },
  ];

  if (!activeCamp) return null;
  const camp = activeCamp;

  const campWorkouts = workoutLogs.filter(l => l.campId === camp.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const campSparring = sparringLogs.filter(l => l.campId === camp.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const campCond = conditioningTests.filter(l => l.campId === camp.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const tabCounts: Record<string, number> = {
    workout: campWorkouts.length,
    sparring: campSparring.length,
    conditioning: campCond.length,
  };

  function logWorkout() {
    // Logs are records of completed training — future dates would inflate
    // weekly volume and streaks with sessions that haven't happened.
    if (!wTitle.trim() || isFutureISODate(wDate)) return;
    const payload: Omit<WorkoutLog, 'id' | 'createdAt'> = {
      campId: camp.id,
      date: wDate,
      // Week of the log's own date — a back-dated entry files under the week
      // it happened in, not the week it was typed in.
      weekNumber: getWeekNumberForDate(camp, parseISO(wDate)),
      dayLabel: format(parseISO(wDate), 'EEEE'),
      sessionType: wType,
      title: wTitle.trim(),
      duration: parseInt(wDuration),
      rpe: parseInt(wRpe),
      notes: wNotes,
      completed: true,
    };
    dispatch({ type: 'LOG_WORKOUT', payload });
    void writeWorkoutToHealth(payload);
    setWTitle(''); setWNotes(''); setShowModal(false);
  }

  function logSparring() {
    if (isFutureISODate(sDate)) return;
    dispatch({
      type: 'LOG_SPARRING',
      payload: {
        campId: camp.id,
        date: sDate,
        weekNumber: getWeekNumberForDate(camp, parseISO(sDate)),
        rounds: parseInt(sRounds),
        roundDuration: parseInt(sRoundDur),
        partnerName: sPartner.trim(),
        partnerLevel: sPartnerLevel,
        focus: sFocus.trim(),
        performance: sPerf,
        notes: sNotes,
      },
    });
    setSPartner(''); setSFocus(''); setSNotes(''); setShowSparModal(false);
  }

  function logCondTest() {
    if (!cValue || isFutureISODate(cDate)) return;
    dispatch({
      type: 'LOG_CONDITIONING',
      payload: {
        campId: camp.id,
        date: cDate,
        weekNumber: getWeekNumberForDate(camp, parseISO(cDate)),
        testType: cType,
        value: parseFloat(cValue),
        unit: cUnit,
        notes: cNotes,
      },
    });
    setCValue(''); setCNotes(''); setShowCondModal(false);
  }

  const PERF_LABELS: Record<number, string> = { 1: 'Poor', 2: 'Below Avg', 3: 'Average', 4: 'Good', 5: 'Excellent' };
  const PERF_COLORS: Record<number, string> = { 1: 'bg-red-700', 2: 'bg-orange-700', 3: 'bg-yellow-700', 4: 'bg-green-700', 5: 'bg-emerald-600' };

  return (
    <div className="space-y-4 pb-4">
      {shareLog && state.currentUser && (
        <ShareCard
          content={{ kind: 'session', log: shareLog, camp }}
          user={state.currentUser}
          onClose={() => setShareLog(null)}
        />
      )}
      {/* Tab bar */}
      <div className="mx-4 mt-4">
        <div className="flex bg-dark-700 rounded-xl p-1 gap-1">
          {TAB_CONFIG.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t.id ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <t.Icon size={13} />
              {t.label}{tabCounts[t.id] > 0 ? ` · ${tabCounts[t.id]}` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* WORKOUTS TAB */}
      {tab === 'workout' && (
        <div className="mx-4 space-y-3">
          <button onClick={() => setShowModal(true)} className="btn-primary w-full flex items-center justify-center gap-2">
            <Plus size={18} /> Log Workout
          </button>
          {campWorkouts.length === 0 ? (
            <div className="card text-center py-10">
              <Dumbbell size={32} className="text-gray-450 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">No workouts logged yet</p>
              <p className="text-sm text-gray-450 mt-1">Tap "Log Workout" to record your first session</p>
            </div>
          ) : (
            campWorkouts.map(log => (
              <div key={log.id} className="card">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-dark-600 rounded-xl flex items-center justify-center flex-shrink-0 text-xl">
                    {SESSION_TYPES.find(s => s.value === log.sessionType)?.emoji ?? '🏋️'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-white text-sm">{log.title}</p>
                      <div className="flex items-center flex-shrink-0">
                        <button onClick={() => setShareLog(log)}
                          aria-label={`Share workout: ${log.title}`}
                          className="text-gray-450 hover:text-brand-400 transition-colors -m-2 p-2">
                          <Share2 size={14} />
                        </button>
                        <button onClick={() => setDeleteConfirmId(log.id)}
                          aria-label={`Delete workout: ${log.title}`}
                          className="text-gray-450 hover:text-red-400 transition-colors -m-2 p-2 ml-2">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><Clock size={11} /> {log.duration}min</span>
                      <span className="flex items-center gap-1"><Zap size={11} /> RPE {log.rpe}/10</span>
                      <span>{format(parseISO(log.date), 'MMM d')}</span>
                    </div>
                    {log.notes && <p className="text-xs text-gray-450 mt-1 italic">{log.notes}</p>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* SPARRING TAB */}
      {tab === 'sparring' && (
        <div className="mx-4 space-y-3">
          <button onClick={() => setShowSparModal(true)} className="btn-primary w-full flex items-center justify-center gap-2">
            <Plus size={18} /> Log Sparring
          </button>
          {campSparring.length === 0 ? (
            <div className="card text-center py-10">
              <Zap size={32} className="text-gray-450 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">No sparring logged yet</p>
              <p className="text-sm text-gray-450 mt-1">Log rounds to track your progress</p>
            </div>
          ) : (
            campSparring.map(log => (
              <div key={log.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{log.rounds} rounds</span>
                      <span className="text-xs text-gray-400">×{log.roundDuration}min</span>
                      <span className={`badge text-xs text-white ${PERF_COLORS[log.performance]}`}>{PERF_LABELS[log.performance]}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {log.partnerName && log.partnerName !== 'Unknown' ? `vs ${log.partnerName} (${log.partnerLevel})` : `${log.partnerLevel}-level partner`} · {format(parseISO(log.date), 'MMM d')}
                    </p>
                    {log.focus && <p className="text-xs text-gray-400 mt-1">Focus: {log.focus}</p>}
                    {log.notes && <p className="text-xs text-gray-450 mt-1 italic">{log.notes}</p>}
                  </div>
                  <button onClick={() => setDeleteSparConfirmId(log.id)}
                    aria-label={`Delete sparring session${log.partnerName && log.partnerName !== 'Unknown' ? ` with ${log.partnerName}` : ''}`}
                    className="text-gray-450 hover:text-red-400 transition-colors flex-shrink-0 -m-2 p-2">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* CONDITIONING TESTS TAB */}
      {tab === 'conditioning' && (
        <div className="mx-4 space-y-3">
          <button onClick={() => setShowCondModal(true)} className="btn-primary w-full flex items-center justify-center gap-2">
            <Plus size={18} /> Log Test Result
          </button>
          {campCond.length === 0 ? (
            <div className="card text-center py-10">
              <Clock size={32} className="text-gray-450 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">No conditioning tests yet</p>
              <p className="text-sm text-gray-450 mt-1">Track benchmark tests throughout camp</p>
            </div>
          ) : (
            campCond.map(test => (
              <div key={test.id} className="card">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm">{test.testType}</p>
                    <p className="text-xs text-gray-400">{format(parseISO(test.date), 'MMM d')} · Week {test.weekNumber}</p>
                    {test.notes && <p className="text-xs text-gray-450 mt-1 italic">{test.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-2xl font-black text-brand-400">{test.value}</p>
                      <p className="text-xs text-gray-400">{test.unit}</p>
                    </div>
                    <button onClick={() => setDeleteCondConfirmId(test.id)}
                      aria-label={`Delete ${test.testType} test result`}
                      className="text-gray-450 hover:text-red-400 transition-colors flex-shrink-0 -m-2 p-2">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Log Workout Modal */}
      {showModal && (
        <Modal title="Log Workout" onClose={() => setShowModal(false)} footer={
          <button onClick={logWorkout} disabled={!wTitle.trim()} className="btn-primary w-full disabled:opacity-50">Save Workout</button>
        }>
          <div className="space-y-4">
            <div>
              <label className="block">
                <span className="label">Date</span>
                <input className="input" type="date" value={wDate} max={todayISO()} onChange={e => setWDate(e.target.value)} />
              </label>
            </div>
            <div>
              <label className="label">Session Type</label>
              <div role="group" aria-label="Session Type" className="grid grid-cols-3 gap-2">
                {SESSION_TYPES.map(st => (
                  <button key={st.value} onClick={() => setWType(st.value)} aria-pressed={wType === st.value}
                    className={`py-2 px-2 rounded-xl text-xs font-medium border-2 transition-all ${wType === st.value ? 'border-brand-500 bg-brand-900/30 text-brand-400' : 'border-dark-400 bg-dark-600 text-gray-400'}`}>
                    {st.emoji} {st.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block">
                <span className="label">Workout Title *</span>
                <input className="input" placeholder="e.g. Morning Pad Work" value={wTitle} onChange={e => setWTitle(e.target.value)} />
              </label>
            </div>
            <div>
              <label className="block">
                <span className="label">Duration (min)</span>
                <input className="input" type="number" min="5" max="300" value={wDuration} onChange={e => setWDuration(e.target.value)} />
              </label>
            </div>
            <div>
              <label className="label mb-0" htmlFor="wl-rpe">Effort: {wRpe}/10</label>
              <input id="wl-rpe" type="range" min="1" max="10" value={wRpe} onChange={e => setWRpe(e.target.value)}
                className="w-full accent-brand-500 mt-2" />
            </div>
            <div>
              <label className="block">
                <span className="label">Notes</span>
                <textarea className="input resize-none" rows={2} placeholder="How did it feel? What went well?" value={wNotes} onChange={e => setWNotes(e.target.value)} />
              </label>
            </div>
          </div>
        </Modal>
      )}

      {/* Log Sparring Modal */}
      {showSparModal && (
        <Modal title="Log Sparring" onClose={() => setShowSparModal(false)} footer={
          <button onClick={logSparring} className="btn-primary w-full">Save Sparring</button>
        }>
          <div className="space-y-4">
            <div>
              <label className="block">
                <span className="label">Date</span>
                <input className="input" type="date" value={sDate} max={todayISO()} onChange={e => setSDate(e.target.value)} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block">
                  <span className="label">Rounds</span>
                  <input className="input" type="number" min="1" max="20" value={sRounds} onChange={e => setSRounds(e.target.value)} />
                </label>
              </div>
              <div>
                <label className="block">
                  <span className="label">Round Duration (min)</span>
                  <select className="select" value={sRoundDur} onChange={e => setSRoundDur(e.target.value)}>
                  <option value="2">2 min</option>
                  <option value="3">3 min</option>
                  <option value="5">5 min</option>
                </select>
                </label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block">
                  <span className="label">Partner Name</span>
                  <input className="input" placeholder="Partner's name" value={sPartner} onChange={e => setSPartner(e.target.value)} />
                </label>
              </div>
              <div>
                <label className="block">
                  <span className="label">Partner Level</span>
                  <select className="select" value={sPartnerLevel} onChange={e => setSPartnerLevel(e.target.value)}>
                  <option>Beginner</option>
                  <option>Similar</option>
                  <option>More Experienced</option>
                  <option>Pro</option>
                </select>
                </label>
              </div>
            </div>
            <div>
              <label className="block">
                <span className="label">Focus / Goal</span>
                <input className="input" placeholder="e.g. Jab defense, pressure fighting" value={sFocus} onChange={e => setSFocus(e.target.value)} />
              </label>
            </div>
            <div>
              <label className="label">Performance</label>
              <div role="group" aria-label="Performance" className="flex gap-2">
                {([1,2,3,4,5] as const).map(n => (
                  <button key={n} onClick={() => setSPerf(n)} aria-pressed={sPerf === n}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-all ${sPerf === n ? `border-transparent text-white ${PERF_COLORS[n]}` : 'border-dark-400 bg-dark-600 text-gray-400'}`}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-center text-gray-400 mt-1">{PERF_LABELS[sPerf]}</p>
            </div>
            <div>
              <label className="block">
                <span className="label">Notes</span>
                <textarea className="input resize-none" rows={2} placeholder="What worked? What to improve?" value={sNotes} onChange={e => setSNotes(e.target.value)} />
              </label>
            </div>
          </div>
        </Modal>
      )}

      {/* Log Conditioning Test Modal */}
      {showCondModal && (
        <Modal title="Log Conditioning Test" onClose={() => setShowCondModal(false)} footer={
          <button onClick={logCondTest} disabled={!cValue} className="btn-primary w-full disabled:opacity-50">Save Test Result</button>
        }>
          <div className="space-y-4">
            <div>
              <label className="block">
                <span className="label">Date</span>
                <input className="input" type="date" value={cDate} max={todayISO()} onChange={e => setCDate(e.target.value)} />
              </label>
            </div>
            <div>
              <label className="block">
                <span className="label">Test Type</span>
                <select className="select" value={cType} onChange={e => {
                const t = COND_TESTS.find(c => c.label === e.target.value);
                setCType(e.target.value);
                if (t) setCUnit(t.unit);
              }}>
                {COND_TESTS.map(t => <option key={t.label}>{t.label}</option>)}
              </select>
              </label>
            </div>
            <div>
              <label className="block">
                <span className="label">Result ({cUnit})</span>
                <input className="input" type="number" step="0.01" placeholder={`Enter result in ${cUnit}`} value={cValue} onChange={e => setCValue(e.target.value)} />
              </label>
            </div>
            <div>
              <label className="block">
                <span className="label">Notes</span>
                <textarea className="input resize-none" rows={2} placeholder="Conditions, how you felt, etc." value={cNotes} onChange={e => setCNotes(e.target.value)} />
              </label>
            </div>
          </div>
        </Modal>
      )}

      {/* These three were inlined copies of ConfirmDialog's markup, which meant
          they missed its focus trap, Escape handling and alertdialog role. */}
      {deleteConfirmId && (
        <ConfirmDialog
          danger
          title="Delete Workout?"
          message="This workout log will be permanently deleted."
          confirmLabel="Delete"
          onConfirm={() => { dispatch({ type: 'DELETE_WORKOUT', payload: deleteConfirmId }); setDeleteConfirmId(null); }}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}

      {deleteSparConfirmId && (
        <ConfirmDialog
          danger
          title="Delete Sparring Log?"
          message="This sparring session will be permanently deleted."
          confirmLabel="Delete"
          onConfirm={() => { dispatch({ type: 'DELETE_SPARRING', payload: deleteSparConfirmId }); setDeleteSparConfirmId(null); }}
          onCancel={() => setDeleteSparConfirmId(null)}
        />
      )}

      {deleteCondConfirmId && (
        <ConfirmDialog
          danger
          title="Delete Test Result?"
          message="This conditioning test result will be permanently deleted."
          confirmLabel="Delete"
          onConfirm={() => { dispatch({ type: 'DELETE_CONDITIONING', payload: deleteCondConfirmId }); setDeleteCondConfirmId(null); }}
          onCancel={() => setDeleteCondConfirmId(null)}
        />
      )}
    </div>
  );
}
