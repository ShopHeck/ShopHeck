import { Settings, ChevronLeft, Timer } from 'lucide-react';
import AppMark from './AppMark';
import { useTimerSignal } from '../../context/TimerContext';

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface Props {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  onSettings?: () => void;
  subtitle?: string;
  currentView?: string;
  onNavigate?: (view: string) => void;
}

export default function Header({ title, showBack, onBack, onSettings, subtitle, currentView, onNavigate }: Props) {
  const signal = useTimerSignal();
  const showTimerPill = signal.isRunning && currentView !== 'timer' && onNavigate;

  return (
    <header className="sticky top-0 z-40 bg-dark-800/90 backdrop-blur border-b border-dark-500 safe-area-top">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
        {showBack ? (
          <button
            onClick={onBack}
            aria-label="Go back"
            className="flex items-center justify-center w-11 h-11 -ml-2.5 flex-shrink-0 text-gray-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <AppMark size={28} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-white truncate">{title}</h1>
          {subtitle && <p className="text-xs text-gray-400 truncate">{subtitle}</p>}
        </div>

        {showTimerPill && (
          <button
            onClick={() => onNavigate!('timer')}
            aria-label={`Round timer running, round ${signal.currentRound} of ${signal.rounds}, ${fmt(signal.timeLeft)} left. Open the timer.`}
            /* The pill is deliberately small so it does not crowd the title, so
               the touch target is extended past the visual bounds instead of
               inflating the pill to 44px and pushing the header taller. */
            className="relative flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 rounded-full px-3 py-1 text-xs font-bold text-white transition-colors active:scale-95 after:content-[''] after:absolute after:-inset-2.5"
          >
            <Timer size={11} />
            R{signal.currentRound}/{signal.rounds} · {fmt(signal.timeLeft)}
          </button>
        )}

        {onSettings && (
          <button
            onClick={onSettings}
            aria-label="Open settings"
            className="flex items-center justify-center w-11 h-11 -mr-2.5 flex-shrink-0 text-gray-400 hover:text-white transition-colors"
          >
            <Settings size={20} />
          </button>
        )}
      </div>
    </header>
  );
}
