import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';
import type { FightCamp, TrainingWeek, TrainingDay, TrainingSession, OffSeasonGoal, CampFactorWeights } from '../types';

type Phase = 'Base Building' | 'Strength & Conditioning' | 'Fight Specific' | 'Peak' | 'Taper';

interface PhaseConfig {
  phase: Phase;
  focus: string;
  intensity: TrainingWeek['intensity'];
  sparringRounds: number;
  conditioningLoad: number;
  strengthEmphasis?: CampFactorWeights['strengthEmphasis'];
}

function getPhaseConfigs(campWeeks: number, experienceLevel: string): PhaseConfig[] {
  const isAdvanced = experienceLevel === 'Professional' || experienceLevel === 'Semi-Pro';

  if (campWeeks <= 6) {
    return [
      { phase: 'Base Building', focus: 'Aerobic base, movement patterns, technical drilling', intensity: 'Low', sparringRounds: 0, conditioningLoad: 3 },
      { phase: 'Strength & Conditioning', focus: 'Functional strength, power development, conditioning', intensity: 'Medium', sparringRounds: isAdvanced ? 3 : 2, conditioningLoad: 4 },
      { phase: 'Fight Specific', focus: 'Fight simulation, combination work, pressure testing', intensity: 'High', sparringRounds: isAdvanced ? 6 : 4, conditioningLoad: 5 },
      { phase: 'Fight Specific', focus: 'Gameplan refinement, controlled sparring, sharpening', intensity: 'High', sparringRounds: isAdvanced ? 8 : 6, conditioningLoad: 4 },
      { phase: 'Peak', focus: 'Fight-pace sparring, final sharpening, mental prep', intensity: 'Very High', sparringRounds: isAdvanced ? 10 : 8, conditioningLoad: 3 },
      { phase: 'Taper', focus: 'Active recovery, light drilling, visualization, weight management', intensity: 'Low', sparringRounds: 0, conditioningLoad: 1 },
    ];
  }

  if (campWeeks <= 8) {
    return [
      { phase: 'Base Building', focus: 'Aerobic base, movement fundamentals, volume work', intensity: 'Low', sparringRounds: 0, conditioningLoad: 3 },
      { phase: 'Base Building', focus: 'Increasing cardio load, technical drilling, footwork', intensity: 'Low', sparringRounds: 0, conditioningLoad: 4 },
      { phase: 'Strength & Conditioning', focus: 'Strength training, explosive power, heavy bag work', intensity: 'Medium', sparringRounds: isAdvanced ? 3 : 2, conditioningLoad: 5 },
      { phase: 'Strength & Conditioning', focus: 'Fight-specific conditioning, combination fluency', intensity: 'Medium', sparringRounds: isAdvanced ? 5 : 3, conditioningLoad: 5 },
      { phase: 'Fight Specific', focus: 'Pressure testing, gameplan implementation, live rounds', intensity: 'High', sparringRounds: isAdvanced ? 8 : 6, conditioningLoad: 4 },
      { phase: 'Fight Specific', focus: 'Tactical refinement, controlled live work, peaking', intensity: 'High', sparringRounds: isAdvanced ? 10 : 8, conditioningLoad: 4 },
      { phase: 'Peak', focus: 'Peak intensity sparring, final prep, visualization', intensity: 'Very High', sparringRounds: isAdvanced ? 12 : 10, conditioningLoad: 3 },
      { phase: 'Taper', focus: 'Active recovery, weight management, mental sharpness', intensity: 'Low', sparringRounds: 0, conditioningLoad: 1 },
    ];
  }

  // 10-week camp
  return [
    { phase: 'Base Building', focus: 'Aerobic foundation, joint prep, movement basics', intensity: 'Low', sparringRounds: 0, conditioningLoad: 2 },
    { phase: 'Base Building', focus: 'Volume cardio, technical drilling, footwork development', intensity: 'Low', sparringRounds: 0, conditioningLoad: 3 },
    { phase: 'Base Building', focus: 'Building work capacity, pad work introduction', intensity: 'Medium', sparringRounds: 0, conditioningLoad: 4 },
    { phase: 'Strength & Conditioning', focus: 'Strength cycle begins, functional power, conditioning', intensity: 'Medium', sparringRounds: isAdvanced ? 3 : 2, conditioningLoad: 5 },
    { phase: 'Strength & Conditioning', focus: 'Power peaking, heavy bag volume, combination chains', intensity: 'Medium', sparringRounds: isAdvanced ? 5 : 4, conditioningLoad: 5 },
    { phase: 'Fight Specific', focus: 'Gameplan introduction, fight-pace drilling, controlled sparring', intensity: 'High', sparringRounds: isAdvanced ? 8 : 6, conditioningLoad: 5 },
    { phase: 'Fight Specific', focus: 'Full gameplan implementation, problem solving sparring', intensity: 'High', sparringRounds: isAdvanced ? 10 : 8, conditioningLoad: 4 },
    { phase: 'Fight Specific', focus: 'Tactical refinement, scouting adjustments, live rounds', intensity: 'High', sparringRounds: isAdvanced ? 12 : 10, conditioningLoad: 4 },
    { phase: 'Peak', focus: 'Final intensity sparring, peaking, visualization, confidence building', intensity: 'Very High', sparringRounds: isAdvanced ? 12 : 10, conditioningLoad: 3 },
    { phase: 'Taper', focus: 'Active recovery, light drilling, weight management, fight week prep', intensity: 'Low', sparringRounds: 0, conditioningLoad: 1 },
  ];
}

