import { beforeEach, describe, expect, it } from 'vitest';
import { reducer, type Action } from '../src/context/AppContext';
import { createDefaultState } from '../src/utils/storage';
import type { AppState } from '../src/types';

/**
 * The reducer must be a pure function of (state, action).
 *
 * StrictMode deliberately invokes reducers twice per dispatch in development to
 * surface impurity. Side effects used to sit inside this one — saveSubscription
 * on SET_SUBSCRIPTION, and a localStorage wipe plus a sign-out event on RESET —
 * so each fired twice. They now live in AppProvider's dispatch wrapper.
 */

class RecordingStorage implements Storage {
  writes: string[] = [];
  removals: string[] = [];
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.removals.push(key); this.values.delete(key); }
  setItem(key: string, value: string): void { this.writes.push(key); this.values.set(key, String(value)); }
}

let storage: RecordingStorage;
let events: string[];

beforeEach(() => {
  storage = new RecordingStorage();
  events = [];
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage, configurable: true, writable: true,
  });
  // requestLocalSignOut dispatches on window.
  Object.defineProperty(globalThis, 'window', {
    value: {
      dispatchEvent: (e: Event) => { events.push(e.type); return true; },
      addEventListener: () => {},
      removeEventListener: () => {},
      location: { search: '' },
    },
    configurable: true,
    writable: true,
  });
});

const base = (): AppState => createDefaultState();

describe('reducer purity', () => {
  const cases: { name: string; action: Action }[] = [
    { name: 'RESET', action: { type: 'RESET' } },
    { name: 'CLEAR_LOCAL_STATE', action: { type: 'CLEAR_LOCAL_STATE' } },
    {
      name: 'SET_SUBSCRIPTION',
      action: { type: 'SET_SUBSCRIPTION', payload: { tier: 'fighter_pro', expiresAt: null, source: 'stripe_server' } },
    },
  ];

  for (const { name, action } of cases) {
    it(`${name} writes nothing to localStorage`, () => {
      reducer(base(), action);
      expect(storage.writes).toEqual([]);
      expect(storage.removals).toEqual([]);
    });

    it(`${name} dispatches no window events`, () => {
      reducer(base(), action);
      expect(events).toEqual([]);
    });

    it(`${name} is idempotent under a StrictMode double invoke`, () => {
      const state = base();
      const first = reducer(state, action);
      const second = reducer(state, action);
      expect(second).toEqual(first);
    });
  }

  it('does not mutate the state it is given', () => {
    const state = base();
    const snapshot = JSON.parse(JSON.stringify(state));

    reducer(state, { type: 'LOG_WEIGHT', payload: { campId: 'c', date: '2026-08-01', weight: 160, notes: '' } });

    expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot);
  });

  it('still applies SET_SUBSCRIPTION to the returned state', () => {
    // Purity must not have cost the actual transition.
    const next = reducer(base(), {
      type: 'SET_SUBSCRIPTION',
      payload: { tier: 'coach_pro', expiresAt: null, source: 'comp' },
    });
    expect(next.subscription.tier).toBe('coach_pro');
  });

  it('still resets state to defaults on RESET', () => {
    const dirty: AppState = { ...base(), workoutLogs: [{ id: 'w' } as never] };
    expect(reducer(dirty, { type: 'RESET' }).workoutLogs).toEqual([]);
  });
});
