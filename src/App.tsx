import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { AppProvider, useApp } from './context/AppContext';
import { TimerProvider, useTimerContext } from './context/TimerContext';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import WeeklyPlanner from './components/WeeklyPlanner';
import WorkoutLogger from './components/WorkoutLogger';
import WeightTracker from './components/WeightTracker';
import ProgressCharts from './components/ProgressCharts';
import CoachDashboard from './components/CoachDashboard';
import Settings from './components/Settings';
import RoundTimer from './components/RoundTimer';
import GamePlanBuilder from './components/GamePlanBuilder';
import NutritionTracker from './components/NutritionTracker';
import AIInsights from './components/AIInsights';
import AppleHealthSync from './components/AppleHealthSync';
import FightReadiness from './components/FightReadiness';
import FitnessTrackerHub from './components/FitnessTrackerHub';
import WorkoutLibrary from './components/WorkoutLibrary';
import MealLibrary from './components/MealLibrary';
import BottomNav from './components/shared/BottomNav';
import Header from './components/shared/Header';
import AdBanner from './components/shared/AdBanner';
import type { SessionType } from './types';

type View = 'dashboard' | 'planner' | 'log' | 'timer' | 'weight' | 'progress' | 'fighters' | 'settings' | 'gameplan' | 'nutrition' | 'aiinsights' | 'health' | 'readiness' | 'trackers' | 'workout-library' | 'meal-library';

export interface LogPrefill {
  sessionType: SessionType;
  title: string;
  duration: number;
}

const VIEW_TITLES: Record<View, { title: string; subtitle?: string }> = {
  dashboard: { title: 'Fight Camp' },
  planner: { title: 'Weekly Planner', subtitle: 'Training Schedule' },
  log: { title: 'Training Log', subtitle: 'Workouts & Sparring' },
  timer: { title: 'Round Timer', subtitle: 'Training Intervals' },
  weight: { title: 'Weight Tracker', subtitle: 'Cut Monitoring' },
  progress: { title: 'Progress', subtitle: 'Charts & Benchmarks' },
  fighters: { title: 'Fighters', subtitle: 'Coach View' },
  settings: { title: 'Settings' },
  gameplan: { title: 'Game Plan', subtitle: 'Fight Strategy' },
  nutrition: { title: 'Nutrition', subtitle: 'Hydration & Meals' },
  aiinsights: { title: 'AI Insights', subtitle: 'Coach Analysis' },
  health: { title: 'Apple Health', subtitle: 'Sync & Export' },
  readiness: { title: 'Fight Readiness', subtitle: 'Camp Analysis' },
  trackers: { title: 'Fitness Trackers', subtitle: 'HR · HRV · Recovery' },
  'workout-library': { title: 'Workout Library', subtitle: 'Exercises & Drills' },
  'meal-library': { title: 'Meal Library', subtitle: 'Plans & Generator' },
};

function FlashOverlay() {
  const { signal } = useTimerContext();
  if (!signal.flashColor) return null;
  return (
    <div
      className={`fixed inset-0 ${signal.flashColor} pointer-events-none z-50 phase-flash`}
    />
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
        {view === 'timer' && <RoundTimer />}
        {view === 'weight' && <WeightTracker />}
        {view === 'nutrition' && <NutritionTracker />}
        {view === 'progress' && <ProgressCharts />}
        {view === 'gameplan' && <GamePlanBuilder />}
        {view === 'aiinsights' && <AIInsights />}
        {view === 'health' && <AppleHealthSync />}
        {view === 'readiness' && <FightReadiness />}
        {view === 'trackers' && <FitnessTrackerHub onNavigate={v => setView(v as View)} />}
        {view === 'workout-library' && <WorkoutLibrary />}
        {view === 'meal-library' && <MealLibrary />}
        {view === 'fighters' && <CoachDashboard />}
        {view === 'settings' && (
          <Settings onNewCamp={() => setShowNewCamp(true)} onNavigate={v => setView(v as View)} />
        )}
      </main>

      <AdBanner />
      <BottomNav active={view} onChange={(v) => setView(v as View)} />

      {/* New Camp — reuse Onboarding camp step */}
      {showNewCamp && (
        <Onboarding campOnly onClose={() => setShowNewCamp(false)} />
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
