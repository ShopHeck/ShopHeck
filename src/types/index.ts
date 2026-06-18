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
  /** Learned weights applied to the NEXT camp's generator + readiness scoring. */
  factorWeights?: CampFactorWeights;
}

// ─── Post-Fight Results & Breakdown ──────────────────────────────────────

export type FightOutcome = 'win' | 'loss' | 'draw' | 'no-contest';

export type FightMethod =
  | 'KO'
  | 'TKO'
  | 'Submission'
  | 'Unanimous Decision'
  | 'Split Decision'
  | 'Majority Decision'
  | 'DQ'
  | 'Technical Decision';

export type DamageLevel = 'none' | 'light' | 'moderate' | 'heavy';

export interface FightRound {
  roundNumber: number;
  /** Self-assessed performance in this round (1 = bad, 5 = dominant) */
  selfScore: 1 | 2 | 3 | 4 | 5;
  /** Pressure felt from opponent (1 = none, 5 = overwhelming) */
  opponentPressure: 1 | 2 | 3 | 4 | 5;
  /** Cardio felt in the round (1 = gassed, 5 = felt strong) */
  cardio: 1 | 2 | 3 | 4 | 5;
  damageDealt: DamageLevel;
  damageTaken: DamageLevel;
  workedWell: string;
  didntWork: string;
  cornerAdjustment?: string;
}

export interface FightResult {
  id: string;
  campId: string;
  fighterId: string;
  fightDate: string;
  opponent: string;
  outcome: FightOutcome;
  method: FightMethod;
  /** 1-indexed. Undefined means went the distance. */
  roundStopped?: number;
  totalRounds: number;
  rounds: FightRound[];
  weighInWeight?: number;
  fightNightWeight?: number;
  /** 1–5. How closely did the fighter stick to the camp gameplan? */
  stylePlanFollowed: 1 | 2 | 3 | 4 | 5;
  overallNotes: string;
  lessons: string;
  /** Snapshot of readiness score the day before the fight, so it can't drift. */
  readinessAtFight?: number;
  createdAt: string;
}

/** Per-fighter overrides that feed campGenerator + readiness for the next camp. */
export interface CampFactorWeights {
  weightCut: number;       // default 20
  trainingVolume: number;  // default 25
  sessionQuality: number;  // default 15
  sparring: number;        // default 20
  conditioning: number;    // default 10
  nutrition: number;       // default 10
  /** Override to bias peak-phase sparring rounds. */
  sparringRoundsTarget?: number;
  conditioningFocus?: 'anaerobic' | 'aerobic' | 'mixed';
  strengthEmphasis?: 'low' | 'normal' | 'high';
  updatedAt: string;
  derivedFromFightId: string;
}

/** Default weights for the six scored factors. Sum = 100. */
export const DEFAULT_FACTOR_WEIGHTS = {
  weightCut: 20,
  trainingVolume: 25,
  sessionQuality: 15,
  sparring: 20,
  conditioning: 10,
  nutrition: 10,
} as const satisfies Record<'weightCut' | 'trainingVolume' | 'sessionQuality' | 'sparring' | 'conditioning' | 'nutrition', number>;

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
  source: 'none' | 'stripe_payment_link' | 'stripe_jwt' | 'revenuecat' | 'comp';
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

// ─── Gamification ─────────────────────────────────────────────────────────

export type BeltTier = 'white' | 'blue' | 'purple' | 'brown' | 'black';

export interface BeltProgress {
  current: BeltTier;
  workoutCount: number;
  /** wins + 0.5 * camps completed without a logged win */
  effectiveWinCredit: number;
  nextTier: BeltTier | null;
  /** 0-100 progress toward the next belt (whichever path is closer). */
  progressPct: number;
  workoutsToNext: number | null;
  winsToNext: number | null;
  /** ISO timestamp the user first crossed each tier. Preserved on downgrade. */
  achievedAt: Partial<Record<BeltTier, string>>;
}

export interface StreakState {
  current: number;
  best: number;
  /** YYYY-MM-DD of the most recent workout. */
  lastWorkoutDate: string | null;
  /** Full ISO datetime of the most recent workout. Drives the 48h rule. */
  lastWorkoutAt: string | null;
  /** True when 24h ≤ hoursSinceLast ≤ 48h — streak is about to expire. */
  atRisk: boolean;
  /** True when last workout was more than 48h ago. */
  expired: boolean;
}

export interface Achievement {
  id: string;
  unlockedAt: string;
}

export type ChallengeMetric =
  | 'workouts'
  | 'sparring_sessions'
  | 'weekly_mep'
  | 'workout_minutes'
  | 'high_rpe_sessions';

export interface WeeklyChallenge {
  id: string;
  /** ISO date of the Monday of the week this challenge belongs to. */
  weekKey: string;
  templateId: string;
  title: string;
  metric: ChallengeMetric;
  target: number;
  progress: number;
  completed: boolean;
  xpReward: number;
}

export type PRType =
  | 'longest_workout'
  | 'highest_weekly_mep'
  | 'most_workouts_week'
  | 'highest_rpe';

export interface PersonalRecord {
  type: PRType;
  value: number;
  achievedAt: string;
  previousValue: number | null;
  sourceLogId?: string;
}

export type CelebrationKind =
  | 'belt'
  | 'achievement'
  | 'pr'
  | 'streak_milestone'
  | 'challenge_complete';

export interface CelebrationEvent {
  id: string;
  kind: CelebrationKind;
  /** Display title for the toast. */
  title: string;
  /** Subtitle / description. */
  subtitle: string;
  /** Lucide icon name. */
  icon: string;
  ts: string;
}

export interface DashboardPrefs {
  progressWidgetCollapsed: boolean;
  progressWidgetHidden: boolean;
}

export interface GamificationState {
  belt: BeltProgress;
  streak: StreakState;
  achievements: Achievement[];
  challenges: WeeklyChallenge[];
  personalRecords: Partial<Record<PRType, PersonalRecord>>;
  totalXp: number;
  pendingCelebrations: CelebrationEvent[];
  lastEvaluatedAt: string | null;
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
  fightResults: FightResult[];
  gamification?: GamificationState;
  dashboardPrefs?: DashboardPrefs;
}
