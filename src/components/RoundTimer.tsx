import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, ChevronUp, ChevronDown } from 'lucide-react';

interface Preset {
  label: string;
  rounds: number;
  workSec: number;
  restSec: number;
}

const PRESETS: Preset[] = [
  { label: 'Boxing',    rounds: 12, workSec: 180, restSec: 60  },
  { label: 'MMA',       rounds: 3,  workSec: 300, restSec: 60  },
  { label: 'Muay Thai', rounds: 5,  workSec: 180, restSec: 120 },
  { label: 'HIIT',      rounds: 8,  workSec: 20,  restSec: 10  },
  { label: 'Custom',    rounds: 3,  workSec: 180, restSec: 60  },
];

type Phase = 'idle' | 'work' | 'rest' | 'done';

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const TIMER_KEY = 'fightcamp_timer_v2';

interface TimerSave {
  selectedPreset: number;
  rounds: number;
  workSec: number;
  restSec: number;
  phase: Phase;
  currentRound: number;
  isRunning: boolean;
  /** Epoch ms when the current phase will end — used when isRunning. */
  phaseDeadline: number;
  /** Seconds remaining when paused — used when !isRunning and phase ≠ idle. */
  pausedTimeLeft: number;
}

function saveTimer(s: TimerSave) {
  try { localStorage.setItem(TIMER_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

function loadTimer(): TimerSave | null {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    return raw ? (JSON.parse(raw) as TimerSave) : null;
  } catch { return null; }
}

/**
 * Fast-forward a running timer through any phase transitions that happened
 * while the app was in the background.  Returns an updated TimerSave with
 * the correct phase / round / deadline for *now*.
 */
function fastForward(s: TimerSave): TimerSave {
  let { phase, currentRound, phaseDeadline, rounds, workSec, restSec } = s;

  while (phase !== 'done' && Date.now() >= phaseDeadline) {
    if (phase === 'work') {
      if (currentRound >= rounds) {
        return { ...s, phase: 'done', currentRound, phaseDeadline, isRunning: false };
      }
      phase = 'rest';
      phaseDeadline += restSec * 1000;
    } else {
      phase = 'work';
      currentRound += 1;
      phaseDeadline += workSec * 1000;
    }
  }

  return { ...s, phase, currentRound, phaseDeadline };
}

// ─── Audio synthesis ──────────────────────────────────────────────────────────

function makeLimiter(ctx: AudioContext): DynamicsCompressorNode {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -3;
  comp.knee.value = 0;
  comp.ratio.value = 20;
  comp.attack.value = 0.001;
  comp.release.value = 0.05;
  comp.connect(ctx.destination);
  return comp;
}

/**
 * Official boxing bell.
 * @param when  Offset in seconds from ctx.currentTime (use 0 for immediate).
 */
function ringBell(ctx: AudioContext, volume = 1.0, when = 0) {
  const t = ctx.currentTime + when;
  const limiter = makeLimiter(ctx);
  const master = ctx.createGain();
  master.gain.setValueAtTime(volume * 1.8, t);
  master.connect(limiter);

  // Strike transient
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

  // Bell partials — modelled on a real steel boxing bell
  const partials = [
    { freq: 587,  vol: 1.00, decay: 4.2 },
    { freq: 938,  vol: 0.65, decay: 3.1 },
    { freq: 1174, vol: 0.45, decay: 2.5 },
    { freq: 1480, vol: 0.28, decay: 1.8 },
    { freq: 1760, vol: 0.18, decay: 1.3 },
    { freq: 2350, vol: 0.10, decay: 0.90 },
    { freq: 3100, vol: 0.05, decay: 0.55 },
  ];
  partials.forEach(p => {
    const osc  = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const g    = ctx.createGain();
    const g2   = ctx.createGain();
    osc.type  = 'sine'; osc.frequency.setValueAtTime(p.freq,         t);
    osc2.type = 'sine'; osc2.frequency.setValueAtTime(p.freq * 1.003, t);
    g.gain.setValueAtTime(p.vol * 0.55, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + p.decay);
    g2.gain.setValueAtTime(p.vol * 0.45, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + p.decay * 0.85);
    osc.connect(g);   g.connect(master);
    osc2.connect(g2); g2.connect(master);
    osc.start(t);  osc.stop(t + p.decay + 0.1);
    osc2.start(t); osc2.stop(t + p.decay * 0.85 + 0.1);
  });
}

/** Ding! Ding! Ding! — three bells scheduled in Web Audio time, no setTimeout. */
function ringEndOfRound(ctx: AudioContext) {
  ringBell(ctx, 1.0, 0.00);
  ringBell(ctx, 1.0, 0.65);
  ringBell(ctx, 1.0, 1.30);
}

/** Three bells with slight volume taper for session complete. */
function ringSessionComplete(ctx: AudioContext) {
  ringBell(ctx, 1.00, 0.00);
  ringBell(ctx, 0.90, 0.65);
  ringBell(ctx, 0.80, 1.30);
}

/** Wooden clapper — 5 sharp bandpass-noise bursts scheduled in Web Audio time. */
function playClapper(ctx: AudioContext, count = 5) {
  const base = ctx.currentTime;
  for (let i = 0; i < count; i++) {
    const t = base + i * 0.13;
    const bufLen = Math.floor(ctx.sampleRate * 0.035);
    const buf  = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let j = 0; j < bufLen; j++) {
      data[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / bufLen, 2.5);
    }
    const src    = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const g      = ctx.createGain();
    src.buffer = buf;
    filter.type = 'bandpass';
    filter.frequency.value = 1200 + i * 25;
    filter.Q.value = 1.8;
    g.gain.setValueAtTime(1.1, t);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.036);
  }
}

