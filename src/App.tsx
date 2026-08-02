import { useState, useEffect, lazy, Suspense } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { AppProvider, useApp } from './context/AppContext';
import { SyncProvider } from './context/SyncContext';
import { TimerProvider, useTimerContext } from './context/TimerContext';
import ViewSkeleton from './components/shared/ViewSkeleton';
import type { SessionType } from './types';

// ── Static imports — rendered immediately on first paint ──────────────────
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import OffSeasonDashboard from './components/OffSeasonDashboard';
import RoundTimer from './components/RoundTimer';   // audio init; keep static
import BottomNav from './components/shared/BottomNav';
import Header from './components/shared/Header';
import AdBanner from './components/shared/AdBanner';
import ProGate from './components/shared/ProGate';
import UpgradeModal from './components/shared/UpgradeModal';
import { isPro } from './utils/subscription';
import { remindersEnabled, syncReminders } from './utils/notifications';

// ── Lazy imports — loaded on first navigation to that view ────────────────
const WeeklyPlanner    = lazy(() => import('./components/WeeklyPlanner'));
const WorkoutLogger    = lazy(() => import('./components/WorkoutLogger'));
const WeightTracker    = lazy(() => import('./components/WeightTracker'));
const ProgressCharts   = lazy(() => import('./components/ProgressCharts'));
const CoachDashboard   = lazy(() => import('./components/CoachDashboard'));
const Settings         = lazy(() => import('./components/Settings'));
const GamePlanBuilder  = lazy(() => import('./components/GamePlanBuilder'));
const NutritionTracker = lazy(() => import('./components/NutritionTracker'));
const AIInsights       = lazy(() => import('./components/AIInsights'));
const AppleHealthSync  = lazy(() => import('./components/AppleHealthSync'));
const FightReadiness   = lazy(() => import('./components/FightReadiness'));
const FitnessTrackerHub = lazy(() => import('./components/FitnessTrackerHub'));
const WorkoutLibrary   = lazy(() => import('./components/WorkoutLibrary'));
const MealLibrary      = lazy(() => import('./components/MealLibrary'));
const FightResultForm  = lazy(() => import('./components/FightResultForm'));
const FightBreakdown   = lazy(() => import('./components/FightBreakdown'));
const CampComparison   = lazy(() => import('./components/CampComparison'));
const ProgressScreen   = lazy(() => import('./components/gamification/ProgressScreen'));

import CelebrationToast from './components/gamification/CelebrationToast';

type View = 'dashboard' | 'planner' | 'log' | 'timer' | 'weight' | 'progress' | 'fighters' | 'settings' | 'gameplan' | 'nutrition' | 'aiinsights' | 'health' | 'readiness' | 'trackers' | 'workout-library' | 'meal-library' | 'fight-log' | 'fight-breakdown' | 'camp-history' | 'achievements';

export interface LogPrefill {
  sessionType: SessionType;
  title: string;
  duration: number;
}

const VIEW_TITLES: Record<View, { title: string; subtitle?: string }> = {
  dashboard:        { title: 'Fight Camp' },
  planner:          { title: 'Weekly Planner',     subtitle: 'Training Schedule' },
  log:              { title: 'Training Log',        subtitle: 'Workouts & Sparring' },
  timer:            { title: 'Round Timer',         subtitle: 'Training Intervals' },
  weight:           { title: 'Weight Tracker',      subtitle: 'Cut Monitoring' },
  progress:         { title: 'Progress',            subtitle: 'Charts & Benchmarks' },
  fighters:         { title: 'Fighters',            subtitle: 'Coach View' },
  settings:         { title: 'Settings' },
  gameplan:         { title: 'Game Plan',           subtitle: 'Fight Strategy' },
  nutrition:        { title: 'Nutrition',           subtitle: 'Hydration & Meals' },
  aiinsights:       { title: 'AI Insights',         subtitle: 'Coach Analysis' },
  health:           { title: 'Apple Health',        subtitle: 'Sync & Export' },
  readiness:        { title: 'Fight Readiness',     subtitle: 'Camp Analysis' },
  trackers:         { title: 'Fitness Trackers',    subtitle: 'HR · HRV · Recovery' },
  'workout-library': { title: 'Workout Library',   subtitle: 'Exercises & Drills' },
  'meal-library':   { title: 'Meal Library',        subtitle: 'Plans & Generator' },
  'fight-log':      { title: 'Log Fight Result',    subtitle: 'Post-Fight Breakdown' },
  'fight-breakdown': { title: 'Fight Breakdown',    subtitle: 'KPIs & Analysis' },
  'camp-history':   { title: 'Camp History',        subtitle: 'Compare Past Camps' },
  achievements:     { title: 'Achievements',        subtitle: 'Belt · Streaks · PRs' },
};

