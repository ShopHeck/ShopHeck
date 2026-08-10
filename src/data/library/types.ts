/**
 * The training library's shape.
 *
 * Two libraries share one base so search, filters, favorites, session queueing
 * and result logging are written once — but a bench press and a guard-retention
 * drill carry genuinely different fields, so they diverge on `kind`:
 *
 *   - `exercise`  — strength, conditioning and mobility
 *   - `technique` — martial-arts techniques and drills
 *
 * The old flat schema stored prescriptions as free text (`setsReps`). Here they
 * are structured (see `Prescription`), so the app can scale them, prefill a
 * session, and compare planned against completed work. `formatPrescription`
 * renders the same human-readable string the cards used to show.
 */

export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';

/** Where in a camp an item earns its place. `[]` = any phase. */
export type CampPhase =
  | 'base'
  | 'build'
  | 'fight-specific'
  | 'peak'
  | 'taper'
  | 'off-season'
  | 'recovery';

/** What slot the item fills inside a single session. */
export type SessionRole =
  | 'warmup'
  | 'primary'
  | 'accessory'
  | 'finisher'
  | 'technical'
  | 'cooldown'
  | 'recovery';

export type EnergySystem = 'alactic' | 'glycolytic' | 'aerobic' | 'mixed';

export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'horizontal-push'
  | 'vertical-push'
  | 'horizontal-pull'
  | 'vertical-pull'
  | 'carry'
  | 'rotation'
  | 'anti-rotation'
  | 'locomotion'
  | 'jump'
  | 'throw'
  | 'mobility';

export type Adaptation =
  | 'max-strength'
  | 'power'
  | 'hypertrophy'
  | 'strength-endurance'
  | 'aerobic-base'
  | 'anaerobic-capacity'
  | 'work-capacity'
  | 'mobility'
  | 'stability';

export type SpaceRequirement =
  | 'anywhere'
  | 'gym-floor'
  | 'rack'
  | 'mat'
  | 'bag-area'
  | 'ring-cage'
  | 'outdoor';

/** What can actually be measured on this item once it's done. */
export type TrackableMetric =
  | 'load'
  | 'reps'
  | 'sets'
  | 'distance'
  | 'pace'
  | 'time'
  | 'power'
  | 'heart-rate'
  | 'rounds'
  | 'rpe'
  | 'technical-quality'
  | 'range-of-motion';

/**
 * A structured, adjustable training prescription.
 *
 * Every field is optional because a mobility hold, a 400 m repeat and a 4×5
 * back squat describe themselves with different subsets. `scheme` is the escape
 * hatch for genuinely non-tabular prescriptions (ladders, contrast sets) — it
 * is rendered verbatim rather than parsed.
 */
export interface Prescription {
  sets?: number;
  /** Upper bound when the prescription is a range: `sets`–`setsMax`. */
  setsMax?: number;
  reps?: number;
  repsMax?: number;
  /** True when sets/reps are counted per limb or per side. */
  perSide?: boolean;
  rounds?: number;
  /** Work duration of a single set/round, in seconds. */
  workSeconds?: number;
  restSeconds?: number;
  distanceMeters?: number;
  distanceMetersMax?: number;
  /** Eccentric-pause-concentric-pause, e.g. '3-1-1-0'. */
  tempo?: string;
  loadType?: 'bodyweight' | 'percent-1rm' | 'absolute' | 'band' | 'sled' | 'implement' | 'none';
  /** Human-readable load target, e.g. '80–85% 1RM'. */
  load?: string;
  rpe?: number;
  rpeMax?: number;
  /** Reps in reserve. */
  rir?: number;
  /** Free-form scheme for prescriptions the structured fields can't carry. */
  scheme?: string;
}

/**
 * Demonstration media. Every field is optional and nothing here is uploaded by
 * the app — these describe content that already exists at a URL. The card
 * renders whatever is present and stays silent about the rest.
 */
export interface MediaRef {
  videoUrl?: string;
  thumbnailUrl?: string;
  /** WebVTT track URL. */
  captionsUrl?: string;
  transcript?: string;
  /** Camera angles the demo is shot from, e.g. ['front', 'side']. */
  angles?: string[];
  /** Chapter markers into `videoUrl`, in seconds. */
  chapters?: { label: string; seconds: number }[];
}

