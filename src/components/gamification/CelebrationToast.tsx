import { useEffect } from 'react';
import * as LucideIcons from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { triggerHaptic, HAPTIC } from '../../hooks/useHaptics';

const DISMISS_MS = 4000;

export default function CelebrationToast() {
  const { state, dispatch } = useApp();
  const queue = state.gamification?.pendingCelebrations ?? [];
  const event = queue[0] ?? null;

  useEffect(() => {
    if (!event) return;
    triggerHaptic(HAPTIC.sessionComplete);
    const id = setTimeout(() => {
      dispatch({ type: 'DISMISS_CELEBRATION', payload: event.id });
    }, DISMISS_MS);
    return () => clearTimeout(id);
  }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!event) return null;

  const IconComponent =
    (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[event.icon] ||
    LucideIcons.Award;

  return (
    <div className="fixed inset-x-0 top-4 z-[70] flex justify-center pointer-events-none px-4">
      <div className="pointer-events-auto max-w-sm w-full bg-gradient-to-br from-brand-700 to-purple-800 border border-brand-500 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 celebration-slide">
        <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
          <IconComponent size={20} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{event.title}</p>
          <p className="text-xs text-white/80 truncate">{event.subtitle}</p>
        </div>
        <button
          onClick={() => dispatch({ type: 'DISMISS_CELEBRATION', payload: event.id })}
          className="text-white/70 hover:text-white transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          <LucideIcons.X size={16} />
        </button>
      </div>
    </div>
  );
}
