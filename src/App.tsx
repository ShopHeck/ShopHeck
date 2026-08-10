import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { AppProvider, useApp } from './context/AppContext';
import { SyncProvider } from './context/SyncContext';
import { TimerProvider, useTimerSignal } from './context/TimerContext';
import { HeartRateProvider } from './context/HeartRateContext';
import ViewSkeleton from './components/shared/ViewSkeleton';
import type { SessionType } from './types';

// ── Static imports — rendered immediately on first paint ──────────────────
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import RoundTimer from './components/RoundTimer';   // audio init; keep static
import BottomNav from './components/shared/BottomNav';
import { tabViewIds } from './components/shared/navTabs';
import { nextHistory, popHistory, type NavigateOptions } from './utils/navigation';
import type { TimerPrefill } from './utils/timerSession';
import Header from './components/shared/Header';
import AdBanner from './components/shared/AdBanner';
import ProGate from './components/shared/ProGate';
import UpgradeModal from './components/shared/UpgradeModal';
import { isPro } from './utils/subscription';
import { remindersEnabled, syncReminders } from './utils/notifications';
import { useAuth } from './context/AuthContext';
import ResetPasswordScreen from './components/ResetPasswordScreen';

// ── Lazy imports — loaded on first navigation to that view ────────────────
const OffSeasonDashboard = lazy(() => import('./components/OffSeasonDashboard'));
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
const CornerMode       = lazy(() => import('./components/CornerMode'));
const FightBreakdown   = lazy(() => import('./components/FightBreakdown'));
const CampComparison   = lazy(() => import('./components/CampComparison'));
const ProgressScreen   = lazy(() => import('./components/gamification/ProgressScreen'));

import CelebrationToast from './components/gamification/CelebrationToast';

/**
 * The one shape every "this view has nothing to show" case renders.
 *
 * Views used to render a bare blank under the header when their precondition
 * was unmet — a dead end whose only exit was the tab bar, and which looked
 * identical to a crash. Every `view === …` branch below now has an else, so a
 * view that renders nothing is no longer expressible. Module-level so its
 * identity is stable across App re-renders.
 */
function EmptyState({ title, body, actionLabel, onAction }: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="mx-4 mt-10 card text-center py-12">
      <p className="text-gray-400 font-semibold">{title}</p>
      <p className="text-sm text-gray-450 mt-1 max-w-xs mx-auto">{body}</p>
      <button onClick={onAction} className="btn-primary mt-4 mx-auto text-sm py-2 px-4">
        {actionLabel}
      </button>
    </div>
  );
}

/** Camp-dependent views. The button lands on the dashboard's mode chooser. */
function NoCampState({ feature, onSetUp }: { feature: string; onSetUp: () => void }) {
  return (
    <EmptyState
      title="No active camp"
      body={`${feature} works inside a fight camp or off-season block.`}
      actionLabel="Set up training"
      onAction={onSetUp}
    />
  );
}

type View = 'dashboard' | 'planner' | 'log' | 'timer' | 'weight' | 'progress' | 'fighters' | 'settings' | 'gameplan' | 'nutrition' | 'aiinsights' | 'health' | 'readiness' | 'trackers' | 'workout-library' | 'meal-library' | 'fight-log' | 'fight-breakdown' | 'camp-history' | 'achievements' | 'corner';

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
  'workout-library': { title: 'Training Library',  subtitle: 'Exercises & Techniques' },
  'meal-library':   { title: 'Meal Library',        subtitle: 'Plans & Generator' },
  'fight-log':      { title: 'Log Fight Result',    subtitle: 'Post-Fight Breakdown' },
  'fight-breakdown': { title: 'Fight Breakdown',    subtitle: 'KPIs & Analysis' },
  'camp-history':   { title: 'Camp History',        subtitle: 'Compare Past Camps' },
  achievements:     { title: 'Achievements',        subtitle: 'Belt · Streaks · PRs' },
  // Corner Mode renders its own full-screen surface over the shell, so this
  // title is never actually visible. It exists because VIEW_TITLES is a
  // Record<View, …> — which is exactly what caught this view being added
  // without one.
  corner:           { title: 'Corner Mode',         subtitle: 'Fight Night' },
};

function FlashOverlay() {
  const signal = useTimerSignal();
  if (!signal.flashColor) return null;
  return (
    <div className={`fixed inset-0 ${signal.flashColor} pointer-events-none z-50 phase-flash`} />
  );
}

