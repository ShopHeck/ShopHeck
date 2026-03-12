import { Play, Pause, RotateCcw, Minimize2 } from 'lucide-react';
import { fmt } from '../hooks/useRoundTimer';
import type { Phase } from '../hooks/useRoundTimer';

interface Props {
  phase: Phase;
  currentRound: number;
  rounds: number;
  timeLeft: number;
  isRunning: boolean;
  onStartPause: () => void;
  onReset: () => void;
  onExitFullscreen: () => void;
}

export default function GymDisplay({
  phase, currentRound, rounds, timeLeft, isRunning,
  onStartPause, onReset, onExitFullscreen,
}: Props) {
  const ringColor =
    phase === 'rest' ? 'text-blue-400' :
    phase === 'done' ? 'text-green-400' :
    phase === 'prep' ? 'text-yellow-400' :
    'text-white';

  const phaseLabel =
    phase === 'prep' ? 'GET READY' :
    phase === 'work' ? 'WORK'      :
    phase === 'rest' ? 'REST'      :
    phase === 'done' ? 'DONE'      : '';

  const phaseBg =
    phase === 'rest' ? 'bg-blue-900/60 text-blue-300'     :
    phase === 'done' ? 'bg-green-900/60 text-green-300'   :
    phase === 'prep' ? 'bg-yellow-900/60 text-yellow-300' :
    'bg-brand-900/60 text-brand-300';

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50 select-none">
      {/* Exit fullscreen */}
      <button
        onClick={onExitFullscreen}
        className="absolute top-4 right-4 text-gray-600 hover:text-gray-400 transition-colors p-2"
      >
        <Minimize2 size={24} />
      </button>

      {/* Round label */}
      {phase !== 'idle' && phase !== 'done' && (
        <div className="text-center mb-4">
          <p className="text-[2vw] font-bold tracking-[0.3em] text-gray-600 uppercase">
            {phase === 'prep' ? '' : 'ROUND'}
          </p>
          <p className="text-[22vw] font-black text-white leading-none">
            {phase === 'prep' ? '?' : currentRound}
          </p>
          <p className="text-[2.5vw] text-gray-600 -mt-2">of {rounds}</p>
        </div>
      )}

      {/* Time */}
      <p className={`text-[15vw] font-black tabular-nums leading-none ${ringColor}`}>
        {phase === 'done' ? 'DONE' : fmt(timeLeft)}
      </p>

      {/* Phase badge */}
      {phaseLabel && (
        <span className={`mt-4 inline-flex px-6 py-2 rounded-full text-[2.5vw] font-black tracking-widest ${phaseBg}`}>
          {phaseLabel}
        </span>
      )}

      {phase === 'done' && (
        <p className="text-green-400 text-[3vw] font-bold mt-4">Session complete!</p>
      )}

      {/* Controls */}
      <div className="flex gap-6 mt-8">
        <button
          onClick={onReset}
          className="w-16 h-16 rounded-full bg-gray-900 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-all active:scale-95"
        >
          <RotateCcw size={24} />
        </button>
        <button
          onClick={onStartPause}
          className={`w-24 h-24 rounded-full flex items-center justify-center text-white transition-all active:scale-95 ${
            phase === 'done'
              ? 'bg-green-600 hover:bg-green-500'
              : isRunning
              ? 'bg-gray-900 border-2 border-brand-600'
              : 'bg-brand-600 hover:bg-brand-500'
          }`}
        >
          {isRunning ? <Pause size={36} /> : <Play size={36} className="translate-x-1" />}
        </button>
      </div>
    </div>
  );
}
