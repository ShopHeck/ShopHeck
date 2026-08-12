import { ChevronRight, MessageSquare, History, Swords, Trophy } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useApp } from '../context/AppContext';
import { getDaysUntilFight, getCurrentWeekNumber, getCampProgress } from '../utils/campGenerator';
import { activeCornerSession } from '../utils/cornerMode';
import { fightCta } from '../utils/fightDayCta';
import AdaptationCard from './AdaptationCard';
import FightCountdownCard from './shared/FightCountdownCard';
import TodayCard from './shared/TodayCard';
import CampPulse from './shared/CampPulse';
import HomeCards from './shared/HomeCards';
import PinnedTools from './shared/PinnedTools';
import type { TimerPrefill } from '../utils/timerSession';
import type { LogPrefill } from '../App';
import type { View } from '../types';

const ACCENT = 'var(--accent-flame)';

interface Props {
  onNavigate: (view: string, prefill?: LogPrefill) => void;
  onShowFightBreakdown: (fightId: string) => void;
  /** Same handover the weekly planner uses so Today starts the right clock. */
  onStartTimer: (prefill: TimerPrefill) => void;
}

/**
 * The fight-camp Home.
 *
 * Five blocks, in the order a fighter actually asks the questions: how long
 * have I got, is anything demanding my attention, what am I doing today and am
 * I fit to do it, how is the week going, and then whatever they chose to keep
 * within reach.
 *
 * It held fifteen. Five facts were stated more than once between them — week
 * progress three times, the cut twice, today's session twice, and "sessions"
 * twice meaning two different numbers — and two more blocks (Recent Activity,
 * Weight Status) restated screens already sitting in the tab bar. What was
 * removed is not gone: everything below the pulse is a card in
 * `utils/homeLayout` that can be pinned back from More, which is also where
 * the tool grid now comes from.
 */
export default function Dashboard({ onNavigate, onShowFightBreakdown, onStartTimer }: Props) {
  const { state } = useApp();
  const { activeCamp, coachNotes, currentUser, fightResults } = state;

  if (!activeCamp) return null;

  const daysUntil = getDaysUntilFight(activeCamp.fightDate);
  const campFightResult = fightResults.find(r => r.campId === activeCamp.id);

  // The fight-day handover between these two CTAs got it wrong once and is now
  // a tested pure function — see utils/fightDayCta.ts for what broke.
  const cta = fightCta({
    fightDate: activeCamp.fightDate,
    daysUntil,
    hasResult: !!campFightResult,
    cornerSession: activeCornerSession(state, activeCamp.id),
  });

  const latestCoachNote = coachNotes
    .filter(n => n.fighterId === currentUser?.id && n.campId === activeCamp.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;

  return (
    <div className="space-y-4 pb-4">
      <div className="mt-4">
        <FightCountdownCard
          daysOut={daysUntil}
          dateLine={activeCamp.fightDate ? format(parseISO(activeCamp.fightDate), 'MMMM d, yyyy') : 'Fight date TBD'}
          opponent={activeCamp.opponent}
          rounds={activeCamp.rounds}
          roundMinutes={activeCamp.roundDuration}
          weightClass={activeCamp.weightClass}
          currentWeek={getCurrentWeekNumber(activeCamp)}
          totalWeeks={activeCamp.campWeeks}
          progressPct={getCampProgress(activeCamp)}
          state={activeCamp.fightDate ? 'populated' : 'empty'}
        />
      </div>

      {/* ── Alert lane ────────────────────────────────────────────────────
          Fixed and unpinnable, because none of it is browsing: each one is
          time-critical and none of it is there most days. Corner Mode in
          particular is only worth building if it is one tap away on the night
          — buried in a menu it would never be found with gloves already on. */}

      {cta === 'corner' && (
        <div className="mx-4">
          <button
            onClick={() => onNavigate('corner')}
            className="w-full flex items-center gap-3 bg-gradient-to-br from-red-900/40 to-dark-700 border border-red-800/60 rounded-2xl p-4 text-left hover:border-red-600 transition-colors min-h-[56px]"
          >
            <div className="w-12 h-12 rounded-xl bg-red-900/50 flex items-center justify-center flex-shrink-0">
              <Swords size={22} className="text-red-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold">Corner Mode</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {daysUntil === 0 ? 'Fight day' : `${daysUntil} days out`} · game plan between rounds, score as you go
              </p>
            </div>
            <ChevronRight size={18} className="text-red-300 flex-shrink-0" />
          </button>
        </div>
      )}

      {cta === 'post-fight' && (
        <div className="mx-4">
          <button
            onClick={() => onNavigate('fight-log')}
            className="w-full flex items-center gap-3 bg-gradient-to-br from-purple-900/40 to-dark-700 border border-purple-800 rounded-2xl p-4 text-left hover:border-purple-600 transition-colors min-h-[56px]"
          >
            <div className="w-12 h-12 rounded-xl bg-purple-900/50 flex items-center justify-center flex-shrink-0">
              <Trophy size={22} className="text-purple-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold">Log your fight result</p>
              <p className="text-xs text-gray-400 mt-0.5">Round-by-round breakdown · tunes your next camp</p>
            </div>
            <ChevronRight size={18} className="text-purple-300 flex-shrink-0" />
          </button>
        </div>
      )}

      {campFightResult && (
        <div className="mx-4">
          <button
            onClick={() => onShowFightBreakdown(campFightResult.id)}
            className="w-full flex items-center gap-3 bg-dark-700 border border-dark-500 rounded-2xl p-4 text-left hover:border-brand-700 transition-colors min-h-[56px]"
          >
            <div className="w-12 h-12 rounded-xl bg-brand-900/40 flex items-center justify-center flex-shrink-0">
              <History size={20} className="text-brand-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold">View Fight Breakdown</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {campFightResult.outcome.toUpperCase()} · {campFightResult.method}
              </p>
            </div>
            <ChevronRight size={18} className="text-gray-400 flex-shrink-0" />
          </button>
        </div>
      )}

      <AdaptationCard />

      {latestCoachNote && (
        <div className="mx-4">
          <div className="bg-gradient-to-r from-purple-900/40 to-dark-700 border border-purple-800/50 rounded-xl p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-900/60 flex items-center justify-center flex-shrink-0 mt-0.5">
              <MessageSquare size={15} className="text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-purple-400">{latestCoachNote.coachName}</span>
                <span className="text-xs text-gray-450">·</span>
                <span className="text-xs text-gray-450">{format(parseISO(latestCoachNote.createdAt), 'MMM d')}</span>
                <span className="badge text-xs bg-dark-600 text-gray-400 ml-auto capitalize">{latestCoachNote.category}</span>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed line-clamp-3">{latestCoachNote.content}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── The cockpit ───────────────────────────────────────────────────── */}

      <TodayCard
        accent={ACCENT}
        onNavigate={v => onNavigate(v)}
        onLog={prefill => onNavigate('log', prefill)}
        onStartTimer={onStartTimer}
        onOpenTimer={() => onNavigate('timer')}
      />

      <CampPulse mode="camp" onNavigate={v => onNavigate(v)} />

      {/* ── Whatever the fighter kept ─────────────────────────────────────── */}

      <HomeCards mode="camp" accent={ACCENT} onNavigate={(v: View) => onNavigate(v)} />
      <PinnedTools mode="camp" accent={ACCENT} onNavigate={(v: View) => onNavigate(v)} />
    </div>
  );
}