function buildDay(dayOfWeek: number, label: string, sessions: TrainingSession[], isRestDay = false): TrainingDay {
  return { dayOfWeek, label, sessions, isRestDay };
}

function buildWeekSchedule(phase: PhaseConfig, isAdvanced: boolean, sport: string): TrainingDay[] {
  const {
    intensity,
    sparringRounds,
    conditioningLoad,
    strengthEmphasis = 'normal',
  } = phase;

  const highIntensity = intensity === 'High' || intensity === 'Very High';
  const isBKFC = sport === 'Bare Knuckle';
  const sportSkillLabel = isBKFC ? 'Bare Knuckle' : sport === 'MMA' ? 'MMA Technique' : sport === 'Boxing' ? 'Boxing' : sport;

  const strengthDuration = strengthEmphasis === 'high' ? 75 : strengthEmphasis === 'low' ? 45 : 60;
  const strengthTitle = strengthEmphasis === 'high'
    ? 'Strength & Power — High Emphasis'
    : strengthEmphasis === 'low'
      ? 'Strength Maintenance'
      : 'Strength & Power Training';
  const strengthDescription = strengthEmphasis === 'high'
    ? 'Progressive compound lifts, controlled plyometrics and rotational power work. Keep technique strict and leave one or two quality reps in reserve.'
    : strengthEmphasis === 'low'
      ? 'Low-volume compound strength, mobility and activation. Maintain force without adding fatigue that competes with skill work.'
      : 'Compound lifts, plyometrics and functional strength work. Focus on technically clean explosive power.';

  // ── Bare-knuckle ruleset-specific session content ──────────────────────
  // These plans develop the physical qualities and tactics of the ruleset, but
  // they do not prescribe bare-knuckle head-contact sparring or unsupervised
  // impact conditioning. Hand pain, swelling or neurologic symptoms require
  // stopping and appropriate coach/medical review.

  const bkfcConditioningDesc = conditioningLoad >= 4
    ? `${phase.phase === 'Peak' ? '10' : '8'}×2min hard but technically controlled rounds on a heavy bag or assault bike, exactly 1min rest — mirror the fight clock. Stop the interval if mechanics break down or pain appears.`
    : '40min steady-state run or bike at 60–70% max HR. Build the aerobic engine that powers repeated 2-min efforts.';

  const bkfcSkillDesc = 'Shadow boxing warm-up (10min). Wrapped/gloved pad work — close-range hooks, uppercuts and check hooks (25min). Hand and wrist preparation: wrist stability, grip and rice-bucket work (15min). Any impact conditioning must be directed by a qualified coach; stop for pain or swelling. Head movement: slips, rolls and pull-backs (15min).';

  const bkfcCombinationDesc = 'Close-range boxing focus: clinch entries permitted by the ruleset, short punches off the break, slip-and-counter chains and inside footwork. Use controlled partner drills and protective equipment; no bare-knuckle head contact in training.';

  const bkfcPadWorkDesc = 'Wrapped/gloved combination pad work at 2-min round pace with scheduled recovery. Counter-punching off head slips, short-range power mechanics and defensive movement. Quality and hand health come before volume.';

  const bkfcSparringDesc = (rounds: number, isHard: boolean) =>
    `${rounds} rounds of ${isHard ? 'higher-intensity controlled boxing sparring' : 'technical controlled boxing sparring'} under a qualified coach, with appropriate gloves, mouthguard and protective equipment. Work inside tactics and head movement without bare-knuckle head contact. ${isHard ? 'Cap intensity if defense, judgment or mechanics deteriorate.' : 'Prioritize positioning, defense and problem solving.'}`;

  const bkfcStrengthDesc = 'Hand, wrist and forearm resilience: wrist stability, rice-bucket and grip work, plus controlled upper-body and rotational strength. Any knuckle-loading or impact progression must be coach-supervised and stopped for pain, numbness or swelling.';

  const bkfcSaturdayDesc = phase.phase === 'Taper'
    ? 'Light 30min jog, mobility and shadow boxing at 50%. Keep hands sharp without impact volume.'
    : '50min road work at conversation pace — build the gas tank that supports repeated 2-min efforts.';

  // ── Build days ────────────────────────────────────────────────────────

  const days: TrainingDay[] = [
    // Monday - Conditioning + Skill
    buildDay(1, 'Monday', [
      {
        type: 'conditioning',
        title: isBKFC
          ? (conditioningLoad >= 4 ? 'Ruleset Burst Intervals' : 'Aerobic Base Work')
          : (conditioningLoad >= 4 ? 'High Intensity Intervals' : 'Steady State Cardio'),
        duration: conditioningLoad >= 4 ? 45 : 40,
        description: isBKFC
          ? bkfcConditioningDesc
          : conditioningLoad >= 4
            ? '6x3min rounds on assault bike, 1min rest. Push the pace each round while maintaining mechanics.'
            : '40min moderate intensity run or bike. Zone 2 heart rate (60-70% max HR).',
      },
      {
        type: 'skill',
        title: `${sportSkillLabel} - Technical Drilling`,
        duration: 75,
        description: isBKFC
          ? bkfcSkillDesc
          : 'Shadow boxing warm-up (15min), pad work combinations (30min), heavy bag rounds (30min).',
      },
    ]),

    // Tuesday - Strength / Sparring
    buildDay(2, 'Tuesday', sparringRounds > 0 ? [
      {
        type: 'sparring',
        title: isBKFC ? 'Controlled Ruleset Sparring' : 'Sparring Session',
        duration: 90,
        description: isBKFC
          ? bkfcSparringDesc(sparringRounds, intensity === 'Very High')
          : `${sparringRounds} rounds of ${intensity === 'Very High' ? 'higher-intensity controlled' : 'controlled'} sparring. ${intensity === 'Very High' ? 'Fight-pace intent with coach-set limits.' : 'Focus on gameplan execution.'}`,
      },
    ] : [
      {
        type: 'strength',
        title: isBKFC ? 'Hand, Wrist & Strength' : strengthTitle,
        duration: strengthDuration,
        description: isBKFC
          ? bkfcStrengthDesc
          : strengthDescription,
      },
    ]),

    // Wednesday - Active Recovery or Skill
    buildDay(3, 'Wednesday', highIntensity ? [
      {
        type: 'skill',
        title: isBKFC ? 'Bare Knuckle Ruleset - Inside Fighting' : `${sportSkillLabel} - Combination Work`,
        duration: 90,
        description: isBKFC
          ? bkfcCombinationDesc
          : 'Technical drilling, combination chains, defensive movement, footwork patterns.',
      },
      {
        type: 'conditioning',
        title: 'Aerobic Recovery Run',
        duration: 30,
        description: 'Easy 30min jog or swim. Keep heart rate below 65% max. Active recovery.',
      },
    ] : [
      {
        type: 'recovery',
        title: 'Active Recovery',
        duration: 45,
        description: 'Light stretching, yoga, or easy swim. Focus on mobility and tissue recovery.',
      },
    ]),

    // Thursday - Conditioning + Skill
    buildDay(4, 'Thursday', [
      {
        type: 'conditioning',
        title: isBKFC
          ? 'Ruleset Fight Simulation'
          : (conditioningLoad >= 5 ? 'Fight Rounds Conditioning' : 'Circuit Training'),
        duration: 50,
        description: isBKFC
          ? `${phase.phase === 'Peak' ? '10' : '8'}×2min wrapped/gloved bag or non-impact conditioning rounds, 1min rest. Match the ruleset clock while preserving hand health and clean mechanics.`
          : conditioningLoad >= 5
            ? `${phase.phase === 'Peak' ? '10' : '8'}x${sport === 'Boxing' ? '3' : '5'}min bag rounds with sport-appropriate recovery. Stay technically clean as fatigue rises.`
            : 'Burpees, sprawls, shadow boxing, jump rope circuit. 5 rounds of 5 exercises.',
      },
      {
        type: 'skill',
        title: isBKFC
          ? 'Bare Knuckle Ruleset - Pad Work & Head Movement'
          : `${sportSkillLabel} - Pad Work Focus`,
        duration: 75,
        description: isBKFC
          ? bkfcPadWorkDesc
          : 'Combination pad work, timing drills, counter striking, defensive response training.',
      },
    ]),

    // Friday - Sparring or Skill
    buildDay(5, 'Friday', sparringRounds > 0 ? [
      {
        type: 'sparring',
        title: isBKFC
          ? 'Technical Ruleset Sparring'
          : (isAdvanced ? 'Hard Sparring' : 'Technical Sparring'),
        duration: 90,
        description: isBKFC
          ? bkfcSparringDesc(Math.ceil(sparringRounds / 2), isAdvanced)
          : `${Math.ceil(sparringRounds / 2)} rounds. ${isAdvanced ? 'Coach-controlled 80-90% intent with safety limits.' : 'Technical focus, 60-70% intensity. Problem solving.'}`,
      },
    ] : [
      {
        type: 'skill',
        title: isBKFC ? 'Bare Knuckle Ruleset - Bag Work & Power' : `${sportSkillLabel} - Bag Work & Combos`,
        duration: 90,
        description: isBKFC
          ? 'Wrapped/gloved heavy bag work at 2-min round pace with 1-min rest. Short combinations, body work, inside fighting and clean power mechanics. Do not use bare-knuckle head-contact sparring or unsupervised bare-hand impact rounds.'
          : 'Heavy bag volume work. Focus on power combinations, rhythm, and endurance.',
      },
    ]),

    // Saturday - Conditioning
    buildDay(6, 'Saturday', [
      {
        type: 'conditioning',
        title: phase.phase === 'Taper' ? 'Light Conditioning' : (isBKFC ? 'Road Work' : 'Long Conditioning'),
        duration: phase.phase === 'Taper' ? 30 : 60,
        description: isBKFC
          ? bkfcSaturdayDesc
          : phase.phase === 'Taper'
            ? 'Easy 30min jog, stretch, light shadow boxing. Keep it relaxed.'
            : 'Long run (45min) or bike (60min). Maintain conversation pace. Builds aerobic base.',
      },
    ]),

    // Sunday - Rest
    buildDay(0, 'Sunday', [
      {
        type: 'recovery',
        title: 'Rest & Recovery',
        duration: 30,
        description: isBKFC
          ? 'Full rest. Prioritize sleep, nutrition and hand recovery. Persistent hand pain, numbness or swelling needs qualified medical evaluation.'
          : 'Full rest or gentle yoga/stretching. Prioritize sleep and nutrition.',
      },
    ], true),
  ];

  return days;
}

