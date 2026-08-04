import React, { createContext, useContext, useReducer, useEffect, useState, useCallback } from 'react';
import type { AppState, FightCamp, FighterProfile, WorkoutLog, SparringLog, ConditioningTest, WeightEntry, GamePlan, NutritionLog, CoachNote, SubscriptionState, HRVEntry, FitbitConfig, FightResult, CampFactorWeights, DashboardPrefs } from '../types';
import { processStripeReturn, saveSubscription, checkNativeSubscription, identifyNativeSubscriber, isCompEmail, COMP_SUBSCRIPTION, DEFAULT_SUBSCRIPTION } from '../utils/subscription';
import {
  loadState,
  scheduleSaveState,
  flushSaveState,
  discardPendingSave,
  createDefaultState,
  createProfile,
  createCamp,
  addWorkoutLog,
  addSparringLog,
  addConditioningTest,
  addWeightEntry,
  deleteWorkoutLog,
  deleteSparringLog,
  deleteConditioningTest,
  deleteWeightEntry,
  updateProfile,
  deleteCamp,
  setSchedule,
  toggleSessionComplete,
  saveGamePlan,
  upsertNutritionLog,
  deleteNutritionLog,
  addCoachNote,
  deleteCoachNote,
  linkCoach,
  addHRVEntry,
  deleteHRVEntry,
  setFitbitConfig,
  addFightResult,
  updateFightResult,
  deleteFightResult,
  applyFactorWeights,
  setDashboardPrefs,
} from '../utils/storage';
import { generateTrainingCamp } from '../utils/campGenerator';
import { applyGamificationUpdates, dismissCelebration } from '../utils/gamification';
import { useAuth } from './AuthContext';
import { fetchServerSubscription, clearIdMap } from '../lib/sync';
import { syncStreakRiskAlert, syncWeeklyReport } from '../utils/notifications';
import { computeWeekReportStats } from '../utils/weeklyReport';
import { seedDemoState } from '../utils/demoSeed';
import {
  clearFightCampLocalData,
  LOCAL_DATA_CLEARED_EVENT,
  requestLocalSignOut,
} from '../utils/localData';

export type Action =
  | { type: 'SET_STATE'; payload: AppState }
  | { type: 'CLEAR_LOCAL_STATE' }
  | { type: 'CREATE_PROFILE'; payload: Omit<FighterProfile, 'id' | 'createdAt'> }
  | { type: 'UPDATE_PROFILE'; payload: FighterProfile }
  | { type: 'CREATE_CAMP'; payload: Omit<FightCamp, 'id' | 'createdAt'> }
  | { type: 'UPDATE_CAMP'; payload: FightCamp }
  | { type: 'DELETE_CAMP'; payload: string }
  | { type: 'SET_ACTIVE_CAMP'; payload: string }
  | { type: 'LOG_WORKOUT'; payload: Omit<WorkoutLog, 'id' | 'createdAt'> }
  | { type: 'LOG_SPARRING'; payload: Omit<SparringLog, 'id' | 'createdAt'> }
  | { type: 'LOG_CONDITIONING'; payload: Omit<ConditioningTest, 'id' | 'createdAt'> }
  | { type: 'LOG_WEIGHT'; payload: Omit<WeightEntry, 'id' | 'createdAt'> }
  | { type: 'DELETE_WORKOUT'; payload: string }
  | { type: 'DELETE_SPARRING'; payload: string }
  | { type: 'DELETE_CONDITIONING'; payload: string }
  | { type: 'DELETE_WEIGHT'; payload: string }
  | { type: 'TOGGLE_SESSION'; payload: string }
  | { type: 'TOGGLE_DAY_OVERRIDE'; payload: string }
  | { type: 'SAVE_GAME_PLAN'; payload: GamePlan }
  | { type: 'LOG_NUTRITION'; payload: Omit<NutritionLog, 'id' | 'createdAt'> }
  | { type: 'DELETE_NUTRITION'; payload: string }
  | { type: 'ADD_COACH_NOTE'; payload: Omit<CoachNote, 'id' | 'createdAt'> }
  | { type: 'DELETE_COACH_NOTE'; payload: string }
  | { type: 'LINK_COACH'; payload: string | null }
  | { type: 'SET_SUBSCRIPTION'; payload: SubscriptionState }
  | { type: 'LOG_HRV'; payload: Omit<HRVEntry, 'id' | 'createdAt'> }
  | { type: 'DELETE_HRV'; payload: string }
  | { type: 'SET_FITBIT_CONFIG'; payload: FitbitConfig | null }
  | { type: 'LOG_FIGHT_RESULT'; payload: FightResult }
  | { type: 'UPDATE_FIGHT_RESULT'; payload: FightResult }
  | { type: 'DELETE_FIGHT_RESULT'; payload: string }
  | { type: 'APPLY_FACTOR_WEIGHTS'; payload: { fighterId: string; weights: CampFactorWeights } }
  | { type: 'RECOMPUTE_GAMIFICATION' }
  | { type: 'DISMISS_CELEBRATION'; payload: string }
  | { type: 'SET_DASHBOARD_PREF'; payload: Partial<DashboardPrefs> }
  | { type: 'RESET' };

