import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useApp } from './AppContext';
import { pushState, pullState, mergeCloud, forceFullResync } from '../lib/sync';

export type SyncStatus = 'disabled' | 'idle' | 'syncing' | 'synced' | 'error';

interface SyncValue {
  /** Accounts available AND signed in — i.e. sync can run at all. */
  enabled: boolean;
  status: SyncStatus;
  lastSyncedAt: string | null;
  error: string | null;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncValue | null>(null);

const DEBOUNCE_MS = 4000;

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { configured, user } = useAuth();
  const { state, dispatch } = useApp();
  const enabled = configured && !!user;

  const [status, setStatus] = useState<SyncStatus>('disabled');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep the latest state without re-firing the sync callbacks on every change.
  const stateRef = useRef(state);
  stateRef.current = state;
  const inFlight = useRef(false);
  /**
   * An edit arrived while a push was in flight. That push already read
   * `stateRef.current`, so the newer edit is not in it — and the debounce timer
   * that would have sent it has been cleared by the run that skipped. Without
   * this flag the change sits unsynced until some unrelated state change
   * happens to schedule another push.
   */
  const pending = useRef(false);
  /**
   * Whether a pull has succeeded since sign-in. Deleting cloud rows is gated on
   * this: until we have confirmed what the account actually contains, an empty
   * or partial local store is indistinguishable from "the user deleted it all",
   * and pruning on that guess would destroy data.
   */
  const restored = useRef(false);

  const syncNow = useCallback(async () => {
    if (!user) return;
    // Do not drop this request — remember it and let the in-flight run pick it
    // up when it settles.
    if (inFlight.current) { pending.current = true; return; }
    inFlight.current = true;
    try {
      // Loops rather than recurses so a burst of edits during a slow upload
      // costs one extra push, not one stack frame per edit.
      do {
        pending.current = false;
        setStatus('syncing');
        setError(null);
        const res = await pushState(user.id, stateRef.current, { prune: restored.current });
        if (!res.ok) {
          setStatus('error');
          setError(res.error ?? 'Sync failed.');
          // Stop here rather than immediately retrying: a failing server would
          // otherwise be hammered in a tight loop. The debounce on the next
          // state change is the retry.
          break;
        }
        setStatus('synced');
        // pushState only writes rows whose content changed. A push that sent
        // nothing means the cloud was already current, so leave the "Backed up
        // 14:32" stamp pointing at the last real upload rather than advancing it
        // every time an unrelated bit of state moves.
        if (res.pushed > 0) setLastSyncedAt(new Date().toISOString());
      } while (pending.current);
    } finally {
      inFlight.current = false;
      pending.current = false;
    }
  }, [user]);

  // Pull cloud data and merge it into local state (cross-device restore).
  const restore = useCallback(async () => {
    if (!user) return;
    setStatus('syncing');
    setError(null);
    const res = await pullState(user.id);
    if (res.ok && res.snapshot) {
      // From here the local store is known to reflect the account, so a record
      // that is missing locally really was deleted and may be tombstoned.
      restored.current = true;
      // The merge below keeps the LOCAL copy of any row that exists on both
      // sides, so the server may now hold a different version of a row whose
      // hash has not moved. Force the next push to re-assert everything, or
      // dirty tracking would skip it and the two would stay diverged.
      forceFullResync();
      const merged = mergeCloud(stateRef.current, res.snapshot);
      dispatch({ type: 'SET_STATE', payload: merged });
      // Regenerate the training schedule for the (possibly restored) active camp.
      if (merged.activeCamp) dispatch({ type: 'SET_ACTIVE_CAMP', payload: merged.activeCamp.id });
    } else if (!res.ok) {
      setStatus('error');
      setError(res.error ?? 'Restore failed.');
    }
  }, [user, dispatch]);

  // On sign-in: restore from cloud, then push to reconcile.
  useEffect(() => {
    if (!enabled) {
      setStatus('disabled');
      // Signing out invalidates the guarantee; the next session must pull again
      // before it is allowed to delete anything.
      restored.current = false;
      return;
    }
    setStatus('idle');
    void (async () => {
      await restore();
      await syncNow();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Debounced push on local data changes.
  useEffect(() => {
    if (!enabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void syncNow(); }, DEBOUNCE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, enabled]);

  return (
    <SyncContext.Provider value={{ enabled, status, lastSyncedAt, error, syncNow }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
