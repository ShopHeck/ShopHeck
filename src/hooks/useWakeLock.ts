import { useEffect, useRef } from 'react';

export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;

    navigator.wakeLock.request('screen')
      .then(s => { sentinelRef.current = s; })
      .catch(() => {});

    const reacquire = () => {
      if (document.visibilityState === 'visible' && active) {
        navigator.wakeLock.request('screen')
          .then(s => { sentinelRef.current = s; })
          .catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', reacquire);
    return () => {
      document.removeEventListener('visibilitychange', reacquire);
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
    };
  }, [active]);
}
