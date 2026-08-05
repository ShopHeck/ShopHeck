import { useApp } from '../../context/AppContext';
import { tabsFor } from './navTabs';
import { triggerHaptic, HAPTIC } from '../../hooks/useHaptics';
import PressableButton from './PressableButton';

interface Props {
  active: string;
  onChange: (view: string) => void;
}

export default function BottomNav({ active, onChange }: Props) {
  const { state } = useApp();
  const isCoach = state.currentUser?.role === 'coach';

  const items = tabsFor(isCoach);

  return (
    /* The app's second and last live-blur surface — fixed, so outside the
       scroll container. Six tabs, matching the real navigation. */
    <nav
      className="fixed bottom-0 left-0 right-0 glass-live border-t border-surface-2 z-50 safe-area-bottom"
      style={{ borderRadius: 0 }}
    >
      <div className="max-w-lg mx-auto flex items-center justify-around px-1 py-1">
        {items.map(({ id, icon: Icon, label }) => (
          <PressableButton
            key={id}
            onClick={() => { triggerHaptic(HAPTIC.tick); onChange(id); }}
            className={`nav-item ${active === id ? 'active' : ''}`}
            aria-current={active === id ? 'page' : undefined}
          >
            <Icon size={20} strokeWidth={active === id ? 2.5 : 1.8} />
            <span>{label}</span>
          </PressableButton>
        ))}
      </div>
    </nav>
  );
}
