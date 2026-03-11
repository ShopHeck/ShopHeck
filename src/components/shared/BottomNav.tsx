import { LayoutDashboard, Calendar, Dumbbell, Scale, BarChart3, Users, Settings, Timer } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface Props {
  active: string;
  onChange: (view: string) => void;
}

export default function BottomNav({ active, onChange }: Props) {
  const { state } = useApp();
  const isCoach = state.currentUser?.role === 'coach';

  const items = isCoach
    ? [
        { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { id: 'fighters', icon: Users, label: 'Fighters' },
        { id: 'progress', icon: BarChart3, label: 'Progress' },
        { id: 'settings', icon: Settings, label: 'Settings' },
      ]
    : [
        { id: 'dashboard', icon: LayoutDashboard, label: 'Home' },
        { id: 'planner', icon: Calendar, label: 'Plan' },
        { id: 'log', icon: Dumbbell, label: 'Log' },
        { id: 'timer', icon: Timer, label: 'Timer' },
        { id: 'weight', icon: Scale, label: 'Weight' },
        { id: 'settings', icon: Settings, label: 'Settings' },
      ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-dark-800 border-t border-dark-500 z-50 safe-area-bottom">
      <div className="max-w-lg mx-auto flex items-center justify-around px-1 py-1">
        {items.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`nav-item ${active === id ? 'active' : ''}`}
          >
            <Icon size={20} strokeWidth={active === id ? 2.5 : 1.8} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
