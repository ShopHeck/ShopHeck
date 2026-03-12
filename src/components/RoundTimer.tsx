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

// ─── Audio synthesis ──────────────────────────────────────────────────────────

/**
 * Creates a DynamicsCompressorNode acting as a hard limiter so we can push
 * bell volume high without clipping the output stage.
 */
function makeLimiter(ctx: AudioContext): DynamicsCompressorNode {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -3;   // dBFS — start limiting just below 0
  comp.knee.value = 0;         // hard knee
  comp.ratio.value = 20;       // very aggressive limiting
  comp.attack.value = 0.001;
  comp.release.value = 0.05;
  comp.connect(ctx.destination);
  return comp;
}

/**
 * Official boxing bell — loud, authoritative, stadium-quality ring.
 *
 * Modelled after a real steel boxing bell:
 *  • Fundamental ~587 Hz (D5) — deep, cuts through gym noise
 *  • Inharmonic partials with individual decay envelopes
 *  • Hard metallic strike transient with high-pass filtered click
 *  • Routed through a DynamicsCompressor/limiter so volume can be pushed to 1.8+
 */
function ringBell(ctx: AudioContext, volume = 1.0) {
  const t = ctx.currentTime;
  const limiter = makeLimiter(ctx);

  // Master gain — high to sound like a real bell
  const master = ctx.createGain();
  master.gain.setValueAtTime(volume * 1.8, t);
  master.connect(limiter);

  // ── Strike transient — metallic click with high-pass presence ──
  const clickLen = Math.floor(ctx.sampleRate * 0.018);
  const clickBuf = ctx.createBuffer(1, clickLen, ctx.sampleRate);
  const cd = clickBuf.getChannelData(0);
  for (let i = 0; i < clickLen; i++) {
    cd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (clickLen * 0.15));
  }
  const clickSrc = ctx.createBufferSource();
  clickSrc.buffer = clickBuf;
  const clickHp = ctx.createBiquadFilter();
  clickHp.type = 'highpass';
  clickHp.frequency.value = 2500;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.9, t);
  clickSrc.connect(clickHp);
  clickHp.connect(clickGain);
  clickGain.connect(master);
  clickSrc.start(t);

  // ── Bell body — inharmonic partials of a real steel bell ──
  // Ratios derived from Chladni pattern analysis of boxing bells.
  const partials = [
    { freq: 587,  vol: 1.00, decay: 4.2 },   // fundamental (D5)
    { freq: 938,  vol: 0.65, decay: 3.1 },   // minor third overtone
    { freq: 1174, vol: 0.45, decay: 2.5 },   // octave
    { freq: 1480, vol: 0.28, decay: 1.8 },   // major third above octave
    { freq: 1760, vol: 0.18, decay: 1.3 },   // 3x octave region
    { freq: 2350, vol: 0.10, decay: 0.90 },  // upper shimmer
    { freq: 3100, vol: 0.05, decay: 0.55 },  // air / brightness
  ];

  partials.forEach(p => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g);
    g.connect(master);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(p.freq, t);
    // Slight detuning adds chorus-like warmth (two oscillators per partial)
    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.connect(g2);
    g2.connect(master);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(p.freq * 1.003, t); // +5 cents detune
    g.gain.setValueAtTime(p.vol * 0.55, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + p.decay);
    g2.gain.setValueAtTime(p.vol * 0.45, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + p.decay * 0.85);
    osc.start(t); osc.stop(t + p.decay + 0.1);
    osc2.start(t); osc2.stop(t + p.decay * 0.85 + 0.1);
  });
}

/**
 * Wooden clapper / trainer clap: `count` sharp bandpass-filtered noise bursts
 * scheduled precisely in Web Audio time so there's no setTimeout drift.
 */
function playClapper(ctx: AudioContext, count = 5) {
  const t = ctx.currentTime;
  for (let i = 0; i < count; i++) {
    const start = t + i * 0.13;
    const bufLen = Math.floor(ctx.sampleRate * 0.035);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let j = 0; j < bufLen; j++) {
      data[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / bufLen, 2.5);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200 + i * 25;
    filter.Q.value = 1.8;
    src.connect(filter);
    const g = ctx.createGain();
    g.gain.setValueAtTime(1.1, start);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(start);
    src.stop(start + 0.036);
  }
}

/** Subtle high tick used for the 3-2-1 countdown. */
function playTick(ctx: AudioContext) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.value = 1050;
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  osc.start(t);
  osc.stop(t + 0.08);
}

// ─── Component ────────────────────────────────────────────────────────────────

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
  // Ref so the interval callback can always read the latest phase
  const phaseRef = useRef<Phase>('idle');

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    // Resume if suspended (required by browser autoplay policy after user gesture)
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
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
                  // Session complete — triple bell
                  setIsRunning(false);
                  ringBell(ctx, 1.0);
                  setTimeout(() => ringBell(ctx, 0.85), 850);
                  setTimeout(() => ringBell(ctx, 0.70), 1700);
                  return currentRound;
                }
                // End of round — single bell, transition to rest
                ringBell(ctx, 1.0);
                setTimeLeft(restSec);
                return currentRound;
              } else {
                // End of rest — bell signals new round start
                ringBell(ctx, 1.0);
                setTimeLeft(workSec);
                return currentRound + 1;
              }
            });
            if (currentPhase === 'work') {
              if (currentRound >= rounds) return 'done';
              return 'rest';
            }
            return 'work';
          });
          return 0;
        }

        const ctx = getAudioCtx();

        // 10-second warning clapper — fires as display transitions from 11 → 10
        if (prev === 11 && phaseRef.current === 'work') {
          playClapper(ctx, 5);
        }

        // Subtle 3-2-1 countdown ticks
        if (prev <= 4 && prev > 1) {
          playTick(ctx);
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
    if (phase === 'idle') {
      // Bell signals the very start of the session
      ringBell(getAudioCtx(), 1.0);
      setPhase('work');
    }
    setIsRunning(r => !r);
  };

  const adjust = (setter: React.Dispatch<React.SetStateAction<number>>, delta: number, min: number, max: number) => {
    setter(v => Math.max(min, Math.min(max, v + delta)));
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
