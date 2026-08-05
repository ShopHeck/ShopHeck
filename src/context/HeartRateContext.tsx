import React, { createContext, useContext } from 'react';
import { useApp } from './AppContext';
import { useBluetoothHR, type HRState } from '../hooks/useBluetoothHR';
import { deriveMaxHR } from '../utils/maxHR';

/**
 * One Bluetooth heart-rate connection for the whole app.
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
export type HeartRate = HRState & {
  connect: () => Promise<void>;
  disconnect: () => void;
  /** The max HR every zone in this state was computed against. */
  maxHR: number;
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
};

const HeartRateContext = createContext<HeartRate>(fallback);

export function HeartRateProvider({ children }: { children: React.ReactNode }) {
  const { state } = useApp();
  const maxHR = deriveMaxHR(state.currentUser);
  const hr = useBluetoothHR(maxHR);

  // Deliberately not memoized. `hr` carries a new `hr`/`zone`/`hrv` on every
  // notification — roughly once a second while a strap is connected — so a memo
  // would recompute on essentially every render it saw and buy nothing. The
  // cost is bounded because only components that call `useHeartRate()` re-render
  // on a tick: `children` is a prop, so the app tree below is referentially
  // stable across this provider's own state updates.
  return (
    <HeartRateContext.Provider value={{ ...hr, maxHR }}>
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
