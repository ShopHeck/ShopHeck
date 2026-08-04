import { useApp } from '../../context/AppContext';
import { tabsFor } from './navTabs';
import { triggerHaptic, HAPTIC } from '../../hooks/useHaptics';

interface Props {
  active: string;
  onChange: (view: string) => void;
}

export default function BottomNav({ active, onChange }: Props) {
  const { state } = useApp();
  const isCoach = state.currentUser?.role === 'coach';

  const items = tabsFor(isCoach);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-dark-800 border-t border-dark-500 z-50 safe-area-bottom">
      <div className="max-w-lg mx-auto flex items-center justify-around px-1 py-1">
        {items.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => { triggerHaptic(HAPTIC.tick); onChange(id); }}
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
