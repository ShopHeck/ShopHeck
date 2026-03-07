import { Flame, Settings, ChevronLeft } from 'lucide-react';

interface Props {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  onSettings?: () => void;
  subtitle?: string;
}

export default function Header({ title, showBack, onBack, onSettings, subtitle }: Props) {
  return (
    <header className="sticky top-0 z-40 bg-dark-800/90 backdrop-blur border-b border-dark-500">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
        {showBack ? (
          <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors p-1 -ml-1">
            <ChevronLeft size={24} />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="bg-brand-600 rounded-lg p-1.5">
              <Flame size={16} className="text-white" />
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-white truncate">{title}</h1>
          {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
        </div>

        {onSettings && (
          <button onClick={onSettings} className="text-gray-400 hover:text-white transition-colors p-1">
            <Settings size={20} />
          </button>
        )}
      </div>
    </header>
  );
}
