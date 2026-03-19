import { useCallback, useEffect, useRef, useState } from 'react';
import { getFishAudioKey, getFishModelId } from '../utils/fishAudioKey';

export type CoachVoiceStyle = 'off' | 'standard' | 'goggins';

// Built-in Goggins model — used when the user hasn't cloned a custom voice
const DEFAULT_MODEL_ID = 'ff5468d06c2443dba9b8d2f9c6aa26b0';
const FISH_AUDIO_API   = 'https://api.fish.audio/v1/tts';

/** Returns the active model ID: user-cloned voice if set, otherwise built-in Goggins */
function getActiveModelId(): string {
  return getFishModelId() || DEFAULT_MODEL_ID;
}

// ─── Web Speech fallback helpers ─────────────────────────────────────────────

function pickDeepVoice(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const PREFERRED = ['alex', 'daniel', 'tom', 'google us english', 'google uk english male', 'fred'];
  for (const name of PREFERRED) {
    const v = voices.find(v => v.name.toLowerCase().includes(name));
    if (v) return v;
  }
  return voices.find(v =>
    v.lang.startsWith('en') &&
    !['samantha', 'karen', 'victoria', 'moira', 'tessa', 'female'].some(n =>
      v.name.toLowerCase().includes(n),
    ),
  ) ?? null;
}

function speakWebSpeech(text: string, style: 'standard' | 'goggins') {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (style === 'goggins') {
    u.pitch  = 0.65;
    u.rate   = 0.88;
    u.volume = 1.0;
    const voice = pickDeepVoice();
    if (voice) u.voice = voice;
  } else {
    u.pitch  = 1.0;
    u.rate   = 1.0;
    u.volume = 1.0;
  }
  window.speechSynthesis.speak(u);
}

// ─── Fish Audio API ───────────────────────────────────────────────────────────

async function fetchFishAudio(text: string, apiKey: string): Promise<ArrayBuffer> {
  const res = await fetch(FISH_AUDIO_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      text,
      reference_id: getActiveModelId(),
      format:        'mp3',
      latency:       'normal',
    }),
  });

  if (!res.ok) {
    throw new Error(`Fish Audio API error ${res.status}: ${await res.text()}`);
  }
  return res.arrayBuffer();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCoachingVoice(style: CoachVoiceStyle, isRunning = false) {
  const audioCtxRef   = useRef<AudioContext | null>(null);
  const keepAliveRef  = useRef<OscillatorNode | null>(null);
  // Track in-flight requests so we don't stack them
  const pendingRef    = useRef(false);
  // Whether Fish Audio is the active path (has a valid key and hasn't permanently failed)
  const [fishAudioActive, setFishAudioActive] = useState(false);

  // Eagerly create the AudioContext inside a user-gesture context
  const getAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  /**
   * Call from a user-gesture handler to unlock both Web Speech and AudioContext on iOS.
   * Must be called synchronously inside a click/touch handler.
   */
  const unlock = useCallback(() => {
    // Unlock Web Speech
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
    // Create and resume AudioContext inside the user gesture
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    // Update Fish Audio active state based on key presence
    setFishAudioActive(!!getFishAudioKey());
  }, [getAudioCtx]);

  // Keepalive oscillator — prevents iOS from suspending the AudioContext between rounds
  useEffect(() => {
    if (!isRunning || style === 'off') {
      if (keepAliveRef.current) {
        try { keepAliveRef.current.stop(); keepAliveRef.current.disconnect(); } catch { /* noop */ }
        keepAliveRef.current = null;
      }
      return;
    }
    // Only start keepalive if AudioContext exists (was unlocked on Start tap)
    if (!audioCtxRef.current) return;

    const ctx  = audioCtxRef.current;
    if (ctx.state === 'suspended') void ctx.resume();

    const osc  = ctx.createOscillator();
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
  }, [isRunning, style]);

  const speakCoach = useCallback(async (text: string) => {
    if (style === 'off') return;

    if (style === 'goggins') {
      const apiKey = getFishAudioKey();

      if (apiKey) {
        // ── Fish Audio path ──────────────────────────────────────────────────
        if (pendingRef.current) return; // one cue at a time
        pendingRef.current = true;
        try {
          const buffer  = await fetchFishAudio(text, apiKey);
          const ctx     = getAudioCtx();
          // Ensure context is running before decode (safety net for iOS)
          if (ctx.state === 'suspended') await ctx.resume();
          const decoded = await ctx.decodeAudioData(buffer);
          const src     = ctx.createBufferSource();
          src.buffer    = decoded;
          src.connect(ctx.destination);
          src.start(0);
          setFishAudioActive(true);
        } catch (err) {
          // Fallback to Web Speech if API call fails (network error, bad key, etc.)
          console.warn('[CoachingVoice] Fish Audio failed, using Web Speech fallback:', err);
          setFishAudioActive(false);
          speakWebSpeech(text, 'goggins');
        } finally {
          pendingRef.current = false;
        }
        return;
      }

      // No key set → Web Speech with low-pitch approximation
      setFishAudioActive(false);
      speakWebSpeech(text, 'goggins');
      return;
    }

    // Standard voice
    speakWebSpeech(text, 'standard');
  }, [style, getAudioCtx]);

  return { speakCoach, unlock, fishAudioActive };
}