// ─── Off Season Schedule ──────────────────────────────────────────────────

type OffPhase = 'Foundation' | 'Development' | 'Performance' | 'Active Recovery';

const OFF_SEASON_CYCLE: OffPhase[] = ['Foundation', 'Development', 'Performance', 'Active Recovery'];

interface OffPhaseConfig {
  phase: OffPhase;
  focus: string;
  intensity: TrainingWeek['intensity'];
  hasSparringTue: boolean;
  hasSparringFri: boolean;
}

function getOffPhaseConfig(phase: OffPhase, goal: OffSeasonGoal): OffPhaseConfig {
  const configs: Record<OffPhase, OffPhaseConfig> = {
    Foundation: {
      phase: 'Foundation',
      focus: 'Aerobic base, movement fundamentals, technical drilling — build the engine',
      intensity: 'Low',
      hasSparringTue: false,
      hasSparringFri: false,
    },
    Development: {
      phase: 'Development',
      focus: 'Increase training load, introduce sparring, build work capacity',
      intensity: 'Medium',
      hasSparringTue: goal !== 'recovery',
      hasSparringFri: false,
    },
    Performance: {
      phase: 'Performance',
      focus: 'Peak training week — two sparring sessions, high conditioning volume',
      intensity: 'High',
      hasSparringTue: goal !== 'recovery' && goal !== 'strength',
      hasSparringFri: goal !== 'recovery' && goal !== 'strength' && goal !== 'base-building',
    },
    'Active Recovery': {
      phase: 'Active Recovery',
      focus: 'Planned deload — light technique work, full tissue recovery, reset for next cycle',
      intensity: 'Low',
      hasSparringTue: false,
      hasSparringFri: false,
    },
  };
  return configs[phase];
}

