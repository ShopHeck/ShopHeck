import type { Food, Macros, ServingUnit } from '../../data/nutrition/types';

export const ZERO_MACROS: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    calories: a.calories + b.calories,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

export function sumMacros(parts: Macros[]): Macros {
  return parts.reduce(addMacros, ZERO_MACROS);
}

export function scaleMacros(m: Macros, factor: number): Macros {
  return {
    calories: m.calories * factor,
    protein: m.protein * factor,
    carbs: m.carbs * factor,
    fat: m.fat * factor,
  };
}

export function roundMacros(m: Macros): Macros {
  return {
    calories: Math.round(m.calories),
    protein: Math.round(m.protein),
    carbs: Math.round(m.carbs),
    fat: Math.round(m.fat),
  };
}

/**
 * Energy implied by the macros under the Atwater factors.
 *
 * Used only to catch authoring mistakes — a transposed digit, a fat figure in
 * the carb column. It is not a metabolic model: dietary fibre yields about
 * 2 kcal/g in reality but 4 here, so high-fibre vegetables read materially
 * high. The integrity test's tolerance is sized for that, deliberately.
 */
export function atwaterCalories(m: Macros): number {
  return m.protein * 4 + m.carbs * 4 + m.fat * 9;
}

export function macrosForServings(food: Food, servings: number): Macros {
  return scaleMacros(food.macros, servings);
}

// ─── Quantity formatting ──────────────────────────────────────────────────────

const VULGAR: Record<string, string> = {
  '0.25': '¼',
  '0.33': '⅓',
  '0.5': '½',
  '0.67': '⅔',
  '0.75': '¾',
};

/** Units that are counted, and so pluralize. Grams and millilitres do not. */
const PLURALIZES: ServingUnit[] = ['scoop', 'cup', 'slice', 'piece', 'can', 'pinch'];

/** Units where the name reads better after the unit: "2 medium bananas". */
const SIZE_UNITS: ServingUnit[] = ['small', 'medium', 'large'];

function formatCount(n: number): string {
  const whole = Math.floor(n);
  const frac = Number((n - whole).toFixed(2));
  const vulgar = VULGAR[String(frac)];
  if (!vulgar) return String(Number(n.toFixed(2)));
  return whole === 0 ? vulgar : `${whole}${vulgar}`;
}

/**
 * Render a portion in the food's own unit.
 *
 * The unit is the point. The previous formatter tested the serving label for
 * "scoop", "tbsp", "cup" and "slice" and then returned grams down both
 * branches, so every portion in the app was a weight regardless of how anyone
 * actually measures the thing.
 */
export function formatQuantity(food: Food, servings: number): string {
  const { unit, amount } = food.serving;

  if (unit === 'g' || unit === 'ml') {
    const total = amount * servings;
    // Weighed portions round to 5 below 100 and to 10 above: nobody portions
    // 183 g of rice, and printing it implies a precision the data lacks.
    const rounded = total >= 100 ? Math.round(total / 10) * 10 : Math.round(total / 5) * 5;
    return `${rounded}${unit}`;
  }

  const count = amount * servings;
  const label = formatCount(count);

  // "piece" is a counting placeholder, not a word anyone says. The food's own
  // name carries it: "3 Rice Cakes", not "3 pieces Rice Cake".
  if (unit === 'piece') return label;

  if (SIZE_UNITS.includes(unit)) return `${label} ${unit}`;

  const plural = count > 1 && PLURALIZES.includes(unit);
  return `${label} ${unit}${plural ? 's' : ''}`;
}

/** Whether a food's name should be pluralized alongside its quantity. */
export function needsPluralName(food: Food, servings: number): boolean {
  const { unit, amount } = food.serving;
  return (unit === 'piece' || SIZE_UNITS.includes(unit)) && amount * servings > 1;
}

/** "Rice Cake" → "Rice Cakes"; "Chicken Thigh (skinless)" → "Chicken Thighs (skinless)". */
export function pluralizeName(name: string): string {
  const paren = name.indexOf(' (');
  const head = paren === -1 ? name : name.slice(0, paren);
  const tail = paren === -1 ? '' : name.slice(paren);
  if (/s$/i.test(head)) return name;
  return `${head}s${tail}`;
}

/** "180g" for a scoop-measured food, so the UI can show mass as a subtitle. */
export function formatGrams(food: Food, servings: number): string {
  return `${Math.round(food.serving.grams * servings)}g`;
}