function FlashOverlay() {
  const { signal } = useTimerContext();
  if (!signal.flashColor) return null;
  return (
    <div className={`fixed inset-0 ${signal.flashColor} pointer-events-none z-50 phase-flash`} />
  );
}

function AppShell() {
  const { state } = useApp();
  const [view, setView] = useState<View>('dashboard');

  // Screenshot harness (?shot): expose the view setter and the upgrade paywall
  // so the Playwright capture scripts can navigate deterministically (the
  // paywall shot is required by App Store Connect for each in-app purchase).
  // No-op in normal use.
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('shot')) {
      const w = window as unknown as { __setView?: (v: string) => void; __openUpgrade?: () => void };
      w.__setView = (v) => setView(v as View);
      w.__openUpgrade = () => setShowUpgrade(true);
    }
  }, []);

  const [showNewCamp, setShowNewCamp] = useState(false);
  const [showNewOffSeason, setShowNewOffSeason] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [logPrefill, setLogPrefill] = useState<LogPrefill | null>(null);
  /** Fight being viewed in the breakdown screen. */
  const [activeFightId, setActiveFightId] = useState<string | null>(null);
  /** When editing an existing fight result, pass the id into the form. */
  const [editingFightId, setEditingFightId] = useState<string | null>(null);

  // Native iOS setup — runs once on mount inside the Capacitor WebView
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#0a0a0a' }).catch(() => {});
    SplashScreen.hide().catch(() => {});
  }, []);

  // Keep daily reminders in sync with the active camp (adds the weigh-in nudge
  // only during a real fight-camp cut). No-op on web / when reminders are off.
  const activeCampId = state.activeCamp?.id;
  useEffect(() => {
    if (!remindersEnabled()) return;
    const camp = state.activeCamp;
    const weighIn = !!(camp && !camp.isOffSeason && camp.fightDate);
    syncReminders({ weighIn });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCampId]);

  if (!state.currentUser) {
    return <Onboarding />;
  }

  const isCoach = state.currentUser.role === 'coach';
  const { title, subtitle } = VIEW_TITLES[view];

  const camp = state.activeCamp;
  const dashSubtitle = camp
    ? (camp.isOffSeason
        ? `Off Season · ${state.currentUser.name}`
        : `${state.currentUser.name} · ${camp.weightClass}`)
    : state.currentUser.name;

  function navigateToLog(prefill?: LogPrefill) {
    if (prefill) setLogPrefill(prefill);
    setView('log');
  }

  // Free tier is capped at a single camp; creating another requires Fighter Pro.
  function requestNewCamp(offSeason: boolean) {
    if (!isPro(state.subscription) && state.camps.length >= 1) {
      setShowUpgrade(true);
      return;
    }
    if (offSeason) setShowNewOffSeason(true);
    else setShowNewCamp(true);
  }

  return (
    <div className="h-screen overflow-hidden bg-dark-900 flex flex-col">
      <FlashOverlay />
      <CelebrationToast />
      <Header
        title={view === 'dashboard' ? 'Fight Camp' : title}
        subtitle={view === 'dashboard' ? dashSubtitle : subtitle}
        currentView={view}
        onNavigate={v => setView(v as View)}
      />

      <main
        className="flex-1 max-w-lg mx-auto w-full overflow-y-auto"
        style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* key={view} forces a remount on every navigation, triggering the
            CSS fade-in animation. Suspense shows ViewSkeleton while a lazy
            chunk is loading on first visit to that view. */}
        <Suspense fallback={<ViewSkeleton />}>
          <div key={view} className="view-enter">

            {view === 'dashboard' && !isCoach && camp && !camp.isOffSeason && (
              <Dashboard
                onNavigate={(v, prefill?) => {
                  if (v === 'log' && prefill) navigateToLog(prefill);
                  else setView(v as View);
                }}
                onShowFightBreakdown={(id) => { setActiveFightId(id); setView('fight-breakdown'); }}
              />
            )}
            {view === 'dashboard' && !isCoach && camp && camp.isOffSeason && (
              <OffSeasonDashboard onNavigate={(v, prefill?) => {
                if (v === 'log' && prefill) navigateToLog(prefill);
                else setView(v as View);
              }} />
            )}
            {view === 'dashboard' && !isCoach && !camp && (
              <div className="mx-4 mt-8 flex flex-col gap-4">
                <div className="text-center mb-2">
                  <h2 className="text-xl font-black text-white">What are you training for?</h2>
                  <p className="text-gray-400 text-sm mt-1">Choose your mode to get started</p>
                </div>
                <button
                  onClick={() => requestNewCamp(false)}
                  className="card flex items-center gap-4 hover:border-brand-600 transition-colors text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-brand-900/50 flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-400"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">Fight Camp</p>
                    <p className="text-xs text-gray-400 mt-0.5">I have a fight scheduled — build a camp around it</p>
                  </div>
                </button>
                <button
                  onClick={() => requestNewCamp(true)}
                  className="card flex items-center gap-4 hover:border-teal-700 transition-colors text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-teal-900/30 flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-400"><path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/></svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">Off Season Training</p>
                    <p className="text-xs text-gray-400 mt-0.5">No fight scheduled — just training, tracking progress</p>
                  </div>
                </button>
              </div>
            )}
            {view === 'dashboard' && isCoach && <CoachDashboard />}
            {view === 'planner' && (
              <WeeklyPlanner onLogSession={(prefill) => navigateToLog(prefill)} />
            )}
            {view === 'log' && (
              <WorkoutLogger
                prefill={logPrefill}
                onPrefillConsumed={() => setLogPrefill(null)}
              />
            )}
            {view === 'timer'           && <RoundTimer />}
            {view === 'weight'          && <WeightTracker />}
            {view === 'nutrition'       && <ProGate required="fighter_pro" page feature="Nutrition Tracker" featureDescription="Log meals, water and macros through your camp, with targets that adjust as you cut." bullets={['One-tap hydration & meal-quality tracking', 'Macro targets auto-suggested from your camp', 'Seven-day history at a glance']}><NutritionTracker /></ProGate>}
            {view === 'progress'        && <ProgressCharts />}
            {view === 'gameplan'        && <ProGate required="fighter_pro" page feature="Game Plan Builder" featureDescription="Build a round-by-round strategy for your opponent and keep it with your camp." bullets={['Opponent scouting & threat notes', 'Early / middle / late round game plans', 'Corner instructions for fight night']}><GamePlanBuilder /></ProGate>}
            {view === 'aiinsights'      && <ProGate required="fighter_pro" page feature="AI Insights" featureDescription="Get a coach-style analysis of your training load, weight cut and readiness — included with Pro, no setup." bullets={['Full camp analysis with 3 action items', 'AI Cut Coach on the weight screen', 'Post-fight breakdowns after every bout']}><AIInsights /></ProGate>}
            {view === 'health'          && <ProGate required="fighter_pro" page feature="Apple Health Sync" featureDescription="Keep your training in one place across apps." bullets={['Import workouts & weight from Apple Health', 'Write logged sessions back to Health', 'Export your full camp data']}><AppleHealthSync /></ProGate>}
            {view === 'readiness'       && <FightReadiness />}
            {view === 'trackers'        && <FitnessTrackerHub onNavigate={v => setView(v as View)} />}
            {view === 'workout-library' && <WorkoutLibrary />}
            {view === 'meal-library'    && <MealLibrary />}
            {view === 'camp-history'    && (
              <CampComparison
                onOpenFight={(id) => { setActiveFightId(id); setView('fight-breakdown'); }}
              />
            )}
            {view === 'fight-log' && camp && (
              <FightResultForm
                camp={camp}
                existingId={editingFightId ?? undefined}
                onDone={(id) => {
                  setEditingFightId(null);
                  setActiveFightId(id);
                  setView('fight-breakdown');
                }}
                onCancel={() => { setEditingFightId(null); setView('dashboard'); }}
              />
            )}
            {view === 'fight-breakdown' && activeFightId && (
              <FightBreakdown
                fightId={activeFightId}
                onBack={() => setView('camp-history')}
                onEdit={(id) => { setEditingFightId(id); setView('fight-log'); }}
              />
            )}
            {view === 'fighters'        && <CoachDashboard />}
            {view === 'achievements'    && <ProgressScreen />}
            {view === 'settings'        && (
              <Settings onNewCamp={() => requestNewCamp(false)} onNavigate={v => setView(v as View)} />
            )}

          </div>
        </Suspense>
      </main>

      <AdBanner />
      <BottomNav active={view} onChange={(v) => setView(v as View)} />

      {/* New Camp modal — reuses Onboarding camp step */}
      {showNewCamp && (
        <Suspense fallback={null}>
          <Onboarding campOnly onClose={() => setShowNewCamp(false)} />
        </Suspense>
      )}

      {/* New Off Season modal */}
      {showNewOffSeason && (
        <Suspense fallback={null}>
          <Onboarding campOnly offSeasonOnly onClose={() => setShowNewOffSeason(false)} />
        </Suspense>
      )}

      {/* Upgrade paywall — shown when a free user hits the 1-camp limit */}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <TimerProvider>
      <AppProvider>
        <SyncProvider>
          <AppShell />
        </SyncProvider>
      </AppProvider>
    </TimerProvider>
  );
}
