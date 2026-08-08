import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import type { WeekReportStats } from './weeklyReport';

const PREF_KEY = 'fightcamp_reminders';
const ROUND_ALERTS_KEY = 'fightcamp_round_alerts';

// Stable IDs so a reschedule replaces the previous notification instead of
// stacking duplicates.
const ID_CHECKIN = 1001;
const ID_WEIGHIN = 1002;
const ID_STREAK_RISK = 1003;
const ID_WEEKLY_REPORT = 1004;
// syncReminders owns only the repeating dailies; the streak alert and weekly
// report are reconciled separately (syncStreakRiskAlert / syncWeeklyReport)
// and must not be cancelled here or the daily resync would silently eat them.
const ALL_IDS = [{ id: ID_CHECKIN }, { id: ID_WEIGHIN }];
const STREAK_IDS = [{ id: ID_STREAK_RISK }];
const REPORT_IDS = [{ id: ID_WEEKLY_REPORT }];

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

// ─── Per-category preferences ───────────────────────────────────────────────
//
// "Training reminders" started as one switch over one 7pm daily. Three more
// notification types have been added since — the weigh-in, the streak-at-risk
// alert and the Sunday recap — and all four still rode that single switch, so a
// fighter who wanted the weigh-in but not the Sunday recap had exactly one
// option: turn everything off. That is the shape of an uninstall, not a
// preference.
//
// The master switch stays as the permission-bearing gate (it is what triggers
// the OS prompt, and it is what `disableReminders` clears); these sit under it.

const CATEGORY_KEY = 'fightcamp_reminder_categories';

export type ReminderCategory = 'checkIn' | 'weighIn' | 'streakRisk' | 'weeklyRecap';

export const REMINDER_CATEGORIES: ReadonlyArray<{
  key: ReminderCategory;
  label: string;
  description: string;
}> = [
  { key: 'checkIn',     label: 'Daily check-in',   description: '7pm — log today’s training' },
  { key: 'weighIn',     label: 'Morning weigh-in', description: '8am during a fight camp cut' },
  { key: 'streakRisk',  label: 'Streak at risk',   description: 'When a streak is down to its last day' },
  { key: 'weeklyRecap', label: 'Weekly recap',     description: 'Sunday evening summary of your week' },
];

/**
 * Categories default to **on**.
 *
 * This is what makes the split backward-compatible: an existing install has the
 * master switch on and no category record, and must keep receiving exactly what
 * it received before rather than going silent until the user visits Settings.
 * Only an explicit opt-out is ever stored.
 */
function readCategories(): Record<ReminderCategory, boolean> {
  const all: Record<ReminderCategory, boolean> = {
    checkIn: true, weighIn: true, streakRisk: true, weeklyRecap: true,
  };
  try {
    const raw = localStorage.getItem(CATEGORY_KEY);
    if (!raw) return all;
    const parsed = JSON.parse(raw) as Partial<Record<ReminderCategory, boolean>>;
    for (const { key } of REMINDER_CATEGORIES) {
      if (typeof parsed[key] === 'boolean') all[key] = parsed[key];
    }
  } catch {
    /* unreadable record — fall back to all-on rather than silencing the app */
  }
  return all;
}

export function getReminderCategories(): Record<ReminderCategory, boolean> {
  return readCategories();
}

/** True when the master switch is on *and* this category is not opted out. */
export function reminderCategoryEnabled(category: ReminderCategory): boolean {
  return remindersEnabled() && readCategories()[category];
}

export function setReminderCategoryEnabled(category: ReminderCategory, on: boolean): void {
  const next = { ...readCategories(), [category]: on };
  localStorage.setItem(CATEGORY_KEY, JSON.stringify(next));
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

    // Both dailies are cancelled above, so a category switched off simply is
    // not rescheduled here — no separate cancel path is needed.
    const categories = readCategories();
    const notifications: LocalNotificationSchema[] = [];
    if (categories.checkIn) {
      notifications.push({
        id: ID_CHECKIN,
        title: 'Keep your streak alive 🔥',
        body: "Log today's training before the day is done.",
        schedule: { on: { hour: 19, minute: 0 }, allowWhileIdle: true },
      });
    }
    if (weighIn && categories.weighIn) {
      notifications.push({
        id: ID_WEIGHIN,
        title: 'Morning weigh-in ⚖️',
        body: 'Log your weight to stay on pace for your cut.',
        schedule: { on: { hour: 8, minute: 0 }, allowWhileIdle: true },
      });
    }
    if (notifications.length === 0) return;
    await LocalNotifications.schedule({ notifications });
  } catch {
    /* notifications are best-effort; never block the app */
  }
}