/** Actions whose payloads can shift streaks/belts/achievements/PRs/challenges. */
const GAMIFICATION_TRIGGERS = new Set([
  'LOG_WORKOUT',
  'DELETE_WORKOUT',
  'LOG_SPARRING',
  'DELETE_SPARRING',
  'LOG_FIGHT_RESULT',
  'UPDATE_FIGHT_RESULT',
  'DELETE_FIGHT_RESULT',
  'DELETE_CAMP',
]);

function baseReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_STATE':
      return action.payload;

    case 'CLEAR_LOCAL_STATE':
      return createDefaultState();

    case 'CREATE_PROFILE': {
      const profile = createProfile(action.payload);
      const fighters = action.payload.role === 'fighter'
        ? [...state.fighters.filter(f => f.id !== profile.id), profile]
        : state.fighters;
      const coaches = action.payload.role === 'coach'
        ? [...state.coaches.filter(c => c.id !== profile.id), profile]
        : state.coaches;
      return { ...state, currentUser: profile, fighters, coaches };
    }

    case 'UPDATE_PROFILE':
      return updateProfile(state, action.payload);

    case 'CREATE_CAMP': {
      const camp = createCamp(action.payload);
      const schedule = generateTrainingCamp(camp, state.currentUser?.factorWeights);
      return setSchedule({ ...state, camps: [...state.camps, camp], activeCamp: camp }, schedule);
    }

    case 'UPDATE_CAMP': {
      const camps = state.camps.map(c => c.id === action.payload.id ? action.payload : c);
      const activeCamp = state.activeCamp?.id === action.payload.id ? action.payload : state.activeCamp;
      const schedule = activeCamp ? generateTrainingCamp(activeCamp, state.currentUser?.factorWeights) : state.trainingSchedule;
      return setSchedule({ ...state, camps, activeCamp }, schedule);
    }

    case 'DELETE_CAMP': {
      // Deleting the active camp promotes another one, so the schedule has to
      // be rebuilt for it — otherwise the planner kept rendering the deleted
      // camp's weeks until the next app launch.
      const next = deleteCamp(state, action.payload);
      const schedule = next.activeCamp
        ? generateTrainingCamp(next.activeCamp, next.currentUser?.factorWeights)
        : [];
      return setSchedule(next, schedule);
    }

    case 'SET_ACTIVE_CAMP': {
      const camp = state.camps.find(c => c.id === action.payload) || null;
      if (!camp) return state;
      const schedule = generateTrainingCamp(camp, state.currentUser?.factorWeights);
      return setSchedule({ ...state, activeCamp: camp }, schedule);
    }

    case 'LOG_WORKOUT':
      return addWorkoutLog(state, action.payload);

    case 'LOG_SPARRING':
      return addSparringLog(state, action.payload);

    case 'LOG_CONDITIONING':
      return addConditioningTest(state, action.payload);

    case 'LOG_WEIGHT':
      return addWeightEntry(state, action.payload);

    case 'DELETE_WORKOUT':
      return deleteWorkoutLog(state, action.payload);

    case 'DELETE_SPARRING':
      return deleteSparringLog(state, action.payload);

    case 'DELETE_CONDITIONING':
      return deleteConditioningTest(state, action.payload);

    case 'DELETE_WEIGHT':
      return deleteWeightEntry(state, action.payload);

    case 'TOGGLE_SESSION':
      return toggleSessionComplete(state, action.payload);

    case 'TOGGLE_DAY_OVERRIDE':
      return {
        ...state,
        dayOverrides: {
          ...state.dayOverrides,
          [action.payload]: !state.dayOverrides[action.payload],
        },
      };

    case 'SAVE_GAME_PLAN':
      return saveGamePlan(state, action.payload);

    case 'LOG_NUTRITION':
      return upsertNutritionLog(state, action.payload);

    case 'DELETE_NUTRITION':
      return deleteNutritionLog(state, action.payload);

    case 'ADD_COACH_NOTE':
      return addCoachNote(state, action.payload);

    case 'DELETE_COACH_NOTE':
      return deleteCoachNote(state, action.payload);

    case 'LINK_COACH':
      return linkCoach(state, action.payload);

    case 'SET_SUBSCRIPTION':
      return { ...state, subscription: action.payload };

    case 'LOG_HRV':
      return addHRVEntry(state, action.payload);

    case 'DELETE_HRV':
      return deleteHRVEntry(state, action.payload);

    case 'SET_FITBIT_CONFIG':
      return setFitbitConfig(state, action.payload);

    case 'LOG_FIGHT_RESULT':
      return addFightResult(state, action.payload);

    case 'UPDATE_FIGHT_RESULT':
      return updateFightResult(state, action.payload);

    case 'DELETE_FIGHT_RESULT':
      return deleteFightResult(state, action.payload);

    case 'APPLY_FACTOR_WEIGHTS':
      return applyFactorWeights(state, action.payload.fighterId, action.payload.weights);

    case 'RECOMPUTE_GAMIFICATION':
      return state; // wrapper below will run the orchestrator

    case 'DISMISS_CELEBRATION':
      return dismissCelebration(state, action.payload);

    case 'SET_DASHBOARD_PREF':
      return setDashboardPrefs(state, action.payload);

    case 'RESET':
      // The wipe itself runs in `dispatch` below, not here — see runCommands.
      return createDefaultState();

    default:
      return state;
  }
}

