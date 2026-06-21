import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { AppState, FightCamp, FighterProfile, WorkoutLog, SparringLog, ConditioningTest, WeightEntry, GamePlan, NutritionLog, CoachNote, SubscriptionState, HRVEntry, FitbitConfig, FightResult, CampFactorWeights, DashboardPrefs } from '../types';
import { processStripeReturn, saveSubscription, checkNativeSubscription, isCompEmail, COMP_SUBSCRIPTION, DEFAULT_SUBSCRIPTION } from '../utils/subscription';
import {
  loadState,
  saveState,
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
import { applyGamificationUpdates, dismissCelebration, defaultGamificationState } from '../utils/gamification';
import { useAuth } from './AuthContext';
import { fetchServerSubscription } from '../lib/sync';
import { seedDemoState } from '../utils/demoSeed';

type Action =
  | { type: 'SET_STATE'; payload: AppState }
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

    case 'DELETE_CAMP':
      return deleteCamp(state, action.payload);

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

    case 'SET_SUBSCRIPTION': {
      saveSubscription(action.payload);
      return { ...state, subscription: action.payload };
    }

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
      return {
        ...loadState(),
        currentUser: null,
        activeCamp: null,
        camps: [],
        fighters: [],
        coaches: [],
        gamification: defaultGamificationState(),
      };

    default:
      return state;
  }
}

function reducer(state: AppState, action: Action): AppState {
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
  const [state, dispatch] = useReducer(reducer, undefined, () => {
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

  const { user, loading: authLoading } = useAuth();

  // Process Stripe Payment Link return on web mount
  useEffect(() => {
    const sub = processStripeReturn();
    if (sub) dispatch({ type: 'SET_SUBSCRIPTION', payload: sub });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      } else if (currentSource === 'revenuecat' || currentSource === 'none') {
        // RevenueCat confirmed no active entitlement. Only reset if the stored
        // subscription was from RevenueCat (not a Stripe web purchase or a comp
        // grant) so we don't accidentally revoke those opening the app on iOS.
        dispatch({
          type: 'SET_SUBSCRIPTION',
          payload: { tier: 'free', expiresAt: null, source: 'none' },
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Comp ("complimentary") access: founder / internal-test accounts (see
  // isCompEmail) get lifetime Coach Pro tied to the signed-in email. This follows
  // the account across devices/reinstalls and outranks the RevenueCat sync above,
  // so testers reach every Pro feature without a real purchase. Reverts to free
  // when a comp account signs out. Wait for the initial session restore
  // (authLoading) before reconciling so we don't transiently revoke on reload.
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
  }, [authLoading, user?.email, state.subscription]);

  // Server-verified Stripe entitlement (web). Once the Stripe webhook records a
  // subscription in Supabase, that row — not the client-side soft unlock — is the
  // source of truth. After sign-in we fetch it and apply it. We only *downgrade*
  // a subscription that was itself server-verified, so we never clobber the
  // optimistic soft unlock from a checkout return before the webhook lands, nor a
  // comp / RevenueCat grant. Comp accounts are skipped entirely (comp wins).
  useEffect(() => {
    if (authLoading || !user?.id || isCompEmail(user.email)) return;
    let cancelled = false;
    fetchServerSubscription(user.id).then(server => {
      if (cancelled || !server) return; // null = no row / offline — leave as-is
      const cur = state.subscription;
      if (server.tier !== 'free') {
        if (cur.source !== 'stripe_server' || cur.tier !== server.tier || cur.expiresAt !== server.expiresAt) {
          dispatch({ type: 'SET_SUBSCRIPTION', payload: server });
        }
      } else if (cur.source === 'stripe_server') {
        dispatch({ type: 'SET_SUBSCRIPTION', payload: DEFAULT_SUBSCRIPTION });
      }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, user?.email]);

  useEffect(() => {
    saveState(state);
  }, [state]);

  // Refresh gamification on boot (catches week rollover, streak expiry while app was closed)
  // and re-evaluate hourly so the streak at-risk warning updates while the app stays open.
  useEffect(() => {
    dispatch({ type: 'RECOMPUTE_GAMIFICATION' });
    const id = setInterval(() => dispatch({ type: 'RECOMPUTE_GAMIFICATION' }), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

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