function buildOffSeasonWeekSchedule(cfg: OffPhaseConfig, sport: string): TrainingDay[] {
  const { phase, hasSparringTue, hasSparringFri } = cfg;
  const isRecovery = phase === 'Active Recovery';
  const sportLabel = sport === 'MMA' ? 'MMA' : sport === 'Boxing' ? 'Boxing' : sport === 'Bare Knuckle' ? 'Bare Knuckle' : sport;

  const condSession = (title: string, duration: number, description: string): TrainingSession => ({
    type: 'conditioning', title, duration, description,
  });
  const skillSession = (title: string, duration: number, description: string): TrainingSession => ({
    type: 'skill', title, duration, description,
  });
  const strengthSession = (title: string, duration: number, description: string): TrainingSession => ({
    type: 'strength', title, duration, description,
  });
  const sparringSession = (title: string, duration: number, description: string): TrainingSession => ({
    type: 'sparring', title, duration, description,
  });
  const recoverySession = (title: string, duration: number, description: string): TrainingSession => ({
    type: 'recovery', title, duration, description,
  });

  return [
    // Monday
    buildDay(1, 'Monday', isRecovery ? [
      skillSession(`${sportLabel} — Light Technique`, 60, 'Low-intensity shadow boxing, light pad work, movement drills. No pressure.'),
    ] : [
      condSession(
        phase === 'Performance' ? 'High Intensity Intervals' : 'Aerobic Conditioning',
        phase === 'Performance' ? 45 : 40,
        phase === 'Performance'
          ? '5×4min hard effort rounds (bag or assault bike), 2min rest. Push hard each round while maintaining mechanics.'
          : '40min moderate steady-state. Zone 2 HR (60–70% max). Build the aerobic engine.',
      ),
      skillSession(`${sportLabel} — Technical Drilling`, 75, 'Shadow boxing warm-up, pad work combinations, heavy bag rounds. Focus on technical precision.'),
    ]),

    // Tuesday
    buildDay(2, 'Tuesday', isRecovery ? [
      recoverySession('Active Recovery', 45, 'Light stretching, mobility work, foam rolling. Let the body adapt.'),
    ] : hasSparringTue ? [
      sparringSession('Sparring Session', 90, `${phase === 'Performance' ? '6' : '4'} rounds of controlled sparring. Focus on clean technique and problem-solving. No ego.`),
    ] : [
      strengthSession('Strength & Power', 60, 'Compound lifts, plyometrics, functional power work. Olympic-style movements for combat athletes.'),
    ]),

    // Wednesday
    buildDay(3, 'Wednesday', isRecovery ? [
      condSession('Light Conditioning', 30, 'Easy 30min jog or bike. Keep heart rate below 65% max HR.'),
    ] : [
      skillSession(`${sportLabel} — Combination Work`, 75, 'Combination chains, defensive movement, footwork patterns, counter-striking drills.'),
      recoverySession('Cool-down & Recovery', 20, 'Static stretching, deep breathing and low-intensity recovery work.'),
    ]),

    // Thursday
    buildDay(4, 'Thursday', isRecovery ? [
      skillSession(`${sportLabel} — Light Technique`, 60, 'Shadow boxing, slow pad work, movement focus. Keep intensity minimal.'),
    ] : [
      condSession(
        phase === 'Performance' ? 'Fight Rounds Conditioning' : 'Circuit Training',
        45,
        phase === 'Performance'
          ? '8 rounds on bags with sport-appropriate recovery. Preserve mechanics while working at fight pace.'
          : 'Burpees, sprawls, shadow boxing, jump rope circuit. 5 rounds, 5 exercises.',
      ),
      skillSession(`${sportLabel} — Pad Work Focus`, 75, 'Combination pad work, timing drills, counter striking, defensive response training.'),
    ]),

    // Friday
    buildDay(5, 'Friday', isRecovery ? [
      { type: 'rest', title: 'Rest Day', duration: 0, description: 'Full rest. Let your body recover completely.' },
    ] : hasSparringFri ? [
      sparringSession('Technical Sparring', 90, '4 rounds at 60–70% intensity. Technical focus — execution over winning.'),
    ] : [
      strengthSession('Strength & Conditioning', 60, 'Strength training plus a short, controlled metabolic finisher. Stop before technique degrades.'),
    ]),

    // Saturday
    buildDay(6, 'Saturday', isRecovery ? [
      recoverySession('Recovery Session', 45, 'Yoga, mobility, or easy swim. Focus on the joints and connective tissue.'),
    ] : [
      condSession('Long Conditioning', 60, 'Long run (45min) or bike (60min). Maintain conversation pace. Builds the aerobic foundation everything runs on.'),
    ]),

    // Sunday
    buildDay(0, 'Sunday', [
      recoverySession('Rest & Recovery', 30, 'Full rest. Sleep 8+ hours. Prioritise nutrition and mental recovery.'),
    ], true),
  ];
}

