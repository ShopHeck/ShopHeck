import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, ChevronUp, ChevronDown } from 'lucide-react';

interface Preset {
  label: string;
  rounds: number;
  workSec: number;
  restSec: number;
}

const PRESETS: Preset[] = [
  { label: 'Boxing', rounds: 12, workSec: 180, restSec: 60 },
  { label: 'MMA', rounds: 3, workSec: 300, restSec: 60 },
  { label: 'Muay Thai', rounds: 5, workSec: 180, restSec: 120 },
  { label: 'HIIT', rounds: 8, workSec: 20, restSec: 10 },
  { label: 'Custom', rounds: 3, workSec: 180, restSec: 60 },
];

type Phase = 'idle' | 'work' | 'rest' | 'done';

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function beep(ctx: AudioContext, freq: number, duration: number, volume = 0.4) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = freq;
  osc.type = 'sine';
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

export default function RoundTimer() {
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [rounds, setRounds] = useState(PRESETS[0].rounds);
  const [workSec, setWorkSec] = useState(PRESETS[0].workSec);
  const [restSec, setRestSec] = useState(PRESETS[0].restSec);

  const [phase, setPhase] = useState<Phase>('idle');
  const [currentRound, setCurrentRound] = useState(1);
  const [timeLeft, setTimeLeft] = useState(PRESETS[0].workSec);
  const [isRunning, setIsRunning] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, []);

  const selectPreset = useCallback((idx: number) => {
    const p = PRESETS[idx];
    setSelectedPreset(idx);
    setRounds(p.rounds);
    setWorkSec(p.workSec);
    setRestSec(p.restSec);
    setPhase('idle');
    setCurrentRound(1);
    setTimeLeft(p.workSec);
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    setIsRunning(false);
    setPhase('idle');
    setCurrentRound(1);
    setTimeLeft(workSec);
  }, [workSec]);

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          const ctx = getAudioCtx();
          setPhase(currentPhase => {
            setCurrentRound(currentRound => {
              if (currentPhase === 'work') {
                if (currentRound >= rounds) {
                  // Done
                  setIsRunning(false);
                  beep(ctx, 880, 0.15);
                  setTimeout(() => beep(ctx, 880, 0.15), 200);
                  setTimeout(() => beep(ctx, 1100, 0.3), 400);
                  return currentRound;
                }
                // Start rest
                beep(ctx, 660, 0.2);
                setTimeout(() => beep(ctx, 440, 0.2), 250);
                setTimeLeft(restSec);
                return currentRound;
              } else {
                // Start next work round
                beep(ctx, 880, 0.1);
                setTimeout(() => beep(ctx, 880, 0.1), 150);
                setTimeout(() => beep(ctx, 880, 0.1), 300);
                setTimeLeft(workSec);
                return currentRound + 1;
              }
            });
            if (currentPhase === 'work') {
              const nextRound = currentRound;
              if (nextRound >= rounds) return 'done';
              return 'rest';
            }
            return 'work';
          });
          return 0;
        }

        // Countdown beeps at 3, 2, 1
        if (prev <= 4 && prev > 1) {
          const ctx = getAudioCtx();
          beep(ctx, 440, 0.08, 0.2);
        }

        return prev - 1;
      });
    }, 1000);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, rounds, workSec, restSec, getAudioCtx]);

  // Keep timeLeft in sync when phase flips to done
  useEffect(() => {
    if (phase === 'done') setTimeLeft(0);
  }, [phase]);

  const handleStartPause = () => {
    if (phase === 'done') {
      reset();
      return;
    }
    if (phase === 'idle') setPhase('work');
    setIsRunning(r => !r);
  };

  const adjust = (setter: React.Dispatch<React.SetStateAction<number>>, delta: number, min: number, max: number) => {
    setter(v => Math.max(min, Math.min(max, v + delta)));
    if (!isRunning && phase === 'idle') {
      // Keep timeLeft in sync with workSec when adjusting work time
    }
  };

  // When workSec changes while idle, keep timeLeft synced
  useEffect(() => {
    if (phase === 'idle') setTimeLeft(workSec);
  }, [workSec, phase]);

  const ringColor =
    phase === 'rest' ? 'text-blue-400' :
    phase === 'done' ? 'text-green-400' :
    phase === 'work' ? 'text-brand-500' :
    'text-gray-500';

  const ringBg =
    phase === 'rest' ? 'border-blue-500/50' :
    phase === 'done' ? 'border-green-500/50' :
    phase === 'work' ? 'border-brand-500/50' :
    'border-dark-400';

  const phaseLabel =
    phase === 'idle' ? 'Ready' :
    phase === 'work' ? 'WORK' :
    phase === 'rest' ? 'REST' :
    'DONE';

  const phaseBg =
    phase === 'rest' ? 'bg-blue-900/40 text-blue-300' :
    phase === 'done' ? 'bg-green-900/40 text-green-300' :
    phase === 'work' ? 'bg-brand-900/40 text-brand-300' :
    'bg-dark-600 text-gray-400';

  return (
    <div className="pb-4">
      {/* Presets */}
      <div className="mx-4 mt-4 flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {PRESETS.map((p, i) => (
          <button
            key={p.label}
            onClick={() => selectPreset(i)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
              selectedPreset === i
                ? 'bg-brand-600 border-brand-500 text-white'
                : 'bg-dark-700 border-dark-500 text-gray-400 hover:border-dark-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Main Timer Display */}
      <div className="mx-4 mt-6 flex flex-col items-center">
        {/* Round indicator */}
        <div className="flex items-center gap-3 mb-4">
          <span className={`badge text-sm font-bold px-3 py-1 ${phaseBg}`}>{phaseLabel}</span>
          {phase !== 'done' && (
            <span className="text-gray-400 text-sm">
              Round {phase === 'idle' ? 1 : currentRound} of {rounds}
            </span>
          )}
        </div>

        {/* Clock ring */}
        <div className={`w-52 h-52 rounded-full border-4 ${ringBg} flex items-center justify-center bg-dark-800 transition-colors duration-500`}>
          <span className={`text-6xl font-black tabular-nums tracking-tight ${ringColor} transition-colors duration-300`}>
            {phase === 'done' ? '✓' : fmt(timeLeft)}
          </span>
        </div>

        {/* Round dots */}
        {phase !== 'idle' && phase !== 'done' && (
          <div className="flex gap-2 mt-4">
            {Array.from({ length: rounds }).map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all ${
                  i < currentRound - 1 ? 'bg-brand-600' :
                  i === currentRound - 1 ? 'bg-brand-400 scale-125' :
                  'bg-dark-500'
                }`}
              />
            ))}
          </div>
        )}

        {phase === 'done' && (
          <p className="text-green-400 font-semibold mt-4 text-lg">Session complete!</p>
        )}
      </div>

      {/* Controls */}
      <div className="mx-4 mt-6 flex gap-3 justify-center">
        <button
          onClick={reset}
          className="w-14 h-14 rounded-full bg-dark-700 border border-dark-500 flex items-center justify-center text-gray-400 hover:text-white hover:border-dark-300 transition-all active:scale-95"
        >
          <RotateCcw size={20} />
        </button>
        <button
          onClick={handleStartPause}
          className={`w-20 h-20 rounded-full flex items-center justify-center text-white transition-all active:scale-95 shadow-lg ${
            phase === 'done'
              ? 'bg-green-600 hover:bg-green-500'
              : isRunning
              ? 'bg-dark-600 border-2 border-brand-600 hover:bg-dark-500'
              : 'bg-brand-600 hover:bg-brand-500'
          }`}
        >
          {isRunning ? <Pause size={30} /> : <Play size={30} className="translate-x-0.5" />}
        </button>
        <div className="w-14 h-14" />
      </div>

      {/* Settings */}
      <div className="mx-4 mt-6 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Timer Settings</p>

        {/* Rounds */}
        <div className="card flex items-center justify-between">
          <span className="text-sm font-medium text-white">Rounds</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => adjust(setRounds, -1, 1, 30)}
              disabled={isRunning}
              className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all"
            >
              <ChevronDown size={16} />
            </button>
            <span className="text-lg font-bold text-white w-8 text-center">{rounds}</span>
            <button
              onClick={() => adjust(setRounds, 1, 1, 30)}
              disabled={isRunning}
              className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all"
            >
              <ChevronUp size={16} />
            </button>
          </div>
        </div>

        {/* Work time */}
        <div className="card flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-white">Work Time</span>
            <p className="text-xs text-gray-500">{fmt(workSec)} per round</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => adjust(setWorkSec, -15, 15, 1800)}
              disabled={isRunning}
              className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all"
            >
              <ChevronDown size={16} />
            </button>
            <span className="text-lg font-bold text-brand-400 w-12 text-center">{fmt(workSec)}</span>
            <button
              onClick={() => adjust(setWorkSec, 15, 15, 1800)}
              disabled={isRunning}
              className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all"
            >
              <ChevronUp size={16} />
            </button>
          </div>
        </div>

        {/* Rest time */}
        <div className="card flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-white">Rest Time</span>
            <p className="text-xs text-gray-500">{fmt(restSec)} between rounds</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => adjust(setRestSec, -5, 5, 600)}
              disabled={isRunning}
              className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all"
            >
              <ChevronDown size={16} />
            </button>
            <span className="text-lg font-bold text-blue-400 w-12 text-center">{fmt(restSec)}</span>
            <button
              onClick={() => adjust(setRestSec, 5, 5, 600)}
              disabled={isRunning}
              className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all"
            >
              <ChevronUp size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
