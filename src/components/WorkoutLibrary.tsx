import { useState, useMemo } from 'react';
import type { FC } from 'react';
import { Search, ChevronDown, ChevronUp, Dumbbell, Zap, Target, Shield, Waves } from 'lucide-react';
import { EXERCISES, CATEGORY_LABELS, type Exercise, type ExerciseCategory } from '../data/workoutLibrary';

const CATEGORIES: { value: ExerciseCategory | 'all'; label: string; Icon?: FC<{ size: number }> }[] = [
  { value: 'all',            label: 'All' },
  { value: 'conditioning',   label: 'Conditioning',   Icon: Zap      },
  { value: 'strength',       label: 'Strength',       Icon: Dumbbell },
  { value: 'skill',          label: 'Skill',          Icon: Target   },
  { value: 'sparring-drill', label: 'Sparring Drills', Icon: Shield  },
  { value: 'flexibility',    label: 'Flexibility',    Icon: Waves    },
];

const DIFFICULTY_COLORS: Record<Exercise['difficulty'], string> = {
  Beginner:     'bg-green-900/40 text-green-300',
  Intermediate: 'bg-yellow-900/40 text-yellow-300',
  Advanced:     'bg-red-900/40 text-red-300',
};

const CATEGORY_COLORS: Record<ExerciseCategory, string> = {
  conditioning:   'bg-orange-900/30 text-orange-400',
  strength:       'bg-yellow-900/30 text-yellow-400',
  skill:          'bg-brand-900/30 text-brand-400',
  'sparring-drill':'bg-red-900/30 text-red-400',
  flexibility:    'bg-teal-900/30 text-teal-400',
};

function ExerciseCard({ ex }: { ex: Exercise }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card p-0 overflow-hidden">
      <button
        className="w-full p-4 text-left flex items-start justify-between gap-3"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[ex.category]}`}>
              {CATEGORY_LABELS[ex.category]}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${DIFFICULTY_COLORS[ex.difficulty]}`}>
              {ex.difficulty}
            </span>
          </div>
          <p className="text-sm font-semibold text-white">{ex.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{ex.setsReps}</p>
        </div>
        <div className="text-gray-500 flex-shrink-0 mt-1">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-dark-600">
          <p className="text-sm text-gray-300 leading-relaxed pt-3">{ex.instructions}</p>

          {ex.tips && (
            <div className="bg-brand-900/20 border border-brand-800/40 rounded-xl p-3">
              <p className="text-xs font-semibold text-brand-400 mb-1">Pro Tip</p>
              <p className="text-xs text-gray-300 leading-relaxed">{ex.tips}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-500">
            {ex.muscleGroups.length > 0 && (
              <div>
                <span className="font-semibold text-gray-400">Muscles: </span>
                {ex.muscleGroups.join(', ')}
              </div>
            )}
            {ex.equipment.length > 0 && (
              <div>
                <span className="font-semibold text-gray-400">Equipment: </span>
                {ex.equipment.join(', ')}
              </div>
            )}
            {ex.equipment.length === 0 && (
              <div>
                <span className="font-semibold text-gray-400">Equipment: </span>
                Bodyweight only
              </div>
            )}
            {ex.sports.length > 0 && (
              <div>
                <span className="font-semibold text-gray-400">Sports: </span>
                {ex.sports.join(', ')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkoutLibrary() {
  const [category, setCategory] = useState<ExerciseCategory | 'all'>('all');
  const [difficulty, setDifficulty] = useState<Exercise['difficulty'] | 'all'>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return EXERCISES.filter(ex => {
      const matchesCat = category === 'all' || ex.category === category;
      const matchesDiff = difficulty === 'all' || ex.difficulty === difficulty;
      const matchesSearch = !q
        || ex.name.toLowerCase().includes(q)
        || ex.muscleGroups.some(m => m.toLowerCase().includes(q))
        || ex.sports.some(s => s.toLowerCase().includes(q))
        || ex.instructions.toLowerCase().includes(q);
      return matchesCat && matchesDiff && matchesSearch;
    });
  }, [category, difficulty, search]);

  return (
    <div className="pb-4">
      {/* Search */}
      <div className="mx-4 mt-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="input pl-9 text-sm"
            placeholder="Search exercises, muscles, sport…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Category filter chips */}
      <div className="mx-4 mt-3 flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {CATEGORIES.map(c => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              category === c.value
                ? 'bg-brand-600 border-brand-500 text-white'
                : 'bg-dark-700 border-dark-500 text-gray-400 hover:border-dark-300'
            }`}
          >
            {c.Icon && <c.Icon size={11} />}
            {c.label}
          </button>
        ))}
      </div>

      {/* Difficulty filter chips */}
      <div className="mx-4 mt-2 flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {(['all', 'Beginner', 'Intermediate', 'Advanced'] as const).map(d => (
          <button
            key={d}
            onClick={() => setDifficulty(d)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              difficulty === d
                ? d === 'Beginner'     ? 'bg-green-700  border-green-600  text-white'
                : d === 'Intermediate' ? 'bg-yellow-700 border-yellow-600 text-white'
                : d === 'Advanced'     ? 'bg-red-700    border-red-600    text-white'
                :                       'bg-brand-600  border-brand-500  text-white'
                : 'bg-dark-700 border-dark-500 text-gray-400 hover:border-dark-300'
            }`}
          >
            {d === 'all' ? 'All Levels' : d}
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="mx-4 mt-3 mb-2">
        <p className="text-xs text-gray-500">{filtered.length} exercise{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Exercise list */}
      <div className="mx-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-dark-700 flex items-center justify-center">
              <Dumbbell size={22} className="text-gray-500" />
            </div>
            <p className="text-sm text-gray-400">No exercises match your search.</p>
            <button
              onClick={() => { setSearch(''); setCategory('all'); setDifficulty('all'); }}
              className="text-xs text-brand-400 font-semibold"
            >
              Clear filters
            </button>
          </div>
        ) : (
          filtered.map(ex => <ExerciseCard key={ex.id} ex={ex} />)
        )}
      </div>
    </div>
  );
}
