export type OffSeasonGoal = 'base-building' | 'strength' | 'maintain' | 'recovery';

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
export type Sport = 'Boxing' | 'MMA' | 'Muay Thai' | 'Kickboxing' | 'Wrestling' | 'BJJ' | 'Bare Knuckle';
export type UserRole = 'fighter' | 'coach';

export interface FightCamp {
  id: string;
  /** Undefined for off-season plans */
  fightDate?: string;
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
  /** True when this is an off-season training plan with no fight date */
  isOffSeason?: boolean;
  offSeasonGoal?: OffSeasonGoal;
}

export interface TrainingWeek {
  weekNumber: number;
  startDate: string;
  endDate: string;
  phase: 'Base Building' | 'Strength & Conditioning' | 'Fight Specific' | 'Peak' | 'Taper'
       | 'Foundation' | 'Development' | 'Performance' | 'Active Recovery';
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
  mep?: number; // MyZone Effort Points earned during session
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

export interface MacroEntry {
  calories: number;
  protein: number; // grams
  carbs: number;   // grams
  fat: number;     // grams
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
  coachId?: string; // fighter links to their coach's profile id
  createdAt: string;
  macroTargets?: MacroEntry;
  maxHR?: number;   // override for 220-age estimate
  mepTarget?: number; // daily MyZone Effort Points target
}

export type CoachNoteCategory = 'technique' | 'conditioning' | 'mental' | 'nutrition' | 'general';

export interface CoachNote {
  id: string;
  coachId: string;
  coachName: string;
  fighterId: string;
  campId: string;
  category: CoachNoteCategory;
  content: string;
  createdAt: string;
}

export interface GamePlan {
  campId: string;
  opponentName?: string;
  opponentStance?: 'Orthodox' | 'Southpaw' | 'Switch';
  opponentHeight?: string;
  opponentReach?: string;
  styleNotes: string;
  earlyRoundPlan: string;
  midRoundPlan: string;
  lateRoundPlan: string;
  keyTechniques: string;
  thingsToAvoid: string;
  cornerInstructions: string;
  updatedAt: string;
}

export interface NutritionLog {
  id: string;
  campId: string;
  date: string; // YYYY-MM-DD
  waterOz: number;
  mealRatings: {
    breakfast?: 'good' | 'ok' | 'poor';
    lunch?: 'good' | 'ok' | 'poor';
    dinner?: 'good' | 'ok' | 'poor';
  };
  notes: string;
  createdAt: string;
  macros?: MacroEntry;
}

// ─── Fitness Tracker / HRV ───────────────────────────────────────────────

export type HRVSource = 'bluetooth' | 'apple_health' | 'fitbit' | 'garmin' | 'whoop' | 'polar_flow' | 'manual';

export interface HRVEntry {
  id: string;
  campId: string;
  date: string; // YYYY-MM-DD
  rmssd: number; // ms — the gold-standard HRV metric
  restingHR?: number; // bpm
  source: HRVSource;
  notes?: string;
  createdAt: string;
}

export interface FitbitConfig {
  clientId: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string; // ISO
  userId?: string;
  lastSync?: string; // ISO
}

// ─── Subscription ────────────────────────────────────────────────────────

export type SubscriptionTier = 'free' | 'fighter_pro' | 'coach_pro';

export interface SubscriptionState {
  tier: SubscriptionTier;
  /** ISO date string when the sub expires; null = free forever */
  expiresAt: string | null;
  source: 'none' | 'stripe_payment_link' | 'stripe_jwt';
}

// ─── Timer ───────────────────────────────────────────────────────────────

export interface CustomTimerPreset {
  id: string;
  label: string;
  rounds: number;
  workSec: number;
  restSec: number;
  createdAt: string;
}

// ─── App State ────────────────────────────────────────────────────────────

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
  coaches: FighterProfile[];
  /** Key: `${campId}-${weekNum}-${dayOfWeek}-${sessionIndex}` */
  completedSessions: Record<string, boolean>;
  /** Key: `${campId}-${weekNum}-${dayOfWeek}` — true = user marked day as rest */
  dayOverrides: Record<string, boolean>;
  /** Key: campId */
  gamePlans: Record<string, GamePlan>;
  nutritionLogs: NutritionLog[];
  coachNotes: CoachNote[];
  subscription: SubscriptionState;
  hrvEntries: HRVEntry[];
  fitbitConfig?: FitbitConfig;
}