// ─── Streak-at-risk alert ───────────────────────────────────────────────────
//
// The streak system computes an at-risk window (24–48h since the last logged
// workout) but used to surface it only inside the app — the one place a user
// who is about to lose their streak isn't. This schedules a single one-shot
// push for the streak's final day. Unlike the static 7pm daily above, it is
// derived from the actual last workout, renews itself on every log, and
// disappears the moment the streak is safe, short, or already lost.

const MS_PER_HOUR = 60 * 60 * 1000;

export interface StreakSnapshot {
  current: number;
  lastWorkoutAt: string | null;
  expired: boolean;
}

/**
 * Reconcile the scheduled streak alert with the live streak. Idempotent —
 * cancels first, then reschedules when there is a streak worth defending.
 * Shares the master switch and OS permission with the dailies, and carries its
 * own "Streak at risk" category on top.
 */
export async function syncStreakRiskAlert(streak: StreakSnapshot): Promise<void> {
  if (!notificationsSupported()) return;
  try {
    await LocalNotifications.cancel({ notifications: STREAK_IDS });
    if (!reminderCategoryEnabled('streakRisk')) return;
    // A 1-day "streak" is just one workout — the generic daily reminder covers
    // that; the targeted alert is reserved for a streak that took real work.
    if (streak.expired || streak.current < 2 || !streak.lastWorkoutAt) return;

    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;

    const last = new Date(streak.lastWorkoutAt).getTime();
    if (!Number.isFinite(last)) return;
    const expiry = last + 48 * MS_PER_HOUR;

    // 36h in: the morning-ish of the streak's final day, with ~12h left to
    // act. Slide out of quiet hours (nobody trains off a 3 a.m. push), but
    // never past the expiry itself.
    let at = new Date(last + 36 * MS_PER_HOUR);
    if (at.getHours() >= 22) {
      at = new Date(at);
      at.setDate(at.getDate() + 1);
      at.setHours(9, 0, 0, 0);
    } else if (at.getHours() < 8) {
      at = new Date(at);
      at.setHours(9, 0, 0, 0);
    }
    if (at.getTime() >= expiry) at = new Date(expiry - 2 * MS_PER_HOUR);
    // Window already passed or is imminent — the app is open right now, and
    // the dashboard's at-risk flame is the in-app cue. (iOS fires past-dated
    // notifications immediately, which would ping a user mid-session.)
    if (at.getTime() <= Date.now()) return;

    await LocalNotifications.schedule({
      notifications: [
        {
          id: ID_STREAK_RISK,
          title: `🔥 Your ${streak.current}-day streak ends today`,
          body: 'One session saves it. Get in the gym and log it.',
          schedule: { at, allowWhileIdle: true },
        },
      ],
    });
  } catch {
    /* best-effort; the dashboard flame remains the in-app cue */
  }
}

// ─── Weekly Fight Ready recap ───────────────────────────────────────────────

/** Next Sunday at 18:00 local (today's 18:00 if it's Sunday and still ahead). */
function nextSundayEvening(now: Date): Date {
  const d = new Date(now);
  d.setHours(18, 0, 0, 0);
  let add = (7 - d.getDay()) % 7; // 0 = Sunday
  if (add === 0 && d.getTime() <= now.getTime()) add = 7;
  d.setDate(d.getDate() + add);
  return d;
}

/**
 * Arm the Sunday-evening week recap with this week's real numbers. A one-shot
 * on purpose, re-armed on every log: the body is only as fresh as the last
 * time the app computed it, so an abandoned install gets exactly one recap —
 * a re-engagement ping — instead of a stale weekly drumbeat repeating numbers
 * from a month ago. An empty week arms nothing (there is no report to read,
 * and the daily reminder already does the nudging).
 */