function AppShell() {
  const { state } = useApp();

  // Navigation is a stack, not a single value. Fourteen of the twenty views
  // sit outside the tab bar, and with a bare `view` there was no way back out
  // of them except the Home tab — the header's showBack/onBack were never
  // wired to anything. The stack lets back return wherever the user actually
  // came from rather than to a hardcoded parent.
  const [history, setHistory] = useState<View[]>(['dashboard']);
  const view = history[history.length - 1];
  const canGoBack = history.length > 1;

  const isCoach = state.currentUser?.role === 'coach';
  const tabViews = tabViewIds(isCoach);

  /**
   * Tapping a tab resets to that tab's root, the way a native tab bar does;
   * anything else pushes so it can be backed out of.
   *
   * `replace` swaps the current entry instead of stacking on it — for a screen
   * that has finished its job and should not be returned to, like the fight
   * result form handing off to the breakdown.
   */
  const navigate = useCallback((next: View, opts?: NavigateOptions) => {
    setHistory(prev => nextHistory(prev, next, tabViews, opts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabViews.join(',')]);

  const goBack = useCallback(() => setHistory(popHistory), []);

  // Screenshot harness (?shot): expose the view setter and the upgrade paywall
  // so the Playwright capture scripts can navigate deterministically (the
  // paywall shot is required by App Store Connect for each in-app purchase).
  // No-op in normal use.
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('shot')) {
      const w = window as unknown as { __setView?: (v: string) => void; __openUpgrade?: () => void };
      w.__setView = (v) => setHistory([v as View]);
      w.__openUpgrade = () => setShowUpgrade(true);
    }
  }, []);

  const [showNewCamp, setShowNewCamp] = useState(false);
  const [showNewOffSeason, setShowNewOffSeason] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [logPrefill, setLogPrefill] = useState<LogPrefill | null>(null);
  const [timerPrefill, setTimerPrefill] = useState<TimerPrefill | null>(null);
  /** Fight being viewed in the breakdown screen. */
  const [activeFightId, setActiveFightId] = useState<string | null>(null);
  /** When editing an existing fight result, pass the id into the form. */
  const [editingFightId, setEditingFightId] = useState<string | null>(null);

  // Native iOS setup — runs once on mount inside the Capacitor WebView
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    // Matches --bg-obsidian. The native bridge takes a literal, so this is the
    // one place the token's value is restated — keep the two in step.
    StatusBar.setBackgroundColor({ color: '#0B0D12' }).catch(() => {});
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

  const { title, subtitle } = VIEW_TITLES[view];

  const camp = state.activeCamp;
  // The Dashboard tab is two different screens depending on who is signed in —
  // a fighter's camp Home, or a coach's team triage — so it needs two titles.
  // With both coach tabs rendering the same header, "Fight Camp · <weight
  // class>" sat above a roster table and named nothing on it.
  const dashSubtitle = isCoach
    ? `${state.currentUser.name} · Coach`
    : camp
      ? (camp.isOffSeason
          ? `Off Season · ${state.currentUser.name}`
          : `${state.currentUser.name} · ${camp.weightClass}`)
      : state.currentUser.name;

  function navigateToLog(prefill?: LogPrefill) {
    if (prefill) setLogPrefill(prefill);
    navigate('log');
  }

  /** Open the round timer already set up for a session on the plan. */
  function navigateToTimer(prefill: TimerPrefill) {
    setTimerPrefill(prefill);
    navigate('timer');
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
        title={view === 'dashboard' ? (isCoach ? 'Team' : 'Fight Camp') : title}
        subtitle={view === 'dashboard' ? dashSubtitle : subtitle}
        showBack={canGoBack}
        onBack={goBack}
        currentView={view}
        onNavigate={v => navigate(v as View)}
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
                  else navigate(v as View);
                }}
                onStartTimer={navigateToTimer}
                onShowFightBreakdown={(id) => { setActiveFightId(id); navigate('fight-breakdown'); }}
              />
            )}
            {view === 'dashboard' && !isCoach && camp && camp.isOffSeason && (
              <OffSeasonDashboard onNavigate={(v, prefill?) => {
                if (v === 'log' && prefill) navigateToLog(prefill);
                else navigate(v as View);
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
            {view === 'dashboard' && isCoach && (
              <CoachDashboard mode="overview" onNavigate={v => navigate(v as View)} />
            )}
            {view === 'planner' && (
              camp ? (
                <WeeklyPlanner
                  onLogSession={(prefill) => navigateToLog(prefill)}
                  onStartTimer={navigateToTimer}
                />
              ) : <NoCampState feature="The weekly plan" onSetUp={() => navigate('dashboard')} />
            )}
            {view === 'log' && (
              camp ? (
                <WorkoutLogger
                  prefill={logPrefill}
                  onPrefillConsumed={() => setLogPrefill(null)}
                />
              ) : <NoCampState feature="Training logging" onSetUp={() => navigate('dashboard')} />
            )}
            {view === 'timer'           && (
              <RoundTimer
                prefill={timerPrefill}
                onPrefillConsumed={() => setTimerPrefill(null)}
              />
            )}
            {view === 'weight'          && (camp ? <WeightTracker /> : <NoCampState feature="Weight tracking" onSetUp={() => navigate('dashboard')} />)}
            {view === 'nutrition'       && <ProGate required="fighter_pro" page feature="Nutrition Tracker" featureDescription="Log meals, water and macros through your camp, with targets that adjust as you cut." bullets={['One-tap hydration & meal-quality tracking', 'Macro targets auto-suggested from your camp', 'Seven-day history at a glance']}><NutritionTracker /></ProGate>}
            {view === 'progress'        && <ProgressCharts />}
            {view === 'gameplan'        && <ProGate required="fighter_pro" page feature="Game Plan Builder" featureDescription="Build a round-by-round strategy for your opponent and keep it with your camp." bullets={['Opponent scouting & threat notes', 'Early / middle / late round game plans', 'Corner instructions for fight night']}><GamePlanBuilder /></ProGate>}
            {view === 'aiinsights'      && <ProGate required="fighter_pro" page feature="AI Insights" featureDescription="Get a coach-style analysis of your training load, weight cut and readiness — included with Pro, no setup." bullets={['Full camp analysis with 3 action items', 'AI Cut Coach on the weight screen', 'Post-fight breakdowns after every bout']}><AIInsights /></ProGate>}
            {view === 'health'          && <ProGate required="fighter_pro" page feature="Apple Health Sync" featureDescription="Keep your training in one place across apps." bullets={['Import workouts & weight from Apple Health', 'Write logged sessions back to Health', 'Export your full camp data']}><AppleHealthSync /></ProGate>}
            {view === 'readiness'       && <FightReadiness />}
            {view === 'trackers'        && <FitnessTrackerHub onNavigate={v => navigate(v as View)} />}
            {view === 'workout-library' && <WorkoutLibrary onLogSession={(prefill) => navigateToLog(prefill)} />}
            {view === 'meal-library'    && <MealLibrary />}
            {view === 'camp-history'    && (
              <CampComparison
                onOpenFight={(id) => { setActiveFightId(id); navigate('fight-breakdown'); }}
              />
            )}
            {view === 'fight-log' && (
              camp ? (
                <FightResultForm
                  camp={camp}
                  existingId={editingFightId ?? undefined}
                  onDone={(id) => {
                    setEditingFightId(null);
                    setActiveFightId(id);
                    // Replace, not push: backing out of the breakdown must not
                    // land on a freshly mounted (and now blank) result form.
                    navigate('fight-breakdown', { replace: true });
                  }}
                  onCancel={() => { setEditingFightId(null); goBack(); }}
                />
              ) : <NoCampState feature="Logging a fight result" onSetUp={() => navigate('dashboard')} />
            )}
            {view === 'fight-breakdown' && (
              activeFightId ? (
                <FightBreakdown
                  fightId={activeFightId}
                  onBack={goBack}
                  onEdit={(id) => { setEditingFightId(id); navigate('fight-log'); }}
                />
              ) : (
                // FightBreakdown carries its own "result not found" state, but
                // it needs an id to render at all — with none, the branch used
                // to collapse to nothing and the guard never got to fire.
                <EmptyState
                  title="No fight selected"
                  body="Open a fight from your camp history to see its breakdown."
                  actionLabel="Camp history"
                  onAction={() => navigate('camp-history')}
                />
              )
            )}
            {view === 'corner' && (
              <CornerMode
                onClose={goBack}
                // Replace, not push: the fight is over, and backing out of the
                // result form must not drop the user into a finished corner
                // session that would offer to start round 1 again.
                onFinish={() => navigate('fight-log', { replace: true })}
              />
            )}
            {view === 'fighters'        && <CoachDashboard mode="roster" />}
            {view === 'achievements'    && <ProgressScreen />}
            {view === 'settings'        && (
              <Settings onNewCamp={() => requestNewCamp(false)} onNavigate={v => navigate(v as View)} />
            )}

          </div>
        </Suspense>
      </main>

      <AdBanner />
      <BottomNav active={view} onChange={(v) => navigate(v as View)} />

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

/**
 * Renders the set-a-new-password screen when the app was opened from a recovery
 * link.
 *
 * Mounted here rather than inside `AppShell` because `AppShell` returns
 * `<Onboarding />` early when there is no profile — and someone resetting a
 * password on a fresh install is exactly the person who would hit that and
 * never see the screen.
 */
function RecoveryGate() {
  const { recovery } = useAuth();
  if (!recovery.active && !recovery.error) return null;
  return <ResetPasswordScreen />;
}

export default function App() {
  return (
    <TimerProvider>
      <AppProvider>
        <SyncProvider>
          {/* Inside AppProvider: the provider derives max HR from the signed-in
              profile. Mounted for the app's lifetime so a paired strap survives
              navigation between the timer, Settings and the tracker hub. */}
          <HeartRateProvider>
            <AppShell />
            <RecoveryGate />
          </HeartRateProvider>
        </SyncProvider>
      </AppProvider>
    </TimerProvider>
  );
}
