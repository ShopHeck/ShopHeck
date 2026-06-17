import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';

const PREF_KEY = 'fightcamp_reminders';

// Stable IDs so a reschedule replaces the previous notification instead of
// stacking duplicates.
const ID_CHECKIN = 1001;
const ID_WEIGHIN = 1002;
const ALL_IDS = [{ id: ID_CHECKIN }, { id: ID_WEIGHIN }];

export function notificationsSupported(): boolean {
  return Capacitor.isNativePlatform();
}

export function remindersEnabled(): boolean {
  return localStorage.getItem(PREF_KEY) === 'on';
}

export function setRemindersEnabled(on: boolean): void {
  localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
}

/** Asks the OS for permission. Returns true when granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  try {
    const res = await LocalNotifications.requestPermissions();
    return res.display === 'granted';
  } catch {
    return false;
  }
}

interface SyncOpts {
  /** Schedule the morning weigh-in reminder (active fight-camp cut only). */
  weighIn: boolean;
}

/**
 * Reconcile scheduled reminders with the current preference + camp state.
 * Idempotent: cancels our notifications first, then reschedules if enabled.
 * Daily repeating local notifications — no backend required.
 */
export async function syncReminders({ weighIn }: SyncOpts): Promise<void> {
  if (!notificationsSupported()) return;
  try {
    await LocalNotifications.cancel({ notifications: ALL_IDS });
    if (!remindersEnabled()) return;

    const notifications: LocalNotificationSchema[] = [
      {
        id: ID_CHECKIN,
        title: 'Keep your streak alive 🔥',
        body: "Log today's training before the day is done.",
        schedule: { on: { hour: 19, minute: 0 }, allowWhileIdle: true },
      },
    ];
    if (weighIn) {
      notifications.push({
        id: ID_WEIGHIN,
        title: 'Morning weigh-in ⚖️',
        body: 'Log your weight to stay on pace for your cut.',
        schedule: { on: { hour: 8, minute: 0 }, allowWhileIdle: true },
      });
    }
    await LocalNotifications.schedule({ notifications });
  } catch {
    /* notifications are best-effort; never block the app */
  }
}

/** Turn reminders off and clear anything scheduled. */
export async function disableReminders(): Promise<void> {
  setRemindersEnabled(false);
  if (!notificationsSupported()) return;
  try {
    await LocalNotifications.cancel({ notifications: ALL_IDS });
  } catch {
    /* noop */
  }
}
