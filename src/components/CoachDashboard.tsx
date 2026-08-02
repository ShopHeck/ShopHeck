import { useState, useEffect } from 'react';
import { Users, ChevronRight, Activity, Scale, Zap, User, Search, MessageSquarePlus, Trash2, ChevronDown, Lock, Cloud } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { format, parseISO } from 'date-fns';
import { getDaysUntilFight, getCampProgress } from '../utils/campGenerator';
import { isCoachPro } from '../utils/subscription';
import { toDisplayWeight, formatWeight } from '../utils/units';
import { listLinkedFighters, getFighterDetail, type LinkedFighter, type FighterDetail } from '../lib/coachLinks';
import UpgradeModal from './shared/UpgradeModal';
import type { CoachNoteCategory } from '../types';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; color: string }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-dark-700 border border-dark-400 rounded-lg px-3 py-2 text-xs">
        <p className="text-gray-400">{label}</p>
        {payload.map((p, i) => <p key={i} style={{ color: p.color }}>{p.value}</p>)}
      </div>
    );
  }
  return null;
}

const CATEGORY_STYLES: Record<CoachNoteCategory, { label: string; cls: string }> = {
  technique:    { label: 'Technique',    cls: 'bg-brand-900/40 text-brand-400' },
  conditioning: { label: 'Conditioning', cls: 'bg-yellow-900/40 text-yellow-400' },
  mental:       { label: 'Mental',       cls: 'bg-purple-900/40 text-purple-400' },
  nutrition:    { label: 'Nutrition',    cls: 'bg-green-900/40 text-green-400' },
  general:      { label: 'General',      cls: 'bg-dark-500 text-gray-400' },
};

