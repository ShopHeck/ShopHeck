import { useCallback, useRef } from 'react';
import { getFishAudioKey } from '../utils/fishAudioKey';

export type CoachVoiceStyle = 'off' | 'standard' | 'goggins';

// Fish Audio model ID for the Goggins voice
const GOGGINS_MODEL_ID = 'ff5468d06c2443dba9b8d2f9c6aa26b0';
const FISH_AUDIO_API   = 'https://api.fish.audio/v1/tts';

// ─── Web Speech fallback helpers ─────────────────────────────────────────────

/**
 * Selects the deepest available male voice for the standard coaching fallback.
 */
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
      reference_id: GOGGINS_MODEL_ID,
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

export function useCoachingVoice(style: CoachVoiceStyle) {
  const unlockedRef  = useRef(false);
  const audioCtxRef  = useRef<AudioContext | null>(null);
  // Track in-flight requests so we don't stack them
  const pendingRef   = useRef(false);

  /** Call from a user-gesture handler to unlock Web Speech on iOS. */
  const unlock = useCallback(() => {
    if (unlockedRef.current || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    window.speechSynthesis.speak(u);
    unlockedRef.current = true;
  }, []);

  const getAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const speakCoach = useCallback(async (text: string) => {
    if (style === 'off') return;

    if (style === 'goggins') {
      const apiKey = getFishAudioKey();

      if (apiKey) {
        // ── Fish Audio path ──────────────────────────────────────────────────
        if (pendingRef.current) return; // one cue at a time
        pendingRef.current = true;
        try {
          const buffer = await fetchFishAudio(text, apiKey);
          const ctx    = getAudioCtx();
          const decoded = await ctx.decodeAudioData(buffer);
          const src     = ctx.createBufferSource();
          src.buffer    = decoded;
          src.connect(ctx.destination);
          src.start(0);
        } catch (err) {
          // Fallback to Web Speech if API call fails (network error, bad key, etc.)
          console.warn('[CoachingVoice] Fish Audio failed, using Web Speech fallback:', err);
          speakWebSpeech(text, 'goggins');
        } finally {
          pendingRef.current = false;
        }
        return;
      }

      // No key set → Web Speech with low-pitch approximation
      speakWebSpeech(text, 'goggins');
      return;
    }

    // Standard voice
    speakWebSpeech(text, 'standard');
  }, [style, getAudioCtx]);

  return { speakCoach, unlock };
}