function buildOffSeasonWeekGoals(phase: OffPhase, goal: OffSeasonGoal): string[] {
  const base: Record<OffPhase, string[]> = {
    Foundation: [
      'Complete all conditioning sessions',
      'Focus on technical precision over intensity',
      'Establish consistent sleep and nutrition habits',
    ],
    Development: [
      'Hit all scheduled sparring rounds',
      'Increase conditioning volume from last week',
      'Track body weight and hydration daily',
    ],
    Performance: [
      'Complete both sparring sessions',
      'Push conditioning while preserving technique',
      'Log every session with honest RPE ratings',
    ],
    'Active Recovery': [
      'Keep intensity light — resist the urge to push',
      'Prioritise sleep: aim for 8+ hours',
      'Reflect on what worked this cycle',
    ],
  };

  const extras: Record<OffSeasonGoal, Partial<Record<OffPhase, string>>> = {
    'base-building': {
      Foundation: 'Build aerobic base — no skipping cardio',
      Development: 'Stay consistent: base > intensity this phase',
    },
    strength: {
      Foundation: 'Hit all strength sessions, track lifts',
      Performance: 'Pursue a technically clean PR only when recovery is good',
    },
    maintain: {},
    recovery: {
      Foundation: 'Listen to your body — skip if genuinely fatigued',
      'Active Recovery': 'Prioritise recovery over training volume',
    },
  };

  const goals = [...base[phase]];
  const extra = extras[goal]?.[phase];
  if (extra) goals[0] = extra;
  return goals;
}

