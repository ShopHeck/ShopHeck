export type MealTime = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Pre-Workout' | 'Post-Workout';
export type MealGoal = 'Cut' | 'Maintain' | 'Build';

export interface Macros {
  calories: number;
  protein: number; // grams
  carbs: number;   // grams
  fat: number;     // grams
}

export interface PresetMeal {
  time: MealTime;
  name: string;
  description: string;
  ingredients: string[];
  macros: Macros;
}

export interface MealPlan {
  id: string;
  name: string;
  goal: MealGoal;
  phase: string;
  description: string;
  totalMacros: Macros;
  meals: PresetMeal[];
}

// ─── Preset Meal Plans ────────────────────────────────────────────────────────

export const MEAL_PLANS: MealPlan[] = [
  // ── CUT ──────────────────────────────────────────────────────────────────────
  {
    id: 'cut-fight-week',
    name: 'Fight Week Cut',
    goal: 'Cut',
    phase: 'Fight Week',
    description: 'Aggressive cut for the final 7 days before weigh-in. Low carb, high protein, water management.',
    totalMacros: { calories: 1600, protein: 190, carbs: 80, fat: 50 },
    meals: [
      {
        time: 'Breakfast',
        name: 'Egg White & Veggie Scramble',
        description: 'High protein, very low calorie start with minimal carbs.',
        ingredients: ['6 egg whites', '1 whole egg', '1 cup spinach', '½ cup mushrooms', '¼ cup diced onion', 'Salt, pepper, hot sauce'],
        macros: { calories: 220, protein: 35, carbs: 8, fat: 5 },
      },
      {
        time: 'Lunch',
        name: 'Grilled Chicken & Broccoli',
        description: 'Lean protein with a low-carb vegetable.',
        ingredients: ['220g chicken breast', '2 cups broccoli', '1 tsp olive oil', 'Garlic powder, salt, lemon'],
        macros: { calories: 320, protein: 55, carbs: 12, fat: 7 },
      },
      {
        time: 'Snack',
        name: 'Greek Yogurt & Cucumber',
        description: 'Protein-dense snack with high water content.',
        ingredients: ['200g non-fat Greek yogurt', '1 cucumber (sliced)', 'Salt, dill'],
        macros: { calories: 130, protein: 22, carbs: 9, fat: 0 },
      },
      {
        time: 'Dinner',
        name: 'Baked White Fish & Asparagus',
        description: 'Very lean protein, minimal carbs.',
        ingredients: ['250g white fish (cod or tilapia)', '1 bunch asparagus', '1 tsp olive oil', 'Lemon, herbs, garlic'],
        macros: { calories: 280, protein: 50, carbs: 8, fat: 7 },
      },
      {
        time: 'Pre-Workout',
        name: 'Small Banana & BCAA',
        description: 'Minimal energy for the last light training sessions.',
        ingredients: ['½ banana', 'BCAA supplement (water)'],
        macros: { calories: 50, protein: 0, carbs: 13, fat: 0 },
      },
      {
        time: 'Post-Workout',
        name: 'Protein Shake',
        description: 'Fast protein to preserve muscle during the cut.',
        ingredients: ['1 scoop whey protein', 'Water', 'Ice'],
        macros: { calories: 120, protein: 25, carbs: 3, fat: 1 },
      },
    ],
  },
  {
    id: 'cut-camp-base',
    name: 'Slow Cut — Camp Base',
    goal: 'Cut',
    phase: 'Camp Base',
    description: 'Moderate caloric deficit for steady weight loss during camp without compromising training quality.',
    totalMacros: { calories: 2100, protein: 200, carbs: 180, fat: 60 },
    meals: [
      {
        time: 'Breakfast',
        name: 'Oats & Protein',
        description: 'Moderate carbs to fuel morning training.',
        ingredients: ['60g rolled oats', '1 scoop protein powder', '½ banana', '1 tsp honey', '200ml milk or oat milk'],
        macros: { calories: 420, protein: 40, carbs: 52, fat: 7 },
      },
      {
        time: 'Pre-Workout',
        name: 'Rice Cake & Peanut Butter',
        description: 'Quick energy before training.',
        ingredients: ['2 rice cakes', '1 tbsp natural peanut butter', '1 tsp honey'],
        macros: { calories: 200, protein: 5, carbs: 28, fat: 8 },
      },
      {
        time: 'Post-Workout',
        name: 'Protein Shake & Banana',
        description: 'Rapid recovery nutrition.',
        ingredients: ['1 scoop whey protein', '1 banana', '300ml milk'],
        macros: { calories: 310, protein: 35, carbs: 35, fat: 4 },
      },
      {
        time: 'Lunch',
        name: 'Turkey Wrap',
        description: 'Balanced midday meal.',
        ingredients: ['150g sliced turkey breast', '1 whole wheat wrap', 'Lettuce, tomato, cucumber', '1 tbsp hummus', '½ avocado'],
        macros: { calories: 420, protein: 38, carbs: 35, fat: 15 },
      },
      {
        time: 'Dinner',
        name: 'Salmon, Brown Rice & Vegetables',
        description: 'Omega-3 rich dinner to support recovery and inflammation.',
        ingredients: ['180g salmon fillet', '100g cooked brown rice', '2 cups mixed vegetables (broccoli, carrots, snap peas)', '1 tsp sesame oil', 'Soy sauce, ginger, garlic'],
        macros: { calories: 480, protein: 42, carbs: 38, fat: 15 },
      },
      {
        time: 'Snack',
        name: 'Cottage Cheese & Berries',
        description: 'Slow-digesting protein before sleep.',
        ingredients: ['200g low-fat cottage cheese', '100g mixed berries'],
        macros: { calories: 180, protein: 25, carbs: 16, fat: 2 },
      },
    ],
  },
  {
    id: 'cut-peak',
    name: 'Peak Phase Cut',
    goal: 'Cut',
    phase: 'Peak',
    description: 'Carb cycling approach during peak training week — high carbs on heavy sparring days, lower on rest days.',
    totalMacros: { calories: 1950, protein: 190, carbs: 170, fat: 55 },
    meals: [
      {
        time: 'Breakfast',
        name: 'Sweet Potato & Egg Scramble',
        description: 'Complex carbs and protein to power the heaviest training day.',
        ingredients: ['200g sweet potato (roasted)', '3 eggs + 2 egg whites', '1 cup kale', '1 tsp coconut oil', 'Salt, pepper, cumin'],
        macros: { calories: 460, protein: 30, carbs: 48, fat: 14 },
      },
      {
        time: 'Pre-Workout',
        name: 'White Rice & Chicken',
        description: 'Fast carbs with moderate protein 90 min before training.',
        ingredients: ['120g cooked white rice', '100g chicken breast', 'Soy sauce', 'Sesame seeds'],
        macros: { calories: 320, protein: 30, carbs: 40, fat: 4 },
      },
      {
        time: 'Post-Workout',
        name: 'Protein & Banana Shake',
        description: 'Rapid glycogen replenishment and muscle protein synthesis.',
        ingredients: ['1.5 scoops whey protein', '1 banana', '250ml coconut water'],
        macros: { calories: 330, protein: 40, carbs: 35, fat: 2 },
      },
      {
        time: 'Lunch',
        name: 'Ground Turkey Rice Bowl',
        description: 'High protein balanced meal post training.',
        ingredients: ['180g lean ground turkey (93%)', '120g cooked white rice', '1 cup roasted zucchini', 'Garlic, tomato, herbs'],
        macros: { calories: 440, protein: 48, carbs: 36, fat: 10 },
      },
      {
        time: 'Dinner',
        name: 'Grilled Chicken & Quinoa',
        description: 'Complete protein evening meal with moderate carbs.',
        ingredients: ['180g chicken breast', '80g cooked quinoa', '1 cup spinach salad', '1 tbsp olive oil dressing', 'Cherry tomatoes, lemon'],
        macros: { calories: 400, protein: 52, carbs: 28, fat: 10 },
      },
    ],
  },
  {
    id: 'cut-recovery',
    name: 'Cut — Active Recovery Day',
    goal: 'Cut',
    phase: 'Recovery',
    description: 'Lower overall calories on non-training days while maintaining protein and micronutrients.',
    totalMacros: { calories: 1750, protein: 185, carbs: 110, fat: 55 },
    meals: [
      {
        time: 'Breakfast',
        name: 'Veggie Omelette',
        description: 'Protein-rich, low-carb start on a rest day.',
        ingredients: ['3 eggs + 2 egg whites', '1 cup bell peppers', '½ cup onion', '¼ cup feta cheese', '1 tsp olive oil', 'Fresh herbs'],
        macros: { calories: 330, protein: 30, carbs: 10, fat: 18 },
      },
      {
        time: 'Lunch',
        name: 'Tuna Salad',
        description: 'High protein, light on carbs, omega-3 boost.',
        ingredients: ['2 cans tuna (in water)', '2 cups mixed greens', '½ avocado', 'Cherry tomatoes', '1 tbsp olive oil + lemon', 'Capers, cucumber'],
        macros: { calories: 380, protein: 52, carbs: 10, fat: 16 },
      },
      {
        time: 'Snack',
        name: 'Apple & Almonds',
        description: 'Fiber and healthy fats to control hunger.',
        ingredients: ['1 medium apple', '30g almonds'],
        macros: { calories: 235, protein: 6, carbs: 26, fat: 14 },
      },
      {
        time: 'Dinner',
        name: 'Beef Stir-Fry & Cauliflower Rice',
        description: 'High protein dinner with a low-carb base.',
        ingredients: ['180g lean beef (sirloin)', '2 cups cauliflower rice', '1 cup bok choy', '1 cup snap peas', '1 tbsp sesame oil', 'Ginger, garlic, soy sauce'],
        macros: { calories: 420, protein: 48, carbs: 18, fat: 16 },
      },
      {
        time: 'Snack',
        name: 'Casein Protein Shake',
        description: 'Slow-release protein overnight to prevent muscle breakdown.',
        ingredients: ['1 scoop casein protein', '250ml almond milk', 'Ice'],
        macros: { calories: 160, protein: 28, carbs: 8, fat: 2 },
      },
    ],
  },

  // ── MAINTAIN ──────────────────────────────────────────────────────────────────
  {
    id: 'maintain-heavy-day',
    name: 'Maintenance — Heavy Training Day',
    goal: 'Maintain',
    phase: 'Camp Base',
    description: 'Full-calorie day matched to a high-volume training session. Adequate carbs to fuel and recover from 2-a-days.',
    totalMacros: { calories: 2700, protein: 200, carbs: 300, fat: 75 },
    meals: [
      {
        time: 'Breakfast',
        name: 'Power Breakfast Bowl',
        description: 'Big energy to start a double session day.',
        ingredients: ['80g oats', '2 eggs (poached)', '1 banana', '30g walnuts', '200ml whole milk', '1 tbsp honey', '1 scoop protein powder'],
        macros: { calories: 640, protein: 45, carbs: 75, fat: 20 },
      },
      {
        time: 'Pre-Workout',
        name: 'White Rice & Tuna',
        description: 'Easily digested pre-workout carb-protein combo.',
        ingredients: ['150g cooked white rice', '1 can tuna', 'Soy sauce', 'Green onion'],
        macros: { calories: 360, protein: 32, carbs: 50, fat: 3 },
      },
      {
        time: 'Post-Workout',
        name: 'Recovery Shake',
        description: '4:1 carb-to-protein ratio for glycogen replenishment.',
        ingredients: ['1.5 scoops whey protein', '1 large banana', '300ml orange juice', 'Ice'],
        macros: { calories: 400, protein: 40, carbs: 55, fat: 2 },
      },
      {
        time: 'Lunch',
        name: 'Chicken & Pasta',
        description: 'Classic fighter meal — high carb and protein.',
        ingredients: ['200g chicken breast', '150g cooked pasta', '1 cup marinara sauce', '1 cup broccoli', '1 tbsp olive oil', 'Parmesan (small amount)'],
        macros: { calories: 560, protein: 55, carbs: 60, fat: 12 },
      },
      {
        time: 'Dinner',
        name: 'Steak, Potato & Greens',
        description: 'Protein and carb recovery dinner.',
        ingredients: ['200g lean steak (flank)', '1 large baked potato', '2 cups mixed greens', '1 tbsp olive oil', 'Salt, pepper, herbs'],
        macros: { calories: 540, protein: 50, carbs: 48, fat: 16 },
      },
      {
        time: 'Snack',
        name: 'Greek Yogurt Parfait',
        description: 'Evening protein and some carbs.',
        ingredients: ['200g Greek yogurt', '50g granola', '100g mixed berries'],
        macros: { calories: 330, protein: 22, carbs: 42, fat: 8 },
      },
    ],
  },
  {
    id: 'maintain-moderate-day',
    name: 'Maintenance — Moderate Day',
    goal: 'Maintain',
    phase: 'Camp Base',
    description: 'Balanced day for single training sessions. Sustainable eating pattern for the full camp duration.',
    totalMacros: { calories: 2400, protein: 190, carbs: 240, fat: 70 },
    meals: [
      {
        time: 'Breakfast',
        name: 'Eggs & Toast',
        description: 'Classic balanced breakfast.',
        ingredients: ['3 eggs (scrambled)', '2 slices whole grain toast', '½ avocado', '½ cup cherry tomatoes', 'Salt, pepper, hot sauce'],
        macros: { calories: 480, protein: 28, carbs: 38, fat: 24 },
      },
      {
        time: 'Pre-Workout',
        name: 'Banana & Peanut Butter',
        description: 'Quick accessible fuel 45–60 min before.',
        ingredients: ['1 banana', '2 tbsp natural peanut butter'],
        macros: { calories: 280, protein: 7, carbs: 35, fat: 16 },
      },
      {
        time: 'Post-Workout',
        name: 'Chocolate Milk',
        description: 'Classic recovery — casein + whey + fast carbs.',
        ingredients: ['500ml low-fat chocolate milk'],
        macros: { calories: 300, protein: 18, carbs: 50, fat: 5 },
      },
      {
        time: 'Lunch',
        name: 'Salmon Sandwich',
        description: 'Omega-3 rich midday meal.',
        ingredients: ['150g salmon fillet', '2 slices sourdough', 'Lettuce, tomato, red onion', '1 tbsp mayo', 'Cucumber, lemon'],
        macros: { calories: 480, protein: 42, carbs: 38, fat: 16 },
      },
      {
        time: 'Dinner',
        name: 'Chicken Fried Rice',
        description: 'Satisfying evening meal with complete macros.',
        ingredients: ['180g chicken breast', '200g cooked brown rice', '2 eggs', '1 cup mixed vegetables', '2 tbsp soy sauce', '1 tbsp sesame oil', 'Green onion, garlic, ginger'],
        macros: { calories: 560, protein: 55, carbs: 55, fat: 14 },
      },
      {
        time: 'Snack',
        name: 'Protein Bar or Cottage Cheese',
        description: 'Flexible evening snack.',
        ingredients: ['200g cottage cheese or 1 quality protein bar', '50g blueberries'],
        macros: { calories: 230, protein: 28, carbs: 22, fat: 4 },
      },
    ],
  },
  {
    id: 'maintain-fight-specific',
    name: 'Maintenance — Fight Specific Phase',
    goal: 'Maintain',
    phase: 'Fight Specific',
    description: 'Timed nutrition around heavy sparring and fight-pace sessions in the 4–6 weeks out period.',
    totalMacros: { calories: 2600, protein: 205, carbs: 265, fat: 72 },
    meals: [
      {
        time: 'Breakfast',
        name: 'Overnight Oats',
        description: 'Prep the night before for a hassle-free training morning.',
        ingredients: ['80g rolled oats', '250ml milk', '1 scoop protein powder', '1 banana (sliced)', '30g chia seeds', '1 tbsp almond butter', 'Cinnamon'],
        macros: { calories: 560, protein: 45, carbs: 62, fat: 16 },
      },
      {
        time: 'Pre-Workout',
        name: 'White Rice, Eggs & Spinach',
        description: '90 min pre-sparring meal for sustained energy.',
        ingredients: ['120g cooked white rice', '3 eggs', '2 cups spinach', '1 tsp olive oil', 'Salt, pepper'],
        macros: { calories: 420, protein: 28, carbs: 42, fat: 14 },
      },
      {
        time: 'Post-Workout',
        name: 'Shake & Dates',
        description: 'Fast sugar replenishment immediately after hard sparring.',
        ingredients: ['1.5 scoops whey protein', '3–4 Medjool dates', '400ml water'],
        macros: { calories: 340, protein: 38, carbs: 40, fat: 2 },
      },
      {
        time: 'Lunch',
        name: 'Beef & Vegetable Bowl',
        description: 'Iron-rich meal to support hard training recovery.',
        ingredients: ['180g lean beef (sirloin strips)', '120g cooked quinoa', 'Roasted bell peppers, zucchini, onion', '1 tbsp olive oil', 'Herbs, lime'],
        macros: { calories: 520, protein: 50, carbs: 38, fat: 18 },
      },
      {
        time: 'Dinner',
        name: 'Baked Chicken Thighs & Sweet Potato',
        description: 'Moderate carb dinner to restore glycogen overnight.',
        ingredients: ['2 chicken thighs (skin removed)', '250g sweet potato (roasted)', '1 cup broccoli', '1 tsp olive oil', 'Paprika, garlic, rosemary'],
        macros: { calories: 500, protein: 48, carbs: 48, fat: 14 },
      },
      {
        time: 'Snack',
        name: 'Tuna on Rice Cakes',
        description: 'Light evening protein boost.',
        ingredients: ['1 can tuna', '3 rice cakes', '1 tsp mayo', 'Lemon, capers'],
        macros: { calories: 220, protein: 30, carbs: 18, fat: 4 },
      },
    ],
  },
  {
    id: 'maintain-taper',
    name: 'Maintenance — Taper Week',
    goal: 'Maintain',
    phase: 'Taper',
    description: 'Carb-load approach in taper week to top off glycogen stores while volume is reduced.',
    totalMacros: { calories: 2800, protein: 180, carbs: 340, fat: 65 },
    meals: [
      {
        time: 'Breakfast',
        name: 'Pancakes & Eggs',
        description: 'Carb-focused taper breakfast.',
        ingredients: ['3 whole grain pancakes', '2 eggs', '100ml maple syrup', '1 cup mixed berries', '1 scoop protein powder (in batter)'],
        macros: { calories: 620, protein: 35, carbs: 90, fat: 14 },
      },
      {
        time: 'Snack',
        name: 'Banana & Honey Rice Cake',
        description: 'Fast carb fuel between meals.',
        ingredients: ['1 banana', '2 rice cakes', '1 tbsp honey'],
        macros: { calories: 250, protein: 3, carbs: 58, fat: 1 },
      },
      {
        time: 'Lunch',
        name: 'Pasta Primavera with Chicken',
        description: 'Classic carb-load lunch.',
        ingredients: ['180g cooked pasta', '150g chicken breast', '1 cup roasted vegetables', '1 tbsp olive oil', 'Tomato sauce, basil, garlic'],
        macros: { calories: 580, protein: 48, carbs: 70, fat: 12 },
      },
      {
        time: 'Snack',
        name: 'Smoothie',
        description: 'Mid-afternoon carb and protein hit.',
        ingredients: ['1 banana', '1 cup mango chunks', '1 scoop protein', '200ml coconut water', '1 tbsp chia seeds'],
        macros: { calories: 380, protein: 30, carbs: 52, fat: 6 },
      },
      {
        time: 'Dinner',
        name: 'Grilled Salmon & Potato',
        description: 'Complete evening meal with anti-inflammatory omega-3s.',
        ingredients: ['200g salmon', '300g new potatoes (boiled)', '2 cups asparagus', '1 tbsp olive oil', 'Lemon, dill, garlic'],
        macros: { calories: 580, protein: 48, carbs: 50, fat: 20 },
      },
      {
        time: 'Snack',
        name: 'Greek Yogurt & Granola',
        description: 'Slow-release evening carbs and protein.',
        ingredients: ['200g Greek yogurt', '60g granola', 'Honey'],
        macros: { calories: 380, protein: 22, carbs: 52, fat: 10 },
      },
    ],
  },

  // ── BUILD ──────────────────────────────────────────────────────────────────────
  {
    id: 'build-base',
    name: 'Build — Off-Season Base',
    goal: 'Build',
    phase: 'Off-Season',
    description: 'Caloric surplus for lean muscle gain during the off-season. High protein supports heavy strength training.',
    totalMacros: { calories: 3200, protein: 220, carbs: 370, fat: 90 },
    meals: [
      {
        time: 'Breakfast',
        name: 'Big Breakfast Burrito',
        description: 'Dense, high-calorie morning meal.',
        ingredients: ['4 eggs', '100g black beans', '100g cooked rice', '½ avocado', '60g cheddar cheese', '1 large flour tortilla', 'Salsa, sour cream'],
        macros: { calories: 820, protein: 45, carbs: 80, fat: 32 },
      },
      {
        time: 'Pre-Workout',
        name: 'Oat Protein Bar (Homemade)',
        description: 'Dense pre-workout fuel.',
        ingredients: ['80g oats', '2 tbsp peanut butter', '1 scoop protein powder', '1 tbsp honey', '30g dark chocolate chips'],
        macros: { calories: 500, protein: 35, carbs: 60, fat: 16 },
      },
      {
        time: 'Post-Workout',
        name: 'Mass Shake',
        description: 'High calorie recovery shake.',
        ingredients: ['2 scoops whey protein', '1 banana', '200ml whole milk', '30g oats', '1 tbsp peanut butter'],
        macros: { calories: 620, protein: 50, carbs: 65, fat: 16 },
      },
      {
        time: 'Lunch',
        name: 'Double Chicken Rice Bowl',
        description: 'High volume fighter lunch.',
        ingredients: ['300g chicken breast', '200g cooked brown rice', '1 cup mixed vegetables', '2 tbsp teriyaki sauce', '1 tbsp sesame oil', 'Sesame seeds, green onion'],
        macros: { calories: 640, protein: 68, carbs: 58, fat: 14 },
      },
      {
        time: 'Snack',
        name: 'Trail Mix & Protein Bar',
        description: 'Dense calorie snack.',
        ingredients: ['50g nuts and dried fruit mix', '1 protein bar'],
        macros: { calories: 380, protein: 20, carbs: 38, fat: 18 },
      },
      {
        time: 'Dinner',
        name: 'Lean Beef & Mashed Potato',
        description: 'High protein and carb evening mass-gaining meal.',
        ingredients: ['250g lean ground beef (93%)', '350g mashed potato', '2 cups steamed broccoli', '1 tbsp butter', 'Salt, pepper, garlic powder'],
        macros: { calories: 680, protein: 55, carbs: 65, fat: 20 },
      },
    ],
  },
  {
    id: 'build-strength',
    name: 'Build — Strength Phase',
    goal: 'Build',
    phase: 'Strength & Conditioning',
    description: 'Nutrition support for a heavy strength and power block. Timed carbs around workouts, high overall protein.',
    totalMacros: { calories: 3000, protein: 215, carbs: 310, fat: 85 },
    meals: [
      {
        time: 'Breakfast',
        name: 'Steak & Eggs',
        description: 'High protein and fat morning for heavy lift days.',
        ingredients: ['150g lean steak', '3 eggs (fried or scrambled)', '2 slices sourdough', '½ avocado', 'Spinach, tomato'],
        macros: { calories: 640, protein: 58, carbs: 30, fat: 30 },
      },
      {
        time: 'Pre-Workout',
        name: 'Carb + Creatine',
        description: 'Pre-lift performance fuel.',
        ingredients: ['2 slices white bread', '1 tbsp honey', '5g creatine monohydrate', '300ml water'],
        macros: { calories: 210, protein: 5, carbs: 44, fat: 1 },
      },
      {
        time: 'Post-Workout',
        name: 'Whey + Fast Carbs',
        description: 'Immediate post-lift muscle protein synthesis.',
        ingredients: ['1.5 scoops whey protein', '1 cup white rice (cooked)', '1 banana', '300ml water'],
        macros: { calories: 480, protein: 42, carbs: 62, fat: 2 },
      },
      {
        time: 'Lunch',
        name: 'Chicken & Sweet Potato Hash',
        description: 'Balanced midday meal.',
        ingredients: ['220g chicken breast', '250g sweet potato', '1 cup kale', '1 tbsp olive oil', 'Paprika, garlic, onion powder'],
        macros: { calories: 520, protein: 52, carbs: 52, fat: 12 },
      },
      {
        time: 'Snack',
        name: 'Ricotta & Rice Cakes',
        description: 'Casein-rich afternoon snack.',
        ingredients: ['150g ricotta cheese', '4 rice cakes', '1 tbsp jam or honey'],
        macros: { calories: 340, protein: 20, carbs: 42, fat: 10 },
      },
      {
        time: 'Dinner',
        name: 'Pork Tenderloin & Risotto',
        description: 'Lean protein with high-GI carb to replenish after hard lift.',
        ingredients: ['200g pork tenderloin', '150g arborio rice (cooked)', 'Mushrooms, onion, garlic', '1 tbsp parmesan', '1 tbsp olive oil', 'Herbs'],
        macros: { calories: 620, protein: 55, carbs: 60, fat: 18 },
      },
      {
        time: 'Snack',
        name: 'Protein Pudding',
        description: 'Overnight amino acid supply.',
        ingredients: ['1 scoop casein protein', '200ml milk', 'Frozen berries'],
        macros: { calories: 220, protein: 30, carbs: 18, fat: 4 },
      },
    ],
  },
  {
    id: 'build-recovery',
    name: 'Build — Rest Day / Active Recovery',
    goal: 'Build',
    phase: 'Recovery',
    description: 'Slightly lower carbs on rest days while keeping protein high to support muscle repair.',
    totalMacros: { calories: 2700, protein: 215, carbs: 250, fat: 80 },
    meals: [
      {
        time: 'Breakfast',
        name: 'Smoked Salmon Bagel',
        description: 'Omega-3 rich recovery breakfast.',
        ingredients: ['120g smoked salmon', '1 whole grain bagel', '2 tbsp cream cheese', 'Red onion, capers, cucumber', 'Lemon'],
        macros: { calories: 500, protein: 38, carbs: 48, fat: 18 },
      },
      {
        time: 'Lunch',
        name: 'Beef & Vegetable Soup',
        description: 'Warming recovery meal high in collagen-supporting nutrients.',
        ingredients: ['200g lean beef chunks', '2 cups mixed vegetables (carrots, celery, potatoes)', '1 can diced tomatoes', 'Bone broth, herbs, garlic'],
        macros: { calories: 420, protein: 42, carbs: 35, fat: 12 },
      },
      {
        time: 'Snack',
        name: 'Boiled Eggs & Apple',
        description: 'Simple whole-food snack.',
        ingredients: ['3 boiled eggs', '1 apple', 'Salt, pepper'],
        macros: { calories: 310, protein: 22, carbs: 28, fat: 14 },
      },
      {
        time: 'Dinner',
        name: 'Baked Chicken Breast & Roast Vegetables',
        description: 'High protein, clean evening meal.',
        ingredients: ['250g chicken breast', '300g mixed root vegetables (parsnip, carrot, beetroot)', '1 tbsp olive oil', 'Thyme, rosemary, garlic'],
        macros: { calories: 520, protein: 58, carbs: 42, fat: 14 },
      },
      {
        time: 'Snack',
        name: 'Casein & Nut Butter',
        description: 'Slow-release protein and healthy fats overnight.',
        ingredients: ['1 scoop casein protein', '1 tbsp almond butter', '200ml almond milk'],
        macros: { calories: 270, protein: 30, carbs: 14, fat: 12 },
      },
      {
        time: 'Snack',
        name: 'Almonds & Dark Chocolate',
        description: 'Antioxidant and healthy fat afternoon snack.',
        ingredients: ['40g almonds', '2 squares dark chocolate (85%)'],
        macros: { calories: 280, protein: 8, carbs: 16, fat: 22 },
      },
    ],
  },
  {
    id: 'build-early-camp',
    name: 'Build — Early Camp Lean Bulk',
    goal: 'Build',
    phase: 'Base Building',
    description: 'Controlled lean bulk at the very start of camp to add functional muscle before cutting begins.',
    totalMacros: { calories: 2900, protein: 210, carbs: 300, fat: 82 },
    meals: [
      {
        time: 'Breakfast',
        name: 'Egg & Oat Pancakes',
        description: 'High protein pancake stack.',
        ingredients: ['3 eggs', '80g oats', '1 scoop protein powder', '1 banana', '1 tsp baking powder', '200ml milk', 'Honey, cinnamon'],
        macros: { calories: 620, protein: 50, carbs: 72, fat: 14 },
      },
      {
        time: 'Pre-Workout',
        name: 'Rice Cakes & Protein Shake',
        description: 'Light pre-workout.',
        ingredients: ['3 rice cakes', '1 scoop whey protein', '300ml water'],
        macros: { calories: 300, protein: 28, carbs: 38, fat: 2 },
      },
      {
        time: 'Post-Workout',
        name: 'Smoothie Bowl',
        description: 'Colourful recovery bowl.',
        ingredients: ['2 scoops whey protein', '1 cup frozen berries', '½ banana', '200ml milk', '30g granola topping', 'Chia seeds, honey'],
        macros: { calories: 520, protein: 48, carbs: 58, fat: 10 },
      },
      {
        time: 'Lunch',
        name: 'Chicken Quesadilla',
        description: 'Fighter-friendly Mexican option.',
        ingredients: ['180g chicken breast (shredded)', '2 large whole wheat tortillas', '60g cheddar cheese', '½ avocado', 'Salsa, jalapeño, Greek yogurt'],
        macros: { calories: 620, protein: 55, carbs: 50, fat: 22 },
      },
      {
        time: 'Dinner',
        name: 'Prawn Stir-Fry & Noodles',
        description: 'Light but protein-rich dinner.',
        ingredients: ['250g prawns', '150g cooked rice noodles', '1 cup bok choy', '1 cup bean sprouts', '2 tbsp oyster sauce', '1 tbsp sesame oil', 'Garlic, chilli'],
        macros: { calories: 480, protein: 42, carbs: 50, fat: 12 },
      },
      {
        time: 'Snack',
        name: 'Nut Butter & Banana Toast',
        description: 'Calorie dense evening snack.',
        ingredients: ['2 slices whole grain toast', '2 tbsp almond butter', '1 banana'],
        macros: { calories: 380, protein: 12, carbs: 52, fat: 14 },
      },
    ],
  },
];

