import { EXERCISE_LIBRARY } from './exercises';
import { TECHNIQUE_LIBRARY } from './techniques';
import type { LibraryItem, StrengthExercise, Technique } from './types';

export * from './types';
export { EXERCISE_LIBRARY } from './exercises';
export { TECHNIQUE_LIBRARY } from './techniques';

/** Which of the two libraries an item belongs to. */
export type LibraryKind = 'exercise' | 'technique';

export const LIBRARY_ITEMS: LibraryItem[] = [...EXERCISE_LIBRARY, ...TECHNIQUE_LIBRARY];

const BY_ID = new Map<string, LibraryItem>(LIBRARY_ITEMS.map(i => [i.id, i]));

export function getLibraryItem(id: string): LibraryItem | undefined {
  return BY_ID.get(id);
}

export function isTechnique(item: LibraryItem): item is Technique {
  return item.kind === 'technique';
}

export function isExercise(item: LibraryItem): item is StrengthExercise {
  return item.kind === 'exercise';
}

/** Sorted unique values across a library, for building filter chips. */
function facet<T extends LibraryItem>(items: T[], pick: (i: T) => string[]): string[] {
  return [...new Set(items.flatMap(pick))].sort((a, b) => a.localeCompare(b));
}

export const EXERCISE_EQUIPMENT = facet(EXERCISE_LIBRARY, e => e.equipment);
export const TECHNIQUE_EQUIPMENT = facet(TECHNIQUE_LIBRARY, t => t.equipment);
export const TECHNIQUE_DISCIPLINES = facet(TECHNIQUE_LIBRARY, t => t.disciplines);
export const TECHNIQUE_FOCUS_TAGS = facet(TECHNIQUE_LIBRARY, t => t.focusTags);
