import { Settings, ChevronLeft, Timer } from 'lucide-react';
import AppMark from './AppMark';
import { useTimerContext } from '../../context/TimerContext';

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
  const { signal } = useTimerContext();
  const showTimerPill = signal.isRunning && currentView !== 'timer' && onNavigate;

  return (
    <header className="sticky top-0 z-40 bg-dark-800/90 backdrop-blur border-b border-dark-500 safe-area-top">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
        {showBack ? (
          <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors p-1 -ml-1">
            <ChevronLeft size={24} />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <AppMark size={28} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-white truncate">{title}</h1>
          {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
        </div>

        {showTimerPill && (
          <button
            onClick={() => onNavigate!('timer')}
            className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 rounded-full px-3 py-1 text-xs font-bold text-white transition-colors active:scale-95"
          >
            <Timer size={11} />
            R{signal.currentRound}/{signal.rounds} · {fmt(signal.timeLeft)}
          </button>
        )}

        {onSettings && (
          <button onClick={onSettings} className="text-gray-400 hover:text-white transition-colors p-1">
            <Settings size={20} />
          </button>
        )}
      </div>
    </header>
  );
}
