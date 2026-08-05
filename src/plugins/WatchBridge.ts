import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface WatchAvailability {
  /** WatchConnectivity exists on this device (iOS, not web/Android). */
  supported: boolean;
  /** An Apple Watch is paired. */
  paired: boolean;
  /**
   * The Fight Camp watch app is installed on it.
   *
   * Distinguished from `paired` on purpose: a fighter who owns a watch but has
   * not installed the app needs "install it from the Watch app", while one with
   * no watch needs nothing at all. Collapsing the two produces a prompt that is
   * wrong for whichever group it is not written for.
   */
  appInstalled: boolean;
}

export interface WatchSessionOptions {
  rounds: number;
  workSec: number;
  restSec: number;
  prepSec: number;
  label: string;
}

export interface WatchHeartRateEvent {
  bpm: number;
  /** Seconds since the epoch, from the watch's own sample. */
  timestamp: number;
}

export interface WatchCommandEvent {
  command: 'start' | 'pause' | 'reset';
}

export interface WatchBridgePlugin {
  isSupported(): Promise<WatchAvailability>;
  /** Mirror a round session onto the wrist. */
  startSession(options: WatchSessionOptions): Promise<void>;
  endSession(): Promise<void>;
  addListener(
    eventName: 'heartRate',
    listener: (event: WatchHeartRateEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'watchCommand',
    listener: (event: WatchCommandEvent) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

/**
 * The Apple Watch companion bridge.
 *
 * The web fallback reports "not supported" rather than throwing, so every
 * caller can be written once and run unchanged in the browser — the same shape
 * as `TimerLiveActivity`. `addListener` returns a real no-op handle because
 * callers store it and call `remove()` on unmount; returning undefined would
 * make every one of those a crash on web.
 */
export const WatchBridge = registerPlugin<WatchBridgePlugin>('WatchBridge', {
  web: {
    isSupported: async () => ({ supported: false, paired: false, appInstalled: false }),
    startSession: async () => {},
    endSession: async () => {},
    addListener: async () => ({ remove: async () => {} }),
    removeAllListeners: async () => {},
  },
});