export async function syncWeeklyReport(stats: WeekReportStats): Promise<void> {
  if (!notificationsSupported()) return;
  try {
    await LocalNotifications.cancel({ notifications: REPORT_IDS });
    if (!reminderCategoryEnabled('weeklyRecap')) return;
    if (stats.sessions === 0) return;
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;

    const hours = stats.hours >= 1 ? ` · ${stats.hours} hrs` : '';
    const streak = stats.streak >= 2 ? ` · ${stats.streak}-day streak` : '';
    await LocalNotifications.schedule({
      notifications: [
        {
          id: ID_WEEKLY_REPORT,
          title: 'Your week in the gym 🥊',
          // Tapping a local notification opens the app at the dashboard — the
          // copy promises exactly that (progress lives one tap away there),
          // not a dedicated report screen the app doesn't have yet.
          body: `${stats.sessions} session${stats.sessions === 1 ? '' : 's'}${hours}${streak}. Check your progress and plan next week.`,
          schedule: { at: nextSundayEvening(new Date()), allowWhileIdle: true },
        },
      ],
    });
  } catch {
    /* best-effort */
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

/**
 * Background round bells are ON unless the fighter has explicitly turned them
 * off.
 *
 * The bell IS the round timer: a fighter who pockets or locks the phone
 * mid-session expects the rounds to keep ringing, and the in-app Web Audio
 * bell cannot do that — WKWebView is suspended within seconds of backgrounding.
 * Defaulting this off meant the timer silently stopped being a timer the
 * moment the screen went dark, for everyone who never found the setting.
 *
 * Only the literal opt-out counts, so an unset preference reads as on while a
 * deliberate "off" still survives. The OS permission is a separate gate the
 * native scheduler enforces on its own — this is the fighter's preference, not
 * a claim that bells can actually be delivered.
 */
export function roundAlertsEnabled(): boolean {
  return localStorage.getItem(ROUND_ALERTS_KEY) !== 'off';
}

export function setRoundAlertsEnabled(on: boolean): void {
  localStorage.setItem(ROUND_ALERTS_KEY, on ? 'on' : 'off');
}

/**
 * Make sure the OS will actually deliver background round bells, asking for
 * the notification permission if it has never been decided.
 *
 * Safe to call on every session start: iOS answers an already-decided
 * permission from its own record without re-prompting, and a denial is
 * reported rather than re-asked.
 */
export async function ensureRoundAlertPermission(): Promise<boolean> {
  if (!notificationsSupported() || !roundAlertsEnabled()) return false;
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display === 'granted') return true;
    if (perm.display === 'denied') return false;
    return await requestNotificationPermission();
  } catch {
    return false;
  }
}

/**
 * Replace any pending round alerts with this list. Alerts already in the past
 * are dropped — iOS fires a past-dated notification immediately, which would
 * ring the bell for a round that has already finished.
 */
export async function scheduleRoundAlerts(
  alerts: RoundAlert[],
  /**
   * Re-checked immediately before and after the scheduling call. Scheduling is
   * several awaits long, so a fighter who backgrounds the app and comes straight
   * back can have the foreground cancel land *first* — leaving alerts queued
   * while the in-app bell is also running, and every round ringing twice. The
   * caller passes a generation check so a superseded call cleans up after
   * itself instead.
   */
  stillWanted: () => boolean = () => true,
): Promise<void> {
  if (!notificationsSupported() || !roundAlertsEnabled()) return;
  try {
    await LocalNotifications.cancel({ notifications: ROUND_ALERT_IDS });
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;

    const now = Date.now();
    const due = alerts
      .filter(a => a.at.getTime() > now + 500)
      .slice(0, ROUND_ALERT_MAX);
    if (due.length === 0 || !stillWanted()) return;

    await LocalNotifications.schedule({
      notifications: due.map((a, i) => ({
        id: ROUND_ALERT_BASE + i,
        title: a.title,
        body: a.body,
        schedule: { at: a.at, allowWhileIdle: true },
      })),
    });

    // Superseded while we were scheduling — undo it rather than leave alerts
    // queued for a foregrounded app.
    if (!stillWanted()) await LocalNotifications.cancel({ notifications: ROUND_ALERT_IDS });
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

/** Turn reminders off and clear anything scheduled (dailies + streak + recap). */
export async function disableReminders(): Promise<void> {
  setRemindersEnabled(false);
  if (!notificationsSupported()) return;
  try {
    await LocalNotifications.cancel({ notifications: [...ALL_IDS, ...STREAK_IDS, ...REPORT_IDS] });
  } catch {
    /* noop */
  }
}
