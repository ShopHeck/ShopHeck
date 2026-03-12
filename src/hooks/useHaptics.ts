import { useCallback } from 'react';

export function useHaptics(enabled: boolean) {
  return useCallback((pattern: number | readonly number[]) => {
    if (enabled && 'vibrate' in navigator) {
      navigator.vibrate(pattern as number | number[]);
    }
  }, [enabled]);
}

export const HAPTIC = {
  roundStart:      [100, 50, 100],
  roundEnd:        [200, 100, 200, 100, 200],
  warning:         [50, 30, 50],
  sessionComplete: [300, 100, 300, 100, 300],
  tick:            [30],
} as const;
