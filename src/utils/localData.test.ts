import { describe, expect, it } from 'vitest';
import {
  GUEST_ACCOUNT_ID,
  clearFightCampLocalData,
  getActiveLocalAccount,
  reconcileLocalAccount,
  setActiveLocalAccount,
} from './localData';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, String(value)); }
}

describe('Fight Camp local-data boundaries', () => {
  it('removes only Fight Camp-owned keys', () => {
    const storage = new MemoryStorage();
    storage.setItem('fightcamp_app', 'private training data');
    storage.setItem('fightcamp_timer_v2', 'timer state');
    storage.setItem('sb-project-auth-token', 'supabase session');
    storage.setItem('unrelated', 'keep me');

    clearFightCampLocalData(storage);

    expect(storage.getItem('fightcamp_app')).toBeNull();
    expect(storage.getItem('fightcamp_timer_v2')).toBeNull();
    expect(storage.getItem('sb-project-auth-token')).toBe('supabase session');
    expect(storage.getItem('unrelated')).toBe('keep me');
  });

  it('adopts existing data on the migration run without wiping it', () => {
    const storage = new MemoryStorage();
    storage.setItem('fightcamp_app', 'existing data');

    expect(reconcileLocalAccount('user-a', storage)).toBe(false);
    expect(getActiveLocalAccount(storage)).toBe('user-a');
    expect(storage.getItem('fightcamp_app')).toBe('existing data');
  });

  it('clears Fight Camp state when the local account changes', () => {
    const storage = new MemoryStorage();
    setActiveLocalAccount('user-a', storage);
    storage.setItem('fightcamp_app', 'user-a data');
    storage.setItem('sb-project-auth-token', 'new auth session');

    expect(reconcileLocalAccount('user-b', storage)).toBe(true);
    expect(getActiveLocalAccount(storage)).toBe('user-b');
    expect(storage.getItem('fightcamp_app')).toBeNull();
    expect(storage.getItem('sb-project-auth-token')).toBe('new auth session');
  });

  it('treats signed-out state as an explicit guest account', () => {
    const storage = new MemoryStorage();
    setActiveLocalAccount('user-a', storage);

    expect(reconcileLocalAccount(null, storage)).toBe(true);
    expect(getActiveLocalAccount(storage)).toBe(GUEST_ACCOUNT_ID);
  });
});
