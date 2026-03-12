import { useState, useEffect, useCallback } from 'react';
import {
  Play, Pause, RotateCcw, ChevronUp, ChevronDown,
  Volume2, VolumeX, Smartphone, Shuffle, Maximize2, Minimize2,
  Plus, X
} from 'lucide-react';
import { useRoundTimer, PRESETS, fmt } from '../hooks/useRoundTimer';
import { loadCustomPresets, saveCustomPresets, generateId } from '../utils/storage';
import { useApp } from '../context/AppContext';
import type { CustomTimerPreset } from '../types';
import ProGate from './shared/ProGate';
import GymDisplay from './GymDisplay';
import ReactionPrompt from './ReactionPrompt';

// ─── Custom Preset Modal ───────────────────────────────────────────────────

interface PresetModalProps {
  onSave: (p: Omit<CustomTimerPreset, 'id' | 'createdAt'>) => void;
  onClose: () => void;
}

function PresetModal({ onSave, onClose }: PresetModalProps) {
  const [label,    setLabel]    = useState('');
  const [rounds,   setRounds]   = useState(3);
  const [workSec,  setWorkSec]  = useState(180);
  const [restSec,  setRestSec]  = useState(60);

  const adj = (setter: React.Dispatch<React.SetStateAction<number>>, d: number, min: number, max: number) =>
    setter(v => Math.max(min, Math.min(max, v + d)));

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center p-4" onClick={onClose}>
      <div className="bg-dark-800 rounded-2xl border border-dark-500 p-5 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">New Preset</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1"><X size={18} /></button>
        </div>

        <div>
          <label className="label">Name</label>
          <input
            className="input"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. Thai Clinch"
            maxLength={20}
          />
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
                className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white">
                <ChevronDown size={16} />
              </button>
              <span className="text-sm font-bold text-white w-10 text-center">
                {row.label === 'Rounds' ? row.value : fmt(row.value)}
              </span>
              <button onClick={() => adj(row.setter, row.step, row.min, row.max)}
                className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white">
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
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function RoundTimer() {
  const { state, dispatch } = useApp();
  const timer = useRoundTimer();
  const {
    selectedPreset, rounds, workSec, restSec, prepSec, warningSec,
    voiceEnabled, hapticEnabled, reactionMode,
    phase, currentRound, timeLeft, isRunning,
    handleStartPause, reset, selectPreset,
    setRounds, setWorkSec, setRestSec, setPrepSec, setWarningSec,
    setVoiceEnabled, setHapticEnabled, setReactionMode,
  } = timer;

  // Simple absolute-value adjuster for settings rows
  const adj = (setter: (v: number) => void, current: number, delta: number, min: number, max: number) => {
    setter(Math.max(min, Math.min(max, current + delta)));
  };

  const [customPresets, setCustomPresets] = useState<CustomTimerPreset[]>([]);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Load custom presets on mount
  useEffect(() => { setCustomPresets(loadCustomPresets()); }, []);

  // Sync fullscreen state
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Log workout when session completes
  useEffect(() => {
    if (phase !== 'done') return;
    if (!state.activeCamp) return;
    const camp = state.activeCamp;
    const preset = selectedPreset < PRESETS.length
      ? PRESETS[selectedPreset].label
      : customPresets[selectedPreset - PRESETS.length]?.label ?? 'Custom';
    const totalSec = rounds * (workSec + restSec);
    dispatch({
      type: 'LOG_WORKOUT',
      payload: {
        campId: camp.id,
        date: new Date().toISOString().slice(0, 10),
        weekNumber: 1,
        dayLabel: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        sessionType: 'conditioning',
        title: `Round Timer — ${preset} ${rounds}×${fmt(workSec)}`,
        duration: Math.round(totalSec / 60),
        rpe: 7,
        notes: `${rounds} rounds, ${fmt(workSec)} work / ${fmt(restSec)} rest`,
        completed: true,
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }, []);

  const isPro = state.subscription && (state.subscription.tier !== 'free');
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
        onStartPause={handleStartPause}
        onReset={reset}
        onExitFullscreen={toggleFullscreen}
      />
    );
  }

  // ── Derived UI ────────────────────────────────────────────────────────────
  const ringColor =
    phase === 'rest' ? 'text-blue-400' :
    phase === 'done' ? 'text-green-400' :
    phase === 'prep' ? 'text-yellow-400' :
    phase === 'work' ? 'text-brand-500' :
    'text-gray-500';

  const ringBg =
    phase === 'rest' ? 'border-blue-500/50' :
    phase === 'done' ? 'border-green-500/50' :
    phase === 'prep' ? 'border-yellow-500/50' :
    phase === 'work' ? 'border-brand-500/50' :
    'border-dark-400';

  const phaseLabel =
    phase === 'idle' ? 'Ready'     :
    phase === 'prep' ? 'GET READY' :
    phase === 'work' ? 'WORK'      :
    phase === 'rest' ? 'REST'      : 'DONE';

  const phaseBg =
    phase === 'rest' ? 'bg-blue-900/40 text-blue-300'     :
    phase === 'done' ? 'bg-green-900/40 text-green-300'   :
    phase === 'prep' ? 'bg-yellow-900/40 text-yellow-300' :
    phase === 'work' ? 'bg-brand-900/40 text-brand-300'   :
    'bg-dark-600 text-gray-400';

  return (
    <div className="pb-4">
      {/* Presets */}
      <div className="mx-4 mt-4 flex gap-2 overflow-x-auto no-scrollbar pb-1 items-center">
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
        {customPresets.map((p, i) => (
          <div key={p.id} className="flex-shrink-0 relative group">
            <button
              onClick={() => {
                const idx = PRESETS.length + i;
                const preset = customPresets[i];
                setRounds(preset.rounds);
                setWorkSec(preset.workSec);
                setRestSec(preset.restSec);
                selectPreset(idx);
              }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                selectedPreset === PRESETS.length + i
                  ? 'bg-purple-600 border-purple-500 text-white'
                  : 'bg-dark-700 border-dark-500 text-gray-400 hover:border-dark-300'
              }`}
            >
              {p.label}
            </button>
            <button
              onClick={() => deleteCustomPreset(p.id)}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-dark-500 border border-dark-400 text-gray-400 hover:text-white hidden group-hover:flex items-center justify-center"
            >
              <X size={9} />
            </button>
          </div>
        ))}
        {/* Add custom preset button */}
        {customPresets.length < FREE_PRESET_LIMIT || isPro ? (
          <button
            onClick={() => setShowPresetModal(true)}
            className="flex-shrink-0 w-9 h-9 rounded-xl bg-dark-700 border border-dark-500 border-dashed text-gray-500 hover:text-white hover:border-dark-300 flex items-center justify-center transition-all"
          >
            <Plus size={16} />
          </button>
        ) : (
          <ProGate required="fighter_pro" inline={false}>
            <button className="flex-shrink-0 w-9 h-9 rounded-xl bg-dark-700 border border-dashed border-dark-500 text-gray-500 flex items-center justify-center">
              <Plus size={16} />
            </button>
          </ProGate>
        )}
      </div>

      {/* Main Timer Display */}
      <div className="mx-4 mt-6 flex flex-col items-center">
        {/* Large round number */}
        {phase !== 'idle' && phase !== 'done' && (
          <div className="text-center mb-3">
            <p className="text-[10px] font-semibold tracking-[0.2em] text-gray-600 uppercase">
              {phase === 'prep' ? 'Get Ready' : 'Round'}
            </p>
            <p className="text-6xl font-black text-white leading-none">
              {phase === 'prep' ? '!' : currentRound}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">of {rounds}</p>
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

        {/* Timer ring */}
        <div className={`w-52 h-52 rounded-full border-4 ${ringBg} flex items-center justify-center bg-dark-800 transition-colors duration-500`}>
          <span className={`text-6xl font-black tabular-nums tracking-tight ${ringColor} transition-colors duration-300`}>
            {phase === 'done' ? '✓' : fmt(timeLeft)}
          </span>
        </div>

        {/* Phase badge when running */}
        {(phase === 'work' || phase === 'rest' || phase === 'prep') && (
          <span className={`badge text-sm font-bold px-3 py-1 mt-3 ${phaseBg}`}>{phaseLabel}</span>
        )}

        {/* Reaction prompt — below badge during rest */}
        {reactionMode && phase === 'rest' && (
          <div className="mt-2 text-center">
            <ReactionPrompt sport={state.currentUser?.sport} active={phase === 'rest'} isPro={!!isPro} />
          </div>
        )}

        {/* Round dots */}
        {phase !== 'idle' && phase !== 'done' && phase !== 'prep' && (
          <div className="flex gap-2 mt-3">
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
      <div className="mx-4 mt-6 flex gap-3 justify-center items-center">
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
        {/* Fullscreen button */}
        <ProGate required="fighter_pro" inline>
          <button
            onClick={toggleFullscreen}
            className="w-14 h-14 rounded-full bg-dark-700 border border-dark-500 flex items-center justify-center text-gray-400 hover:text-white hover:border-dark-300 transition-all active:scale-95"
          >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
        </ProGate>
      </div>

      {/* Settings */}
      <div className="mx-4 mt-6 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Timer Settings</p>

        {/* Rounds */}
        <div className="card flex items-center justify-between">
          <span className="text-sm font-medium text-white">Rounds</span>
          <div className="flex items-center gap-3">
            <button onClick={() => adj(setRounds, rounds, -1, 1, 30)} disabled={isRunning}
              className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all">
              <ChevronDown size={16} />
            </button>
            <span className="text-lg font-bold text-white w-8 text-center">{rounds}</span>
            <button onClick={() => adj(setRounds, rounds, 1, 1, 30)} disabled={isRunning}
              className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all">
              <ChevronUp size={16} />
            </button>
          </div>
        </div>

        {/* Work Time */}
        <div className="card flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-white">Work Time</span>
            <p className="text-xs text-gray-500">{fmt(workSec)} per round</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => adj(setWorkSec, workSec, -15, 15, 1800)} disabled={isRunning}
              className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all">
              <ChevronDown size={16} />
            </button>
            <span className="text-lg font-bold text-brand-400 w-12 text-center">{fmt(workSec)}</span>
            <button onClick={() => adj(setWorkSec, workSec, 15, 15, 1800)} disabled={isRunning}
              className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all">
              <ChevronUp size={16} />
            </button>
          </div>
        </div>

        {/* Rest Time */}
        <div className="card flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-white">Rest Time</span>
            <p className="text-xs text-gray-500">{fmt(restSec)} between rounds</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => adj(setRestSec, restSec, -5, 5, 600)} disabled={isRunning}
              className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all">
              <ChevronDown size={16} />
            </button>
            <span className="text-lg font-bold text-blue-400 w-12 text-center">{fmt(restSec)}</span>
            <button onClick={() => adj(setRestSec, restSec, 5, 5, 600)} disabled={isRunning}
              className="w-8 h-8 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all">
              <ChevronUp size={16} />
            </button>
          </div>
        </div>

        {/* Get Ready Countdown */}
        <div className="card flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-white">Get Ready</span>
            <p className="text-xs text-gray-500">Countdown before round 1</p>
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

        {/* Warning Time */}
        <div className="card flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-white">Warning Bell</span>
            <p className="text-xs text-gray-500">Clapper before round ends</p>
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end">
            {[5, 10].map(v => (
              <button
                key={v}
                onClick={() => setWarningSec(v)}
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
                  onClick={() => setWarningSec(v)}
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
              {voiceEnabled ? <Volume2 size={16} className="text-brand-400" /> : <VolumeX size={16} className="text-gray-500" />}
              <div>
                <span className="text-sm font-medium text-white">Voice Announcements</span>
                <p className="text-xs text-gray-500">Round & rest callouts</p>
              </div>
            </div>
            <button
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              className={`w-11 h-6 rounded-full transition-colors ${voiceEnabled ? 'bg-brand-600' : 'bg-dark-500'}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow mx-0.5 transition-transform ${voiceEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone size={16} className={hapticEnabled ? 'text-brand-400' : 'text-gray-500'} />
              <div>
                <span className="text-sm font-medium text-white">Vibration</span>
                <p className="text-xs text-gray-500">Haptic feedback on transitions</p>
              </div>
            </div>
            <button
              onClick={() => setHapticEnabled(!hapticEnabled)}
              className={`w-11 h-6 rounded-full transition-colors ${hapticEnabled ? 'bg-brand-600' : 'bg-dark-500'}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow mx-0.5 transition-transform ${hapticEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shuffle size={16} className={reactionMode ? 'text-brand-400' : 'text-gray-500'} />
              <div>
                <span className="text-sm font-medium text-white">Reaction Training</span>
                <p className="text-xs text-gray-500">Technique prompts during rest</p>
              </div>
            </div>
            <button
              onClick={() => setReactionMode(!reactionMode)}
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