/** Provenance, so a coach can tell reviewed content from a first draft. */
export interface ContentSource {
  author: string;
  reviewedBy?: string;
  version: string;
  /** YYYY-MM-DD */
  reviewedAt: string;
}

export interface LibraryItemBase {
  id: string;
  name: string;
  difficulty: Difficulty;
  /** `[]` = bodyweight / no equipment. */
  equipment: string[];
  space: SpaceRequirement;
  /** `[]` = suits any phase. */
  campPhases: CampPhase[];
  sessionRoles: SessionRole[];
  prescription: Prescription;
  metrics: TrackableMetric[];
  instructions: string;
  /** Short imperative coaching cues. */
  cues: string[];
  commonMistakes: string[];
  /** What to do before the first working set. */
  warmup?: string;
  /** Named prerequisites — capacities or techniques, not ids. */
  prerequisites: string[];
  progressions: string[];
  regressions: string[];
  substitutions: string[];
  /** Injuries or conditions that rule the item out, or demand a regression. */
  contraindications: string[];
  tips?: string;
  media?: MediaRef;
  source: ContentSource;
}

// ─── Strength / conditioning / mobility ──────────────────────────────────────

export type ExerciseCategory = 'strength' | 'conditioning' | 'mobility';

export interface StrengthExercise extends LibraryItemBase {
  kind: 'exercise';
  category: ExerciseCategory;
  movementPatterns: MovementPattern[];
  adaptation: Adaptation;
  energySystem: EnergySystem;
  muscleGroups: string[];
  /** `[]` = every sport. */
  sports: string[];
}

// ─── Martial-arts techniques and drills ──────────────────────────────────────

export type Discipline =
  | 'Boxing'
  | 'MMA'
  | 'Muay Thai'
  | 'Kickboxing'
  | 'Wrestling'
  | 'BJJ'
  | 'Bare Knuckle';

export type Ruleset =
  | 'unified-mma'
  | 'boxing'
  | 'muay-thai'
  | 'kickboxing'
  | 'ibjjf'
  | 'adcc'
  | 'folkstyle'
  | 'freestyle'
  | 'bare-knuckle';

export type Stance = 'orthodox' | 'southpaw' | 'either' | 'square';

export type FightRange =
  | 'kicking'
  | 'punching'
  | 'clinch'
  | 'takedown'
  | 'ground-top'
  | 'ground-bottom'
  | 'scramble'
  | 'cage-wall';

export type TechniqueIntent =
  | 'attack'
  | 'defense'
  | 'counter'
  | 'escape'
  | 'transition'
  | 'combination'
  | 'control'
  | 'submission'
  | 'sweep';

export type GripContext = 'gi' | 'no-gi' | 'both' | 'n/a';

export type DrillFormat =
  | 'solo'
  | 'partner'
  | 'pad'
  | 'bag'
  | 'wall'
  | 'cage'
  | 'positional'
  | 'live-resistance';

/** What the opponent tends to do, and the answer to it. */
export interface TechniqueReaction {
  reaction: string;
  answer: string;
}

export interface Technique extends LibraryItemBase {
  kind: 'technique';
  disciplines: Discipline[];
  rulesets: Ruleset[];
  stance: Stance;
  range: FightRange;
  /** Named position when one applies, e.g. 'Closed guard'. */
  position?: string;
  intents: TechniqueIntent[];
  grip: GripContext;
  /** Where the technique is restricted or banned. */
  legalityNotes?: string;
  formats: DrillFormat[];
  /** Rules that shape the drill — the constraint IS the coaching. */
  drillConstraints: string[];
  /** How you know the rep was good, not just finished. */
  successCriteria: string[];
  commonReactions: TechniqueReaction[];
  /** Ids of techniques this one chains into or off. */
  linkedTechniques: string[];
  focusTags: string[];
  /**
   * Base spaced-review interval in days. A technique drilled less recently than
   * this is surfaced as due for review.
   */
  reviewIntervalDays: number;
}

export type LibraryItem = StrengthExercise | Technique;

// ─── Display labels ──────────────────────────────────────────────────────────

export const EXERCISE_CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  strength: 'Strength',
  conditioning: 'Conditioning',
  mobility: 'Mobility',
};

