import { useState, useEffect } from 'react';
import { Users, ChevronRight, Activity, Scale, Zap, User, Search, MessageSquarePlus, Trash2, ChevronDown, Lock, Cloud } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PACE_COLORS, paceTier, tint } from '../utils/designTokens';
import { useAuth } from '../context/AuthContext';
import { format, parseISO } from 'date-fns';
import { getDaysUntilFight, getCampProgress } from '../utils/campGenerator';
import { isCoachPro } from '../utils/subscription';
import { toDisplayWeight, formatWeight } from '../utils/units';
import {
  listLinkedFighters, getFighterDetail, listCoachNotes, postCoachNote, removeCoachNote,
  getTeamSnapshots,
  type LinkedFighter, type FighterDetail, type CloudCoachNote,
} from '../lib/coachLinks';
import { buildTeamOverview, FLAG_LABELS, type TeamOverviewRow } from '../utils/teamOverview';
import UpgradeModal from './shared/UpgradeModal';
import GlassMetricTile from './shared/GlassMetricTile';
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

/**
 * A coach and their fighter must never read two different colours for the same
 * camp. Both scales below therefore resolve through the same pace tiers the
 * fighter-side screens use (§2.6) rather than through a private green/amber/red
 * — which is what this file previously carried, in four separate places.
 */
function paceColor(ratio: number): string {
  return PACE_COLORS[paceTier(ratio)];
}

/** Sparring performance is scored 1–5; 4+ is good, 3 is watchable. */
function performanceStyle(score: number) {
  const color = paceColor(score / 4);
  return { backgroundColor: tint(color, 0.18), color };
}


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
  conditioning: { label: 'Conditioning', cls: 'bg-accent-gold/20 text-accent-gold' },
  mental:       { label: 'Mental',       cls: 'bg-accent-violet/20 text-accent-violet' },
  nutrition:    { label: 'Nutrition',    cls: 'bg-accent-green/20 text-accent-green' },
  general:      { label: 'General',      cls: 'bg-dark-500 text-gray-400' },
};

/**
 * Which of the coach's two tabs is being rendered.
 *
 * The tab bar has always had both, and both used to render this component with
 * no argument — so a coach had two tabs showing one screen. They are two jobs:
 * `overview` answers "who needs me today", `roster` answers "show me a specific
 * fighter". The fighter detail view is reachable from either and is shared
 * below, which is why this is one component with a mode rather than two files
 * that would each need their own copy of the detail screen and its note form.
 */
export type CoachView = 'overview' | 'roster';

interface Props {
  mode?: CoachView;
  /** Lets the overview hand off to the roster tab. */
  onNavigate?: (view: string) => void;
}