/**
 * Exported for tests only.
 *
 * The invariant worth pinning is that this is a PURE function of
 * (state, action) — StrictMode invokes it twice per dispatch, so anything with
 * an observable side effect here happens twice in development. Commands that
 * touch localStorage or dispatch events live in AppProvider's `dispatch`
 * wrapper instead.
 */
export function reducer(state: AppState, action: Action): AppState {
  const next = baseReducer(state, action);
  if (action.type === 'RECOMPUTE_GAMIFICATION' || GAMIFICATION_TRIGGERS.has(action.type)) {
    return applyGamificationUpdates(next, action.type);
  }
  return next;
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, baseDispatch] = useReducer(reducer, undefined, () => {
    // Always regenerate trainingSchedule from activeCamp so cached stale week
    // dates (from before generator fixes) are never used.
    // `?shot` loads a demo state for App Store screenshot capture (see demoSeed).
    const loaded = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('shot')
      ? seedDemoState()
      : loadState();
    if (loaded.activeCamp) {
      return setSchedule(loaded, generateTrainingCamp(loaded.activeCamp, loaded.currentUser?.factorWeights));
    }
    return loaded;
  });

  /**
   * Commands that reach outside the state document.
   *
   * These used to run inside the reducer. A reducer must be a pure function of
   * (state, action): StrictMode deliberately invokes it twice in development to
   * surface exactly this, so every wipe and sign-out request fired twice. They
   * are also not state transitions at all — clearing localStorage and asking
   * AuthProvider to sign out are effects that merely accompany one.
   *
   * Running them in the dispatch wrapper keeps the reducer pure and fires each
   * command exactly once per dispatch, in both development and production.
   */
  const dispatch = useCallback<React.Dispatch<Action>>((action) => {
    switch (action.type) {
      case 'CLEAR_LOCAL_STATE':
        // The account boundary moved; this device's local↔cloud id ledger
        // belongs to the previous account.
        discardPendingSave();
        clearIdMap();
        break;
      case 'RESET':
        // Deliberately broader than the app-state document: timer, presets,
        // custom audio, notification prefs, sync ledgers and cached entitlements
        // all use Fight Camp-prefixed keys and must disappear too.
        //
        // The queued write is dropped first — it holds the state being erased,
        // and letting it land after the wipe would write it straight back.
        discardPendingSave();
        clearFightCampLocalData();
        clearIdMap();
        requestLocalSignOut();
        break;
      default:
        break;
    }
    baseDispatch(action);
  }, []);

  const { user, loading: authLoading } = useAuth();
  const [stripeReturnPending, setStripeReturnPending] = useState(false);

  // Cached entitlement follows the resulting value rather than being written
  // from inside the reducer. Idempotent, so a StrictMode double-render is a
  // duplicate write of identical bytes rather than a duplicated effect.
  useEffect(() => {
    saveSubscription(state.subscription);
  }, [state.subscription]);

  // AuthProvider clears persisted Fight Camp data before exposing a different
  // account. Reset the mounted reducer in the same boundary so the next user's
  // cloud restore cannot merge with the previous user's in-memory state.
  useEffect(() => {
    const cleared = () => dispatch({ type: 'CLEAR_LOCAL_STATE' });
    window.addEventListener(LOCAL_DATA_CLEARED_EVENT, cleared);
    return () => window.removeEventListener(LOCAL_DATA_CLEARED_EVENT, cleared);
  }, [dispatch]);

  // Stripe return parameters are only a signal to look for the signed webhook
  // row. They never grant local access by themselves.
  useEffect(() => {
    if (processStripeReturn()) setStripeReturnPending(true);
  }, []);

  // Webhooks can land a moment after the browser returns. Poll briefly for the
  // server-authoritative row so a legitimate purchase unlocks without a reload.
  useEffect(() => {
    if (!stripeReturnPending || authLoading || !user?.id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const poll = async () => {
      const server = await fetchServerSubscription(user.id);
      if (cancelled) return;
      if (server && server.tier !== 'free') {
        dispatch({ type: 'SET_SUBSCRIPTION', payload: server });
        setStripeReturnPending(false);
        return;
      }
      attempts += 1;
      if (attempts >= 8) {
        setStripeReturnPending(false);
        return;
      }
      timer = setTimeout(() => { void poll(); }, 1500);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [stripeReturnPending, authLoading, user?.id, dispatch]);

  // On native iOS: sync subscription status from RevenueCat on every launch.
  // null = error/offline — leave state unchanged to avoid downgrading offline users.
  useEffect(() => {
    const currentSource = state.subscription.source;
    checkNativeSubscription().then(result => {
      if (result === null) return; // network error — leave state unchanged
      if (result.isPro) {
        dispatch({
          type: 'SET_SUBSCRIPTION',
          payload: {
            tier: result.tier === 'coach_pro' ? 'coach_pro' : 'fighter_pro',
            expiresAt: null,
            source: 'revenuecat',
          },
        });
      } else if (currentSource === 'revenuecat' || currentSource === 'revenuecat_server' || currentSource === 'none') {
        // RevenueCat confirmed no active entitlement. Only reset if the stored
        // subscription was from RevenueCat (not a Stripe web purchase or a comp
        // grant) so we don't accidentally revoke those opening the app on iOS.
        // The SDK sees the device's real StoreKit state, so it may also
        // downgrade a stale webhook-sourced ('revenuecat_server') grant.
        dispatch({
          type: 'SET_SUBSCRIPTION',
          payload: { tier: 'free', expiresAt: null, source: 'none' },
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Native: tie this device's RevenueCat subscriber to the signed-in Supabase
  // account (detach on sign-out). This is what makes App Store purchases
  // attributable server-side — webhook events start carrying the Supabase user
  // id. Upgrade-only on the client: logIn also returns the account's
  // entitlements, so a subscription bought on another device under this account
  // unlocks here immediately.
  useEffect(() => {
    if (authLoading) return;
    identifyNativeSubscriber(user?.id ?? null).then(result => {
      if (!result?.isPro) return;
      dispatch({
        type: 'SET_SUBSCRIPTION',
        payload: {
          tier: result.tier === 'coach_pro' ? 'coach_pro' : 'fighter_pro',
          expiresAt: null,
          source: 'revenuecat',
        },
      });
    });
  }, [authLoading, user?.id, dispatch]);

  // Comp ("complimentary") access: founder / internal-test accounts (see
  // isCompEmail) get lifetime Coach Pro tied to the signed-in email.
  useEffect(() => {
    if (authLoading) return;
    const { source, tier } = state.subscription;
    if (isCompEmail(user?.email)) {
      if (source !== 'comp' || tier !== 'coach_pro') {
        dispatch({ type: 'SET_SUBSCRIPTION', payload: COMP_SUBSCRIPTION });
      }
    } else if (source === 'comp') {
      dispatch({ type: 'SET_SUBSCRIPTION', payload: DEFAULT_SUBSCRIPTION });
    }
  }, [authLoading, user?.email, state.subscription, dispatch]);

  // Server-verified entitlement. Stripe and RevenueCat webhook tables are the
  // cross-platform source of truth; no client-synced state can authorize Pro.
  useEffect(() => {
    if (authLoading || !user?.id || isCompEmail(user.email)) return;
    let cancelled = false;
    fetchServerSubscription(user.id).then(server => {
      if (cancelled || !server) return; // null = no row / offline — leave as-is
      const cur = state.subscription;
      const serverSourced = cur.source === 'stripe_server' || cur.source === 'revenuecat_server';
      if (server.tier !== 'free') {
        if (cur.source !== server.source || cur.tier !== server.tier || cur.expiresAt !== server.expiresAt) {
          dispatch({ type: 'SET_SUBSCRIPTION', payload: server });
        }
      } else if (serverSourced) {
        dispatch({ type: 'SET_SUBSCRIPTION', payload: DEFAULT_SUBSCRIPTION });
      }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, user?.email]);

  // Coalesced, idle-scheduled persistence — see scheduleSaveState. The flush
  // handlers below are what make deferring safe: `hidden` covers backgrounding
  // the native app and switching tabs, `pagehide` covers navigation and tab
  // close (iOS Safari does not reliably fire `beforeunload`).
  useEffect(() => {
    scheduleSaveState(state);
  }, [state]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushSaveState();
    };
    const onPageHide = () => flushSaveState();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      // Unmounting the provider ends persistence for this tree; do not leave a
      // coalesced write stranded in the module.
      flushSaveState();
    };
  }, []);

  // Refresh gamification on boot (catches week rollover, streak expiry while app was closed)
  // and re-evaluate hourly so the streak at-risk warning updates while the app stays open.
  useEffect(() => {
    dispatch({ type: 'RECOMPUTE_GAMIFICATION' });
    const id = setInterval(() => dispatch({ type: 'RECOMPUTE_GAMIFICATION' }), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [dispatch]);

  // Keep the scheduled streak-at-risk push in step with the live streak.
  useEffect(() => {
    const streak = state.gamification?.streak;
    if (streak) void syncStreakRiskAlert(streak);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.gamification?.streak.lastWorkoutAt,
    state.gamification?.streak.current,
    state.gamification?.streak.expired,
  ]);

  // Arm the Sunday-evening Fight Ready recap with this week's real numbers.
  useEffect(() => {
    void syncWeeklyReport(computeWeekReportStats(state));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.workoutLogs, state.gamification?.streak.current]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
