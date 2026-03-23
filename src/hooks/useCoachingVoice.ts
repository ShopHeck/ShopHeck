import { useCallback, useEffect, useRef, useState } from 'react';
import { getFishAudioKey, getFishModelId } from '../utils/fishAudioKey';

export type CoachVoiceStyle = 'off' | 'standard' | 'goggins';

// Built-in Goggins model — used when the user hasn't cloned a custom voice
const DEFAULT_MODEL_ID = 'ff5468d06c2443dba9b8d2f9c6aa26b0';
const FISH_AUDIO_API   = 'https://api.fish.audio/v1/tts';

// 44-byte minimal silent WAV — played during the Start tap to unlock HTMLAudioElement
// on iOS (audio elements must be triggered inside a user gesture before async .play() works)
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

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

export function useCoachingVoice(style: CoachVoiceStyle) {
  // Track in-flight requests so we don't stack them
  const pendingRef     = useRef(false);
  // Ref to unlocked audio element — required for iOS async .play()
  const unlockedAudio  = useRef<HTMLAudioElement | null>(null);

  const [fishAudioActive, setFishAudioActive] = useState(false);
  // Non-null once we've had at least one Fish Audio failure, so we can surface it in UI
  const [fishAudioError, setFishAudioError] = useState<string | null>(null);

  /**
   * Call from a user-gesture handler (the Start tap) to unlock audio on iOS.
   * Must be called synchronously inside a click/touch handler.
   */
  const unlock = useCallback(() => {
    // Unlock Web Speech
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
    // Unlock HTMLAudioElement: play a silent data-URL clip during the gesture.
    // After this, async .play() calls on NEW audio elements will be allowed on iOS.
    const a = new Audio(SILENT_WAV);
    a.play().catch(() => {});
    unlockedAudio.current = a;

    const hasKey = !!getFishAudioKey();
    setFishAudioActive(hasKey);
    if (hasKey) setFishAudioError(null);
  }, []);

  // Keep fishAudioActive in sync if the user edits the API key while in the settings screen
  useEffect(() => {
    setFishAudioActive(!!getFishAudioKey());
  }, []);

  const speakCoach = useCallback(async (text: string) => {
    if (style === 'off') return;

    if (style === 'goggins') {
      const apiKey = getFishAudioKey();

      if (apiKey) {
        if (pendingRef.current) return; // one cue at a time
        pendingRef.current = true;
        try {
          const buffer = await fetchFishAudio(text, apiKey);

          // Play via HTMLAudioElement — more reliable on iOS than Web Audio API
          // because it doesn't depend on a separate AudioContext being in the right state.
          const blob    = new Blob([buffer], { type: 'audio/mpeg' });
          const url     = URL.createObjectURL(blob);
          const audio   = new Audio(url);
          audio.onended = () => URL.revokeObjectURL(url);
          await audio.play();

          setFishAudioActive(true);
          setFishAudioError(null);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn('[CoachingVoice] Fish Audio failed, using Web Speech fallback:', msg);
          // Don't clear fishAudioActive — key is still set, just this request failed.
          // Surface the error so the UI can show a warning instead of staying "green".
          setFishAudioError(msg);
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
  }, [style]);

  return { speakCoach, unlock, fishAudioActive, fishAudioError };
}
