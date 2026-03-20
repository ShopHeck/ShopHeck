import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const isNative = Capacitor.isNativePlatform();

export const HAPTIC = {
  roundStart:      [100, 50, 100],
  roundEnd:        [200, 100, 200, 100, 200],
  warning:         [50, 30, 50],
  sessionComplete: [300, 100, 300, 100, 300],
  tick:            [30],
} as const;

type HapticKey = keyof typeof HAPTIC;

// Maps each haptic event to the best native iOS equivalent
const NATIVE_MAP: Record<HapticKey, () => Promise<void>> = {
  roundStart:      () => Haptics.impact({ style: ImpactStyle.Heavy }),
  roundEnd:        () => Haptics.notification({ type: NotificationType.Success }),
  warning:         () => Haptics.impact({ style: ImpactStyle.Light }),
  sessionComplete: () => Haptics.notification({ type: NotificationType.Success }),
  tick:            () => Haptics.impact({ style: ImpactStyle.Light }),
};

export function useHaptics(enabled: boolean) {
  return useCallback((pattern: number | readonly number[]) => {
    if (!enabled) return;

    if (isNative) {
      // Identify which pattern key was passed and use the native equivalent.
      // Fall back to a medium impact for any unrecognised pattern.
      const key = (Object.keys(HAPTIC) as HapticKey[]).find(k => HAPTIC[k] === pattern);
      const nativeFn = key ? NATIVE_MAP[key] : () => Haptics.impact({ style: ImpactStyle.Medium });
      nativeFn().catch(() => {});
    } else if ('vibrate' in navigator) {
      navigator.vibrate(pattern as number | number[]);
    }
  }, [enabled]);
}
