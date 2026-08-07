import React, { useState, useEffect, useCallback, useId } from 'react';
import {
  Play, Pause, RotateCcw, ChevronUp, ChevronDown,
  Volume2, VolumeX, Smartphone, Shuffle, Maximize2, Minimize2,
  Plus, X, Bluetooth, BluetoothOff, Bell, SkipForward
} from 'lucide-react';
import { format } from 'date-fns';
import { useRoundTimer, PRESETS, fmt, hasLiveTimerSession } from '../hooks/useRoundTimer';
import { loadCustomPresets, saveCustomPresets, generateId } from '../utils/storage';
import { useApp } from '../context/AppContext';
import { isPro as hasProAccess } from '../utils/subscription';
import { writeWorkoutToHealth } from '../utils/healthSync';
import { getCurrentWeekNumber } from '../utils/campGenerator';
import { timerSessionMinutes, type TimerPrefill } from '../utils/timerSession';
import type { CustomTimerPreset } from '../types';
import ProGate from './shared/ProGate';
import { useDialog } from '../hooks/useDialog';
import GymDisplay from './GymDisplay';
import PressableButton from './shared/PressableButton';
import TimerOrb from './shared/TimerOrb';
import ReactionPrompt from './ReactionPrompt';
import { ZONE_COLORS, ZONE_LABELS } from '../hooks/useBluetoothHR';
import { tint } from '../utils/designTokens';
import { useHeartRate } from '../context/HeartRateContext';
import { useMyZoneMEP } from '../hooks/useMyZoneMEP';
import { syncLiveActivity, endLiveActivity } from '../utils/liveActivity';
import { WatchBridge } from '../plugins/WatchBridge';

// Session id of the last completion we logged — makes the completion effect
// idempotent across relaunches that restore a finished session.
const TIMER_LOGGED_KEY = 'fightcamp_timer_logged';

// ─── Custom Preset Modal ───────────────────────────────────────────────────

interface PresetModalProps {
  onSave: (p: Omit<CustomTimerPreset, 'id' | 'createdAt'>) => void;
  onClose: () => void;
}

