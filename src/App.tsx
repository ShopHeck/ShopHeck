import { useState, useEffect, lazy, Suspense } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { AppProvider, useApp } from './context/AppContext';
import { TimerProvider, useTimerContext } from './context/TimerContext';
import ViewSkeleton from './components/shared/ViewSkeleton';
import type { SessionType } from './types';

// ── Static imports — rendered immediately on first paint ──────────────────
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import RoundTimer from './components/RoundTimer';   // audio init; keep static
import BottomNav from './components/shared/BottomNav';
import Header from './components/shared/Header';
import AdBanner from './components/shared/AdBanner';

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

type View = 'dashboard' | 'planner' | 'log' | 'timer' | 'weight' | 'progress' | 'fighters' | 'settings' | 'gameplan' | 'nutrition' | 'aiinsights' | 'health' | 'readiness' | 'trackers' | 'workout-library' | 'meal-library';

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
  const [showNewCamp, setShowNewCamp] = useState(false);
  const [logPrefill, setLogPrefill] = useState<LogPrefill | null>(null);

  // Native iOS setup — runs once on mount inside the Capacitor WebView
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#0a0a0a' }).catch(() => {});
    SplashScreen.hide().catch(() => {});
  }, []);

  if (!state.currentUser) {
    return <Onboarding />;
  }

  const isCoach = state.currentUser.role === 'coach';
  const { title, subtitle } = VIEW_TITLES[view];

  const camp = state.activeCamp;
  const dashSubtitle = camp
    ? `${state.currentUser.name} · ${camp.weightClass}`
    : state.currentUser.name;

  function navigateToLog(prefill?: LogPrefill) {
    if (prefill) setLogPrefill(prefill);
    setView('log');
  }

  return (
    <div className="h-screen overflow-hidden bg-dark-900 flex flex-col">
      <FlashOverlay />
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

            {view === 'dashboard' && !isCoach && camp && (
              <Dashboard onNavigate={(v, prefill?) => {
                if (v === 'log' && prefill) navigateToLog(prefill);
                else setView(v as View);
              }} />
            )}
            {view === 'dashboard' && !isCoach && !camp && (
              <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-4">
                <p className="text-gray-400">No active fight camp.</p>
                <button onClick={() => setView('settings')} className="btn-primary">Set Up a Camp</button>
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
            {view === 'nutrition'       && <NutritionTracker />}
            {view === 'progress'        && <ProgressCharts />}
            {view === 'gameplan'        && <GamePlanBuilder />}
            {view === 'aiinsights'      && <AIInsights />}
            {view === 'health'          && <AppleHealthSync />}
            {view === 'readiness'       && <FightReadiness />}
            {view === 'trackers'        && <FitnessTrackerHub onNavigate={v => setView(v as View)} />}
            {view === 'workout-library' && <WorkoutLibrary />}
            {view === 'meal-library'    && <MealLibrary />}
            {view === 'fighters'        && <CoachDashboard />}
            {view === 'settings'        && (
              <Settings onNewCamp={() => setShowNewCamp(true)} onNavigate={v => setView(v as View)} />
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
    </div>
  );
}

export default function App() {
  return (
    <TimerProvider>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </TimerProvider>
  );
}
