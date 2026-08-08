import { registerPlugin } from '@capacitor/core';
import type { TimerBoundaryAlert } from '../utils/timerTimeline';

export interface TimerBellSchedulerPlugin {
  replace(options: {
    sessionId: string;
    revision: number;
    events: TimerBoundaryAlert[];
  }): Promise<{ scheduled: number }>;
  cancel(options: { sessionId: string }): Promise<void>;
}

export const TimerBellScheduler = registerPlugin<TimerBellSchedulerPlugin>('TimerBellScheduler', {
  web: () => Promise.resolve({
    replace: async () => ({ scheduled: 0 }),
    cancel: async () => undefined,
  }),
});
