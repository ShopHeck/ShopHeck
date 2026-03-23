import { useState, useEffect, useRef, useCallback } from 'react';
import { useTimerContext } from '../context/TimerContext';
import { useWakeLock } from './useWakeLock';
import { useHaptics, HAPTIC } from './useHaptics';
import { useVoiceAnnouncements } from './useVoiceAnnouncements';
import type { CoachVoiceStyle } from './useCoachingVoice';
import { getCustomBellDataUrl } from '../utils/customBell';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Preset {
  label: string;
  rounds: number;
  workSec: number;
  restSec: number;
}

export const PRESETS: Preset[] = [
  { label: 'Boxing',    rounds: 12, workSec: 180, restSec: 60  },
  { label: 'MMA',       rounds: 3,  workSec: 300, restSec: 60  },
  { label: 'Muay Thai', rounds: 5,  workSec: 180, restSec: 120 },
  { label: 'HIIT',      rounds: 8,  workSec: 20,  restSec: 10  },
  { label: 'Custom',    rounds: 3,  workSec: 180, restSec: 60  },
];

export type Phase = 'idle' | 'prep' | 'work' | 'rest' | 'done';

export function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Persistence ──────────────────────────────────────────────────────────

const TIMER_KEY = 'fightcamp_timer_v2';

interface TimerSave {
  selectedPreset: number;
  rounds: number;
  workSec: number;
  restSec: number;
  prepSec: number;
  warningSec: number;
  voiceEnabled: boolean;
  hapticEnabled: boolean;
  reactionMode: boolean;
  coachVoice: CoachVoiceStyle;
  workColor: string;
  restColor: string;
  phase: Phase;
  currentRound: number;
  isRunning: boolean;
  phaseDeadline: number;
  pausedTimeLeft: number;
}

const DEFAULTS: Partial<TimerSave> = {
  prepSec: 5,
  warningSec: 10,
  voiceEnabled: false,
  hapticEnabled: true,
  reactionMode: false,
  coachVoice: 'off',
  workColor: '#22c55e',
  restColor: '#ef4444',
};

