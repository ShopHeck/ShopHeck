import { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
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
import BottomNav from './components/shared/BottomNav';
import Header from './components/shared/Header';
import type { SessionType } from './types';

type View = 'dashboard' | 'planner' | 'log' | 'timer' | 'weight' | 'progress' | 'fighters' | 'settings' | 'gameplan' | 'nutrition';

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
};

function AppShell() {
  const { state } = useApp();
  const [view, setView] = useState<View>('dashboard');
  const [showNewCamp, setShowNewCamp] = useState(false);
  const [logPrefill, setLogPrefill] = useState<LogPrefill | null>(null);

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
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <Header
        title={view === 'dashboard' ? 'Fight Camp' : title}
        subtitle={view === 'dashboard' ? dashSubtitle : subtitle}
      />

      <main className="flex-1 max-w-lg mx-auto w-full overflow-y-auto pb-20">
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
        {view === 'fighters' && <CoachDashboard />}
        {view === 'settings' && (
          <Settings onNewCamp={() => setShowNewCamp(true)} />
        )}
      </main>

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
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
