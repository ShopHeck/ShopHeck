import { format } from 'date-fns';

/**
 * Today as a local-calendar yyyy-MM-dd string. Log-entry date fields must use
 * this (never toISOString(), which is UTC and rolls an evening entry onto
 * tomorrow west of Greenwich) both as their default value and as the picker's
 * `max`: training data is a record of what happened, so no logger accepts a
 * future date — a future weigh-in corrupts the cut projection, a future
 * workout corrupts streaks and weekly volume.
 */
export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** yyyy-MM-dd strings compare correctly as strings — no Date parsing needed. */
export function isFutureISODate(date: string): boolean {
  return date > todayISO();
}
