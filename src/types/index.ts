export type WeightClass =
  | 'Strawweight'
  | 'Flyweight'
  | 'Bantamweight'
  | 'Featherweight'
  | 'Lightweight'
  | 'Welterweight'
  | 'Middleweight'
  | 'Light Heavyweight'
  | 'Heavyweight'
  | 'Super Heavyweight';

export type ExperienceLevel = 'Beginner' | 'Amateur' | 'Semi-Pro' | 'Professional';
export type Sport = 'Boxing' | 'MMA' | 'Muay Thai' | 'Kickboxing' | 'Wrestling' | 'BJJ';
export type UserRole = 'fighter' | 'coach';

export interface FightCamp {
  id: string;
  fightDate: string;
  opponent?: string;
  weightClass: WeightClass;
  currentWeight: number;
  targetWeight: number;
  rounds: number;
  roundDuration: number;
  sport: Sport;
  experienceLevel: ExperienceLevel;
  campWeeks: number;
  startDate: string;
  createdAt: string;
}

export interface TrainingWeek {
  weekNumber: number;
  startDate: string;
  endDate: string;
  phase: 'Base Building' | 'Strength & Conditioning' | 'Fight Specific' | 'Peak' | 'Taper';
  focus: string;
  intensity: 'Low' | 'Medium' | 'High' | 'Very High';
  days: TrainingDay[];
  weeklyGoals: string[];
}

export type SessionType = 'conditioning' | 'skill' | 'sparring' | 'strength' | 'recovery' | 'rest';

export interface TrainingSession {
  type: SessionType;
  title: string;
  duration: number;
  description: string;
  notes?: string;
}

export interface TrainingDay {
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  label: string;
  sessions: TrainingSession[];
  isRestDay: boolean;
}

export interface WorkoutLog {
  id: string;
  campId: string;
  date: string;
  weekNumber: number;
  dayLabel: string;
  sessionType: SessionType;
  title: string;
  duration: number;
  rpe: number; // Rate of Perceived Exertion 1-10
  notes: string;
  completed: boolean;
  createdAt: string;
}

export interface SparringLog {
  id: string;
  campId: string;
  date: string;
  weekNumber: number;
  rounds: number;
  roundDuration: number;
  partnerName: string;
  partnerLevel: string;
  focus: string;
  performance: 1 | 2 | 3 | 4 | 5;
  notes: string;
  createdAt: string;
}

export interface ConditioningTest {
  id: string;
  campId: string;
  date: string;
  weekNumber: number;
  testType: string;
  value: number;
  unit: string;
  notes: string;
  createdAt: string;
}

export interface WeightEntry {
  id: string;
  campId: string;
  date: string;
  weight: number;
  notes: string;
  createdAt: string;
}

export interface FighterProfile {
  id: string;
  name: string;
  age: number;
  sport: Sport;
  weightClass: WeightClass;
  experienceLevel: ExperienceLevel;
  role: UserRole;
  gym?: string;
  record?: string;
  avatar?: string;
  createdAt: string;
}

export interface AppState {
  currentUser: FighterProfile | null;
  activeCamp: FightCamp | null;
  camps: FightCamp[];
  trainingSchedule: TrainingWeek[];
  workoutLogs: WorkoutLog[];
  sparringLogs: SparringLog[];
  conditioningTests: ConditioningTest[];
  weightEntries: WeightEntry[];
  fighters: FighterProfile[];
}