// ─── Food Item Database (for Macro Generator) ─────────────────────────────────

export interface FoodItem {
  id: string;
  name: string;
  category: 'protein' | 'carb' | 'fat' | 'vegetable';
  servingLabel: string;
  gramsPerServing: number;
  macros: Macros;
}

export const FOOD_ITEMS: FoodItem[] = [
  // ── Protein sources ──────────────────────────────────────────────────────────
  { id: 'p1',  name: 'Chicken Breast (grilled)', category: 'protein', servingLabel: '100g',       gramsPerServing: 100, macros: { calories: 165, protein: 31, carbs: 0,  fat: 3.6 } },
  { id: 'p2',  name: 'Salmon Fillet',            category: 'protein', servingLabel: '100g',       gramsPerServing: 100, macros: { calories: 208, protein: 20, carbs: 0,  fat: 13  } },
  { id: 'p3',  name: 'Lean Ground Beef (93%)',   category: 'protein', servingLabel: '100g',       gramsPerServing: 100, macros: { calories: 172, protein: 26, carbs: 0,  fat: 7   } },
  { id: 'p4',  name: 'Egg Whites',               category: 'protein', servingLabel: '100g (3 whites)', gramsPerServing: 100, macros: { calories: 52, protein: 11, carbs: 0.7, fat: 0.2 } },
  { id: 'p5',  name: 'Whey Protein (1 scoop)',   category: 'protein', servingLabel: '30g scoop',  gramsPerServing: 30,  macros: { calories: 120, protein: 25, carbs: 3,  fat: 1.5 } },
  { id: 'p6',  name: 'Canned Tuna (in water)',   category: 'protein', servingLabel: '100g drained', gramsPerServing: 100, macros: { calories: 116, protein: 26, carbs: 0,  fat: 1  } },
  { id: 'p7',  name: 'Greek Yogurt (non-fat)',   category: 'protein', servingLabel: '100g',       gramsPerServing: 100, macros: { calories: 59, protein: 10, carbs: 3.6, fat: 0.4 } },
  { id: 'p8',  name: 'Cottage Cheese (low-fat)', category: 'protein', servingLabel: '100g',       gramsPerServing: 100, macros: { calories: 84, protein: 11, carbs: 3.4, fat: 2.3 } },
  { id: 'p9',  name: 'Turkey Breast (sliced)',   category: 'protein', servingLabel: '100g',       gramsPerServing: 100, macros: { calories: 135, protein: 30, carbs: 0,  fat: 1   } },
  { id: 'p10', name: 'Whole Eggs',               category: 'protein', servingLabel: '100g (2 eggs)', gramsPerServing: 100, macros: { calories: 143, protein: 13, carbs: 0.7, fat: 10 } },

  // ── Carbohydrate sources ─────────────────────────────────────────────────────
  { id: 'c1',  name: 'Cooked White Rice',     category: 'carb', servingLabel: '100g cooked', gramsPerServing: 100, macros: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 } },
  { id: 'c2',  name: 'Cooked Brown Rice',     category: 'carb', servingLabel: '100g cooked', gramsPerServing: 100, macros: { calories: 123, protein: 2.7, carbs: 26, fat: 1   } },
  { id: 'c3',  name: 'Rolled Oats',           category: 'carb', servingLabel: '100g dry',    gramsPerServing: 100, macros: { calories: 379, protein: 13, carbs: 68, fat: 7   } },
  { id: 'c4',  name: 'Sweet Potato (baked)',  category: 'carb', servingLabel: '100g',        gramsPerServing: 100, macros: { calories: 90, protein: 2,  carbs: 21, fat: 0.1 } },
  { id: 'c5',  name: 'Whole Grain Pasta (cooked)', category: 'carb', servingLabel: '100g cooked', gramsPerServing: 100, macros: { calories: 124, protein: 5, carbs: 25, fat: 1 } },
  { id: 'c6',  name: 'Banana',                category: 'carb', servingLabel: '1 medium (118g)', gramsPerServing: 118, macros: { calories: 105, protein: 1.3, carbs: 27, fat: 0.4 } },
  { id: 'c7',  name: 'Cooked Quinoa',         category: 'carb', servingLabel: '100g cooked', gramsPerServing: 100, macros: { calories: 120, protein: 4.4, carbs: 22, fat: 1.9 } },
  { id: 'c8',  name: 'White Potato (boiled)', category: 'carb', servingLabel: '100g',        gramsPerServing: 100, macros: { calories: 77, protein: 2,  carbs: 17, fat: 0.1 } },
  { id: 'c9',  name: 'Rice Cakes',            category: 'carb', servingLabel: '2 cakes (18g)', gramsPerServing: 18, macros: { calories: 70, protein: 1.5, carbs: 15, fat: 0.3 } },
  { id: 'c10', name: 'Whole Grain Bread',     category: 'carb', servingLabel: '2 slices (60g)', gramsPerServing: 60, macros: { calories: 156, protein: 8, carbs: 26, fat: 2.4 } },
  { id: 'c11', name: 'Black Beans (cooked)',  category: 'carb', servingLabel: '100g',        gramsPerServing: 100, macros: { calories: 132, protein: 9, carbs: 24, fat: 0.5 } },
  { id: 'c12', name: 'Lentils (cooked)',      category: 'carb', servingLabel: '100g',        gramsPerServing: 100, macros: { calories: 116, protein: 9, carbs: 20, fat: 0.4 } },

  // ── Fat sources ───────────────────────────────────────────────────────────────
  { id: 'f1',  name: 'Avocado',             category: 'fat', servingLabel: '½ avocado (75g)', gramsPerServing: 75,  macros: { calories: 120, protein: 1.5, carbs: 6.4, fat: 11 } },
  { id: 'f2',  name: 'Natural Peanut Butter', category: 'fat', servingLabel: '2 tbsp (32g)', gramsPerServing: 32,  macros: { calories: 188, protein: 8,  carbs: 6,  fat: 16  } },
  { id: 'f3',  name: 'Almond Butter',       category: 'fat', servingLabel: '2 tbsp (32g)',   gramsPerServing: 32,  macros: { calories: 196, protein: 7,  carbs: 6,  fat: 18  } },
  { id: 'f4',  name: 'Olive Oil',           category: 'fat', servingLabel: '1 tbsp (14g)',   gramsPerServing: 14,  macros: { calories: 119, protein: 0,  carbs: 0,  fat: 13.5 } },
  { id: 'f5',  name: 'Mixed Nuts',          category: 'fat', servingLabel: '30g handful',    gramsPerServing: 30,  macros: { calories: 173, protein: 5,  carbs: 6,  fat: 16  } },
  { id: 'f6',  name: 'Almonds',             category: 'fat', servingLabel: '30g',            gramsPerServing: 30,  macros: { calories: 174, protein: 6,  carbs: 6,  fat: 15  } },
  { id: 'f7',  name: 'Walnuts',             category: 'fat', servingLabel: '30g',            gramsPerServing: 30,  macros: { calories: 196, protein: 4.6, carbs: 4, fat: 19.6 } },
  { id: 'f8',  name: 'Whole Milk',          category: 'fat', servingLabel: '250ml',          gramsPerServing: 250, macros: { calories: 149, protein: 8,  carbs: 12, fat: 8   } },
  { id: 'f9',  name: 'Cheddar Cheese',      category: 'fat', servingLabel: '30g',            gramsPerServing: 30,  macros: { calories: 121, protein: 7,  carbs: 0.4, fat: 10 } },
  { id: 'f10', name: 'Coconut Oil',         category: 'fat', servingLabel: '1 tbsp (14g)',   gramsPerServing: 14,  macros: { calories: 121, protein: 0,  carbs: 0,  fat: 14  } },

  // ── Vegetables ───────────────────────────────────────────────────────────────
  { id: 'v1',  name: 'Broccoli (steamed)',     category: 'vegetable', servingLabel: '1 cup (91g)',  gramsPerServing: 91,  macros: { calories: 31,  protein: 2.6, carbs: 6,  fat: 0.3 } },
  { id: 'v2',  name: 'Spinach (raw)',           category: 'vegetable', servingLabel: '2 cups (60g)', gramsPerServing: 60,  macros: { calories: 14,  protein: 1.7, carbs: 2.2, fat: 0.2 } },
  { id: 'v3',  name: 'Asparagus (roasted)',     category: 'vegetable', servingLabel: '1 cup (134g)', gramsPerServing: 134, macros: { calories: 40,  protein: 4.3, carbs: 7.4, fat: 0.4 } },
  { id: 'v4',  name: 'Bell Peppers (mixed)',    category: 'vegetable', servingLabel: '1 cup (149g)', gramsPerServing: 149, macros: { calories: 46,  protein: 1.5, carbs: 9,  fat: 0.4 } },
  { id: 'v5',  name: 'Zucchini (sautéed)',      category: 'vegetable', servingLabel: '1 cup (113g)', gramsPerServing: 113, macros: { calories: 27,  protein: 2,   carbs: 5,  fat: 0.5 } },
  { id: 'v6',  name: 'Kale (raw)',              category: 'vegetable', servingLabel: '1 cup (67g)',  gramsPerServing: 67,  macros: { calories: 33,  protein: 2.9, carbs: 6,  fat: 0.5 } },
  { id: 'v7',  name: 'Cherry Tomatoes',         category: 'vegetable', servingLabel: '1 cup (149g)', gramsPerServing: 149, macros: { calories: 27,  protein: 1.3, carbs: 5.8, fat: 0.3 } },
  { id: 'v8',  name: 'Cucumber (sliced)',        category: 'vegetable', servingLabel: '1 cup (119g)', gramsPerServing: 119, macros: { calories: 16,  protein: 0.7, carbs: 3.8, fat: 0.1 } },
  { id: 'v9',  name: 'Green Beans (steamed)',    category: 'vegetable', servingLabel: '1 cup (125g)', gramsPerServing: 125, macros: { calories: 44,  protein: 2.4, carbs: 10, fat: 0.4 } },
  { id: 'v10', name: 'Bok Choy (stir-fried)',    category: 'vegetable', servingLabel: '1 cup (170g)', gramsPerServing: 170, macros: { calories: 20,  protein: 2.7, carbs: 3,  fat: 0.3 } },
  { id: 'v11', name: 'Cauliflower Rice',         category: 'vegetable', servingLabel: '1 cup (107g)', gramsPerServing: 107, macros: { calories: 25,  protein: 2,   carbs: 5,  fat: 0.3 } },
  { id: 'v12', name: 'Mushrooms (sautéed)',       category: 'vegetable', servingLabel: '1 cup (156g)', gramsPerServing: 156, macros: { calories: 44,  protein: 6.2, carbs: 6,  fat: 0.9 } },
];