function generateOffSeasonSchedule(camp: FightCamp): TrainingWeek[] {
  const { campWeeks, startDate, sport } = camp;
  const goal: OffSeasonGoal = camp.offSeasonGoal ?? 'maintain';
  const weeks: TrainingWeek[] = [];

  for (let i = 0; i < campWeeks; i++) {
    const cyclePos = i % 4; // 0=Foundation, 1=Development, 2=Performance, 3=ActiveRecovery
    const phase = OFF_SEASON_CYCLE[cyclePos];
    const cfg = getOffPhaseConfig(phase, goal);

    const weekStart = startOfWeek(addDays(parseISO(startDate), i * 7), { weekStartsOn: 1 });
    const weekEnd = addDays(weekStart, 6);

    weeks.push({
      weekNumber: i + 1,
      startDate: format(weekStart, 'yyyy-MM-dd'),
      endDate: format(weekEnd, 'yyyy-MM-dd'),
      phase,
      focus: cfg.focus,
      intensity: cfg.intensity,
      weeklyGoals: buildOffSeasonWeekGoals(phase, goal),
      days: buildOffSeasonWeekSchedule(cfg, sport),
    });
  }

  return weeks;
}

export function getCurrentOffSeasonCycle(camp: FightCamp): number {
  const weekNum = getCurrentWeekNumber(camp);
  return Math.ceil(weekNum / 4);
}