/** Subtle 1050 Hz tick for the 3-2-1 countdown. */
function playTick(ctx: AudioContext) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 1050;
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.08);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RoundTimer() {
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [rounds,   setRounds]   = useState(PRESETS[0].rounds);
  const [workSec,  setWorkSec]  = useState(PRESETS[0].workSec);
  const [restSec,  setRestSec]  = useState(PRESETS[0].restSec);
  const [phase,    setPhase]    = useState<Phase>('idle');
  const [currentRound, setCurrentRound] = useState(1);
  const [timeLeft, setTimeLeft] = useState(PRESETS[0].workSec);
  const [isRunning, setIsRunning] = useState(false);

  // Refs for stale-closure-safe reads inside intervals / event handlers
  const phaseRef      = useRef<Phase>('idle');
  const roundRef      = useRef(1);
  const roundsRef     = useRef(PRESETS[0].rounds);
  const workSecRef    = useRef(PRESETS[0].workSec);
  const restSecRef    = useRef(PRESETS[0].restSec);
  const isRunningRef  = useRef(false);
  const timeLeftRef   = useRef(PRESETS[0].workSec);
  /** Epoch ms when the current phase ends — the single source of timing truth. */
  const deadlineRef   = useRef(0);
  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef   = useRef<AudioContext | null>(null);

  // Keep refs in sync with state
  useEffect(() => { phaseRef.current     = phase;       }, [phase]);
  useEffect(() => { roundRef.current     = currentRound;}, [currentRound]);
  useEffect(() => { roundsRef.current    = rounds;      }, [rounds]);
  useEffect(() => { workSecRef.current   = workSec;     }, [workSec]);
  useEffect(() => { restSecRef.current   = restSec;     }, [restSec]);
  useEffect(() => { isRunningRef.current = isRunning;   }, [isRunning]);
  useEffect(() => { timeLeftRef.current  = timeLeft;    }, [timeLeft]);

  const getAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    return audioCtxRef.current;
  }, []);

  // ── Persist timer state to localStorage ────────────────────────────────────
  useEffect(() => {
    if (phase === 'idle') return;
    saveTimer({
      selectedPreset, rounds, workSec, restSec, phase, currentRound,
      isRunning,
      phaseDeadline:  isRunning ? deadlineRef.current : 0,
      pausedTimeLeft: !isRunning ? timeLeft : 0,
    });
  }, [phase, currentRound, isRunning, timeLeft, selectedPreset, rounds, workSec, restSec]);

  // ── Restore timer state on mount ───────────────────────────────────────────
  useEffect(() => {
    const saved = loadTimer();
    if (!saved || saved.phase === 'idle') return;

    setSelectedPreset(saved.selectedPreset);
    setRounds(saved.rounds);    roundsRef.current  = saved.rounds;
    setWorkSec(saved.workSec);  workSecRef.current = saved.workSec;
    setRestSec(saved.restSec);  restSecRef.current = saved.restSec;

    if (saved.isRunning) {
      const fwd = fastForward(saved);
      phaseRef.current = fwd.phase;
      roundRef.current = fwd.currentRound;
      setPhase(fwd.phase);
      setCurrentRound(fwd.currentRound);

      if (fwd.phase === 'done') {
        setIsRunning(false); isRunningRef.current = false;
        setTimeLeft(0);
      } else {
        deadlineRef.current = fwd.phaseDeadline;
        const tl = Math.max(1, Math.ceil((fwd.phaseDeadline - Date.now()) / 1000));
        setTimeLeft(tl); timeLeftRef.current = tl;
        setIsRunning(true); isRunningRef.current = true;
      }
    } else {
      phaseRef.current = saved.phase;
      roundRef.current = saved.currentRound;
      setPhase(saved.phase);
      setCurrentRound(saved.currentRound);
      setTimeLeft(saved.pausedTimeLeft); timeLeftRef.current = saved.pausedTimeLeft;
      // Set a virtual deadline so resume works correctly
      deadlineRef.current = Date.now() + saved.pausedTimeLeft * 1000;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount

  // ── Page-visibility fast-forward ───────────────────────────────────────────
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !isRunningRef.current) return;

      // Walk through any phases that expired while we were in the background
      let phase     = phaseRef.current;
      let round     = roundRef.current;
      let deadline  = deadlineRef.current;
      const rounds  = roundsRef.current;
      const wSec    = workSecRef.current;
      const rSec    = restSecRef.current;

      while (phase !== 'done' && Date.now() >= deadline) {
        if (phase === 'work') {
          if (round >= rounds) { phase = 'done'; break; }
          phase = 'rest';
          deadline += rSec * 1000;
        } else {
          phase = 'work';
          round += 1;
          deadline += wSec * 1000;
        }
      }

      deadlineRef.current = deadline;
      phaseRef.current    = phase;
      roundRef.current    = round;
      setPhase(phase);
      setCurrentRound(round);

      if (phase === 'done') {
        setIsRunning(false); isRunningRef.current = false;
        setTimeLeft(0);
      } else {
        setTimeLeft(Math.max(1, Math.ceil((deadline - Date.now()) / 1000)));
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []); // stable — reads only via refs

  // ── Main timing loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      const remaining = Math.ceil((deadlineRef.current - Date.now()) / 1000);

      if (remaining <= 0) {
        // ── Phase transition ──
        const ctx   = getAudioCtx();
        const phase = phaseRef.current;
        const round = roundRef.current;

        if (phase === 'work') {
          if (round >= roundsRef.current) {
            // Session complete — Ding Ding Ding
            ringSessionComplete(ctx);
            setIsRunning(false); isRunningRef.current = false;
            setPhase('done');    phaseRef.current = 'done';
            setTimeLeft(0);
          } else {
            // End of round — Ding! Ding! Ding!
            ringEndOfRound(ctx);
            const newDeadline = Date.now() + restSecRef.current * 1000;
            deadlineRef.current = newDeadline;
            setPhase('rest'); phaseRef.current = 'rest';
            setTimeLeft(restSecRef.current);
          }
        } else {
          // End of rest — single bell, new round starts
          ringBell(ctx, 1.0);
          const newRound    = round + 1;
          const newDeadline = Date.now() + workSecRef.current * 1000;
          deadlineRef.current = newDeadline;
          roundRef.current    = newRound;
          setCurrentRound(newRound);
          setPhase('work');    phaseRef.current = 'work';
          setTimeLeft(workSecRef.current);
        }
        return;
      }

      setTimeLeft(remaining);

      // ── Audio cues ──
      const ctx = getAudioCtx();
      // 10-second clapper warning (fires once as display hits 10)
      if (remaining === 10 && phaseRef.current === 'work') {
        playClapper(ctx, 5);
      }
      // 3-2-1 countdown ticks
      if (remaining <= 3) {
        playTick(ctx);
      }
    }, 250); // 250 ms ticks — accurate even under background throttling

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, getAudioCtx]);
  // rounds / workSec / restSec are read from refs inside the interval so no deps needed

  // ── Controls ───────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setIsRunning(false);  isRunningRef.current = false;
    setPhase('idle');     phaseRef.current = 'idle';
    setCurrentRound(1);   roundRef.current = 1;
    setTimeLeft(workSecRef.current);
    deadlineRef.current = 0;
    try { localStorage.removeItem(TIMER_KEY); } catch { /* noop */ }
  }, []);

  const selectPreset = useCallback((idx: number) => {
    const p = PRESETS[idx];
    setSelectedPreset(idx);
    setRounds(p.rounds);    roundsRef.current  = p.rounds;
    setWorkSec(p.workSec);  workSecRef.current = p.workSec;
    setRestSec(p.restSec);  restSecRef.current = p.restSec;
    setPhase('idle');       phaseRef.current   = 'idle';
    setCurrentRound(1);     roundRef.current   = 1;
    setTimeLeft(p.workSec);
    setIsRunning(false);    isRunningRef.current = false;
    deadlineRef.current = 0;
    try { localStorage.removeItem(TIMER_KEY); } catch { /* noop */ }
  }, []);

  const handleStartPause = () => {
    if (phase === 'done') { reset(); return; }

    if (!isRunning) {
      if (phase === 'idle') {
        // First start
        ringBell(getAudioCtx(), 1.0);
        setPhase('work'); phaseRef.current = 'work';
        deadlineRef.current = Date.now() + workSec * 1000;
      } else {
        // Resume from pause — reset deadline from current timeLeft
        deadlineRef.current = Date.now() + timeLeft * 1000;
      }
    }
    setIsRunning(r => !r);
  };

  // Keep timeLeft in sync when idle workSec changes
  useEffect(() => {
    if (phase === 'idle') setTimeLeft(workSec);
  }, [workSec, phase]);

  const adjust = (
    setter: React.Dispatch<React.SetStateAction<number>>,
    delta: number, min: number, max: number
  ) => setter(v => Math.max(min, Math.min(max, v + delta)));

  // ── Derived UI values ──────────────────────────────────────────────────────
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
    phase === 'work' ? 'WORK'  :
    phase === 'rest' ? 'REST'  : 'DONE';

  const phaseBg =
    phase === 'rest' ? 'bg-blue-900/40 text-blue-300'   :
    phase === 'done' ? 'bg-green-900/40 text-green-300' :
    phase === 'work' ? 'bg-brand-900/40 text-brand-300' :
    'bg-dark-600 text-gray-400';

  // ── Render ─────────────────────────────────────────────────────────────────
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
        <div className="flex items-center gap-3 mb-4">
          <span className={`badge text-sm font-bold px-3 py-1 ${phaseBg}`}>{phaseLabel}</span>
          {phase !== 'done' && (
            <span className="text-gray-400 text-sm">
              Round {phase === 'idle' ? 1 : currentRound} of {rounds}
            </span>
          )}
        </div>

        <div className={`w-52 h-52 rounded-full border-4 ${ringBg} flex items-center justify-center bg-dark-800 transition-colors duration-500`}>
          <span className={`text-6xl font-black tabular-nums tracking-tight ${ringColor} transition-colors duration-300`}>
            {phase === 'done' ? '✓' : fmt(timeLeft)}
          </span>
        </div>

        {phase !== 'idle' && phase !== 'done' && (
          <div className="flex gap-2 mt-4">
            {Array.from({ length: Math.min(rounds, 20) }).map((_, i) => (
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

        <div className="card flex items-center justify-between">
          <span className="text-sm font-medium text-white">Rounds</span>
          <div className="flex items-center gap-3">
            <button onClick={() => adjust(setRounds, -1, 1, 30)} disabled={isRunning}
              className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all">
              <ChevronDown size={16} />
            </button>
            <span className="text-lg font-bold text-white w-8 text-center">{rounds}</span>
            <button onClick={() => adjust(setRounds, 1, 1, 30)} disabled={isRunning}
              className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all">
              <ChevronUp size={16} />
            </button>
          </div>
        </div>

        <div className="card flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-white">Work Time</span>
            <p className="text-xs text-gray-500">{fmt(workSec)} per round</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => adjust(setWorkSec, -15, 15, 1800)} disabled={isRunning}
              className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all">
              <ChevronDown size={16} />
            </button>
            <span className="text-lg font-bold text-brand-400 w-12 text-center">{fmt(workSec)}</span>
            <button onClick={() => adjust(setWorkSec, 15, 15, 1800)} disabled={isRunning}
              className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all">
              <ChevronUp size={16} />
            </button>
          </div>
        </div>

        <div className="card flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-white">Rest Time</span>
            <p className="text-xs text-gray-500">{fmt(restSec)} between rounds</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => adjust(setRestSec, -5, 5, 600)} disabled={isRunning}
              className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all">
              <ChevronDown size={16} />
            </button>
            <span className="text-lg font-bold text-blue-400 w-12 text-center">{fmt(restSec)}</span>
            <button onClick={() => adjust(setRestSec, 5, 5, 600)} disabled={isRunning}
              className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all">
              <ChevronUp size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