function saveTimer(s: TimerSave) {
  try { localStorage.setItem(TIMER_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

function loadTimer(): TimerSave | null {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (!raw) return null;
    return { ...DEFAULTS, ...JSON.parse(raw) } as TimerSave;
  } catch { return null; }
}

function fastForward(s: TimerSave): TimerSave {
  let { phase, currentRound, phaseDeadline, rounds, workSec, restSec, prepSec } = s;

  while (phase !== 'done' && Date.now() >= phaseDeadline) {
    if (phase === 'prep') {
      phase = 'work';
      phaseDeadline += workSec * 1000;
    } else if (phase === 'work') {
      if (currentRound >= rounds) {
        return { ...s, phase: 'done', currentRound, phaseDeadline, isRunning: false };
      }
      phase = 'rest';
      phaseDeadline += restSec * 1000;
    } else if (phase === 'rest') {
      phase = 'work';
      currentRound += 1;
      phaseDeadline += workSec * 1000;
    }
  }

  // Avoid unused variable warning — prepSec is used in save/restore
  void prepSec;
  return { ...s, phase, currentRound, phaseDeadline };
}

// ─── Audio synthesis ──────────────────────────────────────────────────────

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

function ringBell(ctx: AudioContext, volume = 1.0, when = 0) {
  const t = ctx.currentTime + when;
  const limiter = makeLimiter(ctx);
  const master = ctx.createGain();
  master.gain.setValueAtTime(volume * 1.8, t);
  master.connect(limiter);

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
    osc.type  = 'sine'; osc.frequency.setValueAtTime(p.freq,          t);
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

function ringEndOfRound(ctx: AudioContext) {
  ringBell(ctx, 1.0, 0.00);
  ringBell(ctx, 1.0, 0.65);
  ringBell(ctx, 1.0, 1.30);
}

function ringSessionComplete(ctx: AudioContext) {
  ringBell(ctx, 1.00, 0.00);
  ringBell(ctx, 0.90, 0.65);
  ringBell(ctx, 0.80, 1.30);
}

/**
 * Three sharp wooden-stick claps spaced 220ms apart.
 * Models two hardwood blocks struck together: fast transient click,
 * narrow-band wood resonance ~950 Hz, very short decay.
 */
function playClapper(ctx: AudioContext) {
  const sr = ctx.sampleRate;
  const base = ctx.currentTime;

  for (let i = 0; i < 3; i++) {
    const t = base + i * 0.22;

    // 1) Sharp click transient — 3 ms of shaped noise through high-pass
    const clickLen = Math.floor(sr * 0.003);
    const clickBuf = ctx.createBuffer(1, clickLen, sr);
    const cd = clickBuf.getChannelData(0);
    for (let j = 0; j < clickLen; j++) {
      cd[j] = (Math.random() * 2 - 1) * Math.exp(-j / (clickLen * 0.2));
    }
    const clickSrc = ctx.createBufferSource();
    clickSrc.buffer = clickBuf;
    const clickHp = ctx.createBiquadFilter();
    clickHp.type = 'highpass';
    clickHp.frequency.value = 3000;
    const clickG = ctx.createGain();
    clickG.gain.setValueAtTime(3.5, t);
    clickSrc.connect(clickHp);
    clickHp.connect(clickG);
    clickG.connect(ctx.destination);
    clickSrc.start(t);

    // 2) Wood-body resonance — 80 ms noise through tight bandpass at ~950 Hz
    const bodyLen = Math.floor(sr * 0.08);
    const bodyBuf = ctx.createBuffer(1, bodyLen, sr);
    const bd = bodyBuf.getChannelData(0);
    for (let j = 0; j < bodyLen; j++) {
      bd[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bodyLen * 0.07));
    }
    const bodySrc = ctx.createBufferSource();
    bodySrc.buffer = bodyBuf;
    const bodyBp = ctx.createBiquadFilter();
    bodyBp.type = 'bandpass';
    bodyBp.frequency.value = 950;
    bodyBp.Q.value = 6;
    const bodyG = ctx.createGain();
    bodyG.gain.setValueAtTime(2.2, t);
    bodySrc.connect(bodyBp);
    bodyBp.connect(bodyG);
    bodyG.connect(ctx.destination);
    bodySrc.start(t);

    // 3) Short pitched tap — sine at 950 Hz, decays in 35 ms
    const osc = ctx.createOscillator();
    const oscG = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 950;
    oscG.gain.setValueAtTime(0.5, t);
    oscG.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    osc.connect(oscG);
    oscG.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.04);
  }
}

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

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useRoundTimer() {
  const { setSignal } = useTimerContext();

  // Settings state
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [rounds,   setRounds]   = useState(PRESETS[0].rounds);
  const [workSec,  setWorkSec]  = useState(PRESETS[0].workSec);
  const [restSec,  setRestSec]  = useState(PRESETS[0].restSec);
  const [prepSec,  setPrepSec]  = useState(5);
  const [warningSec, setWarningSec] = useState(10);
  const [voiceEnabled,  setVoiceEnabled]  = useState(false);
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const [reactionMode,  setReactionMode]  = useState(false);
  const [coachVoice,    setCoachVoice]    = useState<CoachVoiceStyle>('off');
  const [workColor, setWorkColor] = useState('#22c55e');
  const [restColor, setRestColor] = useState('#ef4444');

  // Timer engine state
  const [phase,        setPhase]        = useState<Phase>('idle');
  const [currentRound, setCurrentRound] = useState(1);
  const [timeLeft,     setTimeLeft]     = useState(PRESETS[0].workSec);
  const [isRunning,    setIsRunning]    = useState(false);

  // Refs for stale-closure-safe reads
  const phaseRef      = useRef<Phase>('idle');
  const roundRef      = useRef(1);
  const roundsRef     = useRef(PRESETS[0].rounds);
  const workSecRef    = useRef(PRESETS[0].workSec);
  const restSecRef    = useRef(PRESETS[0].restSec);
  const prepSecRef    = useRef(5);
  const warningSecRef = useRef(10);
  const isRunningRef  = useRef(false);
  const timeLeftRef   = useRef(PRESETS[0].workSec);
  const deadlineRef   = useRef(0);
  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef      = useRef<AudioContext | null>(null);
  const keepAliveRef     = useRef<OscillatorNode | null>(null);
  const customBellBufRef = useRef<AudioBuffer | null>(null);
  const warningFiredRef  = useRef(false); // prevent double-fire per phase
  const lastTickRef   = useRef(-1);     // last remaining value that got a tick
  const voiceRef      = useRef(false);
  const hapticRef     = useRef(true);
  const coachVoiceRef = useRef<CoachVoiceStyle>('off');

  // Sync refs with state
  useEffect(() => { phaseRef.current     = phase;        }, [phase]);
  useEffect(() => { roundRef.current     = currentRound; }, [currentRound]);
  useEffect(() => { roundsRef.current    = rounds;       }, [rounds]);
  useEffect(() => { workSecRef.current   = workSec;      }, [workSec]);
  useEffect(() => { restSecRef.current   = restSec;      }, [restSec]);
  useEffect(() => { prepSecRef.current   = prepSec;      }, [prepSec]);
  useEffect(() => { warningSecRef.current = warningSec;  }, [warningSec]);
  useEffect(() => { isRunningRef.current = isRunning;    }, [isRunning]);
  useEffect(() => { timeLeftRef.current  = timeLeft;     }, [timeLeft]);
  useEffect(() => { voiceRef.current     = voiceEnabled; }, [voiceEnabled]);
  useEffect(() => { hapticRef.current    = hapticEnabled;}, [hapticEnabled]);
  useEffect(() => { coachVoiceRef.current = coachVoice;  }, [coachVoice]);

  // Push updates to TimerContext signal bus
  useEffect(() => {
    setSignal(s => ({ ...s, isRunning, phase, currentRound, rounds, timeLeft }));
  }, [isRunning, phase, currentRound, rounds, timeLeft, setSignal]);

  // Sub-hooks
  useWakeLock(isRunning);
  const vibrate = useHaptics(hapticEnabled);
  const { speak, unlock } = useVoiceAnnouncements(voiceEnabled);

  const getAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    return audioCtxRef.current;
  }, []);

  // Keep AudioContext alive while running — prevents mobile browser auto-suspension
  useEffect(() => {
    if (!isRunning) {
      if (keepAliveRef.current) {
        try { keepAliveRef.current.stop(); keepAliveRef.current.disconnect(); } catch { /* noop */ }
        keepAliveRef.current = null;
      }
      return;
    }
    const ctx = getAudioCtx();

    // Pre-decode custom bell into AudioContext so it can be played from timer callbacks
    const dataUrl = getCustomBellDataUrl();
    if (dataUrl) {
      const b64    = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const binary = atob(b64);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      ctx.decodeAudioData(bytes.buffer.slice(0))
        .then(buf => { customBellBufRef.current = buf; })
        .catch(e  => { console.warn('[RoundTimer] custom bell decode failed:', e); });
    } else {
      customBellBufRef.current = null;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0; // completely silent
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    keepAliveRef.current = osc;
    return () => {
      try { osc.stop(); osc.disconnect(); gain.disconnect(); } catch { /* noop */ }
      if (keepAliveRef.current === osc) keepAliveRef.current = null;
    };
  }, [isRunning, getAudioCtx]);

  // Play custom bell using the pre-decoded AudioBuffer (set on Start), or fall back
  // to the synthesized ringBell.
  // The custom bell is routed through the same gain (1.8×) + limiter chain as ringBell
  // so that it has comparable loudness and triggers iOS audio-focus ducking of background
  // music at the same level as the synthesized bell.
  const playRoundStartBell = useCallback((ctx: AudioContext) => {
    if (customBellBufRef.current) {
      const t       = ctx.currentTime;
      const limiter = makeLimiter(ctx);
      const gain    = ctx.createGain();
      gain.gain.setValueAtTime(1.8, t);
      gain.connect(limiter);

      const src = ctx.createBufferSource();
      src.buffer = customBellBufRef.current;
      src.connect(gain);
      src.start(t);
    } else {
      ringBell(ctx, 1.0);
    }
  }, []);

  // Flash helper — sets flashColor in context for 600ms
  const flash = useCallback((color: string) => {
    setSignal(s => ({ ...s, flashColor: color }));
    setTimeout(() => setSignal(s => ({ ...s, flashColor: null })), 600);
  }, [setSignal]);

  // ── Persist ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'idle') return;
    saveTimer({
      selectedPreset, rounds, workSec, restSec, prepSec, warningSec,
      voiceEnabled, hapticEnabled, reactionMode, coachVoice, workColor, restColor,
      phase, currentRound, isRunning,
      phaseDeadline:  isRunning ? deadlineRef.current : 0,
      pausedTimeLeft: !isRunning ? timeLeft : 0,
    });
  }, [phase, currentRound, isRunning, timeLeft,
      selectedPreset, rounds, workSec, restSec, prepSec, warningSec,
      voiceEnabled, hapticEnabled, reactionMode, coachVoice, workColor, restColor]);

  // ── Restore on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    const saved = loadTimer();
    if (!saved || saved.phase === 'idle') return;

    setSelectedPreset(saved.selectedPreset);
    setRounds(saved.rounds);       roundsRef.current    = saved.rounds;
    setWorkSec(saved.workSec);     workSecRef.current   = saved.workSec;
    setRestSec(saved.restSec);     restSecRef.current   = saved.restSec;
    setPrepSec(saved.prepSec);     prepSecRef.current   = saved.prepSec;
    setWarningSec(saved.warningSec); warningSecRef.current = saved.warningSec;
    setVoiceEnabled(saved.voiceEnabled);
    setHapticEnabled(saved.hapticEnabled);
    setReactionMode(saved.reactionMode);
    if (saved.coachVoice) { setCoachVoice(saved.coachVoice); coachVoiceRef.current = saved.coachVoice; }
    if (saved.workColor) setWorkColor(saved.workColor);
    if (saved.restColor) setRestColor(saved.restColor);

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
      deadlineRef.current = Date.now() + saved.pausedTimeLeft * 1000;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Page-visibility fast-forward ─────────────────────────────────────────
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !isRunningRef.current) return;

      let ph        = phaseRef.current;
      let round     = roundRef.current;
      let deadline  = deadlineRef.current;
      const rds     = roundsRef.current;
      const wSec    = workSecRef.current;
      const rSec    = restSecRef.current;

      while (ph !== 'done' && Date.now() >= deadline) {
        if (ph === 'prep') {
          ph = 'work';
          deadline += wSec * 1000;
        } else if (ph === 'work') {
          if (round >= rds) { ph = 'done'; break; }
          ph = 'rest';
          deadline += rSec * 1000;
        } else {
          ph = 'work';
          round += 1;
          deadline += wSec * 1000;
        }
      }

      deadlineRef.current = deadline;
      phaseRef.current    = ph;
      roundRef.current    = round;
      setPhase(ph);
      setCurrentRound(round);
      warningFiredRef.current = false;

      if (ph === 'done') {
        setIsRunning(false); isRunningRef.current = false;
        setTimeLeft(0);
      } else {
        setTimeLeft(Math.max(1, Math.ceil((deadline - Date.now()) / 1000)));
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // ── Main timing loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    warningFiredRef.current = false;
    lastTickRef.current = -1;

    intervalRef.current = setInterval(() => {
      const remaining = Math.ceil((deadlineRef.current - Date.now()) / 1000);

      if (remaining <= 0) {
        const ctx   = getAudioCtx();
        const ph    = phaseRef.current;
        const round = roundRef.current;

        if (ph === 'prep') {
          // Prep done → start round 1
          playRoundStartBell(ctx);
          flash('bg-brand-500');
          vibrate(HAPTIC.roundStart);
          if (voiceRef.current) speak('Round 1');
          const newDeadline = Date.now() + workSecRef.current * 1000;
          deadlineRef.current = newDeadline;
          setPhase('work'); phaseRef.current = 'work';
          setTimeLeft(workSecRef.current);
          warningFiredRef.current = false;
          lastTickRef.current = -1;

        } else if (ph === 'work') {
          if (round >= roundsRef.current) {
            // Session complete
            ringSessionComplete(ctx);
            flash('bg-green-500');
            vibrate(HAPTIC.sessionComplete);
            if (voiceRef.current) speak('Session complete. Great work.');
            setIsRunning(false); isRunningRef.current = false;
            setPhase('done');    phaseRef.current = 'done';
            setTimeLeft(0);
          } else {
            // End of round → rest
            ringEndOfRound(ctx);
            flash('bg-blue-500');
            vibrate(HAPTIC.roundEnd);
            if (voiceRef.current) speak('Rest');
            const newDeadline = Date.now() + restSecRef.current * 1000;
            deadlineRef.current = newDeadline;
            setPhase('rest'); phaseRef.current = 'rest';
            setTimeLeft(restSecRef.current);
            warningFiredRef.current = false;
          }
        } else {
          // End of rest → new round
          const newRound    = round + 1;
          const isLast      = newRound >= roundsRef.current;
          playRoundStartBell(ctx);
          flash('bg-brand-500');
          vibrate(HAPTIC.roundStart);
          if (voiceRef.current) speak(isLast ? 'Last round' : `Round ${newRound}`);
          const newDeadline = Date.now() + workSecRef.current * 1000;
          deadlineRef.current = newDeadline;
          roundRef.current    = newRound;
          setCurrentRound(newRound);
          setPhase('work');    phaseRef.current = 'work';
          setTimeLeft(workSecRef.current);
          warningFiredRef.current = false;
        }
        return;
      }

      setTimeLeft(remaining);

      const ctx = getAudioCtx();

      // Configurable warning (only fires once per phase)
      if (
        remaining === warningSecRef.current &&
        phaseRef.current === 'work' &&
        !warningFiredRef.current
      ) {
        warningFiredRef.current = true;
        playClapper(ctx);
        vibrate(HAPTIC.warning);
        if (voiceRef.current) speak(`${warningSecRef.current} seconds`);
      }

      // 3-2-1 countdown ticks — fire once per distinct second value
      if (remaining <= 3 && phaseRef.current === 'work' && remaining !== lastTickRef.current) {
        lastTickRef.current = remaining;
        playTick(ctx);
        vibrate(HAPTIC.tick);
        if (voiceRef.current) speak(String(remaining));
      }
    }, 250);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, getAudioCtx, flash, vibrate, speak]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setIsRunning(false);  isRunningRef.current = false;
    setPhase('idle');     phaseRef.current = 'idle';
    setCurrentRound(1);   roundRef.current = 1;
    setTimeLeft(workSecRef.current);
    deadlineRef.current = 0;
    warningFiredRef.current = false;
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
    warningFiredRef.current = false;
    try { localStorage.removeItem(TIMER_KEY); } catch { /* noop */ }
  }, []);

  const handleStartPause = useCallback(() => {
    if (phase === 'done') { reset(); return; }

    if (!isRunning) {
      // Unlock speech on user gesture
      unlock();

      if (phase === 'idle') {
        const ctx = getAudioCtx();
        if (prepSecRef.current > 0) {
          // Start with prep countdown
          setPhase('prep'); phaseRef.current = 'prep';
          deadlineRef.current = Date.now() + prepSecRef.current * 1000;
          if (voiceRef.current) speak(`Round 1 begins in ${prepSecRef.current}`);
        } else {
          // Straight to work
          playRoundStartBell(ctx);
          flash('bg-brand-500');
          vibrate(HAPTIC.roundStart);
          if (voiceRef.current) speak('Round 1');
          setPhase('work'); phaseRef.current = 'work';
          deadlineRef.current = Date.now() + workSec * 1000;
        }
      } else {
        // Resume from pause
        deadlineRef.current = Date.now() + timeLeft * 1000;
      }
    }
    setIsRunning(r => !r);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isRunning, workSec, timeLeft, reset, getAudioCtx, flash, vibrate, speak, unlock]);

  // Sync idle display when workSec changes
  useEffect(() => {
    if (phase === 'idle') setTimeLeft(workSec);
  }, [workSec, phase]);

  return {
    // Settings
    selectedPreset, rounds, workSec, restSec, prepSec, warningSec,
    voiceEnabled, hapticEnabled, reactionMode, coachVoice,
    workColor, restColor,
    // Timer state
    phase, currentRound, timeLeft, isRunning,
    // Actions
    handleStartPause, reset, selectPreset,
    // Setters (for settings rows)
    setRounds:      (v: number) => { setRounds(v); roundsRef.current = v; },
    setWorkSec:     (v: number) => { setWorkSec(v); workSecRef.current = v; },
    setRestSec:     (v: number) => { setRestSec(v); restSecRef.current = v; },
    setPrepSec:     (v: number) => { setPrepSec(v); prepSecRef.current = v; },
    setWarningSec:  (v: number) => { setWarningSec(v); warningSecRef.current = v; },
    setVoiceEnabled,
    setHapticEnabled,
    setReactionMode,
    setCoachVoice: (v: CoachVoiceStyle) => { setCoachVoice(v); coachVoiceRef.current = v; },
    setWorkColor,
    setRestColor,
  };
}
