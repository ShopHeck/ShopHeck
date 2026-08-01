import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useApp } from './AppContext';
import { pushState, pullState, mergeCloud } from '../lib/sync';

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

  const syncNow = useCallback(async () => {
    if (!user || inFlight.current) return;
    inFlight.current = true;
    setStatus('syncing');
    setError(null);
    const res = await pushState(user.id, stateRef.current);
    inFlight.current = false;
    if (res.ok) {
      setStatus('synced');
      // pushState only writes rows whose content changed. A push that sent
      // nothing means the cloud was already current, so leave the "Backed up
      // 14:32" stamp pointing at the last real upload rather than advancing it
      // every time an unrelated bit of state moves.
      if (res.pushed > 0) setLastSyncedAt(new Date().toISOString());
    } else {
      setStatus('error');
      setError(res.error ?? 'Sync failed.');
    }
  }, [user]);

  // Pull cloud data and merge it into local state (cross-device restore).
  const restore = useCallback(async () => {
    if (!user) return;
    setStatus('syncing');
    setError(null);
    const res = await pullState(user.id);
    if (res.ok && res.snapshot) {
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