function PresetModal({ onSave, onClose }: PresetModalProps) {
  const titleId = useId();
  const panelRef = useDialog({ onClose });
  const [label,    setLabel]    = useState('');
  const [rounds,   setRounds]   = useState(3);
  const [workSec,  setWorkSec]  = useState(180);
  const [restSec,  setRestSec]  = useState(60);

  const adj = (setter: React.Dispatch<React.SetStateAction<number>>, d: number, min: number, max: number) =>
    setter(v => Math.max(min, Math.min(max, v + d)));

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-dark-800 rounded-2xl border border-dark-500 w-full max-w-sm flex flex-col outline-none"
        style={{ maxHeight: 'calc(100dvh - 2rem)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Fixed header */}
        <div className="flex items-center justify-between p-5 flex-shrink-0 border-b border-dark-600">
          <h3 id={titleId} className="text-base font-bold text-white">New Preset</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white p-3 -m-2"><X size={18} /></button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
          <div>
            <label className="block">
              <span className="label">Name</span>
              <input
              className="input"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Thai Clinch"
              maxLength={20}
            />
            </label>
          </div>

          {[
            { label: 'Rounds', value: rounds, setter: setRounds, step: 1, min: 1, max: 30 },
            { label: 'Work (sec)', value: workSec, setter: setWorkSec, step: 15, min: 15, max: 1800 },
            { label: 'Rest (sec)', value: restSec, setter: setRestSec, step: 5, min: 5, max: 600 },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between">
              <span className="text-sm text-gray-300">{row.label}</span>
              <div className="flex items-center gap-3">
                <button onClick={() => adj(row.setter, -row.step, row.min, row.max)}
                  aria-label={`Decrease ${row.label.toLowerCase()}`}
                  className="w-10 h-10 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white">
                  <ChevronDown size={16} />
                </button>
                <span className="text-sm font-bold text-white w-10 text-center">
                  {row.label === 'Rounds' ? row.value : fmt(row.value)}
                </span>
                <button onClick={() => adj(row.setter, row.step, row.min, row.max)}
                  aria-label={`Increase ${row.label.toLowerCase()}`}
                  className="w-10 h-10 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white">
                  <ChevronUp size={16} />
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={() => { if (label.trim()) { onSave({ label: label.trim(), rounds, workSec, restSec }); } }}
            disabled={!label.trim()}
            className="btn-primary w-full disabled:opacity-40"
          >
            Save Preset
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

interface RoundTimerProps {
  /** Settings handed over from a session on the plan. See `timerPrefillForSession`. */
  prefill?: TimerPrefill | null;
  /** Called once the prefill has been applied (or deliberately declined). */
  onPrefillConsumed?: () => void;
}

/** The built-in 'Custom' chip — looked up rather than hard-coded at 4 so
 *  reordering PRESETS cannot silently point this at 'HIIT'. */
const CUSTOM_PRESET_INDEX = PRESETS.findIndex(p => p.label === 'Custom');

export default function RoundTimer({ prefill, onPrefillConsumed }: RoundTimerProps = {}) {
  const { state, dispatch } = useApp();
  const timer = useRoundTimer();
  const {
    selectedPreset, rounds, workSec, restSec, prepSec, warningSec,
    voiceEnabled, hapticEnabled, reactionMode, bgAlerts, bgAlertsSupported,
    workColor, restColor,
    phase, currentRound, timeLeft, isRunning, sessionId, phaseSec, deadlineMs,
    handleStartPause, reset, selectPreset, skipPhase, extendPhase,
    setRounds, setWorkSec, setRestSec, setPrepSec, setWarningSec,
    setVoiceEnabled, setHapticEnabled, setReactionMode, setBgAlerts,
    setWorkColor, setRestColor,
  } = timer;

  // Bluetooth HR — the app's single connection (see context/HeartRateContext).
  const hr = useHeartRate();
  const { mep, resetMEP } = useMyZoneMEP(hr.zone, isRunning);
  const mepTarget = state.currentUser?.mepTarget ?? 65;

  // Wrap handleStartPause
  const onStartPause = React.useCallback(() => {
    handleStartPause();
  }, [handleStartPause]);

  // Screenshot/preview harness (?shot): expose the start-pause control the same
  // way AppShell exposes __setView, so scripts/app-preview.mjs can run the
  // clock during an App Store preview recording instead of filming a static
  // 3:00. No-op in normal use.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!new URLSearchParams(window.location.search).has('shot')) return;
    (window as unknown as { __timerStartPause?: () => void }).__timerStartPause = onStartPause;
  }, [onStartPause]);

  /** What the current settings were loaded from, when they came from the plan. */
  const [planLabel, setPlanLabel] = useState<string | null>(null);

  /**
   * Apply settings handed over from the weekly plan.
   *
   * Applied through the hook's own setters (which keep the clock's refs in
   * step) and via `selectPreset(Custom)` first, so the chip row cannot claim
   * "Boxing" while showing numbers Boxing does not have — `selectPreset` also
   * clears any finished session back to idle.
   *
   * Declined outright when a session is on the clock. A prefill arriving
   * mid-round would rewrite the round count and length under a fighter who is
   * three rounds into using them; the running session is worth more than the
   * handover, so it wins and the prefill is dropped.
   *
   * `hasLiveTimerSession()` is the load-bearing half of that guard, not a
   * belt-and-braces extra. This view unmounts when the fighter goes back to the
   * plan, so on the remount that *delivers* the prefill, `phase` and
   * `isRunning` are still their initial idle values — the hook's restore effect
   * has not landed yet. Reading state alone let a second tap rewrite a running
   * session's rounds out from under it.
   */
  useEffect(() => {
    if (!prefill) return;
    const busy = isRunning || (phase !== 'idle' && phase !== 'done') || hasLiveTimerSession();
    if (!busy) {
      if (CUSTOM_PRESET_INDEX >= 0) selectPreset(CUSTOM_PRESET_INDEX);
      setRounds(prefill.rounds);
      setWorkSec(prefill.workSec);
      setRestSec(prefill.restSec);
      setPlanLabel(prefill.label);
    }
    onPrefillConsumed?.();
  }, [prefill, isRunning, phase, selectPreset, setRounds, setWorkSec, setRestSec, onPrefillConsumed]);

  // Simple absolute-value adjuster for settings rows
  const adj = (setter: (v: number) => void, current: number, delta: number, min: number, max: number) => {
    setter(Math.max(min, Math.min(max, current + delta)));
  };

  const [customPresets, setCustomPresets] = useState<CustomTimerPreset[]>([]);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Load custom presets on mount
  useEffect(() => { setCustomPresets(loadCustomPresets()); }, []);
  useEffect(() => {
    const reload = () => setCustomPresets(loadCustomPresets());
    window.addEventListener('fightcamp-presets-changed', reload);
    return () => window.removeEventListener('fightcamp-presets-changed', reload);
  }, []);

  // Exit the takeover when the browser leaves real fullscreen (Esc on web).
  // Entering is driven by state alone — see toggleFullscreen.
  useEffect(() => {
    const onFsChange = () => { if (!document.fullscreenElement) setIsFullscreen(false); };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Log workout when session completes — exactly once per session. The 'done'
  // phase can be reached live or restored on a later launch, so dedupe on the
  // session id (persisted marker) rather than firing on every 'done'.
  useEffect(() => {
    if (phase !== 'done') return;
    if (!state.activeCamp) return;
    if (!sessionId) return; // legacy/unknown session — don't log ambiguously
    try {
      if (localStorage.getItem(TIMER_LOGGED_KEY) === sessionId) return;
    } catch { /* ignore */ }
    const camp = state.activeCamp;
    const preset = selectedPreset < PRESETS.length
      ? PRESETS[selectedPreset].label
      : customPresets[selectedPreset - PRESETS.length]?.label ?? 'Custom';
    const totalMinutes = timerSessionMinutes(rounds, workSec, restSec);
    // Local calendar date (not UTC) so streak/adherence day-bucketing matches
    // WorkoutLogger; toISOString() is UTC and splits an evening session onto the
    // next day for UTC-negative users, inflating uniqueDays.
    const todayLocal = format(new Date(), 'yyyy-MM-dd');
    dispatch({
      type: 'LOG_WORKOUT',
      payload: {
        campId: camp.id,
        date: todayLocal,
        weekNumber: getCurrentWeekNumber(camp),
        dayLabel: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        sessionType: 'conditioning',
        title: `Round Timer — ${preset} ${rounds}×${fmt(workSec)}`,
        duration: totalMinutes,
        rpe: 7,
        notes: `${rounds} rounds, ${fmt(workSec)} work / ${fmt(restSec)} rest`,
        completed: true,
        ...(hr.connected && mep > 0 ? { mep } : {}),
      },
    });
    void writeWorkoutToHealth({
      sessionType: 'conditioning',
      date: todayLocal,
      duration: totalMinutes,
    });
    try { localStorage.setItem(TIMER_LOGGED_KEY, sessionId); } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sessionId]);

  // Reset MEP when a new session starts (phase goes from idle/done to prep/work)
  const prevPhaseRef = React.useRef(phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    if ((prev === 'idle' || prev === 'done') && (phase === 'prep' || phase === 'work')) {
      resetMEP();
    }
    prevPhaseRef.current = phase;
  }, [phase, resetMEP]);

  // ── Live Activity (iOS 16.1+) ─────────────────────────────────────────────
  // The web timer freezes when the app backgrounds, so push the session's
  // REMAINING SCHEDULE as absolute wall-clock segments: the widget renders
  // the countdown from Date() itself and keeps counting while WKWebView is
  // suspended.
  //
  // Keyed on `deadlineMs`, not `timeLeft` — the deadline only moves on phase
  // transitions, skips and +30s extensions, so this pushes exactly when the
  // schedule changes and never once a second.
  const presetLabel = selectedPreset < PRESETS.length
    ? PRESETS[selectedPreset].label
    : customPresets[selectedPreset - PRESETS.length]?.label ?? 'Custom';

  // Latest activity payload, refreshed every render. The push effects below
  // read it through a ref so they can re-run ONLY on schedule-change signals
  // (deps) instead of on every second tick.
  const laSnapshotRef = React.useRef({
    phase, round: currentRound, rounds, deadlineMs, phaseSec, workSec,
    restSec, prepSec, isRunning, pausedTimeLeft: timeLeft, presetLabel,
    workColorHex: workColor, restColorHex: restColor,
  });
  laSnapshotRef.current = {
    phase, round: currentRound, rounds, deadlineMs, phaseSec, workSec,
    restSec, prepSec, isRunning, pausedTimeLeft: timeLeft, presetLabel,
    workColorHex: workColor, restColorHex: restColor,
  };

  useEffect(() => {
    if (phase === 'idle' || phase === 'done' || !sessionId) {
      void endLiveActivity();
      return;
    }
    void syncLiveActivity(laSnapshotRef.current, sessionId);
    // deadlineMs (not timeLeft) is the schedule-change signal: it moves only
    // on phase transitions, skips and +30s extensions, so this pushes exactly
    // when the schedule changes and never once a second. pausedTimeLeft is
    // only consumed by the widget while paused, where timeLeft is constant.
  }, [phase, currentRound, isRunning, sessionId, deadlineMs, phaseSec,
      rounds, workSec, restSec, prepSec, presetLabel, workColor, restColor]);

  // Mirror the session onto the wrist.
  //
  // Only the CONFIGURATION is sent, once per session — not the running clock.
  // The watch derives every phase boundary itself from these durations plus its
  // own start instant (see RoundEngine.swift), because WatchConnectivity is
  // best-effort: a per-transition push would drop bells whenever the link was
  // busy, and a bell that never rings is the one failure that makes a round
  // timer useless. Keyed on sessionId so a preset change mid-session cannot
  // re-push and restart the wrist clock.
  useEffect(() => {
    if (!sessionId) {
      void WatchBridge.endSession().catch(() => {});
      return;
    }
    void WatchBridge.startSession({
      rounds, workSec, restSec, prepSec, label: presetLabel, sessionId,
    }).catch(() => {
      // No watch paired, or the watch app is not installed. The phone timer is
      // unaffected, and nagging about a device the fighter may not own would be
      // noise — Settings surfaces availability instead.
    });
  }, [sessionId, rounds, workSec, restSec, prepSec, presetLabel]);

  // The push that matters most: the last foreground moment before WKWebView
  // suspends. Without it the activity would be one transition stale by the
  // time the phone is locked.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      if (phase === 'idle' || phase === 'done' || !sessionId) return;
      void syncLiveActivity(laSnapshotRef.current, sessionId);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [phase, sessionId]);

  // Cold launch / process restart: JS has no memory of a prior Live Activity,
  // but ActivityKit may still be showing one. When the timer mounts with no
  // active session, ask native to end every system-held timer activity.
  useEffect(() => {
    if (!sessionId) void endLiveActivity();
    // Mount-only: sessionId at first paint is the signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savePreset = useCallback((p: Omit<CustomTimerPreset, 'id' | 'createdAt'>) => {
    const newPreset: CustomTimerPreset = { ...p, id: generateId(), createdAt: new Date().toISOString() };
    const next = [...customPresets, newPreset];
    setCustomPresets(next);
    saveCustomPresets(next);
    setShowPresetModal(false);
  }, [customPresets]);

  const deleteCustomPreset = useCallback((id: string) => {
    const next = customPresets.filter(p => p.id !== id);
    setCustomPresets(next);
    saveCustomPresets(next);
  }, [customPresets]);

  const toggleFullscreen = useCallback(() => {
    // The takeover is state-driven: GymDisplay renders off isFullscreen alone.
    // The Fullscreen API is progressive enhancement for desktop web browser
    // chrome — iOS WKWebView has no Element.requestFullscreen for page
    // elements (calling it throws synchronously), so it must never gate the
    // feature.
    const next = !isFullscreen;
    setIsFullscreen(next);
    try {
      if (next) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    } catch { /* no Fullscreen API — the takeover view stands on its own */ }
  }, [isFullscreen]);

  const isPro = hasProAccess(state.subscription);
  const FREE_PRESET_LIMIT = 2;

  // ── Gym Display (fullscreen) ─────────────────────────────────────────────
  if (isFullscreen) {
    return (
      <GymDisplay
        phase={phase}
        currentRound={currentRound}
        rounds={rounds}
        timeLeft={timeLeft}
        isRunning={isRunning}
        workColor={workColor}
        restColor={restColor}
        hrBpm={hr.connected ? hr.hr : null}
        hrColor={ZONE_COLORS[hr.zone]}
        mep={hr.connected ? mep : 0}
        onStartPause={handleStartPause}
        onReset={reset}
        onExitFullscreen={toggleFullscreen}
      />
    );
  }

  // ── Progress ring geometry ────────────────────────────────────────────────
  // The ring depletes as the phase advances — the single glance a fighter
  // needs mid-round. Denominator is phaseSec (the CURRENT phase's nominal
  // duration, grown by +30s extensions), not the work/rest setting, so an
  // extended phase never shows past 100%.
  // Ring geometry now lives in <TimerOrb>, which locks the two permitted sizes
  // and their stroke widths; this screen only supplies the fraction.
  const progress = phase === 'idle' || phase === 'done'
    ? 1
    : Math.max(0, Math.min(1, timeLeft / Math.max(1, phaseSec)));

  // ── Derived UI ────────────────────────────────────────────────────────────
  // The phase→color mapping now lives entirely in <TimerOrb>; the surfaces
  // around it key off the fighter's workColor directly.
  const phaseLabel =
    phase === 'idle' ? 'Ready'     :
    phase === 'prep' ? 'GET READY' :
    phase === 'work' ? 'WORK'      :
    phase === 'rest' ? 'REST'      : 'DONE';

  const phaseBg =
    phase === 'rest' ? 'bg-accent-blue/20 text-accent-blue'   :
    phase === 'done' ? 'bg-accent-green/20 text-accent-green' :
    phase === 'prep' ? 'bg-accent-gold/20 text-accent-gold'   :
    'bg-surface-2 text-gray-400';

  return (
    <div className="pb-4">
      {/* Presets */}
      <div className="mx-4 mt-4 flex gap-2 overflow-x-auto no-scrollbar pb-1 items-center">
        {PRESETS.map((p, i) => (
          <button
            key={p.label}
            onClick={() => { setPlanLabel(null); selectPreset(i); }}
            disabled={isRunning}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              selectedPreset === i
                ? 'bg-brand-600 border-brand-500 text-white'
                : 'bg-dark-700 border-dark-500 text-gray-400 hover:border-dark-300'
            }`}
          >
            {p.label}
          </button>
        ))}
        {customPresets.map((p, i) => (
          <div key={p.id} className="flex-shrink-0 relative">
            <button
              onClick={() => {
                const idx = PRESETS.length + i;
                const preset = customPresets[i];
                setPlanLabel(null);
                setRounds(preset.rounds);
                setWorkSec(preset.workSec);
                setRestSec(preset.restSec);
                selectPreset(idx);
              }}
              disabled={isRunning}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                selectedPreset === PRESETS.length + i
                  ? 'bg-purple-600 border-purple-500 text-white'
                  : 'bg-dark-700 border-dark-500 text-gray-400 hover:border-dark-300'
              }`}
            >
              {p.label}
            </button>
            {/* Always-visible delete — hover-only affordances are invisible on
                touch, which is the entire target platform. */}
            <button
              onClick={() => deleteCustomPreset(p.id)}
              disabled={isRunning}
              aria-label={`Delete preset ${p.label}`}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-dark-500 border border-dark-400 text-gray-400 hover:text-white flex items-center justify-center disabled:opacity-50"
            >
              <X size={9} />
            </button>
          </div>
        ))}
        {/* Add custom preset button */}
        {customPresets.length < FREE_PRESET_LIMIT || isPro ? (
          <button
            onClick={() => setShowPresetModal(true)}
            aria-label="Create a custom timer preset"
            className="flex-shrink-0 w-9 h-9 rounded-xl bg-dark-700 border border-dark-500 border-dashed text-gray-400 hover:text-white hover:border-dark-300 flex items-center justify-center transition-all"
          >
            <Plus size={16} />
          </button>
        ) : (
          <ProGate required="fighter_pro" inline={false}>
            <button aria-label="Create a custom timer preset (Fighter Pro)" className="flex-shrink-0 w-9 h-9 rounded-xl bg-dark-700 border border-dashed border-dark-500 text-gray-400 flex items-center justify-center">
              <Plus size={16} />
            </button>
          </ProGate>
        )}
      </div>

      {/* Where these settings came from, when they came from the plan. Without
          it the timer just silently holds different numbers than last time. */}
      {planLabel && (
        <p className="mx-4 mt-2 text-[11px] text-gray-450">
          Set up from your plan · <span className="text-brand-400 font-semibold">{planLabel}</span>
        </p>
      )}

      {/* Main Timer Display */}
      <div className="mx-4 mt-6 flex flex-col items-center">
        {/* Large round number */}
        {phase !== 'idle' && phase !== 'done' && (
          <div className="text-center mb-3">
            <p className="text-[10px] font-semibold tracking-[0.2em] text-gray-450 uppercase">
              {phase === 'prep' ? 'Get Ready' : 'Round'}
            </p>
            <p className="text-6xl font-black text-white leading-none">
              {phase === 'prep' ? '!' : currentRound}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">of {rounds}</p>
          </div>
        )}

        {phase === 'idle' && (
          <div className="flex items-center gap-3 mb-4">
            <span className={`badge text-sm font-bold px-3 py-1 ${phaseBg}`}>{phaseLabel}</span>
            <span className="text-gray-400 text-sm">Round 1 of {rounds}</span>
          </div>
        )}

        {phase === 'done' && (
          <div className="flex items-center gap-3 mb-4">
            <span className={`badge text-sm font-bold px-3 py-1 ${phaseBg}`}>{phaseLabel}</span>
          </div>
        )}

        {/* The orb carries its own state label in the center (§3.4), which is
            why the separate phase badge that used to sit under it is gone —
            it was the same word twice, 60px apart. */}
        <TimerOrb
          time={phase === 'done' ? '✓' : fmt(timeLeft)}
          phase={phase === 'idle' || phase === 'prep' || phase === 'work' || phase === 'rest' ? phase : 'done'}
          progress={progress}
          workColor={workColor}
          restColor={restColor}
          running={isRunning}
          label={phaseLabel}
        />

        {/* Reaction prompt — below badge during rest */}
        {reactionMode && phase === 'rest' && (
          <div className="mt-2 text-center">
            <ReactionPrompt sport={state.currentUser?.sport} active={phase === 'rest'} isPro={!!isPro} />
          </div>
        )}

        {/* Live HR / MEP row */}
        {hr.connected && hr.hr !== null && phase !== 'idle' && (
          <div
            className="mt-3 flex items-center gap-3 px-4 py-2 rounded-2xl"
            style={{
              backgroundColor: tint(ZONE_COLORS[hr.zone], 0.09),
              border: `1px solid ${tint(ZONE_COLORS[hr.zone], 0.25)}`,
            }}
          >
            <span className="text-sm font-bold tabular-nums" style={{ color: ZONE_COLORS[hr.zone] }}>
              {hr.hr} bpm
            </span>
            <span className="text-xs text-gray-400">{ZONE_LABELS[hr.zone]}</span>
            {mep > 0 && (
              <>
                <span className="text-gray-450">·</span>
                <span className="text-xs font-semibold text-gray-300">{mep} MEP</span>
              </>
            )}
          </div>
        )}

        {/* In-session controls — skip the phase or add 30s. Shown only while a
            phase is live; idle/done use the main start/reset row below. */}
        {(phase === 'work' || phase === 'rest' || phase === 'prep') && (
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => extendPhase(30)}
              aria-label="Add 30 seconds to the current phase"
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-surface-1 border border-surface-2 text-sm font-semibold text-gray-300 hover:text-white hover:border-surface-3 pressable"
            >
              <Plus size={15} />
              30s
            </button>
            <button
              onClick={skipPhase}
              aria-label={phase === 'rest' ? 'Skip rest — go to the next round' : phase === 'prep' ? 'Skip the countdown' : 'Skip to the rest period'}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-surface-1 border border-surface-2 text-sm font-semibold text-gray-300 hover:text-white hover:border-surface-3 pressable"
            >
              <SkipForward size={15} />
              {phase === 'rest' ? 'Skip rest' : phase === 'prep' ? 'Skip' : 'End round'}
            </button>
          </div>
        )}

        {/* Round dots */}
        {phase !== 'idle' && phase !== 'done' && phase !== 'prep' && (
          <div className="flex gap-2 mt-3">
            {Array.from({ length: Math.min(rounds, 20) }).map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all ${i === currentRound - 1 ? 'scale-125' : ''}`}
                style={{
                  backgroundColor:
                    i < currentRound - 1  ? `${workColor}99` :
                    i === currentRound - 1 ? workColor :
                    'var(--surface-3)',
                }}
              />
            ))}
          </div>
        )}

        {phase === 'done' && (
          <div className="mt-4 w-full max-w-xs mx-auto">
            <p className="text-green-400 font-semibold text-lg text-center">Session complete!</p>
            {/* Session summary — rounds, clock time and MEP in one card, so the
                fighter leaves the timer with the workout's shape, not just a
                checkmark. The session itself is auto-logged (see completion
                effect); this is the receipt. */}
            <div className="card mt-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-black text-white">{rounds}</div>
                <div className="text-[11px] text-gray-400">rounds</div>
              </div>
              <div>
                <div className="text-lg font-black text-white">{fmt(rounds * workSec + Math.max(0, rounds - 1) * restSec)}</div>
                <div className="text-[11px] text-gray-400">clock time</div>
              </div>
              <div>
                <div className="text-lg font-black text-white">{hr.connected && mep > 0 ? mep : '—'}</div>
                <div className="text-[11px] text-gray-400">MEP</div>
              </div>
            </div>
            {hr.connected && mep > 0 && (
              <p className="text-sm mt-2 text-center" style={{ color: mep >= mepTarget ? 'var(--pace-ahead)' : 'var(--text-secondary)' }}>
                {mep} MEP {mep >= mepTarget ? `✓ target hit (${mepTarget})` : `/ ${mepTarget} target`}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Controls. These use <PressableButton> rather than `active:scale-95`
          because WKWebView drops `:active` on a fast tap — and a fast tap with
          gloves on, mid-round, is precisely how this row gets used. Everywhere
          else in the app the CSS pseudo-class is good enough; here it is the
          difference between a control that confirms it fired and one that
          appears not to have. */}
      <div className="mx-4 mt-6 flex gap-3 justify-center items-center">
        <PressableButton
          onClick={reset}
          aria-label="Reset timer"
          className="w-14 h-14 rounded-full bg-surface-1 border border-surface-2 flex items-center justify-center text-gray-400 hover:text-white hover:border-surface-3"
        >
          <RotateCcw size={20} />
        </PressableButton>
        <PressableButton
          onClick={onStartPause}
          aria-label={phase === 'done' ? 'Start a new session' : isRunning ? 'Pause timer' : 'Start timer'}
          className="w-20 h-20 rounded-full flex items-center justify-center text-white shadow-2"
          style={
            phase === 'done'
              ? { backgroundColor: 'var(--pace-ahead)', color: 'var(--bg-obsidian)' }
              : isRunning
              ? { backgroundColor: 'var(--surface-2)', border: '2px solid var(--accent-flame)' }
              : { backgroundColor: 'var(--accent-flame)', boxShadow: 'var(--glow-active)' }
          }
        >
          {isRunning ? <Pause size={30} /> : <Play size={30} className="translate-x-0.5" />}
        </PressableButton>
        {/* Bluetooth HR button */}
        {hr.supported && (
          <PressableButton
            onClick={hr.connected ? hr.disconnect : hr.connect}
            disabled={hr.connecting}
            aria-label={hr.connected ? `Disconnect heart rate monitor (${hr.deviceName})` : 'Connect heart rate monitor'}
            title={hr.connected ? `Connected: ${hr.deviceName}` : 'Connect HR device'}
            className="w-14 h-14 rounded-full border flex items-center justify-center disabled:opacity-50"
            style={
              hr.connected
                ? {
                    backgroundColor: tint('var(--pace-ahead)', 0.14),
                    borderColor: tint('var(--pace-ahead)', 0.5),
                    color: 'var(--pace-ahead)',
                  }
                : { backgroundColor: 'var(--surface-1)', borderColor: 'var(--surface-2)', color: 'var(--text-secondary)' }
            }
          >
            {hr.connecting
              ? <span className="text-[9px] font-bold text-gray-400">…</span>
              : hr.connected
              ? <Bluetooth size={20} />
              : <BluetoothOff size={20} />
            }
          </PressableButton>
        )}
        {/* Fullscreen button */}
        <ProGate required="fighter_pro" inline>
          <PressableButton
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen gym display' : 'Fullscreen gym display'}
            className="w-14 h-14 rounded-full bg-surface-1 border border-surface-2 flex items-center justify-center text-gray-400 hover:text-white hover:border-surface-3"
          >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </PressableButton>
        </ProGate>
      </div>

      {/* Settings */}
      <div className="mx-4 mt-6 space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Timer Settings</p>

        {/* Rounds */}
        <div className="card flex items-center justify-between">
          <span className="text-sm font-medium text-white">Rounds</span>
          <div className="flex items-center gap-3">
            <button onClick={() => adj(setRounds, rounds, -1, 1, 30)} disabled={isRunning}
              aria-label="Decrease rounds"
              className="w-10 h-10 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all">
              <ChevronDown size={16} />
            </button>
            <span className="text-lg font-bold text-white w-8 text-center">{rounds}</span>
            <button onClick={() => adj(setRounds, rounds, 1, 1, 30)} disabled={isRunning}
              aria-label="Increase rounds"
              className="w-10 h-10 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all">
              <ChevronUp size={16} />
            </button>
          </div>
        </div>

        {/* Work Time */}
        <div className="card flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-white">Work Time</span>
            <p className="text-xs text-gray-400">{fmt(workSec)} per round</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => adj(setWorkSec, workSec, -15, 15, 1800)} disabled={isRunning}
              aria-label="Decrease work time"
              className="w-10 h-10 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all">
              <ChevronDown size={16} />
            </button>
            <span className="text-lg font-bold text-brand-400 w-12 text-center">{fmt(workSec)}</span>
            <button onClick={() => adj(setWorkSec, workSec, 15, 15, 1800)} disabled={isRunning}
              aria-label="Increase work time"
              className="w-10 h-10 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all">
              <ChevronUp size={16} />
            </button>
          </div>
        </div>

        {/* Rest Time */}
        <div className="card flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-white">Rest Time</span>
            <p className="text-xs text-gray-400">{fmt(restSec)} between rounds</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => adj(setRestSec, restSec, -5, 5, 600)} disabled={isRunning}
              aria-label="Decrease rest time"
              className="w-10 h-10 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all">
              <ChevronDown size={16} />
            </button>
            <span className="text-lg font-bold text-blue-400 w-12 text-center">{fmt(restSec)}</span>
            <button onClick={() => adj(setRestSec, restSec, 5, 5, 600)} disabled={isRunning}
              aria-label="Increase rest time"
              className="w-10 h-10 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all">
              <ChevronUp size={16} />
            </button>
          </div>
        </div>

        {/* Get Ready Countdown */}
        <div className="card flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-white">Get Ready</span>
            <p className="text-xs text-gray-400">Countdown before round 1</p>
          </div>
          <div className="flex gap-1.5">
            {[0, 5, 10].map(v => (
              <button
                key={v}
                onClick={() => setPrepSec(v)}
                disabled={isRunning}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-40 ${
                  prepSec === v
                    ? 'bg-brand-600 border-brand-500 text-white'
                    : 'bg-dark-600 border-dark-400 text-gray-400 hover:border-dark-300'
                }`}
              >
                {v === 0 ? 'Off' : `${v}s`}
              </button>
            ))}
          </div>
        </div>

        {/* Ring Colors */}
        <div className="card space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ring Colors</p>
          {/* The six swatches per phase are the shipped set (§3.4). They are
              real hex rather than token references — and one of only two such
              places in the app — because the fighter's choice is handed to the
              Live Activity and the watch app over the Capacitor bridge, and
              UIKit cannot resolve `var()`. The values are the design system's
              accents written out, so a chosen ring color is still on-palette;
              they were previously Tailwind defaults that matched nothing. */}
          {[
            {
              label: 'Work',
              current: workColor,
              set: setWorkColor,
              swatches: [
                { hex: '#00E676', name: 'green' },
                { hex: '#4DA8FF', name: 'blue' },
                { hex: '#00F5D4', name: 'cyan' },
                { hex: '#9D4EDD', name: 'violet' },
                { hex: '#FF5E1A', name: 'orange' },
                { hex: '#FFFFFF', name: 'white' },
              ],
            },
            {
              label: 'Rest',
              current: restColor,
              set: setRestColor,
              swatches: [
                { hex: '#FF2A00', name: 'red' },
                { hex: '#FF5E1A', name: 'orange' },
                { hex: '#FFD166', name: 'gold' },
                { hex: '#4DA8FF', name: 'blue' },
                { hex: '#9D4EDD', name: 'violet' },
                { hex: '#8C94A1', name: 'gray' },
              ],
            },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between">
              <span className="text-sm font-medium text-white w-10">{row.label}</span>
              <div className="flex gap-2">
                {row.swatches.map(({ hex, name }) => (
                  <button
                    key={hex}
                    onClick={() => row.set(hex)}
                    className={`w-7 h-7 rounded-full border-2 transition-all active:scale-95 ${
                      row.current === hex ? 'border-white scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: hex }}
                    /* The hex was the accessible name, which announced as
                       "number F F five E one A" — a color name is the thing a
                       screen-reader user can actually act on. */
                    aria-label={`${row.label} ring: ${name}`}
                    aria-pressed={row.current === hex}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Warning Time */}
        <div className="card flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-white">Warning Bell</span>
            <p className="text-xs text-gray-400">Warning clap this many seconds before the round ends</p>
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end">
            {[5, 10].map(v => (
              <button
                key={v}
                onClick={() => setWarningSec(v)} aria-pressed={warningSec === v}
                disabled={isRunning}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-40 ${
                  warningSec === v
                    ? 'bg-brand-600 border-brand-500 text-white'
                    : 'bg-dark-600 border-dark-400 text-gray-400 hover:border-dark-300'
                }`}
              >
                {v}s
              </button>
            ))}
            <ProGate required="fighter_pro" inline={false}>
              {[15, 20, 30].map(v => (
                <button
                  key={v}
                  onClick={() => setWarningSec(v)} aria-pressed={warningSec === v}
                  disabled={isRunning}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-40 ${
                    warningSec === v
                      ? 'bg-purple-600 border-purple-500 text-white'
                      : 'bg-dark-600 border-dark-400 text-gray-400 hover:border-dark-300'
                  }`}
                >
                  {v}s
                </button>
              ))}
            </ProGate>
          </div>
        </div>

        {/* Toggle row — Voice, Haptics, Reaction */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {voiceEnabled ? <Volume2 size={16} className="text-brand-400" /> : <VolumeX size={16} className="text-gray-400" />}
              <div>
                <span className="text-sm font-medium text-white">Voice Announcements</span>
                <p className="text-xs text-gray-400">Round & rest callouts</p>
              </div>
            </div>
            <button
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              role="switch"
              aria-checked={voiceEnabled}
              aria-label="Voice announcements"
              className={`w-11 h-6 rounded-full transition-colors ${voiceEnabled ? 'bg-brand-600' : 'bg-dark-500'}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow mx-0.5 transition-transform ${voiceEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone size={16} className={hapticEnabled ? 'text-brand-400' : 'text-gray-400'} />
              <div>
                <span className="text-sm font-medium text-white">Vibration</span>
                <p className="text-xs text-gray-400">Haptic feedback on transitions</p>
              </div>
            </div>
            <button
              onClick={() => setHapticEnabled(!hapticEnabled)}
              role="switch"
              aria-checked={hapticEnabled}
              aria-label="Vibration"
              className={`w-11 h-6 rounded-full transition-colors ${hapticEnabled ? 'bg-brand-600' : 'bg-dark-500'}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow mx-0.5 transition-transform ${hapticEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {bgAlertsSupported && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell size={16} className={bgAlerts ? 'text-brand-400' : 'text-gray-400'} />
                <div>
                  <span className="text-sm font-medium text-white">Background Alerts</span>
                  <p className="text-xs text-gray-400">Ring rounds with the app closed</p>
                </div>
              </div>
              <button
                onClick={() => void setBgAlerts(!bgAlerts)}
                role="switch"
                aria-checked={bgAlerts}
                aria-label="Background alerts"
                className={`w-11 h-6 rounded-full transition-colors ${bgAlerts ? 'bg-brand-600' : 'bg-dark-500'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow mx-0.5 transition-transform ${bgAlerts ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shuffle size={16} className={reactionMode ? 'text-brand-400' : 'text-gray-400'} />
              <div>
                <span className="text-sm font-medium text-white">Reaction Training</span>
                <p className="text-xs text-gray-400">Technique prompts during rest</p>
              </div>
            </div>
            <button
              onClick={() => setReactionMode(!reactionMode)}
              role="switch"
              aria-checked={reactionMode}
              aria-label="Reaction training"
              className={`w-11 h-6 rounded-full transition-colors ${reactionMode ? 'bg-brand-600' : 'bg-dark-500'}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow mx-0.5 transition-transform ${reactionMode ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

        </div>
      </div>

      {showPresetModal && (
        <PresetModal onSave={savePreset} onClose={() => setShowPresetModal(false)} />
      )}
    </div>
  );
}
