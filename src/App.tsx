import { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import WeeklyPlanner from './components/WeeklyPlanner';
import WorkoutLogger from './components/WorkoutLogger';
import WeightTracker from './components/WeightTracker';
import ProgressCharts from './components/ProgressCharts';
import CoachDashboard from './components/CoachDashboard';
import BottomNav from './components/shared/BottomNav';
import Header from './components/shared/Header';

type View = 'dashboard' | 'planner' | 'log' | 'weight' | 'progress' | 'fighters';

const VIEW_TITLES: Record<View, { title: string; subtitle?: string }> = {
  dashboard: { title: 'Fight Camp' },
  planner: { title: 'Weekly Planner', subtitle: 'Training Schedule' },
  log: { title: 'Training Log', subtitle: 'Workouts & Sparring' },
  weight: { title: 'Weight Tracker', subtitle: 'Cut Monitoring' },
  progress: { title: 'Progress', subtitle: 'Charts & Benchmarks' },
  fighters: { title: 'Fighters', subtitle: 'Coach View' },
};

function AppShell() {
  const { state } = useApp();
  const [view, setView] = useState<View>('dashboard');

  if (!state.currentUser) {
    return <Onboarding />;
  }

  const isCoach = state.currentUser.role === 'coach';
  const { title, subtitle } = VIEW_TITLES[view];

  const camp = state.activeCamp;
  const dashSubtitle = camp
    ? `${state.currentUser.name} · ${camp.weightClass}`
    : state.currentUser.name;

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <Header
        title={view === 'dashboard' ? 'Fight Camp' : title}
        subtitle={view === 'dashboard' ? dashSubtitle : subtitle}
      />

      <main className="flex-1 max-w-lg mx-auto w-full overflow-y-auto pb-20">
        {view === 'dashboard' && !isCoach && camp && <Dashboard onNavigate={(v) => setView(v as View)} />}
        {view === 'dashboard' && !isCoach && !camp && (
          <div className="flex flex-col items-center justify-center h-full py-20 px-8 text-center">
            <p className="text-gray-400">No active fight camp. Create one to get started.</p>
          </div>
        )}
        {view === 'dashboard' && isCoach && <CoachDashboard />}
        {view === 'planner' && <WeeklyPlanner />}
        {view === 'log' && <WorkoutLogger />}
        {view === 'weight' && <WeightTracker />}
        {view === 'progress' && <ProgressCharts />}
        {view === 'fighters' && <CoachDashboard />}
      </main>

      <BottomNav active={view} onChange={(v) => setView(v as View)} />
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