export const ADAPTATION_LABELS: Record<Adaptation, string> = {
  'max-strength': 'Max strength',
  power: 'Power',
  hypertrophy: 'Hypertrophy',
  'strength-endurance': 'Strength endurance',
  'aerobic-base': 'Aerobic base',
  'anaerobic-capacity': 'Anaerobic capacity',
  'work-capacity': 'Work capacity',
  mobility: 'Mobility',
  stability: 'Stability',
};

export const ENERGY_SYSTEM_LABELS: Record<EnergySystem, string> = {
  alactic: 'Alactic',
  glycolytic: 'Glycolytic',
  aerobic: 'Aerobic',
  mixed: 'Mixed',
};

export const MOVEMENT_PATTERN_LABELS: Record<MovementPattern, string> = {
  squat: 'Squat',
  hinge: 'Hinge',
  lunge: 'Lunge',
  'horizontal-push': 'Horizontal push',
  'vertical-push': 'Vertical push',
  'horizontal-pull': 'Horizontal pull',
  'vertical-pull': 'Vertical pull',
  carry: 'Carry',
  rotation: 'Rotation',
  'anti-rotation': 'Anti-rotation',
  locomotion: 'Locomotion',
  jump: 'Jump',
  throw: 'Throw',
  mobility: 'Mobility',
};

export const CAMP_PHASE_LABELS: Record<CampPhase, string> = {
  base: 'Base',
  build: 'Build',
  'fight-specific': 'Fight specific',
  peak: 'Peak',
  taper: 'Taper',
  'off-season': 'Off season',
  recovery: 'Recovery',
};

export const SESSION_ROLE_LABELS: Record<SessionRole, string> = {
  warmup: 'Warm-up',
  primary: 'Primary',
  accessory: 'Accessory',
  finisher: 'Finisher',
  technical: 'Technical',
  cooldown: 'Cool-down',
  recovery: 'Recovery',
};

export const SPACE_LABELS: Record<SpaceRequirement, string> = {
  anywhere: 'Anywhere',
  'gym-floor': 'Gym floor',
  rack: 'Squat rack',
  mat: 'Mats',
  'bag-area': 'Bag area',
  'ring-cage': 'Ring or cage',
  outdoor: 'Outdoor / track',
};

export const METRIC_LABELS: Record<TrackableMetric, string> = {
  load: 'Load',
  reps: 'Reps',
  sets: 'Sets',
  distance: 'Distance',
  pace: 'Pace',
  time: 'Time',
  power: 'Power',
  'heart-rate': 'Heart rate',
  rounds: 'Rounds',
  rpe: 'RPE',
  'technical-quality': 'Technical quality',
  'range-of-motion': 'Range of motion',
};

export const RANGE_LABELS: Record<FightRange, string> = {
  kicking: 'Kicking range',
  punching: 'Punching range',
  clinch: 'Clinch',
  takedown: 'Takedown',
  'ground-top': 'Ground — top',
  'ground-bottom': 'Ground — bottom',
  scramble: 'Scramble',
  'cage-wall': 'Cage / wall',
};

export const INTENT_LABELS: Record<TechniqueIntent, string> = {
  attack: 'Attack',
  defense: 'Defense',
  counter: 'Counter',
  escape: 'Escape',
  transition: 'Transition',
  combination: 'Combination',
  control: 'Control',
  submission: 'Submission',
  sweep: 'Sweep',
};

export const FORMAT_LABELS: Record<DrillFormat, string> = {
  solo: 'Solo',
  partner: 'Partner',
  pad: 'Pads',
  bag: 'Bag',
  wall: 'Wall',
  cage: 'Cage',
  positional: 'Positional',
  'live-resistance': 'Live resistance',
};

export const RULESET_LABELS: Record<Ruleset, string> = {
  'unified-mma': 'Unified MMA',
  boxing: 'Boxing',
  'muay-thai': 'Muay Thai',
  kickboxing: 'Kickboxing',
  ibjjf: 'IBJJF',
  adcc: 'ADCC',
  folkstyle: 'Folkstyle',
  freestyle: 'Freestyle',
  'bare-knuckle': 'Bare knuckle',
};

export const STANCE_LABELS: Record<Stance, string> = {
  orthodox: 'Orthodox',
  southpaw: 'Southpaw',
  either: 'Either stance',
  square: 'Square',
};

