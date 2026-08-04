import { Play, Pause, RotateCcw, Minimize2 } from 'lucide-react';
import { fmt } from '../hooks/useRoundTimer';
import type { Phase } from '../hooks/useRoundTimer';

interface Props {
  phase: Phase;
  currentRound: number;
  rounds: number;
  timeLeft: number;
  isRunning: boolean;
  /** User-selected ring colors from the timer settings. */
  workColor: string;
  restColor: string;
  /** Live heart rate when a strap is connected, else null. */
  hrBpm: number | null;
  hrColor: string;
  mep: number;
  onStartPause: () => void;
  onReset: () => void;
  onExitFullscreen: () => void;
}

export default function GymDisplay({
  phase, currentRound, rounds, timeLeft, isRunning,
  workColor, restColor, hrBpm, hrColor, mep,
  onStartPause, onReset, onExitFullscreen,
}: Props) {
  // The clock takes the user's chosen work/rest colors; fixed colors only for
  // the transient prep/done states.
  const timeStyle =
    phase === 'work' ? { color: workColor } :
    phase === 'rest' ? { color: restColor } :
    undefined;
  const timeClass =
    phase === 'done' ? 'text-green-400' :
    phase === 'prep' ? 'text-yellow-400' :
    'text-white';

  const phaseLabel =
    phase === 'prep' ? 'GET READY' :
    phase === 'work' ? 'WORK'      :
    phase === 'rest' ? 'REST'      :
    phase === 'done' ? 'DONE'      : 'READY';

  const phaseBg =
    phase === 'rest' ? 'bg-blue-900/60 text-blue-300'     :
    phase === 'done' ? 'bg-green-900/60 text-green-300'   :
    phase === 'prep' ? 'bg-yellow-900/60 text-yellow-300' :
    phase === 'work' ? 'bg-brand-900/60 text-brand-300'   :
    'bg-dark-600 text-gray-400';

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50 select-none">
      {/* Exit — kept clear of the notch/status bar on iOS */}
      <button
        onClick={onExitFullscreen}
        aria-label="Exit gym display"
        className="absolute right-4 text-gray-450 hover:text-gray-400 transition-colors p-2"
        style={{ top: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
      >
        <Minimize2 size={24} />
      </button>

      {/* Round label */}
      {phase !== 'idle' && phase !== 'done' && (
        <div className="text-center mb-4">
          <p className="text-[2vw] font-bold tracking-[0.3em] text-gray-450 uppercase">
            {phase === 'prep' ? '' : 'ROUND'}
          </p>
          <p className="text-[22vw] font-black text-white leading-none">
            {phase === 'prep' ? '?' : currentRound}
          </p>
          <p className="text-[2.5vw] text-gray-450 -mt-2">of {rounds}</p>
        </div>
      )}

      {/* Time */}
      <p className={`text-[15vw] font-black tabular-nums leading-none ${timeClass}`} style={timeStyle}>
        {phase === 'done' ? 'DONE' : fmt(timeLeft)}
      </p>

      {/* Phase badge */}
      <span className={`mt-4 inline-flex px-6 py-2 rounded-full text-[2.5vw] font-black tracking-widest ${phaseBg}`}>
        {phaseLabel}
      </span>

      {/* Live HR / MEP — big enough to read from across the gym */}
      {hrBpm !== null && phase !== 'idle' && (
        <div className="mt-4 flex items-baseline gap-4">
          <span className="text-[4vw] font-black tabular-nums" style={{ color: hrColor }}>
            {hrBpm} <span className="text-[2vw] font-bold">BPM</span>
          </span>
          {mep > 0 && (
            <span className="text-[2.5vw] font-bold text-gray-400 tabular-nums">{mep} MEP</span>
          )}
        </div>
      )}

      {phase === 'done' && (
        <p className="text-green-400 text-[3vw] font-bold mt-4">Session complete!</p>
      )}

      {/* Controls */}
      <div className="flex gap-6 mt-8">
        <button
          onClick={onReset}
          aria-label="Reset timer"
          className="w-16 h-16 rounded-full bg-gray-900 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-all active:scale-95"
        >
          <RotateCcw size={24} />
        </button>
        <button
          onClick={onStartPause}
          aria-label={phase === 'done' ? 'Reset for a new session' : isRunning ? 'Pause timer' : 'Start timer'}
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
