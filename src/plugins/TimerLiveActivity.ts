import { registerPlugin } from '@capacitor/core';

export interface TimerLiveActivitySegment {
  /** "prep" | "work" | "rest" */
  kind: string;
  /** Round number this segment belongs to (1-based). */
  round: number;
  /** Epoch milliseconds. */
  startMs: number;
  endMs: number;
}

export interface TimerLiveActivityState {
  segments: TimerLiveActivitySegment[];
  round: number;
  rounds: number;
  presetLabel: string;
  isPaused: boolean;
  pausedRemainingSec: number;
  workColorHex: string;
  restColorHex: string;
}

export interface TimerLiveActivityPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  start(options: TimerLiveActivityState & { sessionId: string }): Promise<{ started: boolean }>;
  update(options: TimerLiveActivityState): Promise<{ updated: boolean }>;
  end(): Promise<{ ended: boolean }>;
}

export const TimerLiveActivity = registerPlugin<TimerLiveActivityPlugin>('TimerLiveActivity', {
  web: {
    isSupported: async () => ({ supported: false }),
    start: async () => ({ started: false }),
    update: async () => ({ updated: false }),
    end: async () => ({ ended: true }),
  },
});
