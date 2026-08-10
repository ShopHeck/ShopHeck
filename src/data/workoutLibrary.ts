/**
 * Back-compatibility shim for the pre-2.0 flat exercise library.
 *
 * The library now lives in `src/data/library` as two connected schemas
 * (`StrengthExercise` and `Technique`). This module projects both back onto the
 * old flat `Exercise` shape — one category enum, one free-text `setsReps` — so
 * anything still importing `EXERCISES` keeps working unchanged.
 *
 * New code should import from `../data/library` instead.
 */
import { EXERCISE_LIBRARY, TECHNIQUE_LIBRARY, formatPrescription } from './library';

export type ExerciseCategory = 'conditioning' | 'strength' | 'skill' | 'flexibility' | 'sparring-drill';
export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  sports: string[];       // [] = all sports
  equipment: string[];    // [] = bodyweight only
  difficulty: Difficulty;
  setsReps: string;
  muscleGroups: string[];
  instructions: string;
  tips?: string;
}

export const EXERCISES: Exercise[] = [
  ...EXERCISE_LIBRARY.map((e): Exercise => ({
    id: e.id,
    name: e.name,
    // 'mobility' was called 'flexibility' in the flat schema.
    category: e.category === 'mobility' ? 'flexibility' : e.category,
    sports: e.sports,
    equipment: e.equipment,
    difficulty: e.difficulty,
    setsReps: formatPrescription(e.prescription),
    muscleGroups: e.muscleGroups,
    instructions: e.instructions,
    tips: e.tips,
  })),
  ...TECHNIQUE_LIBRARY.map((t): Exercise => ({
    id: t.id,
    name: t.name,
    // The flat schema split drills by whether they involved a resisting
    // opponent; `formats` now carries that distinction explicitly.
    category: t.formats.includes('live-resistance') ? 'sparring-drill' : 'skill',
    sports: t.disciplines,
    equipment: t.equipment,
    difficulty: t.difficulty,
    setsReps: formatPrescription(t.prescription),
    muscleGroups: t.focusTags,
    instructions: t.instructions,
    tips: t.tips,
  })),
];

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  conditioning: 'Conditioning',
  strength: 'Strength',
  skill: 'Skill',
  flexibility: 'Flexibility',
  'sparring-drill': 'Sparring Drills',
};
