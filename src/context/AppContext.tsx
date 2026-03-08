import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { AppState, FightCamp, FighterProfile, WorkoutLog, SparringLog, ConditioningTest, WeightEntry } from '../types';
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
  deleteWeightEntry,
  updateProfile,
  deleteCamp,
  setSchedule,
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
  | { type: 'DELETE_WEIGHT'; payload: string }
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
      return { ...state, currentUser: profile, fighters };
    }

    case 'UPDATE_PROFILE':
      return updateProfile(state, action.payload);

    case 'CREATE_CAMP': {
      const camp = createCamp(action.payload);
      const schedule = generateTrainingCamp(camp);
      return setSchedule({ ...state, camps: [...state.camps, camp], activeCamp: camp }, schedule);
    }

    case 'UPDATE_CAMP': {
      const camps = state.camps.map(c => c.id === action.payload.id ? action.payload : c);
      const activeCamp = state.activeCamp?.id === action.payload.id ? action.payload : state.activeCamp;
      const schedule = activeCamp ? generateTrainingCamp(activeCamp) : state.trainingSchedule;
      return setSchedule({ ...state, camps, activeCamp }, schedule);
    }

    case 'DELETE_CAMP':
      return deleteCamp(state, action.payload);

    case 'SET_ACTIVE_CAMP': {
      const camp = state.camps.find(c => c.id === action.payload) || null;
      if (!camp) return state;
      const schedule = generateTrainingCamp(camp);
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

    case 'DELETE_WEIGHT':
      return deleteWeightEntry(state, action.payload);

    case 'RESET':
      return { ...loadState(), currentUser: null, activeCamp: null, camps: [], fighters: [] };

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
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

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
