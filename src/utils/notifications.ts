import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';

const PREF_KEY = 'fightcamp_reminders';
const ROUND_ALERTS_KEY = 'fightcamp_round_alerts';

// Stable IDs so a reschedule replaces the previous notification instead of
// stacking duplicates.
const ID_CHECKIN = 1001;
const ID_WEIGHIN = 1002;
const ALL_IDS = [{ id: ID_CHECKIN }, { id: ID_WEIGHIN }];

// Round alerts get their own block so cancelling them never disturbs the daily
// reminders above. 30 rounds is the timer's own maximum, and each round can
// contribute a start and an end.
const ROUND_ALERT_BASE = 2000;
const ROUND_ALERT_MAX = 64;
const ROUND_ALERT_IDS = Array.from(
  { length: ROUND_ALERT_MAX },
  (_, i) => ({ id: ROUND_ALERT_BASE + i }),
);

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

    // The pref can be "on" while the OS permission was later revoked. Without
    // this check schedule() throws, is swallowed below, and nothing fires while
    // the UI still reads "reminders on". Skip silently instead of pretending.
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;

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

// ─── Round-timer alerts while the app is backgrounded ───────────────────────
//
// The round timer runs on a setInterval, which the OS throttles hard once the
// app leaves the foreground — a fighter who pockets their phone mid-session
// hears nothing, and the timer only catches up (silently) when they look at it
// again. There is no way to keep a JS timer audible in the background, so the
// remaining transitions are handed to the OS as scheduled local notifications.
//
// They are scheduled on backgrounding and cancelled on return, so the in-app
// bell and the notification can never both fire for the same round.

export interface RoundAlert {
  /** Wall-clock moment this bell is due. */
  at: Date;
  title: string;
  body: string;
}

export function roundAlertsEnabled(): boolean {
  return localStorage.getItem(ROUND_ALERTS_KEY) === 'on';
}

export function setRoundAlertsEnabled(on: boolean): void {
  localStorage.setItem(ROUND_ALERTS_KEY, on ? 'on' : 'off');
}

/**
 * Replace any pending round alerts with this list. Alerts already in the past
 * are dropped — iOS fires a past-dated notification immediately, which would
 * ring the bell for a round that has already finished.
 */
export async function scheduleRoundAlerts(alerts: RoundAlert[]): Promise<void> {
  if (!notificationsSupported() || !roundAlertsEnabled()) return;
  try {
    await LocalNotifications.cancel({ notifications: ROUND_ALERT_IDS });
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;

    const now = Date.now();
    const due = alerts
      .filter(a => a.at.getTime() > now + 500)
      .slice(0, ROUND_ALERT_MAX);
    if (due.length === 0) return;

    await LocalNotifications.schedule({
      notifications: due.map((a, i) => ({
        id: ROUND_ALERT_BASE + i,
        title: a.title,
        body: a.body,
        schedule: { at: a.at, allowWhileIdle: true },
      })),
    });
  } catch {
    /* best-effort; the in-app bell remains the primary cue */
  }
}

/** Drop every pending round alert (timer stopped, or app back in front). */
export async function cancelRoundAlerts(): Promise<void> {
  if (!notificationsSupported()) return;
  try {
    await LocalNotifications.cancel({ notifications: ROUND_ALERT_IDS });
  } catch {
    /* noop */
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
