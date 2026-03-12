import { useCallback, useRef } from 'react';

export function useVoiceAnnouncements(enabled: boolean) {
  const unlockedRef = useRef(false);

  // Call this from the user's tap handler to unlock speechSynthesis on iOS
  const unlock = useCallback(() => {
    if (unlockedRef.current || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    window.speechSynthesis.speak(u);
    unlockedRef.current = true;
  }, []);

  const speak = useCallback((text: string) => {
    if (!enabled || !('speechSynthesis' in window)) return;
    // Cancel any pending utterances to avoid backlog
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.pitch = 1.0;
    u.volume = 1.0;
    window.speechSynthesis.speak(u);
  }, [enabled]);

  return { speak, unlock };
}
