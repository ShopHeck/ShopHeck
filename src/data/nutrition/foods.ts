import type { Food } from './types';

/**
 * The food database.
 *
 * Every macro figure is per ONE serving, and every serving carries the unit the
 * thing is actually measured in — a scoop is a scoop, a tablespoon is a
 * tablespoon. Recipes reference these by id and state a serving count, so a
 * recipe's macros are computed rather than claimed.
 *
 * `minServings` / `maxServings` / `step` bound what the generator may portion.
 * They are the reason a generated meal cannot contain 1.7 kg of Greek yogurt:
 * the search has no value above `maxServings` to find. Set them to what a
 * person would plausibly eat in one sitting, not to what is theoretically
 * edible.
 *
 * Calories are checked against the Atwater factors in
 * `tests/nutritionLibrary.test.ts`, which catches transposed digits and macros
 * entered in the wrong column.
 */

const g100 = (grams = 100) => ({ amount: grams, unit: 'g' as const, grams });

export const FOOD_DATABASE: Food[] = [
  // ── Protein ─────────────────────────────────────────────────────────────────
  { id: 'chicken-breast', name: 'Chicken Breast', category: 'protein', serving: g100(), macros: { calories: 165, protein: 31, carbs: 0, fat: 3.6 }, minServings: 0.8, maxServings: 3, step: 0.1, generatorRole: 'primary' },
  { id: 'chicken-thigh', name: 'Chicken Thigh (skinless)', category: 'protein', serving: { amount: 1, unit: 'piece', grams: 95 }, macros: { calories: 170, protein: 23.5, carbs: 0, fat: 7.8 }, minServings: 1, maxServings: 3, step: 1, generatorRole: 'primary' },
  { id: 'salmon-fillet', name: 'Salmon Fillet', category: 'protein', serving: g100(), macros: { calories: 208, protein: 20, carbs: 0, fat: 13 }, minServings: 0.8, maxServings: 2.5, step: 0.1, generatorRole: 'primary' },
  { id: 'smoked-salmon', name: 'Smoked Salmon', category: 'protein', serving: g100(), macros: { calories: 117, protein: 18, carbs: 0, fat: 4.3 }, minServings: 0.5, maxServings: 1.5, step: 0.1, generatorRole: 'primary' },
  { id: 'white-fish', name: 'White Fish (cod or tilapia)', category: 'protein', serving: g100(), macros: { calories: 96, protein: 21, carbs: 0, fat: 1 }, minServings: 1, maxServings: 3, step: 0.1, generatorRole: 'primary' },
  { id: 'prawns', name: 'Prawns', category: 'protein', serving: g100(), macros: { calories: 99, protein: 24, carbs: 0.2, fat: 0.3 }, minServings: 1, maxServings: 3, step: 0.1, generatorRole: 'primary' },
  { id: 'canned-tuna', name: 'Canned Tuna (in water)', category: 'protein', serving: { amount: 1, unit: 'can', grams: 112 }, macros: { calories: 130, protein: 29, carbs: 0, fat: 1.1 }, minServings: 1, maxServings: 2, step: 1, generatorRole: 'primary' },
  { id: 'lean-beef-sirloin', name: 'Lean Beef (sirloin)', category: 'protein', serving: g100(), macros: { calories: 183, protein: 27, carbs: 0, fat: 8 }, minServings: 0.8, maxServings: 2.5, step: 0.1, generatorRole: 'primary' },
  { id: 'lean-steak-flank', name: 'Lean Steak (flank)', category: 'protein', serving: g100(), macros: { calories: 192, protein: 28, carbs: 0, fat: 8.4 }, minServings: 0.8, maxServings: 2.5, step: 0.1, generatorRole: 'primary' },
  { id: 'beef-chunks', name: 'Lean Beef Chunks', category: 'protein', serving: g100(), macros: { calories: 175, protein: 27, carbs: 0, fat: 7 }, minServings: 0.8, maxServings: 2.5, step: 0.1, generatorRole: 'primary' },
  { id: 'ground-beef-93', name: 'Lean Ground Beef (93%)', category: 'protein', serving: g100(), macros: { calories: 172, protein: 26, carbs: 0, fat: 7 }, minServings: 0.8, maxServings: 2.5, step: 0.1, generatorRole: 'primary' },
  { id: 'ground-turkey-93', name: 'Lean Ground Turkey (93%)', category: 'protein', serving: g100(), macros: { calories: 170, protein: 27, carbs: 0, fat: 7 }, minServings: 0.8, maxServings: 2.5, step: 0.1, generatorRole: 'primary' },
  { id: 'turkey-breast-sliced', name: 'Turkey Breast (sliced)', category: 'protein', serving: g100(), macros: { calories: 135, protein: 30, carbs: 0, fat: 1 }, minServings: 0.8, maxServings: 2, step: 0.1, generatorRole: 'primary' },
  { id: 'pork-tenderloin', name: 'Pork Tenderloin', category: 'protein', serving: g100(), macros: { calories: 143, protein: 26, carbs: 0, fat: 3.5 }, minServings: 0.8, maxServings: 2.5, step: 0.1, generatorRole: 'primary' },
  { id: 'whole-egg', name: 'Whole Egg', category: 'protein', serving: { amount: 1, unit: 'piece', grams: 50 }, macros: { calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8 }, minServings: 1, maxServings: 4, step: 1, generatorRole: 'primary' },
  { id: 'egg-white', name: 'Egg White', category: 'protein', serving: { amount: 1, unit: 'piece', grams: 33 }, macros: { calories: 17, protein: 3.6, carbs: 0.2, fat: 0.1 }, minServings: 2, maxServings: 8, step: 1, generatorRole: 'primary' },
  { id: 'whey-protein', name: 'Whey Protein', category: 'protein', serving: { amount: 1, unit: 'scoop', grams: 30 }, macros: { calories: 120, protein: 25, carbs: 3, fat: 1.5 }, minServings: 1, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'casein-protein', name: 'Casein Protein', category: 'protein', serving: { amount: 1, unit: 'scoop', grams: 32 }, macros: { calories: 120, protein: 24, carbs: 4, fat: 1 }, minServings: 1, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'greek-yogurt-nonfat', name: 'Greek Yogurt (non-fat)', category: 'protein', serving: g100(), macros: { calories: 59, protein: 10, carbs: 3.6, fat: 0.4 }, minServings: 1, maxServings: 2.5, step: 0.1, generatorRole: 'primary' },
  { id: 'greek-yogurt', name: 'Greek Yogurt', category: 'protein', serving: g100(), macros: { calories: 97, protein: 9, carbs: 3.9, fat: 5 }, minServings: 1, maxServings: 2.5, step: 0.1, generatorRole: 'primary' },
  { id: 'cottage-cheese-lowfat', name: 'Cottage Cheese (low-fat)', category: 'protein', serving: g100(), macros: { calories: 84, protein: 11, carbs: 3.4, fat: 2.3 }, minServings: 1, maxServings: 2.5, step: 0.1, generatorRole: 'primary' },
  { id: 'ricotta', name: 'Ricotta Cheese', category: 'protein', serving: g100(), macros: { calories: 174, protein: 11, carbs: 3, fat: 13 }, minServings: 0.5, maxServings: 2, step: 0.1, generatorRole: 'primary' },
  { id: 'protein-bar', name: 'Protein Bar', category: 'protein', serving: { amount: 1, unit: 'piece', grams: 60 }, macros: { calories: 220, protein: 20, carbs: 22, fat: 7 }, minServings: 1, maxServings: 1, step: 1, generatorRole: 'never' },

  // ── Carbohydrate ────────────────────────────────────────────────────────────
  { id: 'white-rice-cooked', name: 'White Rice (cooked)', category: 'carb', serving: g100(), macros: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 }, minServings: 0.5, maxServings: 3, step: 0.1, generatorRole: 'primary' },
  { id: 'brown-rice-cooked', name: 'Brown Rice (cooked)', category: 'carb', serving: g100(), macros: { calories: 123, protein: 2.7, carbs: 26, fat: 1 }, minServings: 0.5, maxServings: 3, step: 0.1, generatorRole: 'primary' },
  { id: 'arborio-rice-cooked', name: 'Arborio Rice (cooked)', category: 'carb', serving: g100(), macros: { calories: 130, protein: 2.4, carbs: 28, fat: 0.3 }, minServings: 0.5, maxServings: 2.5, step: 0.1, generatorRole: 'primary' },
  { id: 'rice-noodles-cooked', name: 'Rice Noodles (cooked)', category: 'carb', serving: g100(), macros: { calories: 109, protein: 0.9, carbs: 25, fat: 0.2 }, minServings: 0.5, maxServings: 2.5, step: 0.1, generatorRole: 'primary' },
  { id: 'pasta-cooked', name: 'Pasta (cooked)', category: 'carb', serving: g100(), macros: { calories: 158, protein: 5.8, carbs: 31, fat: 0.9 }, minServings: 0.5, maxServings: 2.5, step: 0.1, generatorRole: 'primary' },
  { id: 'whole-grain-pasta-cooked', name: 'Whole Grain Pasta (cooked)', category: 'carb', serving: g100(), macros: { calories: 124, protein: 5, carbs: 25, fat: 1 }, minServings: 0.5, maxServings: 2.5, step: 0.1, generatorRole: 'primary' },
  { id: 'rolled-oats', name: 'Rolled Oats (dry)', category: 'carb', serving: g100(), macros: { calories: 379, protein: 13, carbs: 68, fat: 7 }, minServings: 0.3, maxServings: 1, step: 0.1, generatorRole: 'primary' },
  { id: 'sweet-potato', name: 'Sweet Potato (baked)', category: 'carb', serving: g100(), macros: { calories: 90, protein: 2, carbs: 21, fat: 0.1 }, minServings: 0.5, maxServings: 3, step: 0.1, generatorRole: 'primary' },
  { id: 'white-potato', name: 'Potato (boiled)', category: 'carb', serving: g100(), macros: { calories: 77, protein: 2, carbs: 17, fat: 0.1 }, minServings: 0.5, maxServings: 3.5, step: 0.1, generatorRole: 'primary' },
  { id: 'baked-potato', name: 'Baked Potato', category: 'carb', serving: { amount: 1, unit: 'large', grams: 300 }, macros: { calories: 261, protein: 7, carbs: 59, fat: 0.3 }, minServings: 0.5, maxServings: 1.5, step: 0.5, generatorRole: 'primary' },
  { id: 'mashed-potato', name: 'Mashed Potato', category: 'carb', serving: g100(), macros: { calories: 113, protein: 2, carbs: 17, fat: 4.2 }, minServings: 0.5, maxServings: 3.5, step: 0.1, generatorRole: 'primary' },
  { id: 'quinoa-cooked', name: 'Quinoa (cooked)', category: 'carb', serving: g100(), macros: { calories: 120, protein: 4.4, carbs: 22, fat: 1.9 }, minServings: 0.5, maxServings: 2.5, step: 0.1, generatorRole: 'primary' },
  { id: 'rice-cake', name: 'Rice Cake', category: 'carb', serving: { amount: 1, unit: 'piece', grams: 9 }, macros: { calories: 35, protein: 0.7, carbs: 7.3, fat: 0.3 }, minServings: 2, maxServings: 5, step: 1, generatorRole: 'primary' },
  { id: 'whole-grain-bread', name: 'Whole Grain Bread', category: 'carb', serving: { amount: 1, unit: 'slice', grams: 30 }, macros: { calories: 78, protein: 4, carbs: 13, fat: 1.2 }, minServings: 1, maxServings: 3, step: 1, generatorRole: 'primary' },
  { id: 'white-bread', name: 'White Bread', category: 'carb', serving: { amount: 1, unit: 'slice', grams: 25 }, macros: { calories: 66, protein: 2, carbs: 12.5, fat: 0.8 }, minServings: 1, maxServings: 3, step: 1, generatorRole: 'primary' },
  { id: 'sourdough', name: 'Sourdough', category: 'carb', serving: { amount: 1, unit: 'slice', grams: 45 }, macros: { calories: 120, protein: 4.8, carbs: 23, fat: 0.7 }, minServings: 1, maxServings: 3, step: 1, generatorRole: 'primary' },
  { id: 'bagel-whole-grain', name: 'Whole Grain Bagel', category: 'carb', serving: { amount: 1, unit: 'piece', grams: 95 }, macros: { calories: 245, protein: 10, carbs: 48, fat: 1.5 }, minServings: 0.5, maxServings: 1.5, step: 0.5, generatorRole: 'primary' },
  { id: 'whole-wheat-wrap', name: 'Whole Wheat Wrap', category: 'carb', serving: { amount: 1, unit: 'piece', grams: 60 }, macros: { calories: 170, protein: 6, carbs: 28, fat: 4 }, minServings: 1, maxServings: 2, step: 1, generatorRole: 'primary' },
  { id: 'flour-tortilla-large', name: 'Flour Tortilla', category: 'carb', serving: { amount: 1, unit: 'large', grams: 72 }, macros: { calories: 218, protein: 6, carbs: 36, fat: 5.5 }, minServings: 1, maxServings: 2, step: 1, generatorRole: 'primary' },
  { id: 'whole-wheat-tortilla-large', name: 'Whole Wheat Tortilla', category: 'carb', serving: { amount: 1, unit: 'large', grams: 62 }, macros: { calories: 180, protein: 5, carbs: 30, fat: 4.5 }, minServings: 1, maxServings: 2, step: 1, generatorRole: 'primary' },
  { id: 'pancake-whole-grain', name: 'Whole Grain Pancake', category: 'carb', serving: { amount: 1, unit: 'piece', grams: 60 }, macros: { calories: 130, protein: 4, carbs: 22, fat: 3 }, minServings: 1, maxServings: 4, step: 1, generatorRole: 'primary' },
  { id: 'black-beans', name: 'Black Beans (cooked)', category: 'carb', serving: g100(), macros: { calories: 132, protein: 9, carbs: 24, fat: 0.5 }, minServings: 0.5, maxServings: 2, step: 0.1, generatorRole: 'primary' },
  { id: 'lentils', name: 'Lentils (cooked)', category: 'carb', serving: g100(), macros: { calories: 116, protein: 9, carbs: 20, fat: 0.4 }, minServings: 0.5, maxServings: 2, step: 0.1, generatorRole: 'primary' },
  { id: 'banana', name: 'Banana', category: 'carb', serving: { amount: 1, unit: 'medium', grams: 118 }, macros: { calories: 105, protein: 1.3, carbs: 27, fat: 0.4 }, minServings: 0.5, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'apple', name: 'Apple', category: 'carb', serving: { amount: 1, unit: 'medium', grams: 182 }, macros: { calories: 95, protein: 0.5, carbs: 25, fat: 0.3 }, minServings: 1, maxServings: 2, step: 1, generatorRole: 'primary' },
  { id: 'mixed-berries', name: 'Mixed Berries', category: 'carb', serving: g100(), macros: { calories: 57, protein: 0.7, carbs: 14, fat: 0.3 }, minServings: 0.5, maxServings: 2, step: 0.1, generatorRole: 'side' },
  { id: 'blueberries', name: 'Blueberries', category: 'carb', serving: g100(), macros: { calories: 57, protein: 0.7, carbs: 14.5, fat: 0.3 }, minServings: 0.5, maxServings: 2, step: 0.1, generatorRole: 'side' },
  { id: 'mango', name: 'Mango Chunks', category: 'carb', serving: { amount: 1, unit: 'cup', grams: 165 }, macros: { calories: 99, protein: 1.4, carbs: 25, fat: 0.6 }, minServings: 0.5, maxServings: 2, step: 0.5, generatorRole: 'side' },
  { id: 'medjool-date', name: 'Medjool Date', category: 'carb', serving: { amount: 1, unit: 'piece', grams: 24 }, macros: { calories: 66, protein: 0.4, carbs: 18, fat: 0 }, minServings: 2, maxServings: 5, step: 1, generatorRole: 'side' },
  { id: 'granola', name: 'Granola', category: 'carb', serving: { amount: 30, unit: 'g', grams: 30 }, macros: { calories: 140, protein: 3.5, carbs: 21, fat: 5 }, minServings: 1, maxServings: 2, step: 0.5, generatorRole: 'side' },
  { id: 'honey', name: 'Honey', category: 'carb', serving: { amount: 1, unit: 'tbsp', grams: 21 }, macros: { calories: 64, protein: 0.1, carbs: 17, fat: 0 }, minServings: 0.5, maxServings: 2, step: 0.5, generatorRole: 'side' },
  { id: 'maple-syrup', name: 'Maple Syrup', category: 'carb', serving: { amount: 1, unit: 'tbsp', grams: 20 }, macros: { calories: 52, protein: 0, carbs: 13.4, fat: 0 }, minServings: 0.5, maxServings: 4, step: 0.5, generatorRole: 'side' },
  { id: 'jam', name: 'Jam', category: 'carb', serving: { amount: 1, unit: 'tbsp', grams: 20 }, macros: { calories: 56, protein: 0.1, carbs: 14, fat: 0 }, minServings: 0.5, maxServings: 2, step: 0.5, generatorRole: 'side' },
  { id: 'orange-juice', name: 'Orange Juice', category: 'carb', serving: { amount: 100, unit: 'ml', grams: 104 }, macros: { calories: 45, protein: 0.7, carbs: 10.4, fat: 0.2 }, minServings: 1, maxServings: 3, step: 0.5, generatorRole: 'side' },
  { id: 'coconut-water', name: 'Coconut Water', category: 'carb', serving: { amount: 100, unit: 'ml', grams: 100 }, macros: { calories: 19, protein: 0.7, carbs: 3.7, fat: 0.2 }, minServings: 1, maxServings: 4, step: 0.5, generatorRole: 'side' },
  { id: 'chocolate-milk-lowfat', name: 'Low-fat Chocolate Milk', category: 'carb', serving: { amount: 100, unit: 'ml', grams: 103 }, macros: { calories: 63, protein: 3.2, carbs: 10.4, fat: 1 }, minServings: 2, maxServings: 5, step: 0.5, generatorRole: 'side' },
  { id: 'hummus', name: 'Hummus', category: 'carb', serving: { amount: 1, unit: 'tbsp', grams: 15 }, macros: { calories: 25, protein: 1.2, carbs: 2, fat: 1.4 }, minServings: 1, maxServings: 3, step: 1, generatorRole: 'side' },
  { id: 'marinara-sauce', name: 'Marinara Sauce', category: 'carb', serving: g100(), macros: { calories: 45, protein: 1.2, carbs: 7.3, fat: 1.2 }, minServings: 0.5, maxServings: 3, step: 0.5, generatorRole: 'side' },
  { id: 'tomato-sauce', name: 'Tomato Sauce', category: 'carb', serving: g100(), macros: { calories: 32, protein: 1.6, carbs: 7, fat: 0.2 }, minServings: 0.5, maxServings: 3, step: 0.5, generatorRole: 'side' },
  { id: 'diced-tomatoes', name: 'Diced Tomatoes (canned)', category: 'carb', serving: { amount: 1, unit: 'can', grams: 400 }, macros: { calories: 128, protein: 6.4, carbs: 29, fat: 0.8 }, minServings: 0.5, maxServings: 1, step: 0.5, generatorRole: 'side' },
  { id: 'salsa', name: 'Salsa', category: 'carb', serving: { amount: 2, unit: 'tbsp', grams: 32 }, macros: { calories: 10, protein: 0.5, carbs: 2, fat: 0.1 }, minServings: 1, maxServings: 3, step: 1, generatorRole: 'side' },

  // ── Fat ─────────────────────────────────────────────────────────────────────
  { id: 'avocado', name: 'Avocado', category: 'fat', serving: { amount: 0.5, unit: 'medium', grams: 75 }, macros: { calories: 120, protein: 1.5, carbs: 6.4, fat: 11 }, minServings: 1, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'peanut-butter', name: 'Natural Peanut Butter', category: 'fat', serving: { amount: 1, unit: 'tbsp', grams: 16 }, macros: { calories: 94, protein: 4, carbs: 3, fat: 8 }, minServings: 1, maxServings: 3, step: 0.5, generatorRole: 'primary' },
  { id: 'almond-butter', name: 'Almond Butter', category: 'fat', serving: { amount: 1, unit: 'tbsp', grams: 16 }, macros: { calories: 98, protein: 3.4, carbs: 3, fat: 9 }, minServings: 1, maxServings: 3, step: 0.5, generatorRole: 'primary' },
  { id: 'olive-oil', name: 'Olive Oil', category: 'fat', serving: { amount: 1, unit: 'tbsp', grams: 14 }, macros: { calories: 119, protein: 0, carbs: 0, fat: 13.5 }, minServings: 0.5, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'coconut-oil', name: 'Coconut Oil', category: 'fat', serving: { amount: 1, unit: 'tbsp', grams: 14 }, macros: { calories: 121, protein: 0, carbs: 0, fat: 14 }, minServings: 0.5, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'sesame-oil', name: 'Sesame Oil', category: 'fat', serving: { amount: 1, unit: 'tbsp', grams: 14 }, macros: { calories: 120, protein: 0, carbs: 0, fat: 13.6 }, minServings: 0.5, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'butter', name: 'Butter', category: 'fat', serving: { amount: 1, unit: 'tbsp', grams: 14 }, macros: { calories: 102, protein: 0.1, carbs: 0, fat: 11.5 }, minServings: 0.5, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'mayo', name: 'Mayonnaise', category: 'fat', serving: { amount: 1, unit: 'tbsp', grams: 14 }, macros: { calories: 94, protein: 0.1, carbs: 0.1, fat: 10 }, minServings: 0.5, maxServings: 2, step: 0.5, generatorRole: 'side' },
  { id: 'mixed-nuts', name: 'Mixed Nuts', category: 'fat', serving: { amount: 30, unit: 'g', grams: 30 }, macros: { calories: 173, protein: 5, carbs: 6, fat: 16 }, minServings: 0.5, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'almonds', name: 'Almonds', category: 'fat', serving: { amount: 30, unit: 'g', grams: 30 }, macros: { calories: 174, protein: 6, carbs: 6, fat: 15 }, minServings: 0.5, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'walnuts', name: 'Walnuts', category: 'fat', serving: { amount: 30, unit: 'g', grams: 30 }, macros: { calories: 196, protein: 4.6, carbs: 4, fat: 19.6 }, minServings: 0.5, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'trail-mix', name: 'Nut & Dried Fruit Mix', category: 'fat', serving: { amount: 30, unit: 'g', grams: 30 }, macros: { calories: 140, protein: 4, carbs: 13, fat: 8 }, minServings: 1, maxServings: 2, step: 0.5, generatorRole: 'side' },
  { id: 'chia-seeds', name: 'Chia Seeds', category: 'fat', serving: { amount: 1, unit: 'tbsp', grams: 12 }, macros: { calories: 58, protein: 2, carbs: 5, fat: 3.7 }, minServings: 1, maxServings: 3, step: 1, generatorRole: 'side' },
  { id: 'sesame-seeds', name: 'Sesame Seeds', category: 'fat', serving: { amount: 1, unit: 'tbsp', grams: 9 }, macros: { calories: 52, protein: 1.6, carbs: 2.1, fat: 4.5 }, minServings: 1, maxServings: 2, step: 1, generatorRole: 'side' },
  { id: 'whole-milk', name: 'Whole Milk', category: 'fat', serving: { amount: 100, unit: 'ml', grams: 103 }, macros: { calories: 61, protein: 3.2, carbs: 4.8, fat: 3.3 }, minServings: 1, maxServings: 4, step: 0.5, generatorRole: 'primary' },
  { id: 'milk', name: 'Semi-skimmed Milk', category: 'fat', serving: { amount: 100, unit: 'ml', grams: 103 }, macros: { calories: 50, protein: 3.4, carbs: 4.9, fat: 1.8 }, minServings: 1, maxServings: 4, step: 0.5, generatorRole: 'primary' },
  { id: 'almond-milk', name: 'Almond Milk (unsweetened)', category: 'fat', serving: { amount: 100, unit: 'ml', grams: 100 }, macros: { calories: 15, protein: 0.5, carbs: 0.6, fat: 1.2 }, minServings: 1, maxServings: 4, step: 0.5, generatorRole: 'side' },
  { id: 'oat-milk', name: 'Oat Milk', category: 'fat', serving: { amount: 100, unit: 'ml', grams: 100 }, macros: { calories: 45, protein: 1, carbs: 6.7, fat: 1.5 }, minServings: 1, maxServings: 4, step: 0.5, generatorRole: 'side' },
  { id: 'cheddar-cheese', name: 'Cheddar Cheese', category: 'fat', serving: { amount: 30, unit: 'g', grams: 30 }, macros: { calories: 121, protein: 7, carbs: 0.4, fat: 10 }, minServings: 0.5, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'feta-cheese', name: 'Feta Cheese', category: 'fat', serving: { amount: 30, unit: 'g', grams: 30 }, macros: { calories: 79, protein: 4.2, carbs: 1.2, fat: 6.4 }, minServings: 0.5, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'parmesan', name: 'Parmesan', category: 'fat', serving: { amount: 1, unit: 'tbsp', grams: 5 }, macros: { calories: 22, protein: 2, carbs: 0.2, fat: 1.5 }, minServings: 1, maxServings: 3, step: 1, generatorRole: 'side' },
  { id: 'cream-cheese', name: 'Cream Cheese', category: 'fat', serving: { amount: 1, unit: 'tbsp', grams: 15 }, macros: { calories: 51, protein: 0.9, carbs: 0.8, fat: 5 }, minServings: 1, maxServings: 3, step: 1, generatorRole: 'side' },
  { id: 'sour-cream', name: 'Sour Cream', category: 'fat', serving: { amount: 1, unit: 'tbsp', grams: 12 }, macros: { calories: 23, protein: 0.3, carbs: 0.5, fat: 2.3 }, minServings: 1, maxServings: 3, step: 1, generatorRole: 'side' },
  { id: 'dark-chocolate', name: 'Dark Chocolate (85%)', category: 'fat', serving: { amount: 1, unit: 'piece', grams: 10 }, macros: { calories: 60, protein: 1.2, carbs: 3.3, fat: 5 }, minServings: 1, maxServings: 4, step: 1, generatorRole: 'side' },
  { id: 'dark-chocolate-chips', name: 'Dark Chocolate Chips', category: 'fat', serving: { amount: 30, unit: 'g', grams: 30 }, macros: { calories: 160, protein: 1.5, carbs: 18, fat: 9 }, minServings: 0.5, maxServings: 2, step: 0.5, generatorRole: 'side' },

  // ── Vegetables ──────────────────────────────────────────────────────────────
  { id: 'broccoli', name: 'Broccoli', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 91 }, macros: { calories: 31, protein: 2.6, carbs: 6, fat: 0.3 }, minServings: 1, maxServings: 3, step: 0.5, generatorRole: 'primary' },
  { id: 'spinach', name: 'Spinach', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 30 }, macros: { calories: 7, protein: 0.9, carbs: 1.1, fat: 0.1 }, minServings: 1, maxServings: 4, step: 0.5, generatorRole: 'primary' },
  { id: 'asparagus', name: 'Asparagus', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 134 }, macros: { calories: 27, protein: 3, carbs: 5, fat: 0.2 }, minServings: 1, maxServings: 3, step: 0.5, generatorRole: 'primary' },
  { id: 'bell-peppers', name: 'Bell Peppers', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 149 }, macros: { calories: 46, protein: 1.5, carbs: 9, fat: 0.4 }, minServings: 1, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'zucchini', name: 'Zucchini', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 113 }, macros: { calories: 27, protein: 2, carbs: 5, fat: 0.5 }, minServings: 1, maxServings: 3, step: 0.5, generatorRole: 'primary' },
  { id: 'kale', name: 'Kale', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 67 }, macros: { calories: 33, protein: 2.9, carbs: 6, fat: 0.5 }, minServings: 1, maxServings: 3, step: 0.5, generatorRole: 'primary' },
  { id: 'cherry-tomatoes', name: 'Cherry Tomatoes', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 149 }, macros: { calories: 27, protein: 1.3, carbs: 5.8, fat: 0.3 }, minServings: 0.5, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'cucumber', name: 'Cucumber', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 119 }, macros: { calories: 16, protein: 0.7, carbs: 3.8, fat: 0.1 }, minServings: 1, maxServings: 3, step: 0.5, generatorRole: 'primary' },
  { id: 'green-beans', name: 'Green Beans', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 125 }, macros: { calories: 44, protein: 2.4, carbs: 10, fat: 0.4 }, minServings: 1, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'snap-peas', name: 'Snap Peas', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 98 }, macros: { calories: 41, protein: 2.7, carbs: 7.4, fat: 0.2 }, minServings: 1, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'bok-choy', name: 'Bok Choy', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 170 }, macros: { calories: 20, protein: 2.7, carbs: 3, fat: 0.3 }, minServings: 1, maxServings: 3, step: 0.5, generatorRole: 'primary' },
  { id: 'cauliflower-rice', name: 'Cauliflower Rice', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 107 }, macros: { calories: 25, protein: 2, carbs: 5, fat: 0.3 }, minServings: 1, maxServings: 3, step: 0.5, generatorRole: 'primary' },
  { id: 'mushrooms', name: 'Mushrooms (sautéed)', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 156 }, macros: { calories: 44, protein: 6.2, carbs: 6, fat: 0.9 }, minServings: 0.5, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'onion', name: 'Onion', category: 'vegetable', serving: { amount: 0.5, unit: 'cup', grams: 80 }, macros: { calories: 32, protein: 0.9, carbs: 7.5, fat: 0.1 }, minServings: 0.5, maxServings: 2, step: 0.5, generatorRole: 'side' },
  { id: 'mixed-greens', name: 'Mixed Greens', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 36 }, macros: { calories: 6, protein: 0.5, carbs: 1.1, fat: 0.1 }, minServings: 1, maxServings: 4, step: 0.5, generatorRole: 'primary' },
  { id: 'lettuce', name: 'Lettuce', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 36 }, macros: { calories: 5, protein: 0.5, carbs: 1, fat: 0.1 }, minServings: 1, maxServings: 3, step: 0.5, generatorRole: 'side' },
  { id: 'mixed-vegetables', name: 'Mixed Vegetables', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 91 }, macros: { calories: 59, protein: 2.6, carbs: 12, fat: 0.2 }, minServings: 1, maxServings: 3, step: 0.5, generatorRole: 'primary' },
  { id: 'root-vegetables', name: 'Mixed Root Vegetables', category: 'vegetable', serving: g100(), macros: { calories: 62, protein: 1.4, carbs: 14, fat: 0.3 }, minServings: 1, maxServings: 3, step: 0.5, generatorRole: 'primary' },
  { id: 'carrots', name: 'Carrots', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 128 }, macros: { calories: 52, protein: 1.2, carbs: 12, fat: 0.3 }, minServings: 1, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'celery', name: 'Celery', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 101 }, macros: { calories: 16, protein: 0.7, carbs: 3, fat: 0.2 }, minServings: 1, maxServings: 2, step: 0.5, generatorRole: 'side' },
  { id: 'bean-sprouts', name: 'Bean Sprouts', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 104 }, macros: { calories: 31, protein: 3.2, carbs: 6.2, fat: 0.2 }, minServings: 1, maxServings: 2, step: 0.5, generatorRole: 'primary' },
  { id: 'tomato', name: 'Tomato', category: 'vegetable', serving: { amount: 1, unit: 'medium', grams: 123 }, macros: { calories: 22, protein: 1.1, carbs: 4.8, fat: 0.2 }, minServings: 1, maxServings: 2, step: 1, generatorRole: 'side' },
  { id: 'jalapeno', name: 'Jalapeño', category: 'vegetable', serving: { amount: 1, unit: 'piece', grams: 14 }, macros: { calories: 4, protein: 0.1, carbs: 0.8, fat: 0.1 }, minServings: 1, maxServings: 2, step: 1, generatorRole: 'side' },
  { id: 'frozen-berries', name: 'Frozen Berries', category: 'vegetable', serving: { amount: 1, unit: 'cup', grams: 140 }, macros: { calories: 70, protein: 1, carbs: 17, fat: 0.5 }, minServings: 0.5, maxServings: 2, step: 0.5, generatorRole: 'side' },

  // ── Seasonings, aromatics and no-macro extras ───────────────────────────────
  // Present so recipe text stays human ("Salt, pepper, hot sauce") without
  // pretending a pinch of pepper carries macros. `generatorRole: 'never'` keeps
  // every one of them out of generated meals.
  ...([
    ['salt', 'Salt'], ['black-pepper', 'Black Pepper'], ['garlic', 'Garlic'],
    ['garlic-powder', 'Garlic Powder'], ['onion-powder', 'Onion Powder'],
    ['paprika', 'Paprika'], ['cumin', 'Cumin'], ['cinnamon', 'Cinnamon'],
    ['fresh-herbs', 'Fresh Herbs'], ['dried-herbs', 'Dried Herbs'],
    ['rosemary', 'Rosemary'], ['thyme', 'Thyme'], ['dill', 'Dill'],
    ['basil', 'Basil'], ['ginger', 'Ginger'], ['chilli', 'Chilli'],
    ['lemon', 'Lemon'], ['lime', 'Lime'], ['capers', 'Capers'],
    ['hot-sauce', 'Hot Sauce'], ['green-onion', 'Green Onion'],
    ['baking-powder', 'Baking Powder'], ['ice', 'Ice'], ['water', 'Water'],
    ['bcaa', 'BCAA Supplement'], ['creatine', 'Creatine Monohydrate'],
    ['bone-broth', 'Bone Broth'],
  ] as const).map(([id, name]): Food => ({
    id,
    name,
    category: 'seasoning',
    serving: { amount: 1, unit: 'pinch', grams: 1 },
    macros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    minServings: 1,
    maxServings: 1,
    step: 1,
    generatorRole: 'never',
  })),

  // ── Condiments with enough macros to count ──────────────────────────────────
  { id: 'soy-sauce', name: 'Soy Sauce', category: 'seasoning', serving: { amount: 1, unit: 'tbsp', grams: 16 }, macros: { calories: 9, protein: 1.3, carbs: 0.8, fat: 0 }, minServings: 1, maxServings: 3, step: 1, generatorRole: 'never' },
  { id: 'oyster-sauce', name: 'Oyster Sauce', category: 'seasoning', serving: { amount: 1, unit: 'tbsp', grams: 18 }, macros: { calories: 9, protein: 0.2, carbs: 2, fat: 0 }, minServings: 1, maxServings: 3, step: 1, generatorRole: 'never' },
  { id: 'teriyaki-sauce', name: 'Teriyaki Sauce', category: 'seasoning', serving: { amount: 1, unit: 'tbsp', grams: 18 }, macros: { calories: 16, protein: 1, carbs: 2.7, fat: 0 }, minServings: 1, maxServings: 3, step: 1, generatorRole: 'never' },
];

const BY_ID = new Map(FOOD_DATABASE.map(f => [f.id, f]));

export function getFood(id: string): Food | undefined {
  return BY_ID.get(id);
}

/**
 * Throwing lookup for the places that cannot proceed without the food — recipe
 * macro computation, chiefly. A dangling reference is a build-time authoring
 * bug, and the integrity test catches it long before this fires.
 */
export function requireFood(id: string): Food {
  const food = BY_ID.get(id);
  if (!food) throw new Error(`Unknown food id: ${id}`);
  return food;
}
