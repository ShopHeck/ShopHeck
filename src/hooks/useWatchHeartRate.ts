import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { WatchBridge, type WatchAvailability } from '../plugins/WatchBridge';
import { getZone, type HRZone } from './useBluetoothHR';

/**
 * Heart rate from an Apple Watch on the fighter's wrist.
 *
 * The app's heart-rate features — zones, MyZone points, the timer's HR ring —
 * previously all required a Bluetooth chest strap. Most fighters do not own
 * one; a lot of them own a watch. This is the same data through a different
 * pipe, so the whole HR half of the app lights up for them.
 */

export interface WatchHRState {
  bpm: number | null;
  zone: HRZone;
  /** True while samples are actually arriving. */
  streaming: boolean;
  availability: WatchAvailability;
}

/**
 * A sample older than this is treated as gone rather than current.
 *
 * The watch sends samples roughly once a second while its workout session runs,
 * and drops them silently when the phone is unreachable (see
 * WatchConnectivityClient). Without an expiry the last sample before the
 * fighter walked away would sit on screen as a live reading indefinitely.
 */
const SAMPLE_TTL_MS = 12_000;

const UNAVAILABLE: WatchAvailability = { supported: false, paired: false, appInstalled: false };

export function useWatchHeartRate(maxHR: number): WatchHRState {
  const [bpm, setBpm] = useState<number | null>(null);
  const [availability, setAvailability] = useState<WatchAvailability>(UNAVAILABLE);
  const lastSampleAt = useRef<number>(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let active = true;
    let handle: PluginListenerHandle | undefined;

    WatchBridge.isSupported()
      .then(a => { if (active) setAvailability(a); })
      .catch(() => { /* leave as unavailable */ });

    WatchBridge.addListener('heartRate', ({ bpm: next }) => {
      lastSampleAt.current = Date.now();
      setBpm(next);
    })
      .then(h => {
        handle = h;
        // Resolved after unmount — remove immediately rather than leaking a
        // listener that outlives the component and calls setState on it.
        if (!active) void h.remove();
      })
      .catch(() => {});

    // Expiry is polled rather than driven by a per-sample timeout: samples
    // arrive about once a second, and re-arming a timeout that often is a lot
    // of churn to detect an event that matters within a few seconds at worst.
    const sweep = setInterval(() => {
      if (lastSampleAt.current === 0) return;
      if (Date.now() - lastSampleAt.current > SAMPLE_TTL_MS) {
        lastSampleAt.current = 0;
        setBpm(null);
      }
    }, 4000);

    return () => {
      active = false;
      clearInterval(sweep);
      void handle?.remove();
    };
  }, []);

  return {
    bpm,
    // Recomputed from the CURRENT maxHR on every render rather than stored with
    // the sample, so editing max HR in Settings re-zones the live reading
    // immediately — the same property the Bluetooth path gets from its
    // handler ref.
    zone: bpm === null ? 0 : getZone(bpm, maxHR),
    streaming: bpm !== null,
    availability,
  };
}