export const GRIP_LABELS: Record<GripContext, string> = {
  gi: 'Gi',
  'no-gi': 'No-gi',
  both: 'Gi & no-gi',
  'n/a': '—',
};

// ─── Prescription formatting ─────────────────────────────────────────────────

/** `90` → `'1:30'`, `45` → `'45 s'`, `180` → `'3:00'`. */
export function formatSeconds(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}:00` : `${m}:${String(s).padStart(2, '0')}`;
}

function range(lo: number | undefined, hi: number | undefined): string | null {
  if (lo === undefined) return null;
  return hi !== undefined && hi !== lo ? `${lo}–${hi}` : `${lo}`;
}

/**
 * Renders a prescription as the one-line string the library cards show.
 *
 * Shape: `sets × amount [per side] [@ load] [tempo] · rest X · RPE Y`, where
 * `amount` is reps, a distance, or a duration — whichever the item uses.
 */
export function formatPrescription(p: Prescription): string {
  const parts: string[] = [];

  const sets = range(p.sets, p.setsMax);
  const reps = range(p.reps, p.repsMax);
  const distance = range(p.distanceMeters, p.distanceMetersMax);

  // The unit of work inside one set: reps, distance, or a clock. A scheme
  // stands in when the item has none of those ("10 s contract / 30 s relax"),
  // so `3 × <scheme>` still reads correctly.
  let amount: string | null = null;
  if (reps) amount = `${reps} rep${reps === '1' ? '' : 's'}`;
  else if (distance) amount = `${distance} m`;
  else if (p.workSeconds !== undefined) amount = formatSeconds(p.workSeconds);

  let schemeIsAmount = false;
  if (!amount && p.scheme) {
    amount = p.scheme;
    schemeIsAmount = true;
  }

  // Rounds with a work/rest clock read as intervals, not as sets.
  if (p.rounds !== undefined && p.workSeconds !== undefined) {
    const on = `${p.rounds} × ${formatSeconds(p.workSeconds)} on`;
    parts.push(p.restSeconds !== undefined ? `${on} / ${formatSeconds(p.restSeconds)} off` : on);
  } else if (sets && amount) {
    parts.push(`${sets} × ${amount}`);
  } else if (p.rounds !== undefined) {
    parts.push(`${p.rounds} round${p.rounds === 1 ? '' : 's'}`);
  } else if (amount) {
    parts.push(amount);
  }

  if (p.perSide && parts.length > 0) parts[parts.length - 1] += ' per side';
  if (p.scheme && !schemeIsAmount) parts.push(p.scheme);
  if (p.load) parts.push(`@ ${p.load}`);
  if (p.tempo) parts.push(`tempo ${p.tempo}`);

  const trail: string[] = [];
  // Interval rest is already in the "on / off" phrase above.
  const restShown = p.rounds !== undefined && p.workSeconds !== undefined;
  if (p.restSeconds !== undefined && !restShown) trail.push(`rest ${formatSeconds(p.restSeconds)}`);
  const rpe = range(p.rpe, p.rpeMax);
  if (rpe) trail.push(`RPE ${rpe}`);
  if (p.rir !== undefined) trail.push(`${p.rir} RIR`);

  const head = parts.join(' ');
  return trail.length > 0 ? `${head} · ${trail.join(' · ')}` : head;
}

/**
 * Rough minutes an item costs in a session — used to total the session queue.
 * Deliberately approximate: it exists so a queue of six items doesn't claim to
 * be an unknown length, not to plan to the second.
 */
export function estimateMinutes(p: Prescription): number {
  const rest = p.restSeconds ?? 45;

  if (p.rounds !== undefined && p.workSeconds !== undefined) {
    return Math.max(1, Math.round((p.rounds * (p.workSeconds + rest)) / 60));
  }

  const sets = p.setsMax ?? p.sets ?? p.rounds ?? 3;
  // Time under tension per set: an explicit clock, a distance at ~3 m/s, or
  // ~4 s per rep.
  const work = p.workSeconds
    ?? (p.distanceMetersMax ?? p.distanceMeters ? (p.distanceMetersMax ?? p.distanceMeters!) / 3 : undefined)
    ?? ((p.repsMax ?? p.reps ?? 8) * 4);
  const perSide = p.perSide ? 2 : 1;
  return Math.max(1, Math.round((sets * perSide * (work + rest)) / 60));
}
