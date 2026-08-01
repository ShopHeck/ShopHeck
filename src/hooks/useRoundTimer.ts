import { useState, useEffect, useRef, useCallback } from 'react';
import { useTimerContext } from '../context/TimerContext';
import { useWakeLock } from './useWakeLock';
import { useHaptics, HAPTIC } from './useHaptics';
import { useVoiceAnnouncements } from './useVoiceAnnouncements';
import { getCustomBellDataUrl } from '../utils/customBell';
import {
  scheduleRoundAlerts, cancelRoundAlerts, roundAlertsEnabled, setRoundAlertsEnabled,
  requestNotificationPermission, notificationsSupported,
  type RoundAlert,
} from '../utils/notifications';

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
  workColor: string;
  restColor: string;
  phase: Phase;
  currentRound: number;
  isRunning: boolean;
  phaseDeadline: number;
  pausedTimeLeft: number;
  /** Unique id minted when a session starts, so the completion log fires exactly
   *  once even if the session finishes while the app is closed and is restored on
   *  a later launch (idempotency marker — see RoundTimer's completion effect). */
  sessionId: string;
}

const DEFAULTS: Partial<TimerSave> = {
  prepSec: 5,
  warningSec: 10,
  voiceEnabled: false,
  hapticEnabled: true,
  reactionMode: false,
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
  const { rounds, workSec, restSec, prepSec } = s;
  let { phase, currentRound, phaseDeadline } = s;

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

/**
 * One limiter per AudioContext, reused for every sound.
 *
 * This used to mint a fresh DynamicsCompressorNode on each bell and wire it
 * straight to ctx.destination without ever disconnecting it. A 12-round session
 * rings ~40 bells, so the graph accumulated ~40 live compressors — each one
 * running its own DSP on every audio quantum for the rest of the session.
 */
const limiters = new WeakMap<AudioContext, DynamicsCompressorNode>();

function makeLimiter(ctx: AudioContext): DynamicsCompressorNode {
  const existing = limiters.get(ctx);
  if (existing) return existing;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -3;
  comp.knee.value = 0;
  comp.ratio.value = 20;
  comp.attack.value = 0.001;
  comp.release.value = 0.05;
  comp.connect(ctx.destination);
  limiters.set(ctx, comp);
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
  const [workColor, setWorkColor] = useState('#22c55e');
  const [restColor, setRestColor] = useState('#ef4444');
  const [bgAlerts, setBgAlertsState] = useState(roundAlertsEnabled());

  // Timer engine state
  const [phase,        setPhase]        = useState<Phase>('idle');
  const [currentRound, setCurrentRound] = useState(1);
  const [timeLeft,     setTimeLeft]     = useState(PRESETS[0].workSec);
  const [isRunning,    setIsRunning]    = useState(false);
  // Identifies the current session for once-only completion logging.
  const [sessionId,    setSessionId]    = useState('');

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
  const suspendTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customBellBufRef = useRef<AudioBuffer | null>(null);
  const warningFiredRef  = useRef(false); // prevent double-fire per phase
  const lastTickRef   = useRef(-1);     // last remaining value that got a tick
  const voiceRef      = useRef(false);
  const hapticRef     = useRef(true);

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

  // Decode the custom bell file whenever the timer starts so it's ready for
  // synchronous playback inside the setInterval callback.
  // No keepalive oscillator — the audio context is deliberately suspended between
  // sounds so that iOS's .duckOthers session restores background music volume after
  // each bell/clapper finishes rather than keeping it ducked the whole session.
  useEffect(() => {
    if (!isRunning) {
      // Suspend promptly so the audio session releases and background music resumes.
      if (suspendTimerRef.current) clearTimeout(suspendTimerRef.current);
      suspendTimerRef.current = setTimeout(() => {
        audioCtxRef.current?.suspend().catch(() => {});
        suspendTimerRef.current = null;
      }, 800);
      return;
    }

    const ctx = getAudioCtx();
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
  }, [isRunning, getAudioCtx]);

  // Debounced audio-session release — called after every bell/clapper so the
  // AudioContext is suspended (= session inactive) once all audio has decayed.
  // iOS then un-ducks background music with its standard 0.5 s fade.
  //
  // Delay: 7 s covers the longest sound (triple end-of-round bell ≈ 5.5 s decay).
  // Each subsequent sound resets the timer, so music stays ducked through the full
  // warning → countdown → bell sequence without interruption.
  const scheduleCtxSuspend = useCallback(() => {
    if (suspendTimerRef.current) clearTimeout(suspendTimerRef.current);
    suspendTimerRef.current = setTimeout(() => {
      audioCtxRef.current?.suspend().catch(() => {});
      suspendTimerRef.current = null;
    }, 7000);
  }, []);

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
      voiceEnabled, hapticEnabled, reactionMode, workColor, restColor,
      phase, currentRound, isRunning, sessionId,
      phaseDeadline:  isRunning ? deadlineRef.current : 0,
      pausedTimeLeft: !isRunning ? timeLeft : 0,
    });
  }, [phase, currentRound, isRunning, timeLeft, sessionId,
      selectedPreset, rounds, workSec, restSec, prepSec, warningSec,
      voiceEnabled, hapticEnabled, reactionMode, workColor, restColor]);

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
    setSessionId(saved.sessionId ?? '');
    if (saved.workColor) setWorkColor(saved.workColor);
    if (saved.restColor) setRestColor(saved.restColor);

    // A finished session IS restored into 'done' so its completion is logged if
    // it wasn't already (e.g. the app was killed before the live log ran). The
    // completion effect dedupes on sessionId, so repeated launches never
    // duplicate the workout or the HealthKit sample.
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

  /**
   * Every remaining phase change from `deadline`, as wall-clock moments.
   *
   * Mirrors the state machine in the interval below exactly — prep ends into
   * round 1, work ends into rest (or into "done" on the last round), rest ends
   * into the next round — so the OS rings the same bells at the same instants
   * the in-app timer would have.
   */
  const upcomingAlerts = useCallback((): RoundAlert[] => {
    const alerts: RoundAlert[] = [];
    let ph = phaseRef.current;
    let round = roundRef.current;
    let at = deadlineRef.current;
    const total = roundsRef.current;

    // Bounded by the phases actually left in the session, not by a while(true).
    for (let i = 0; i < total * 2 + 2 && ph !== 'done'; i++) {
      if (ph === 'prep') {
        alerts.push({ at: new Date(at), title: 'Round 1', body: `Round 1 of ${total} — go.` });
        ph = 'work';
        at += workSecRef.current * 1000;
      } else if (ph === 'work') {
        if (round >= total) {
          alerts.push({ at: new Date(at), title: 'Session complete', body: 'Great work.' });
          ph = 'done';
        } else {
          alerts.push({ at: new Date(at), title: `End of round ${round}`, body: 'Rest.' });
          ph = 'rest';
          at += restSecRef.current * 1000;
        }
      } else {
        round += 1;
        alerts.push({
          at: new Date(at),
          title: round >= total ? 'Last round' : `Round ${round}`,
          body: `Round ${round} of ${total} — go.`,
        });
        ph = 'work';
        at += workSecRef.current * 1000;
      }
    }
    return alerts;
  }, []);

  // ── Background round alerts ──────────────────────────────────────────────
  // Handed to the OS only while the app is actually backgrounded, and revoked
  // the moment it returns, so a notification and the in-app bell can never both
  // fire for the same round.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && isRunningRef.current) {
        void scheduleRoundAlerts(upcomingAlerts());
      } else {
        void cancelRoundAlerts();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      void cancelRoundAlerts();
    };
  }, [upcomingAlerts]);

  // Pausing, resetting or finishing while backgrounded must not leave bells
  // queued for a session that is no longer running.
  useEffect(() => {
    if (!isRunning) void cancelRoundAlerts();
  }, [isRunning]);

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
          playRoundStartBell(ctx); scheduleCtxSuspend();
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
            ringSessionComplete(ctx); scheduleCtxSuspend();
            flash('bg-green-500');
            vibrate(HAPTIC.sessionComplete);
            if (voiceRef.current) speak('Session complete. Great work.');
            setIsRunning(false); isRunningRef.current = false;
            setPhase('done');    phaseRef.current = 'done';
            setTimeLeft(0);
          } else {
            // End of round → rest
            ringEndOfRound(ctx); scheduleCtxSuspend();
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
          playRoundStartBell(ctx); scheduleCtxSuspend();
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

      // Configurable warning (only fires once per phase). Guard warningSec <
      // workSec: otherwise a warning >= the work length would fire on the very
      // first tick of the round (remaining === workSec) or never fire at all.
      if (
        warningSecRef.current < workSecRef.current &&
        remaining === warningSecRef.current &&
        phaseRef.current === 'work' &&
        !warningFiredRef.current
      ) {
        warningFiredRef.current = true;
        playClapper(ctx); scheduleCtxSuspend();
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
  }, [isRunning, getAudioCtx, flash, vibrate, speak, scheduleCtxSuspend]);

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
    // Built-in presets carry their own numbers; custom presets live at indices
    // beyond the built-in list and are applied by the caller (it owns the
    // customPresets list). Guard the lookup so a custom index doesn't
    // dereference undefined and crash the whole timer view.
    const p = idx < PRESETS.length ? PRESETS[idx] : null;
    setSelectedPreset(idx);
    if (p) {
      setRounds(p.rounds);    roundsRef.current  = p.rounds;
      setWorkSec(p.workSec);  workSecRef.current = p.workSec;
      setRestSec(p.restSec);  restSecRef.current = p.restSec;
      setTimeLeft(p.workSec);
    }
    // For a custom preset the idle-display timeLeft is corrected by the
    // workSec→timeLeft sync effect once the caller's setWorkSec lands.
    setPhase('idle');       phaseRef.current   = 'idle';
    setCurrentRound(1);     roundRef.current   = 1;
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
        // New session — mint an id so the completion effect logs it exactly once,
        // even across an app relaunch that restores the finished session.
        setSessionId(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
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

  /**
   * Turning this on needs the OS notification permission, so it is requested at
   * the moment the fighter asks for the feature rather than at launch. If they
   * decline, the toggle stays off instead of claiming a capability we don't
   * have.
   */
  const setBgAlerts = useCallback(async (on: boolean) => {
    if (!on) {
      setRoundAlertsEnabled(false);
      setBgAlertsState(false);
      await cancelRoundAlerts();
      return;
    }
    const granted = await requestNotificationPermission();
    setRoundAlertsEnabled(granted);
    setBgAlertsState(granted);
  }, []);

  return {
    // Settings
    selectedPreset, rounds, workSec, restSec, prepSec, warningSec,
    voiceEnabled, hapticEnabled, reactionMode, bgAlerts,
    workColor, restColor,
    // Timer state
    phase, currentRound, timeLeft, isRunning, sessionId,
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
    setBgAlerts,
    /** Background alerts need a native OS scheduler; hide the row on web. */
    bgAlertsSupported: notificationsSupported(),
    setReactionMode,
    setWorkColor,
    setRestColor,
  };
}
