import { useCallback, useRef } from 'react';

export type CoachVoiceStyle = 'off' | 'standard' | 'goggins';

/**
 * Selects the best available deep male voice for Goggins mode.
 * Falls back gracefully if none found.
 *
 * Preferred voices (roughly ordered by how "Goggins-appropriate" they sound):
 *   - macOS/iOS: "Alex", "Daniel", "Tom"
 *   - Android/Chrome: "Google US English" (male variant), "Google UK English Male"
 *   - Generic: any en-US voice that doesn't flag itself as female
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
  // Fall back: any English voice that doesn't self-identify as female
  const enVoice = voices.find(v =>
    v.lang.startsWith('en') &&
    !v.name.toLowerCase().includes('female') &&
    !v.name.toLowerCase().includes('samantha') &&
    !v.name.toLowerCase().includes('karen') &&
    !v.name.toLowerCase().includes('victoria') &&
    !v.name.toLowerCase().includes('moira') &&
    !v.name.toLowerCase().includes('tessa'),
  );
  return enVoice ?? null;
}

export function useCoachingVoice(style: CoachVoiceStyle) {
  const unlockedRef = useRef(false);

  /** Must be called inside a user-gesture handler (e.g. the Start tap). */
  const unlock = useCallback(() => {
    if (unlockedRef.current || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    window.speechSynthesis.speak(u);
    unlockedRef.current = true;
  }, []);

  const speakCoach = useCallback((text: string) => {
    if (style === 'off' || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);

    if (style === 'goggins') {
      // Deep, deliberate, intense — as close to the Goggins timbre as Web TTS allows
      u.pitch  = 0.65;  // very deep
      u.rate   = 0.88;  // slower, punchy delivery
      u.volume = 1.0;

      // Voices load async; call getVoices() fresh every time so late-loading voices work
      const voice = pickDeepVoice();
      if (voice) u.voice = voice;
    } else {
      // Standard coaching voice — neutral, clear
      u.pitch  = 1.0;
      u.rate   = 1.0;
      u.volume = 1.0;
    }

    window.speechSynthesis.speak(u);
  }, [style]);

  return { speakCoach, unlock };
}
