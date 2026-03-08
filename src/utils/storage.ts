import type { AppState, FightCamp, FighterProfile, WorkoutLog, SparringLog, ConditioningTest, WeightEntry, TrainingWeek } from '../types';

const STORAGE_KEY = 'fightcamp_app';

export const defaultState: AppState = {
  currentUser: null,
  activeCamp: null,
  camps: [],
  trainingSchedule: [],
  workoutLogs: [],
  sparringLogs: [],
  conditioningTests: [],
  weightEntries: [],
  fighters: [],
  completedSessions: {},
};

export function toggleSessionComplete(state: AppState, key: string): AppState {
  return {
    ...state,
    completedSessions: {
      ...state.completedSessions,
      [key]: !state.completedSessions[key],
    },
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    return { ...defaultState, ...JSON.parse(raw) };
  } catch {
    return defaultState;
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    console.error('Failed to save state');
  }
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createProfile(profile: Omit<FighterProfile, 'id' | 'createdAt'>): FighterProfile {
  return {
    ...profile,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
}

export function createCamp(camp: Omit<FightCamp, 'id' | 'createdAt'>): FightCamp {
  return {
    ...camp,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
}

export function addWorkoutLog(state: AppState, log: Omit<WorkoutLog, 'id' | 'createdAt'>): AppState {
  const newLog: WorkoutLog = { ...log, id: generateId(), createdAt: new Date().toISOString() };
  return { ...state, workoutLogs: [newLog, ...state.workoutLogs] };
}

export function addSparringLog(state: AppState, log: Omit<SparringLog, 'id' | 'createdAt'>): AppState {
  const newLog: SparringLog = { ...log, id: generateId(), createdAt: new Date().toISOString() };
  return { ...state, sparringLogs: [newLog, ...state.sparringLogs] };
}

export function addConditioningTest(state: AppState, test: Omit<ConditioningTest, 'id' | 'createdAt'>): AppState {
  const newTest: ConditioningTest = { ...test, id: generateId(), createdAt: new Date().toISOString() };
  return { ...state, conditioningTests: [newTest, ...state.conditioningTests] };
}

export function addWeightEntry(state: AppState, entry: Omit<WeightEntry, 'id' | 'createdAt'>): AppState {
  const newEntry: WeightEntry = { ...entry, id: generateId(), createdAt: new Date().toISOString() };
  return { ...state, weightEntries: [newEntry, ...state.weightEntries] };
}

export function deleteWorkoutLog(state: AppState, id: string): AppState {
  return { ...state, workoutLogs: state.workoutLogs.filter(l => l.id !== id) };
}

export function deleteSparringLog(state: AppState, id: string): AppState {
  return { ...state, sparringLogs: state.sparringLogs.filter(l => l.id !== id) };
}

export function deleteWeightEntry(state: AppState, id: string): AppState {
  return { ...state, weightEntries: state.weightEntries.filter(e => e.id !== id) };
}

export function updateProfile(state: AppState, profile: FighterProfile): AppState {
  const fighters = state.fighters.map(f => f.id === profile.id ? profile : f);
  const currentUser = state.currentUser?.id === profile.id ? profile : state.currentUser;
  return { ...state, fighters, currentUser };
}

export function deleteCamp(state: AppState, campId: string): AppState {
  const camps = state.camps.filter(c => c.id !== campId);
  const activeCamp = state.activeCamp?.id === campId
    ? (camps[camps.length - 1] ?? null)
    : state.activeCamp;
  // Cascade: remove all logs associated with deleted camp
  return {
    ...state,
    camps,
    activeCamp,
    workoutLogs: state.workoutLogs.filter(l => l.campId !== campId),
    sparringLogs: state.sparringLogs.filter(l => l.campId !== campId),
    conditioningTests: state.conditioningTests.filter(t => t.campId !== campId),
    weightEntries: state.weightEntries.filter(e => e.campId !== campId),
  };
}

export function setSchedule(state: AppState, schedule: TrainingWeek[]): AppState {
  return { ...state, trainingSchedule: schedule };
}