function applyFactorWeightsToPhases(phases: PhaseConfig[], weights: CampFactorWeights): PhaseConfig[] {
  if (!weights.sparringRoundsTarget && !weights.conditioningFocus && !weights.strengthEmphasis) return phases;

  // sparringRoundsTarget is a whole-camp target learned from the previous bout.
  // One quarter approximates the desired peak-week load. Scale both upward and
  // downward; the previous Math.max(original, scaled) could only increase work.
  const peakRounds = phases.filter(p => p.phase === 'Peak').map(p => p.sparringRounds);
  const peakMax = peakRounds.length ? Math.max(...peakRounds) : 0;
  const targetPeak = weights.sparringRoundsTarget != null
    ? Math.max(0, Math.round(weights.sparringRoundsTarget / 4))
    : peakMax;
  const sparringScale = peakMax > 0 ? targetPeak / peakMax : 1;

  return phases.map(p => {
    let sparringRounds = p.sparringRounds;
    let conditioningLoad = p.conditioningLoad;

    if (weights.sparringRoundsTarget != null && sparringRounds > 0) {
      const scaled = Math.round(p.sparringRounds * sparringScale);
      sparringRounds = targetPeak === 0 ? 0 : Math.max(1, scaled);
    }

    if (weights.conditioningFocus === 'aerobic' && p.phase !== 'Taper') {
      // Aerobic emphasis: raise Base Building & early S&C load.
      if (p.phase === 'Base Building' || p.phase === 'Strength & Conditioning') {
        conditioningLoad = Math.min(5, conditioningLoad + 1);
      }
    } else if (weights.conditioningFocus === 'anaerobic') {
      if (p.phase === 'Fight Specific' || p.phase === 'Peak') {
        conditioningLoad = Math.min(5, conditioningLoad + 1);
      }
    }

    return {
      ...p,
      sparringRounds,
      conditioningLoad,
      strengthEmphasis: weights.strengthEmphasis ?? p.strengthEmphasis,
    };
  });
}

