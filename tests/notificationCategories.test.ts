import { describe, it, expect, beforeEach, vi } from 'vitest';

// The module reads Capacitor at import time for `notificationsSupported`, and
// pulls in the local-notifications plugin. Neither is exercised here — these
// tests cover the preference layer, which is pure localStorage.
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: {} }));

import {
  REMINDER_CATEGORIES,
  getReminderCategories,
  reminderCategoryEnabled,
  setReminderCategoryEnabled,
  setRemindersEnabled,
} from '../src/utils/notifications';

const CATEGORY_KEY = 'fightcamp_reminder_categories';

// The preference helpers read the global directly rather than taking an
// injectable store, so the global is what has to be replaced — same shape as
// tests/storage.test.ts.
class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, String(value)); }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
});

describe('reminder categories', () => {
  it('defaults every category to on', () => {
    expect(getReminderCategories()).toEqual({
      checkIn: true, weighIn: true, streakRisk: true, weeklyRecap: true,
    });
  });

  it('keeps an existing install receiving what it already received', () => {
    // The upgrade case: master switch on, no category record written yet.
    // Anything other than all-on here silently mutes a user who never asked
    // for a change.
    setRemindersEnabled(true);
    expect(localStorage.getItem(CATEGORY_KEY)).toBeNull();
    for (const { key } of REMINDER_CATEGORIES) {
      expect(reminderCategoryEnabled(key)).toBe(true);
    }
  });

  it('persists an explicit opt-out without touching the others', () => {
    setReminderCategoryEnabled('weeklyRecap', false);
    expect(getReminderCategories()).toEqual({
      checkIn: true, weighIn: true, streakRisk: true, weeklyRecap: false,
    });
  });

  it('round-trips an opt-out back on', () => {
    setReminderCategoryEnabled('streakRisk', false);
    expect(getReminderCategories().streakRisk).toBe(false);
    setReminderCategoryEnabled('streakRisk', true);
    expect(getReminderCategories().streakRisk).toBe(true);
  });

  it('gates every category behind the master switch', () => {
    setRemindersEnabled(false);
    for (const { key } of REMINDER_CATEGORIES) {
      expect(reminderCategoryEnabled(key)).toBe(false);
    }
  });

  it('requires both the master switch and the category', () => {
    setRemindersEnabled(true);
    setReminderCategoryEnabled('checkIn', false);
    expect(reminderCategoryEnabled('checkIn')).toBe(false);
    expect(reminderCategoryEnabled('weighIn')).toBe(true);
  });

  it('falls back to all-on when the stored record is unreadable', () => {
    // Silence is the worse failure: a corrupt record must not be the reason a
    // fighter stops hearing from the app.
    localStorage.setItem(CATEGORY_KEY, 'not json');
    expect(getReminderCategories()).toEqual({
      checkIn: true, weighIn: true, streakRisk: true, weeklyRecap: true,
    });
  });

  it('ignores non-boolean values in a partial record', () => {
    localStorage.setItem(CATEGORY_KEY, JSON.stringify({ checkIn: 'yes', weighIn: false }));
    const cats = getReminderCategories();
    expect(cats.checkIn).toBe(true);   // garbage → default
    expect(cats.weighIn).toBe(false);  // real opt-out → honoured
    expect(cats.streakRisk).toBe(true); // absent → default
  });
});
