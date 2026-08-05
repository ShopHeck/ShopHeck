import React, { createContext, useContext } from 'react';
import { useApp } from './AppContext';
import { useBluetoothHR, type HRState } from '../hooks/useBluetoothHR';
import { useWatchHeartRate } from '../hooks/useWatchHeartRate';
import { deriveMaxHR } from '../utils/maxHR';

/**
 * One heart-rate reading for the whole app, from whichever sensor is live.
 *
 * Two sources feed this: a Bluetooth chest strap and an Apple Watch on the
 * fighter's wrist. Every consumer sees one merged reading and never has to know
 * which, which is what let the watch be added without touching the timer, the
 * tracker hub or Settings.
 *
 * `useBluetoothHR` was called independently in `RoundTimer`, `Settings` and
 * `FitnessTrackerHub`, each with its own `useState`. Three separate hook
 * instances meant three separate connection attempts and three separate
 * opinions about whether a strap was connected: pairing in Settings and then
 * walking to the timer showed "not connected", and the timer's own connect
 * would open a second GATT session to the same device.
 *
 * Worse, the hook disconnects its device in an unmount cleanup — so on the old
 * arrangement, merely navigating away from the screen that owned the connection
 * dropped the strap mid-session. Hoisting the single instance to a provider
 * mounted for the app's lifetime is what actually fixes that: the connection now
 * outlives navigation because nothing unmounts it until the app closes.
 *
 * `maxHR` is derived here rather than passed in, which is what lets one instance
 * serve every screen — the three call sites previously passed three differently
 * derived values (see `utils/maxHR.ts`).
 */
/** Where the live reading is coming from. */
export type HeartRateSource = 'none' | 'strap' | 'watch';

export type HeartRate = HRState & {
  connect: () => Promise<void>;
  disconnect: () => void;
  /** The max HR every zone in this state was computed against. */
  maxHR: number;
  /** Which sensor produced the current reading. */
  source: HeartRateSource;
  /** True when an Apple Watch could supply heart rate but is not right now. */
  watchAvailable: boolean;
};

const fallback: HeartRate = {
  hr: null,
  zone: 0,
  hrv: null,
  connected: false,
  connecting: false,
  supported: false,
  deviceName: null,
  connectError: null,
  connect: async () => {},
  disconnect: () => {},
  maxHR: 195,
  source: 'none',
  watchAvailable: false,
};

const HeartRateContext = createContext<HeartRate>(fallback);

export function HeartRateProvider({ children }: { children: React.ReactNode }) {
  const { state } = useApp();
  const maxHR = deriveMaxHR(state.currentUser);
  const strap = useBluetoothHR(maxHR);
  const watch = useWatchHeartRate(maxHR);

  // The strap wins when both are live, and that is a real judgement rather than
  // an arbitrary tie-break: a chest strap reads the electrical signal directly,
  // while a wrist optical sensor is well known to lag and drop out under the
  // repeated impact and grip tension of striking — exactly this app's use case.
  // A fighter who bothered to put a strap on gets the strap's numbers.
  const useWatch = !strap.connected && watch.streaming;

  const merged: HeartRate = useWatch
    ? {
        ...strap,
        hr: watch.bpm,
        zone: watch.zone,
        // HRV stays null: RMSSD needs beat-to-beat RR intervals, and the watch
        // bridge carries averaged BPM only. Reporting the strap's stale HRV
        // beside a watch heart rate would attribute one sensor's data to
        // another.
        hrv: null,
        connected: true,
        deviceName: 'Apple Watch',
        source: 'watch',
        maxHR,
        watchAvailable: watch.availability.appInstalled,
      }
    : {
        ...strap,
        source: strap.connected ? 'strap' : 'none',
        maxHR,
        watchAvailable: watch.availability.appInstalled,
      };

  // Deliberately not memoized. The value carries a new `hr`/`zone`/`hrv` on
  // every notification — roughly once a second while a sensor is live — so a
  // memo would recompute on essentially every render it saw and buy nothing.
  // The cost is bounded because only components that call `useHeartRate()`
  // re-render on a tick: `children` is a prop, so the app tree below is
  // referentially stable across this provider's own state updates.
  return (
    <HeartRateContext.Provider value={merged}>
      {children}
    </HeartRateContext.Provider>
  );
}

/**
 * The app's single heart-rate connection.
 *
 * Re-renders the caller about once a second while a strap is streaming, so call
 * it from the component that renders the reading rather than from a shell above
 * it.
 */
export function useHeartRate(): HeartRate {
  return useContext(HeartRateContext);
}