export function generateTrainingCamp(camp: FightCamp, weights?: CampFactorWeights): TrainingWeek[] {
  if (camp.isOffSeason) return generateOffSeasonSchedule(camp);

  const { campWeeks, startDate, experienceLevel, sport } = camp;
  const isAdvanced = experienceLevel === 'Professional' || experienceLevel === 'Semi-Pro';
  let phaseConfigs = getPhaseConfigs(campWeeks, experienceLevel);
  if (weights) phaseConfigs = applyFactorWeightsToPhases(phaseConfigs, weights);
  const weeks: TrainingWeek[] = [];

  for (let i = 0; i < campWeeks; i++) {
    const phaseConfig = phaseConfigs[i] || phaseConfigs[phaseConfigs.length - 1];
    const weekStart = startOfWeek(addDays(parseISO(startDate), i * 7), { weekStartsOn: 1 });
    const weekEnd = addDays(weekStart, 6);

    const isBKFC = sport === 'Bare Knuckle';
    const goals: string[] = [];
    if (phaseConfig.phase === 'Base Building') {
      goals.push(
        'Complete all conditioning sessions',
        isBKFC ? 'Build hand and wrist resilience — non-impact first, coach-supervised' : 'Focus on technical precision',
        'Establish sleep/nutrition routine',
      );
    } else if (phaseConfig.phase === 'Strength & Conditioning') {
      goals.push(
        isBKFC ? 'Complete coach-approved hand, wrist and forearm strength work' : 'Hit all strength targets',
        `${phaseConfig.sparringRounds} rounds of ${isBKFC ? 'controlled ruleset ' : ''}sparring`,
        'Track conditioning benchmarks',
      );
    } else if (phaseConfig.phase === 'Fight Specific') {
      goals.push(
        `Complete ${phaseConfig.sparringRounds} ${isBKFC ? 'controlled ruleset ' : ''}sparring rounds`,
        isBKFC ? 'Refine head movement and close-range defense with protective equipment' : 'Refine fight gameplan',
        'Monitor weight daily',
      );
    } else if (phaseConfig.phase === 'Peak') {
      goals.push(
        isBKFC ? 'Peak ruleset preparation — coach-controlled intensity, no bare-knuckle head contact' : 'Peak performance sparring',
        'Maintain weight within 3 lbs (1.4 kg) of target',
        isBKFC ? 'Practice composure and decision-making under controlled pressure' : 'Mental visualization daily',
      );
    } else {
      goals.push(
        'Follow the coach-approved fight-week weight plan',
        isBKFC ? 'Light wrapped/gloved pad work only — protect the hands' : 'Light drilling only',
        'Aim for 8+ hours sleep per night',
        'Stay sharp — no contact',
      );
    }

    weeks.push({
      weekNumber: i + 1,
      startDate: format(weekStart, 'yyyy-MM-dd'),
      endDate: format(weekEnd, 'yyyy-MM-dd'),
      phase: phaseConfig.phase,
      focus: phaseConfig.focus,
      intensity: phaseConfig.intensity,
      weeklyGoals: goals,
      days: buildWeekSchedule(phaseConfig, isAdvanced, sport),
    });
  }

  return weeks;
}

export function getDaysUntilFight(fightDate: string | undefined, now: Date = new Date()): number {
  if (!fightDate) return 0;
  return Math.max(0, differenceInCalendarDays(parseISO(fightDate), now));
}

// Schedule weeks are snapped to the Monday on/before the start date. Measure
// calendar days from that same Monday so daylight-saving transitions cannot
// shift a workout into the wrong camp week.
export function getWeekNumberForDate(camp: FightCamp, date: Date): number {
  const start = startOfWeek(parseISO(camp.startDate), { weekStartsOn: 1 });
  const diffDays = differenceInCalendarDays(date, start);
  const diffWeeks = Math.floor(diffDays / 7);
  return Math.max(1, Math.min(diffWeeks + 1, camp.campWeeks));
}

export function getCurrentWeekNumber(camp: FightCamp): number {
  return getWeekNumberForDate(camp, new Date());
}

export function getCampProgress(camp: FightCamp, now: Date = new Date()): number {
  const total = camp.campWeeks * 7;
  if (total <= 0) return 0; // guard campWeeks === 0 → 0/0 → NaN% width
  // Anchor on the actual start date rather than the Monday-aligned planner week.
  const start = parseISO(camp.startDate);
  const elapsed = differenceInCalendarDays(now, start);
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}
