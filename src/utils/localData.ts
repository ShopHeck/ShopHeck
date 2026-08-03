const STORAGE_PREFIX = 'fightcamp_';
const ACTIVE_ACCOUNT_KEY = `${STORAGE_PREFIX}active_account`;

export const GUEST_ACCOUNT_ID = 'guest';
export const LOCAL_DATA_CLEARED_EVENT = 'fightcamp:local-data-cleared';

/**
 * Remove every Fight Camp-owned localStorage entry while leaving Supabase auth
 * tokens and unrelated site data untouched. Using the prefix rather than a
 * hand-maintained list ensures newly added preferences are included in account
 * deletion and reset flows automatically.
 */
export function clearFightCampLocalData(storage: Storage = localStorage): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

/** Account marker used to prevent one signed-in athlete inheriting another's local state. */
export function getActiveLocalAccount(storage: Storage = localStorage): string | null {
  return storage.getItem(ACTIVE_ACCOUNT_KEY);
}

export function setActiveLocalAccount(accountId: string, storage: Storage = localStorage): void {
  storage.setItem(ACTIVE_ACCOUNT_KEY, accountId);
}

/**
 * First run after this migration adopts the existing local data. Later account
 * changes wipe the previous account's device-local cache before cloud restore.
 * Returns true when a boundary was crossed and callers must reset in-memory state.
 */
export function reconcileLocalAccount(
  userId: string | null,
  storage: Storage = localStorage,
): boolean {
  const next = userId ?? GUEST_ACCOUNT_ID;
  const previous = getActiveLocalAccount(storage);

  // Migration path: existing installs predate the marker. Adopt their current
  // data rather than destroying it on the first launch after the update.
  if (!previous) {
    setActiveLocalAccount(next, storage);
    return false;
  }

  if (previous === next) return false;

  clearFightCampLocalData(storage);
  setActiveLocalAccount(next, storage);
  return true;
}

/** Notify the mounted app that an auth boundary cleared its persisted state. */
export function notifyLocalDataCleared(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(LOCAL_DATA_CLEARED_EVENT));
  }
}

/** Ask AuthProvider to clear the local Supabase session after an app reset. */
export function requestLocalSignOut(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('fightcamp:request-sign-out'));
  }
}
