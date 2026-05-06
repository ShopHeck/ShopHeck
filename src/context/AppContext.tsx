import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { AppState, FightCamp, FighterProfile, WorkoutLog, SparringLog, ConditioningTest, WeightEntry, GamePlan, NutritionLog, CoachNote, SubscriptionState, HRVEntry, FitbitConfig, FightResult, CampFactorWeights } from '../types';
import { processStripeReturn, saveSubscription, checkNativeSubscription } from '../utils/subscription';
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
} from '../utils/storage';
import { generateTrainingCamp } from '../utils/campGenerator';

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
  | { type: 'RESET' };

function reducer(state: AppState, action: Action): AppState {
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

    case 'RESET':
      return { ...loadState(), currentUser: null, activeCamp: null, camps: [], fighters: [], coaches: [] };

    default:
      return state;
  }
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
    const loaded = loadState();
    if (loaded.activeCamp) {
      return setSchedule(loaded, generateTrainingCamp(loaded.activeCamp, loaded.currentUser?.factorWeights));
    }
    return loaded;
  });

  // Process Stripe Payment Link return on web mount
  useEffect(() => {
    const sub = processStripeReturn();
    if (sub) dispatch({ type: 'SET_SUBSCRIPTION', payload: sub });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On native iOS: sync subscription status from RevenueCat on every launch
  useEffect(() => {
    checkNativeSubscription().then(isPro => {
      if (isPro) {
        dispatch({
          type: 'SET_SUBSCRIPTION',
          payload: { tier: 'fighter_pro', expiresAt: null, source: 'revenuecat' },
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveState(state);
  }, [state]);

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
