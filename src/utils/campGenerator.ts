import { addDays, format } from 'date-fns';
import type { FightCamp, TrainingWeek, TrainingDay, TrainingSession } from '../types';

type Phase = 'Base Building' | 'Strength & Conditioning' | 'Fight Specific' | 'Peak' | 'Taper';

interface PhaseConfig {
  phase: Phase;
  focus: string;
  intensity: TrainingWeek['intensity'];
  sparringRounds: number;
  conditioningLoad: number;
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
  const { intensity, sparringRounds, conditioningLoad } = phase;

  const highIntensity = intensity === 'High' || intensity === 'Very High';
  const sportSkillLabel = sport === 'MMA' ? 'MMA Technique' : sport === 'Boxing' ? 'Boxing' : sport;

  const days: TrainingDay[] = [
    // Monday - Conditioning + Skill
    buildDay(1, 'Monday', [
      {
        type: 'conditioning',
        title: conditioningLoad >= 4 ? 'High Intensity Intervals' : 'Steady State Cardio',
        duration: conditioningLoad >= 4 ? 45 : 40,
        description: conditioningLoad >= 4
          ? '6x3min rounds on assault bike, 1min rest. Push the pace each round.'
          : '40min moderate intensity run or bike. Zone 2 heart rate (60-70% max HR).',
      },
      {
        type: 'skill',
        title: `${sportSkillLabel} - Technical Drilling`,
        duration: 75,
        description: 'Shadow boxing warm-up (15min), pad work combinations (30min), heavy bag rounds (30min).',
      },
    ]),

    // Tuesday - Strength/Sparring
    buildDay(2, 'Tuesday', sparringRounds > 0 ? [
      {
        type: 'sparring',
        title: 'Sparring Session',
        duration: 90,
        description: `${sparringRounds} rounds of ${intensity === 'Very High' ? 'competitive' : 'controlled'} sparring. ${intensity === 'Very High' ? 'Fight-pace intensity.' : 'Focus on gameplan execution.'}`,
      },
    ] : [
      {
        type: 'strength',
        title: 'Strength & Power Training',
        duration: 60,
        description: 'Olympic lifts, plyometrics, and functional strength work. Focus on explosive power.',
      },
    ]),

    // Wednesday - Active Recovery or Skill
    buildDay(3, 'Wednesday', highIntensity ? [
      {
        type: 'skill',
        title: `${sportSkillLabel} - Combination Work`,
        duration: 90,
        description: 'Technical drilling, combination chains, defensive movement, footwork patterns.',
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
        title: conditioningLoad >= 5 ? 'Fight Rounds Conditioning' : 'Circuit Training',
        duration: 50,
        description: conditioningLoad >= 5
          ? `${phase.phase === 'Peak' ? '12' : '8'}x${sport === 'Boxing' ? '3' : '5'}min rounds on bags, staying in motion. No rest between rounds.`
          : 'Burpees, sprawls, shadow boxing, jump rope circuit. 5 rounds of 5 exercises.',
      },
      {
        type: 'skill',
        title: `${sportSkillLabel} - Pad Work Focus`,
        duration: 75,
        description: 'Combination pad work, timing drills, counter striking, defensive response training.',
      },
    ]),

    // Friday - Sparring or Skill
    buildDay(5, 'Friday', sparringRounds > 0 ? [
      {
        type: 'sparring',
        title: isAdvanced ? 'Hard Sparring' : 'Technical Sparring',
        duration: 90,
        description: `${Math.ceil(sparringRounds / 2)} rounds. ${isAdvanced ? 'Go at 80-90% intensity.' : 'Technical focus, 60-70% intensity. Problem solving.'}`,
      },
    ] : [
      {
        type: 'skill',
        title: `${sportSkillLabel} - Bag Work & Combos`,
        duration: 90,
        description: 'Heavy bag volume work. Focus on power combinations, rhythm, and endurance.',
      },
    ]),

    // Saturday - Long conditioning or light work
    buildDay(6, 'Saturday', [
      {
        type: 'conditioning',
        title: phase.phase === 'Taper' ? 'Light Conditioning' : 'Long Conditioning',
        duration: phase.phase === 'Taper' ? 30 : 60,
        description: phase.phase === 'Taper'
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
        description: 'Full rest or gentle yoga/stretching. Ice bath if sore. Prioritize sleep and nutrition.',
      },
    ], true),
  ];

  return days;
}

export function generateTrainingCamp(camp: FightCamp): TrainingWeek[] {
  const { campWeeks, startDate, experienceLevel, sport } = camp;
  const isAdvanced = experienceLevel === 'Professional' || experienceLevel === 'Semi-Pro';
  const phaseConfigs = getPhaseConfigs(campWeeks, experienceLevel);
  const weeks: TrainingWeek[] = [];

  for (let i = 0; i < campWeeks; i++) {
    const phaseConfig = phaseConfigs[i] || phaseConfigs[phaseConfigs.length - 1];
    const weekStart = addDays(new Date(startDate), i * 7);
    const weekEnd = addDays(weekStart, 6);

    const goals: string[] = [];
    if (phaseConfig.phase === 'Base Building') {
      goals.push('Complete all conditioning sessions', 'Focus on technical precision', 'Establish sleep/nutrition routine');
    } else if (phaseConfig.phase === 'Strength & Conditioning') {
      goals.push('Hit all strength targets', `${phaseConfig.sparringRounds} rounds of sparring`, 'Track conditioning benchmarks');
    } else if (phaseConfig.phase === 'Fight Specific') {
      goals.push(`Complete ${phaseConfig.sparringRounds} sparring rounds`, 'Refine fight gameplan', 'Monitor weight daily');
    } else if (phaseConfig.phase === 'Peak') {
      goals.push('Peak performance sparring', 'Maintain weight within 3lbs of target', 'Mental visualization daily');
    } else {
      goals.push('Start weight cut protocol', 'Light drilling only', 'Max 8hrs sleep per night', 'Stay sharp — no contact');
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

export function getDaysUntilFight(fightDate: string): number {
  const today = new Date();
  const fight = new Date(fightDate);
  const diff = Math.ceil((fight.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

export function getCurrentWeekNumber(camp: FightCamp): number {
  const today = new Date();
  const start = new Date(camp.startDate);
  const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7));
  return Math.max(1, Math.min(diff + 1, camp.campWeeks));
}

export function getCampProgress(camp: FightCamp): number {
  const total = camp.campWeeks * 7;
  const start = new Date(camp.startDate);
  const today = new Date();
  const elapsed = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}