export default function CoachDashboard({ mode = 'overview', onNavigate }: Props) {
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

  // The coach side is a paid tier. Free coaches see the roster shell, but
  // opening a fighter's data / notes requires Coach Pro.
  const coachPro = isCoachPro(state.subscription);

  // Declared here rather than beside the list render because the fighter
  // detail views return early, above that point, and their back button names
  // the tab it returns to.
  const overview = mode === 'overview';

  // Team overview (Coach Pro). Loaded alongside the roster rather than on
  // demand — it is the first thing on the screen, and a spinner where the
  // triage table should be defeats the point of it.
  const [team, setTeam] = useState<TeamOverviewRow[]>([]);

  useEffect(() => {
    if (!authConfigured || !authUser || currentUser?.role !== 'coach') return;
    listLinkedFighters(authUser.id).then(setLinked);
  }, [authConfigured, authUser, currentUser?.role]);

  useEffect(() => {
    // Gated on the entitlement too: without it the table never renders, and
    // fetching every linked fighter's logs to throw them away is pure cost.
    // Nothing is cleared on the way out — the table's own render is gated on
    // `coachPro`, so a stale roster can never be displayed, and clearing here
    // would be a state write on every render this effect re-runs.
    if (!authConfigured || !authUser || currentUser?.role !== 'coach' || !coachPro) return;
    let active = true;
    getTeamSnapshots(authUser.id)
      .then(snaps => { if (active) setTeam(buildTeamOverview(snaps)); })
      .catch(() => { /* roster stays empty; the section renders its own notice */ });
    return () => { active = false; };
  }, [authConfigured, authUser, currentUser?.role, coachPro]);

  // ── Cloud coach notes (the ones that actually reach a remote fighter) ──
  //
  // Kept in component state, not app state: these rows belong to the *fighter's*
  // account and are written straight to Supabase (see lib/coachLinks.ts). The
  // local `coachNotes` slice is a different thing — notes on locally-added
  // fighters, which have no cloud identity.
  const [cloudNotes, setCloudNotes] = useState<CloudCoachNote[]>([]);
  const [cloudNoteContent, setCloudNoteContent] = useState('');
  const [cloudNoteCategory, setCloudNoteCategory] = useState<CoachNoteCategory>('general');
  const [cloudNoteBusy, setCloudNoteBusy] = useState(false);
  const [cloudNoteError, setCloudNoteError] = useState('');

  async function openCloudFighter(f: LinkedFighter) {
    if (!coachPro) { setShowUpgrade(true); return; }
    setCloudFighter(f);
    setLoadingDetail(true);
    setCloudNoteError('');
    const [detail, notes] = await Promise.all([getFighterDetail(f.id), listCoachNotes(f.id)]);
    setCloudDetail(detail);
    setCloudNotes(notes);
    setLoadingDetail(false);
  }

  async function submitCloudNote(campId: string) {
    if (!cloudFighter || !authUser || !cloudNoteContent.trim()) return;
    setCloudNoteBusy(true);
    setCloudNoteError('');
    const res = await postCoachNote({
      coachId: authUser.id,
      coachName: currentUser?.name ?? 'Coach',
      fighterId: cloudFighter.id,
      campId,
      category: cloudNoteCategory,
      content: cloudNoteContent.trim(),
    });
    if (res.error) {
      setCloudNoteError(res.error);
      setCloudNoteBusy(false);
      return;
    }
    // Re-read rather than optimistically appending: the row's id and
    // created_at are assigned by the server, and the note list is keyed on both.
    setCloudNotes(await listCoachNotes(cloudFighter.id));
    setCloudNoteContent('');
    setCloudNoteCategory('general');
    setCloudNoteBusy(false);
  }

  async function retractCloudNote(noteId: string) {
    if (!cloudFighter) return;
    const res = await removeCoachNote(noteId);
    if (res.error) { setCloudNoteError(res.error); return; }
    setCloudNotes(await listCoachNotes(cloudFighter.id));
  }

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
            ← Back to {overview ? 'Team' : 'Fighters'}
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
          <div className="mx-4 card text-center py-10 text-sm text-gray-400">Loading…</div>
        ) : !camp ? (
          <div className="mx-4 card text-center py-10 text-sm text-gray-400">This fighter hasn't started a camp yet.</div>
        ) : (
          <>
            <div className="mx-4">
              <div className="bg-gradient-to-br from-brand-900/40 to-dark-700 border border-brand-800/40 rounded-xl p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-brand-400 font-semibold uppercase tracking-wider">{camp.is_off_season ? 'Off Season' : 'Active Camp'}</p>
                    <p className="text-2xl font-black text-white mt-1">{camp.fight_date ? `${getDaysUntilFight(camp.fight_date)} days out` : 'Training'}</p>
                    {camp.fight_date && <p className="text-xs text-gray-400">{format(parseISO(camp.fight_date), 'MMM d, yyyy')}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-white">{camp.rounds}R</p>
                    <p className="text-xs text-gray-400">{camp.round_duration}min</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mx-4 grid grid-cols-3" style={{ gap: 'var(--space-3)' }}>
              <GlassMetricTile
                label="Sessions"
                value={campWorkouts.length}
                icon={<Activity size={13} style={{ color: 'var(--accent-flame)' }} />}
              />
              <GlassMetricTile
                label="Rounds"
                value={campSparring.reduce((s, l) => s + l.rounds, 0)}
                icon={<Zap size={13} style={{ color: 'var(--accent-gold)' }} />}
              />
              <GlassMetricTile
                label={`${unit} now`}
                value={toDisplayWeight(latestW, unit)}
                icon={<Scale size={13} style={{ color: 'var(--accent-blue)' }} />}
              />
            </div>

            {campSparring.length > 0 && (
              <div className="mx-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Recent Sparring</p>
                <div className="space-y-2">
                  {[...campSparring].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5).map(s => (
                    <div key={s.id} className="card flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{s.rounds} rounds{s.partner_name && s.partner_name !== 'Unknown' ? ` vs ${s.partner_name}` : ''}</p>
                        <p className="text-xs text-gray-400">{format(parseISO(s.date), 'MMM d')} · Week {s.week_number}</p>
                      </div>
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold tabular-nums"
                        style={performanceStyle(s.performance)}
                      >{s.performance}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {campWorkouts.length > 0 && (
              <div className="mx-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Recent Sessions</p>
                <div className="space-y-2">
                  {[...campWorkouts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5).map(w => (
                    <div key={w.id} className="card flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{w.title}</p>
                        <p className="text-xs text-gray-400">{format(parseISO(w.date), 'MMM d')} · RPE {w.rpe}</p>
                      </div>
                      <span className="text-xs text-gray-400">{w.duration}min</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Coach notes — the write path that actually reaches this fighter's
                phone. Scoped to the camp on screen, which is what makes the
                camp_id foreign key resolvable on the fighter's side. */}
            <div className="mx-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Coach Notes</p>

              <div className="card mb-3 space-y-3">
                <div className="flex gap-1.5 flex-wrap">
                  {(Object.keys(CATEGORY_STYLES) as CoachNoteCategory[]).map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCloudNoteCategory(cat)}
                      aria-pressed={cloudNoteCategory === cat}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                        cloudNoteCategory === cat
                          ? `${CATEGORY_STYLES[cat].cls} border-current`
                          : 'bg-dark-600 text-gray-400 border-dark-500 hover:border-dark-300'
                      }`}
                    >
                      {CATEGORY_STYLES[cat].label}
                    </button>
                  ))}
                </div>
                <textarea
                  className="input w-full min-h-[90px] text-sm resize-none"
                  placeholder={`Write a note ${cloudFighter.name.split(' ')[0]} will see in their app…`}
                  value={cloudNoteContent}
                  onChange={e => setCloudNoteContent(e.target.value)}
                />
                {cloudNoteError && (
                  <p className="text-xs text-accent-crimson">{cloudNoteError}</p>
                )}
                <div className="flex justify-end">
                  <button
                    onClick={() => submitCloudNote(camp.id)}
                    disabled={!cloudNoteContent.trim() || cloudNoteBusy}
                    className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
                  >
                    {cloudNoteBusy ? 'Sending…' : 'Send Note'}
                  </button>
                </div>
              </div>

              {cloudNotes.length === 0 ? (
                <div className="card text-center py-6">
                  <MessageSquarePlus size={24} className="text-gray-450 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No notes yet</p>
                  <p className="text-xs text-gray-450 mt-1">Notes you send appear on {cloudFighter.name.split(' ')[0]}&apos;s phone on their next sync</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cloudNotes.map(note => (
                    <div key={note.id} className="card">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className={`badge text-xs font-semibold ${
                              CATEGORY_STYLES[note.category as CoachNoteCategory]?.cls ?? 'bg-dark-500 text-gray-400'
                            }`}>
                              {CATEGORY_STYLES[note.category as CoachNoteCategory]?.label ?? note.category}
                            </span>
                            <span className="text-xs text-gray-450">
                              {format(parseISO(note.createdAt), 'MMM d, h:mm a')}
                            </span>
                            {note.coachId !== authUser?.id && (
                              <span className="text-xs text-gray-450">· {note.coachName}</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-300 leading-relaxed">{note.content}</p>
                        </div>
                        {/* Only the author can retract a note — RLS enforces the
                            same rule, so showing the control to anyone else would
                            offer an action the server rejects. */}
                        {note.coachId === authUser?.id && (
                          <button
                            onClick={() => retractCloudNote(note.id)}
                            aria-label="Delete note"
                            className="text-gray-450 hover:text-accent-crimson transition-colors flex-shrink-0 mt-0.5"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
            ← Back to {overview ? 'Team' : 'Fighters'}
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
                {fighter?.gym && <span className="text-xs text-gray-450">{fighter.gym}</span>}
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
                <p className="text-xs text-gray-400">{activeCamp.fightDate ? format(parseISO(activeCamp.fightDate), 'MMM d, yyyy') : 'No fight scheduled'}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-white">{activeCamp.rounds}R</p>
                <p className="text-xs text-gray-400">{activeCamp.roundDuration}min</p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
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
        <div className="mx-4 grid grid-cols-3" style={{ gap: 'var(--space-3)' }}>
          <GlassMetricTile
            label="Sessions"
            value={campWorkouts.length}
            icon={<Activity size={13} style={{ color: 'var(--accent-flame)' }} />}
          />
          <GlassMetricTile
            label="Rounds"
            value={campSparring.reduce((s, l) => s + l.rounds, 0)}
            icon={<Zap size={13} style={{ color: 'var(--accent-gold)' }} />}
          />
          <GlassMetricTile
            label={`${unit} now`}
            value={toDisplayWeight(currentW, unit)}
            icon={<Scale size={13} style={{ color: 'var(--accent-blue)' }} />}
          />
        </div>

        {/* Coach Notes Section */}
        <div className="mx-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Coach Notes</p>
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
                        : 'bg-dark-600 text-gray-400 border-dark-500 hover:border-dark-300'
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
              <MessageSquarePlus size={24} className="text-gray-450 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No notes yet</p>
              <p className="text-xs text-gray-450 mt-1">Add coaching feedback to keep your fighter on track</p>
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
                        <span className="text-xs text-gray-450">
                          {format(parseISO(note.createdAt), 'MMM d, h:mm a')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300 leading-relaxed">{note.content}</p>
                    </div>
                    <button
                      onClick={() => dispatch({ type: 'DELETE_COACH_NOTE', payload: note.id })}
                      className="text-gray-450 hover:text-accent-crimson transition-colors flex-shrink-0 mt-0.5"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {fighterNotes.length > 3 && (
                <button
                  onClick={() => setShowAllNotes(v => !v)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-400 hover:text-gray-300 transition-colors"
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
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Weekly Activity</p>
            <div role="img" aria-label="Bar chart of sessions logged per week across your fighters." className="card p-2">
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={weeklyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-2)" />
                  <XAxis dataKey="week" tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} tickFormatter={v => `W${v}`} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="sessions" stroke="var(--accent-flame)" strokeWidth={2} dot={{ r: 3, fill: 'var(--accent-flame)' }} name="Sessions" />
                  <Line type="monotone" dataKey="sparRounds" stroke="var(--accent-blue)" strokeWidth={2} dot={{ r: 3, fill: 'var(--accent-blue)' }} name="Spar Rds" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Weight Trend */}
        {weightChartData.length > 1 && (
          <div className="mx-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Weight Trend</p>
            <div className="card p-2">
              <div className="flex justify-between text-xs text-gray-400 mb-2 px-1">
                <span>Current: {formatWeight(currentW, unit)}</span>
                <span>Target: {formatWeight(activeCamp.targetWeight, unit)}</span>
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={weightChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-2)" />
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="weight" stroke="var(--accent-blue)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--accent-blue)' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Recent Sparring */}
        {campSparring.length > 0 && (
          <div className="mx-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Recent Sparring</p>
            <div className="space-y-2">
              {/* Sorted before slicing, matching the cloud-fighter branch
                  above — array position is not recency after a cloud restore. */}
              {[...campSparring].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map(s => (
                <div key={s.id} className="card flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{s.rounds} rounds{s.partnerName && s.partnerName !== 'Unknown' ? ` vs ${s.partnerName}` : ''}</p>
                    <p className="text-xs text-gray-400">{format(parseISO(s.date), 'MMM d')} · Week {s.weekNumber}</p>
                    {s.focus && <p className="text-xs text-gray-450 mt-0.5">Focus: {s.focus}</p>}
                  </div>
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold tabular-nums"
                    style={performanceStyle(s.performance)}
                  >
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

  // ── Triage counts, for the overview header and its summary tiles ──
  // Read off the same rows the table renders, so the count and the table can
  // never disagree about who needs attention.
  const flaggedRows = team.filter(r => r.flags.length > 0);
  const fightWeekRows = team.filter(r => r.flags.includes('fight-week'));
  const rosterSize = linked.length || activeFighters.length;

  return (
    <div className="space-y-4 pb-4">
      <div className="mx-4 mt-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-black text-white">{overview ? 'Team' : 'Fighters'}</h2>
            <p className="text-sm text-gray-400">
              {overview
                ? (team.length > 0
                    ? `${flaggedRows.length} of ${team.length} need${flaggedRows.length === 1 ? 's' : ''} your attention`
                    : 'Camp status across your roster')
                : `${rosterSize} fighter${rosterSize !== 1 ? 's' : ''} in system`}
            </p>
          </div>
          <div className="w-10 h-10 bg-brand-900/40 rounded-xl flex items-center justify-center">
            {overview
              ? <Activity size={18} className="text-brand-400" />
              : <Users size={18} className="text-brand-400" />}
          </div>
        </div>

        {/* Search — the roster's job, not the overview's. The overview is a
            fixed, already-prioritised list; there is nothing there to find. */}
        {!overview && (
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Search fighters..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        {/* Coach Pro CTA — coach features are a paid tier */}
        {!coachPro && (
          <button
            onClick={() => setShowUpgrade(true)}
            className="w-full mb-4 flex items-center gap-3 p-3.5 rounded-xl border border-purple-700/40 bg-gradient-to-br from-purple-900/30 to-dark-700 text-left hover:border-purple-600 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-accent-violet/20 flex items-center justify-center flex-shrink-0">
              <Lock size={16} className="text-accent-violet" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Unlock Coach Pro</p>
              <p className="text-xs text-gray-400 mt-0.5">View fighter analytics, add notes &amp; manage unlimited fighters</p>
            </div>
            <ChevronRight size={16} className="text-accent-violet flex-shrink-0" />
          </button>
        )}

        {/* The triage strip — the answer to "who needs me today" above the
            table that says why. Overview only, and only once the rows exist:
            two tiles reading zero would be a worse answer than no tiles. */}
        {overview && team.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <GlassMetricTile
              label="Need attention"
              value={flaggedRows.length}
              icon={<Activity size={14} />}
              goodDirection="down"
            />
            <GlassMetricTile
              label="In fight week"
              value={fightWeekRows.length}
              icon={<Zap size={14} />}
            />
          </div>
        )}

        {/* Team Overview — the triage table. Coach Pro only: it is the roster
            analytics the tier is sold on, and every field it reads is behind
            the same gate as the fighter detail view. */}
        {overview && authConfigured && authUser && coachPro && linked.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Users size={14} className="text-brand-400" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Team Overview</p>
            </div>
            {team.length === 0 ? (
              <div className="card text-center py-6 text-sm text-gray-400">Loading team overview…</div>
            ) : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-500">
                    <th scope="col" className="text-left font-semibold text-gray-400 text-xs uppercase tracking-wider px-3 py-2">Fighter</th>
                    <th scope="col" className="text-right font-semibold text-gray-400 text-xs uppercase tracking-wider px-2 py-2 whitespace-nowrap">Days out</th>
                    <th scope="col" className="text-right font-semibold text-gray-400 text-xs uppercase tracking-wider px-2 py-2">Adherence</th>
                    <th scope="col" className="text-right font-semibold text-gray-400 text-xs uppercase tracking-wider px-2 py-2 whitespace-nowrap">7d</th>
                    <th scope="col" className="text-right font-semibold text-gray-400 text-xs uppercase tracking-wider px-3 py-2 whitespace-nowrap">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map(row => {
                    const fighterLink = linked.find(f => f.id === row.fighterId);
                    return (
                      <tr
                        key={row.fighterId}
                        onClick={() => fighterLink && openCloudFighter(fighterLink)}
                        className="border-b border-dark-600 last:border-0 hover:bg-dark-600/50 transition-colors cursor-pointer"
                      >
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-white leading-tight">{row.name}</p>
                          {row.flags.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {row.flags.map(flag => (
                                <span
                                  key={flag}
                                  className="badge text-[10px]"
                                  style={
                                    /* Fight week is a state, not a problem — it
                                       takes the flame of the countdown rather
                                       than the crimson of a red flag. */
                                    flag === 'fight-week'
                                      ? { backgroundColor: tint('var(--accent-flame)', 0.18), color: 'var(--accent-flame)' }
                                      : { backgroundColor: tint('var(--pace-critical)', 0.18), color: 'var(--pace-critical)' }
                                  }
                                >
                                  {FLAG_LABELS[flag]}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-450 mt-0.5">
                              {row.hasCamp ? 'On track' : 'No camp'}
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-right text-white whitespace-nowrap">
                          {row.daysOut !== null ? `${row.daysOut}d` : <span className="text-gray-450">—</span>}
                        </td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap">
                          {row.adherencePct === null ? (
                            <span className="text-gray-450">—</span>
                          ) : (
                            <span
                              className="tabular-nums"
                              style={{ color: paceColor(row.adherencePct / 80) }}
                            >
                              {row.adherencePct}%
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-right text-gray-300 whitespace-nowrap">
                          {row.sessionsLast7}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-300 whitespace-nowrap">
                          {row.latestWeight === null ? (
                            <span className="text-gray-450">—</span>
                          ) : (
                            <>
                              {toDisplayWeight(row.latestWeight, unit)}
                              {row.targetWeight !== null && !row.isOffSeason && (
                                <span className="text-gray-450"> / {toDisplayWeight(row.targetWeight, unit)}</span>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
            {/* The column headings alone don't say what "adherence" counts, and
                a coach reads this table at a glance. */}
            <p className="text-xs text-gray-450 mt-2">
              Sorted by who needs you first. Adherence is ticked sessions ÷ scheduled sessions; 7d is sessions logged this week.
            </p>
          </div>
        )}

        {/* What the overview shows when the triage table cannot render. Each
            case has a different fix, so each gets its own sentence rather than
            one generic "nothing here yet" — a coach who is simply not signed in
            should not be told to buy anything. */}
        {overview && !(authConfigured && authUser && coachPro && linked.length > 0) && (
          <div className="card text-center py-8">
            <Users size={28} className="text-gray-450 mx-auto mb-3" />
            <p className="text-sm text-gray-400">
              {!authConfigured || !authUser
                ? 'Sign in to see camp status across your team.'
                : !coachPro
                  ? 'Coach Pro shows every fighter’s adherence, cut pace and quiet streaks in one table.'
                  : 'Connect a fighter and their camp status shows up here.'}
            </p>
            <button
              onClick={() => (!coachPro && authUser ? setShowUpgrade(true) : onNavigate?.('fighters'))}
              className="mt-3 text-sm font-semibold text-brand-400"
            >
              {!coachPro && authUser ? 'See Coach Pro' : 'Go to Fighters'}
            </button>
          </div>
        )}

        {/* Connected Fighters (cloud) */}
        {!overview && authConfigured && authUser && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Cloud size={14} className="text-brand-400" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Connected Fighters</p>
            </div>
            {linked.length === 0 ? (
              <div className="card text-center py-6">
                <Users size={24} className="text-gray-450 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No connected fighters yet</p>
                <p className="text-xs text-gray-450 mt-1">Generate an invite code in Settings and share it — or enter a code a fighter sent you.</p>
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
                            {f.gym && <span className="text-xs text-gray-450">· {f.gym}</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="badge bg-dark-500 text-gray-400 text-xs">{f.sport}</span>
                            <span className="badge bg-dark-500 text-gray-400 text-xs">{f.weightClass}</span>
                            {f.latestCamp?.fight_date && (
                              <span className="text-xs text-brand-400">{getDaysUntilFight(f.latestCamp.fight_date)}d to fight</span>
                            )}
                          </div>
                        </div>
                        {coachPro ? <ChevronRight size={16} className="text-gray-450" /> : <Lock size={14} className="text-brand-500" />}
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Camp Overview */}
        {overview && activeCamp && (
          <div className="bg-gradient-to-br from-dark-700 to-dark-600 border border-dark-400 rounded-xl p-4 mb-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Active Camp Overview</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <div className="text-2xl font-black text-white">{getDaysUntilFight(activeCamp.fightDate)}</div>
                <div className="text-xs text-gray-400">days out</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-white">{workoutLogs.filter(l => l.campId === activeCamp.id).length}</div>
                <div className="text-xs text-gray-400">sessions logged</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-brand-400">{getCampProgress(activeCamp)}%</div>
                <div className="text-xs text-gray-400">camp progress</div>
              </div>
            </div>
          </div>
        )}

        {/* Legacy local fighter list — only in offline/demo mode (cloud uses Connected Fighters above) */}
        {!overview && activeFighters.length > 0 && (
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
                        {f.gym && <span className="text-xs text-gray-450">· {f.gym}</span>}
                        {unreadNotes > 0 && (
                          <span className="ml-auto badge bg-brand-700 text-white text-xs px-2">{unreadNotes} note{unreadNotes !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="badge bg-dark-500 text-gray-400 text-xs">{f.sport}</span>
                        <span className="badge bg-dark-500 text-gray-400 text-xs">{f.weightClass}</span>
                      </div>
                    </div>
                    {coachPro
                      ? <ChevronRight size={16} className="text-gray-450" />
                      : <Lock size={14} className="text-brand-500" />}
                  </div>

                  {fCamp && (
                    <div className="mt-3 pt-3 border-t border-dark-500 grid grid-cols-3 gap-2">
                      <div className="text-center">
                        <p className="text-sm font-bold text-white">{fWorkouts.length}</p>
                        <p className="text-xs text-gray-450">sessions</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-white">{fSparring.reduce((s, l) => s + l.rounds, 0)}</p>
                        <p className="text-xs text-gray-450">spar rds</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-brand-400">{getDaysUntilFight(fCamp.fightDate)}d</p>
                        <p className="text-xs text-gray-450">to fight</p>
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
      {!overview && !authUser && activeFighters.length === 0 && (
        <div className="mx-4 card text-center py-8">
          <User size={32} className="text-gray-450 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Fighters will appear here once they create accounts and link you as their coach in their Settings.</p>
        </div>
      )}

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} defaultTier="coach" />}
    </div>
  );
}