export default function CoachDashboard() {
  const { state, dispatch } = useApp();
  const unit = state.dashboardPrefs?.weightUnit ?? 'lbs';
  const { fighters, camps, workoutLogs, sparringLogs, weightEntries, currentUser, coachNotes } = state;
  const [selectedFighter, setSelectedFighter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] = useState<CoachNoteCategory>('general');
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  // Cloud-linked fighters (Phase 4)
  const { configured: authConfigured, user: authUser } = useAuth();
  const [linked, setLinked] = useState<LinkedFighter[]>([]);
  const [cloudFighter, setCloudFighter] = useState<LinkedFighter | null>(null);
  const [cloudDetail, setCloudDetail] = useState<FighterDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (authConfigured && authUser && currentUser?.role === 'coach') {
      listLinkedFighters(authUser.id).then(setLinked);
    }
  }, [authConfigured, authUser, currentUser?.role]);

  async function openCloudFighter(f: LinkedFighter) {
    if (!coachPro) { setShowUpgrade(true); return; }
    setCloudFighter(f);
    setLoadingDetail(true);
    setCloudDetail(await getFighterDetail(f.id));
    setLoadingDetail(false);
  }

  // The coach side is a paid tier. Free coaches see the roster shell, but
  // opening a fighter's data / notes requires Coach Pro.
  const coachPro = isCoachPro(state.subscription);
  function openFighter(id: string) {
    if (coachPro) setSelectedFighter(id);
    else setShowUpgrade(true);
  }

  const activeFighters = fighters.filter(f => f.role === 'fighter');
  const filtered = activeFighters.filter(f =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.sport.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const fighter = selectedFighter ? fighters.find(f => f.id === selectedFighter) : null;
  const activeCamp = camps[camps.length - 1];

  function submitNote() {
    if (!noteContent.trim() || !fighter || !activeCamp || !currentUser) return;
    dispatch({
      type: 'ADD_COACH_NOTE',
      payload: {
        coachId: currentUser.id,
        coachName: currentUser.name,
        fighterId: fighter.id,
        campId: activeCamp.id,
        category: noteCategory,
        content: noteContent.trim(),
      },
    });
    setNoteContent('');
    setNoteCategory('general');
    setShowNoteForm(false);
  }

  // ── Cloud-linked fighter detail (read-only, from Supabase) ──
  if (cloudFighter) {
    const camps = [...(cloudDetail?.camps ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const camp = camps[0] ?? null;
    const campWorkouts = camp ? (cloudDetail?.workouts ?? []).filter(w => w.camp_id === camp.id) : [];
    const campSparring = camp ? (cloudDetail?.sparring ?? []).filter(s => s.camp_id === camp.id) : [];
    const campWeights = camp
      ? (cloudDetail?.weights ?? []).filter(w => w.camp_id === camp.id)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      : [];
    const latestW = campWeights[campWeights.length - 1]?.weight ?? camp?.current_weight ?? 0;

    return (
      <div className="space-y-4 pb-4">
        <div className="mx-4 mt-4">
          <button onClick={() => { setCloudFighter(null); setCloudDetail(null); }} className="flex items-center gap-2 text-brand-500 text-sm font-medium mb-4">
            ← Back to Fighters
          </button>
          <div className="card flex items-center gap-4">
            <div className="w-14 h-14 bg-brand-900/50 rounded-2xl flex items-center justify-center flex-shrink-0">
              <span className="text-brand-400 font-black text-2xl">{cloudFighter.name.charAt(0)}</span>
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-black text-white">{cloudFighter.name}</h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="badge bg-dark-500 text-gray-400 text-xs">{cloudFighter.sport}</span>
                <span className="badge bg-dark-500 text-gray-400 text-xs">{cloudFighter.weightClass}</span>
                <span className="badge bg-brand-900/40 text-brand-400 text-xs flex items-center gap-1"><Cloud size={10} /> Live</span>
              </div>
            </div>
          </div>
        </div>

        {loadingDetail ? (
          <div className="mx-4 card text-center py-10 text-sm text-gray-500">Loading…</div>
        ) : !camp ? (
          <div className="mx-4 card text-center py-10 text-sm text-gray-500">This fighter hasn't started a camp yet.</div>
        ) : (
          <>
            <div className="mx-4">
              <div className="bg-gradient-to-br from-brand-900/40 to-dark-700 border border-brand-800/40 rounded-xl p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-brand-400 font-semibold uppercase tracking-wider">{camp.is_off_season ? 'Off Season' : 'Active Camp'}</p>
                    <p className="text-2xl font-black text-white mt-1">{camp.fight_date ? `${getDaysUntilFight(camp.fight_date)} days out` : 'Training'}</p>
                    {camp.fight_date && <p className="text-xs text-gray-500">{format(parseISO(camp.fight_date), 'MMM d, yyyy')}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-white">{camp.rounds}R</p>
                    <p className="text-xs text-gray-500">{camp.round_duration}min</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mx-4 grid grid-cols-3 gap-3">
              <div className="stat-card">
                <Activity size={14} className="text-brand-500" />
                <div className="text-lg font-black text-white">{campWorkouts.length}</div>
                <div className="text-xs text-gray-500">sessions</div>
              </div>
              <div className="stat-card">
                <Zap size={14} className="text-yellow-400" />
                <div className="text-lg font-black text-white">{campSparring.reduce((s, l) => s + l.rounds, 0)}</div>
                <div className="text-xs text-gray-500">spar rounds</div>
              </div>
              <div className="stat-card">
                <Scale size={14} className="text-blue-400" />
                <div className="text-lg font-black text-white">{toDisplayWeight(latestW, unit)}</div>
                <div className="text-xs text-gray-500">{unit} now</div>
              </div>
            </div>

            {campSparring.length > 0 && (
              <div className="mx-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Recent Sparring</p>
                <div className="space-y-2">
                  {[...campSparring].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5).map(s => (
                    <div key={s.id} className="card flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{s.rounds} rounds vs {s.partner_name}</p>
                        <p className="text-xs text-gray-500">{format(parseISO(s.date), 'MMM d')} · Week {s.week_number}</p>
                      </div>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold ${
                        s.performance >= 4 ? 'bg-green-900/40 text-green-400' :
                        s.performance >= 3 ? 'bg-yellow-900/40 text-yellow-400' : 'bg-red-900/40 text-red-400'
                      }`}>{s.performance}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {campWorkouts.length > 0 && (
              <div className="mx-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Recent Sessions</p>
                <div className="space-y-2">
                  {[...campWorkouts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5).map(w => (
                    <div key={w.id} className="card flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{w.title}</p>
                        <p className="text-xs text-gray-500">{format(parseISO(w.date), 'MMM d')} · RPE {w.rpe}</p>
                      </div>
                      <span className="text-xs text-gray-500">{w.duration}min</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (selectedFighter && activeCamp) {
    const campWorkouts = workoutLogs.filter(l => l.campId === activeCamp.id);
    const campSparring = sparringLogs.filter(l => l.campId === activeCamp.id);
    const campWeights = weightEntries
      .filter(e => e.campId === activeCamp.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const daysUntil = getDaysUntilFight(activeCamp.fightDate);
    const progress = getCampProgress(activeCamp);
    const latestWeight = campWeights[campWeights.length - 1];
    const currentW = latestWeight ? latestWeight.weight : activeCamp.currentWeight;

    const weeklyStats: Record<number, { week: number; sessions: number; sparRounds: number }> = {};
    for (let i = 1; i <= activeCamp.campWeeks; i++) {
      weeklyStats[i] = { week: i, sessions: 0, sparRounds: 0 };
    }
    campWorkouts.forEach(l => { if (weeklyStats[l.weekNumber]) weeklyStats[l.weekNumber].sessions++; });
    campSparring.forEach(l => { if (weeklyStats[l.weekNumber]) weeklyStats[l.weekNumber].sparRounds += l.rounds; });
    const weeklyData = Object.values(weeklyStats);

    const weightChartData = [
      { date: 'Start', weight: toDisplayWeight(activeCamp.currentWeight, unit) },
      ...campWeights.map(e => ({ date: format(parseISO(e.date), 'M/d'), weight: toDisplayWeight(e.weight, unit) })),
    ];

    const fighterNotes = coachNotes
      .filter(n => n.fighterId === selectedFighter && n.campId === activeCamp.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const visibleNotes = showAllNotes ? fighterNotes : fighterNotes.slice(0, 3);

    return (
      <div className="space-y-4 pb-4">
        <div className="mx-4 mt-4">
          <button onClick={() => { setSelectedFighter(null); setShowNoteForm(false); }} className="flex items-center gap-2 text-brand-500 text-sm font-medium mb-4">
            ← Back to Fighters
          </button>

          {/* Fighter Header */}
          <div className="card flex items-center gap-4">
            <div className="w-14 h-14 bg-brand-900/50 rounded-2xl flex items-center justify-center flex-shrink-0">
              <span className="text-brand-400 font-black text-2xl">{fighter?.name.charAt(0)}</span>
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-black text-white">{fighter?.name}</h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="badge bg-dark-500 text-gray-400 text-xs">{fighter?.sport}</span>
                <span className="badge bg-dark-500 text-gray-400 text-xs">{fighter?.weightClass}</span>
                <span className="badge bg-dark-500 text-gray-400 text-xs">{fighter?.experienceLevel}</span>
                {fighter?.gym && <span className="text-xs text-gray-600">{fighter.gym}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Fight Camp Info */}
        <div className="mx-4">
          <div className="bg-gradient-to-br from-brand-900/40 to-dark-700 border border-brand-800/40 rounded-xl p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-brand-400 font-semibold uppercase tracking-wider">Active Camp</p>
                <p className="text-2xl font-black text-white mt-1">{activeCamp.fightDate ? `${daysUntil} days out` : 'Off-season'}</p>
                <p className="text-xs text-gray-500">{activeCamp.fightDate ? format(parseISO(activeCamp.fightDate), 'MMM d, yyyy') : 'No fight scheduled'}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-white">{activeCamp.rounds}R</p>
                <p className="text-xs text-gray-500">{activeCamp.roundDuration}min</p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Camp Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 bg-dark-500 rounded-full">
                <div className="h-full bg-brand-500 rounded-full" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="mx-4 grid grid-cols-3 gap-3">
          <div className="stat-card">
            <Activity size={14} className="text-brand-500" />
            <div className="text-lg font-black text-white">{campWorkouts.length}</div>
            <div className="text-xs text-gray-500">sessions</div>
          </div>
          <div className="stat-card">
            <Zap size={14} className="text-yellow-400" />
            <div className="text-lg font-black text-white">{campSparring.reduce((s, l) => s + l.rounds, 0)}</div>
            <div className="text-xs text-gray-500">spar rounds</div>
          </div>
          <div className="stat-card">
            <Scale size={14} className="text-blue-400" />
            <div className="text-lg font-black text-white">{toDisplayWeight(currentW, unit)}</div>
            <div className="text-xs text-gray-500">{unit} now</div>
          </div>
        </div>

        {/* Coach Notes Section */}
        <div className="mx-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Coach Notes</p>
            <button
              onClick={() => setShowNoteForm(v => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-brand-400 hover:text-brand-300 transition-colors"
            >
              <MessageSquarePlus size={14} />
              Add Note
            </button>
          </div>

          {/* Note Form */}
          {showNoteForm && (
            <div className="card mb-3 space-y-3">
              {/* Category picker */}
              <div className="flex gap-1.5 flex-wrap">
                {(Object.keys(CATEGORY_STYLES) as CoachNoteCategory[]).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setNoteCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      noteCategory === cat
                        ? `${CATEGORY_STYLES[cat].cls} border-current`
                        : 'bg-dark-600 text-gray-500 border-dark-500 hover:border-dark-300'
                    }`}
                  >
                    {CATEGORY_STYLES[cat].label}
                  </button>
                ))}
              </div>
              <textarea
                className="input w-full min-h-[90px] text-sm resize-none"
                placeholder="Write your coaching feedback, observations, or instructions..."
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowNoteForm(false); setNoteContent(''); }}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitNote}
                  disabled={!noteContent.trim()}
                  className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
                >
                  Post Note
                </button>
              </div>
            </div>
          )}

          {/* Notes List */}
          {fighterNotes.length === 0 ? (
            <div className="card text-center py-6">
              <MessageSquarePlus size={24} className="text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No notes yet</p>
              <p className="text-xs text-gray-600 mt-1">Add coaching feedback to keep your fighter on track</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleNotes.map(note => (
                <div key={note.id} className="card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`badge text-xs font-semibold ${CATEGORY_STYLES[note.category].cls}`}>
                          {CATEGORY_STYLES[note.category].label}
                        </span>
                        <span className="text-xs text-gray-600">
                          {format(parseISO(note.createdAt), 'MMM d, h:mm a')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300 leading-relaxed">{note.content}</p>
                    </div>
                    <button
                      onClick={() => dispatch({ type: 'DELETE_COACH_NOTE', payload: note.id })}
                      className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {fighterNotes.length > 3 && (
                <button
                  onClick={() => setShowAllNotes(v => !v)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <ChevronDown size={14} className={`transition-transform ${showAllNotes ? 'rotate-180' : ''}`} />
                  {showAllNotes ? 'Show less' : `Show ${fighterNotes.length - 3} more notes`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Weekly Sessions Chart */}
        {weeklyData.some(w => w.sessions > 0) && (
          <div className="mx-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Weekly Activity</p>
            <div className="card p-2">
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={weeklyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="week" tick={{ fill: '#666', fontSize: 10 }} tickFormatter={v => `W${v}`} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#666', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="sessions" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: '#f97316' }} name="Sessions" />
                  <Line type="monotone" dataKey="sparRounds" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3, fill: '#60a5fa' }} name="Spar Rds" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Weight Trend */}
        {weightChartData.length > 1 && (
          <div className="mx-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Weight Trend</p>
            <div className="card p-2">
              <div className="flex justify-between text-xs text-gray-500 mb-2 px-1">
                <span>Current: {formatWeight(currentW, unit)}</span>
                <span>Target: {formatWeight(activeCamp.targetWeight, unit)}</span>
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={weightChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#666', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="weight" stroke="#60a5fa" strokeWidth={2.5} dot={{ r: 3, fill: '#60a5fa' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Recent Sparring */}
        {campSparring.length > 0 && (
          <div className="mx-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Recent Sparring</p>
            <div className="space-y-2">
              {campSparring.slice(0, 5).map(s => (
                <div key={s.id} className="card flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{s.rounds} rounds vs {s.partnerName}</p>
                    <p className="text-xs text-gray-500">{format(parseISO(s.date), 'MMM d')} · Week {s.weekNumber}</p>
                    {s.focus && <p className="text-xs text-gray-600 mt-0.5">Focus: {s.focus}</p>}
                  </div>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold ${
                    s.performance >= 4 ? 'bg-green-900/40 text-green-400' :
                    s.performance >= 3 ? 'bg-yellow-900/40 text-yellow-400' :
                    'bg-red-900/40 text-red-400'
                  }`}>
                    {s.performance}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="mx-4 mt-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-black text-white">Coach View</h2>
            <p className="text-sm text-gray-500">{activeFighters.length} fighter{activeFighters.length !== 1 ? 's' : ''} in system</p>
          </div>
          <div className="w-10 h-10 bg-brand-900/40 rounded-xl flex items-center justify-center">
            <Users size={18} className="text-brand-400" />
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="input pl-9"
            placeholder="Search fighters..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Coach Pro CTA — coach features are a paid tier */}
        {!coachPro && (
          <button
            onClick={() => setShowUpgrade(true)}
            className="w-full mb-4 flex items-center gap-3 p-3.5 rounded-xl border border-purple-700/40 bg-gradient-to-br from-purple-900/30 to-dark-700 text-left hover:border-purple-600 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-purple-900/40 flex items-center justify-center flex-shrink-0">
              <Lock size={16} className="text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Unlock Coach Pro</p>
              <p className="text-xs text-gray-400 mt-0.5">View fighter analytics, add notes &amp; manage unlimited fighters</p>
            </div>
            <ChevronRight size={16} className="text-purple-400 flex-shrink-0" />
          </button>
        )}

        {/* Connected Fighters (cloud) */}
        {authConfigured && authUser && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Cloud size={14} className="text-brand-400" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Connected Fighters</p>
            </div>
            {linked.length === 0 ? (
              <div className="card text-center py-6">
                <Users size={24} className="text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No connected fighters yet</p>
                <p className="text-xs text-gray-600 mt-1">Generate an invite code in Settings and share it with your fighters.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {linked
                  .filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()) || f.sport.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(f => (
                    <button key={f.id} onClick={() => openCloudFighter(f)} className="w-full card hover:border-brand-700 transition-colors text-left">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-brand-900/50 to-dark-600 rounded-xl flex items-center justify-center flex-shrink-0">
                          <span className="text-brand-400 font-black text-lg">{f.name.charAt(0)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-white">{f.name}</p>
                            {f.gym && <span className="text-xs text-gray-600">· {f.gym}</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="badge bg-dark-500 text-gray-500 text-xs">{f.sport}</span>
                            <span className="badge bg-dark-500 text-gray-500 text-xs">{f.weightClass}</span>
                            {f.latestCamp?.fight_date && (
                              <span className="text-xs text-brand-400">{getDaysUntilFight(f.latestCamp.fight_date)}d to fight</span>
                            )}
                          </div>
                        </div>
                        {coachPro ? <ChevronRight size={16} className="text-gray-600" /> : <Lock size={14} className="text-brand-500" />}
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Camp Overview */}
        {activeCamp && (
          <div className="bg-gradient-to-br from-dark-700 to-dark-600 border border-dark-400 rounded-xl p-4 mb-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Active Camp Overview</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <div className="text-2xl font-black text-white">{getDaysUntilFight(activeCamp.fightDate)}</div>
                <div className="text-xs text-gray-500">days out</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-white">{workoutLogs.filter(l => l.campId === activeCamp.id).length}</div>
                <div className="text-xs text-gray-500">sessions logged</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-brand-400">{getCampProgress(activeCamp)}%</div>
                <div className="text-xs text-gray-500">camp progress</div>
              </div>
            </div>
          </div>
        )}

        {/* Legacy local fighter list — only in offline/demo mode (cloud uses Connected Fighters above) */}
        {activeFighters.length > 0 && (
          <div className="space-y-3">
            {filtered.map(f => {
              const fCamp = camps[camps.length - 1];
              const fWorkouts = workoutLogs.filter(l => fCamp && l.campId === fCamp.id);
              const fSparring = sparringLogs.filter(l => fCamp && l.campId === fCamp.id);
              const unreadNotes = coachNotes.filter(n => n.fighterId === f.id && fCamp && n.campId === fCamp.id).length;

              return (
                <button
                  key={f.id}
                  onClick={() => openFighter(f.id)}
                  className="w-full card hover:border-brand-700 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-brand-900/50 to-dark-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <span className="text-brand-400 font-black text-lg">{f.name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-white">{f.name}</p>
                        {f.gym && <span className="text-xs text-gray-600">· {f.gym}</span>}
                        {unreadNotes > 0 && (
                          <span className="ml-auto badge bg-brand-700 text-white text-xs px-2">{unreadNotes} note{unreadNotes !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="badge bg-dark-500 text-gray-500 text-xs">{f.sport}</span>
                        <span className="badge bg-dark-500 text-gray-500 text-xs">{f.weightClass}</span>
                      </div>
                    </div>
                    {coachPro
                      ? <ChevronRight size={16} className="text-gray-600" />
                      : <Lock size={14} className="text-brand-500" />}
                  </div>

                  {fCamp && (
                    <div className="mt-3 pt-3 border-t border-dark-500 grid grid-cols-3 gap-2">
                      <div className="text-center">
                        <p className="text-sm font-bold text-white">{fWorkouts.length}</p>
                        <p className="text-xs text-gray-600">sessions</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-white">{fSparring.reduce((s, l) => s + l.rounds, 0)}</p>
                        <p className="text-xs text-gray-600">spar rds</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-brand-400">{getDaysUntilFight(fCamp.fightDate)}d</p>
                        <p className="text-xs text-gray-600">to fight</p>
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Local-mode hint — only when offline (cloud coaches use Connected Fighters) */}
      {!authUser && activeFighters.length === 0 && (
        <div className="mx-4 card text-center py-8">
          <User size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Fighters will appear here once they create accounts and link you as their coach in their Settings.</p>
        </div>
      )}

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
