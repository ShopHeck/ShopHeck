import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Search, Dumbbell, Star, SlidersHorizontal, History, ClipboardList, X } from 'lucide-react';
import {
  CAMP_PHASE_LABELS, ENERGY_SYSTEM_LABELS, EXERCISE_CATEGORY_LABELS, EXERCISE_EQUIPMENT,
  FORMAT_LABELS, INTENT_LABELS, TECHNIQUE_DISCIPLINES, TECHNIQUE_EQUIPMENT,
  EXERCISE_LIBRARY, TECHNIQUE_LIBRARY,
  type CampPhase, type Difficulty, type Discipline, type DrillFormat, type EnergySystem,
  type ExerciseCategory, type LibraryItem, type TechniqueIntent,
} from '../data/library';
import { useApp } from '../context/AppContext';
import { EMPTY_LIBRARY, matchesQuery, queueMinutes, reviewInfo } from '../utils/library';
import { DIFFICULTY_COLORS } from '../utils/designTokens';
import { todayISO } from '../utils/dates';
import LibraryCard from './library/LibraryCard';
import AddToSessionSheet from './library/AddToSessionSheet';
import LogResultSheet from './library/LogResultSheet';
import SessionQueueSheet from './library/SessionQueueSheet';
import type { LogPrefill } from '../App';

type Tab = 'exercise' | 'technique';
const DIFFICULTIES: (Difficulty | 'all')[] = ['all', 'Beginner', 'Intermediate', 'Advanced'];

/**
 * The active chip is the filter's own tier color at full strength, so the chip
 * and the badges it selects for are visibly the same scale (§2.6).
 */
const difficultyChipStyle = (d: Difficulty | 'all') => {
  const color = d === 'all' ? 'var(--accent-flame)' : DIFFICULTY_COLORS[d];
  return { backgroundColor: color, borderColor: color, color: 'var(--bg-obsidian)' };
};

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
        active ? 'bg-brand-600 border-brand-500 text-white' : 'bg-dark-700 border-dark-500 text-gray-400 hover:border-dark-300'
      }`}
    >
      {children}
    </button>
  );
}

interface Props {
  /** Hands a queued session to the workout logger. */
  onLogSession?: (prefill: LogPrefill) => void;
}

export default function WorkoutLibrary({ onLogSession }: Props) {
  const { state } = useApp();
  const { results, favorites, queue } = state.library ?? EMPTY_LIBRARY;

  const [tab, setTab] = useState<Tab>('exercise');
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');
  const [category, setCategory] = useState<ExerciseCategory | 'all'>('all');
  const [discipline, setDiscipline] = useState<string>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [equipment, setEquipment] = useState('all');
  const [campPhase, setCampPhase] = useState<CampPhase | 'all'>('all');
  const [energySystem, setEnergySystem] = useState<EnergySystem | 'all'>('all');
  const [intent, setIntent] = useState<TechniqueIntent | 'all'>('all');
  const [drillFormat, setDrillFormat] = useState<DrillFormat | 'all'>('all');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addItem, setAddItem] = useState<LibraryItem | null>(null);
  const [logItem, setLogItem] = useState<{ item: LibraryItem; prefillWork?: string } | null>(null);
  const [showQueue, setShowQueue] = useState(false);
  /** Day the queue sheet is showing. null = follow `focusDate`. */
  const [queueDate, setQueueDate] = useState<string | null>(null);

  const today = todayISO();

  // Sessions can be queued for any day, so the bar tracks every pending one:
  // today's if there is one, otherwise the soonest other day. Showing only
  // today's would strand a session planned for tomorrow — and permanently hide
  // one whose day has passed.
  // Not wrapped in useMemo: the React Compiler memoizes this itself, and a
  // manual memo around the in-place sort is one it cannot preserve.
  const queueDates = [...new Set(queue.map(q => q.date))].sort();
  const focusDate = queueDates.includes(today) ? today : (queueDates[0] ?? today);
  const activeQueueDate = queueDate && queueDates.includes(queueDate) ? queueDate : focusDate;
  const activeQueue = useMemo(
    () => queue.filter(q => q.date === activeQueueDate),
    [queue, activeQueueDate],
  );

  // Switching libraries resets the filters that only exist on one of them, so a
  // stale technique filter can't silently empty the exercise list.
  function switchTab(next: Tab) {
    setTab(next);
    setCategory('all');
    setDiscipline('all');
    setEquipment('all');
    setEnergySystem('all');
    setIntent('all');
    setDrillFormat('all');
    setReviewOnly(false);
    setExpandedId(null);
  }

  function clearFilters() {
    setSearch('');
    setDifficulty('all');
    setCategory('all');
    setDiscipline('all');
    setEquipment('all');
    setCampPhase('all');
    setEnergySystem('all');
    setIntent('all');
    setDrillFormat('all');
    setFavoritesOnly(false);
    setReviewOnly(false);
  }

  const filtered = useMemo(() => {
    const source: LibraryItem[] = tab === 'exercise' ? EXERCISE_LIBRARY : TECHNIQUE_LIBRARY;

    const matches = source.filter(item => {
      if (!matchesQuery(item, search)) return false;
      if (difficulty !== 'all' && item.difficulty !== difficulty) return false;
      if (favoritesOnly && !favorites.includes(item.id)) return false;
      if (equipment !== 'all' && !item.equipment.includes(equipment)) return false;
      // An empty campPhases list means the item suits any phase.
      if (campPhase !== 'all' && item.campPhases.length > 0 && !item.campPhases.includes(campPhase)) return false;

      if (item.kind === 'exercise') {
        if (category !== 'all' && item.category !== category) return false;
        if (energySystem !== 'all' && item.energySystem !== energySystem) return false;
      } else {
        if (discipline !== 'all' && !item.disciplines.includes(discipline as Discipline)) return false;
        if (intent !== 'all' && !item.intents.includes(intent)) return false;
        if (drillFormat !== 'all' && !item.formats.includes(drillFormat)) return false;
        if (reviewOnly) {
          const status = reviewInfo(item, results).status;
          if (status !== 'due' && status !== 'overdue') return false;
        }
      }
      return true;
    });

    // Neglected first when reviewing — the whole point of the filter is triage.
    if (reviewOnly) {
      return [...matches].sort(
        (a, b) => (reviewInfo(b, results).daysSince ?? 0) - (reviewInfo(a, results).daysSince ?? 0),
      );
    }
    return matches;
  }, [tab, search, difficulty, category, discipline, equipment, campPhase, energySystem, intent, drillFormat, favoritesOnly, reviewOnly, favorites, results]);

  const equipmentOptions = tab === 'exercise' ? EXERCISE_EQUIPMENT : TECHNIQUE_EQUIPMENT;
  const dueCount = useMemo(
    () => TECHNIQUE_LIBRARY.filter(t => {
      const s = reviewInfo(t, results).status;
      return s === 'due' || s === 'overdue';
    }).length,
    [results],
  );

  return (
    <div className="pb-4">
      {/* Library switch */}
      <div className="mx-4 mt-4">
        <div className="flex bg-dark-700 rounded-xl p-1 gap-1">
          {([
            { id: 'exercise' as const,  label: 'Training',   count: EXERCISE_LIBRARY.length },
            { id: 'technique' as const, label: 'Techniques', count: TECHNIQUE_LIBRARY.length },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t.id ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.label} · {t.count}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-500 mt-1.5 px-1">
          {tab === 'exercise'
            ? 'Strength, conditioning and mobility — structured sets, load and rest.'
            : 'Techniques and drills — position, intent, constraints and spaced review.'}
        </p>
      </div>

      {/* Search */}
      <div className="mx-4 mt-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 text-sm"
            aria-label={tab === 'exercise' ? 'Search the training library' : 'Search the technique library'}
            placeholder={tab === 'exercise' ? 'Search exercises, muscles, pattern…' : 'Search techniques, position, discipline…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Category / discipline chips */}
      <div className="mx-4 mt-3 flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {tab === 'exercise' ? (
          <>
            <Chip active={category === 'all'} onClick={() => setCategory('all')}>All</Chip>
            {(Object.keys(EXERCISE_CATEGORY_LABELS) as ExerciseCategory[]).map(c => (
              <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                {EXERCISE_CATEGORY_LABELS[c]}
              </Chip>
            ))}
          </>
        ) : (
          <>
            <Chip active={discipline === 'all'} onClick={() => setDiscipline('all')}>All</Chip>
            {TECHNIQUE_DISCIPLINES.map(d => (
              <Chip key={d} active={discipline === d} onClick={() => setDiscipline(d)}>{d}</Chip>
            ))}
          </>
        )}
      </div>

      {/* Difficulty chips */}
      <div className="mx-4 mt-2 flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {DIFFICULTIES.map(d => (
          <button
            key={d}
            onClick={() => setDifficulty(d)}
            aria-pressed={difficulty === d}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              difficulty === d ? '' : 'bg-surface-1 border-surface-2 text-gray-400 hover:border-surface-3'
            }`}
            style={difficulty === d ? difficultyChipStyle(d) : undefined}
          >
            {d === 'all' ? 'All Levels' : d}
          </button>
        ))}
      </div>

      {/* Toggles */}
      <div className="mx-4 mt-2 flex gap-2 overflow-x-auto no-scrollbar pb-1">
        <Chip active={favoritesOnly} onClick={() => setFavoritesOnly(v => !v)}>
          <Star size={11} fill={favoritesOnly ? 'currentColor' : 'none'} /> Favourites
        </Chip>
        {tab === 'technique' && (
          <Chip active={reviewOnly} onClick={() => setReviewOnly(v => !v)}>
            <History size={11} /> Needs review{dueCount > 0 ? ` · ${dueCount}` : ''}
          </Chip>
        )}
        <Chip active={showFilters} onClick={() => setShowFilters(v => !v)}>
          <SlidersHorizontal size={11} /> Filters
        </Chip>
      </div>

      {showFilters && (
        <div className="mx-4 mt-2 card space-y-3">
          <label className="block">
            <span className="label">Equipment</span>
            <select className="select py-2 text-sm" value={equipment} onChange={e => setEquipment(e.target.value)}>
              <option value="all">Any equipment</option>
              {equipmentOptions.map(eq => <option key={eq} value={eq}>{eq}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="label">Camp phase</span>
            <select className="select py-2 text-sm" value={campPhase} onChange={e => setCampPhase(e.target.value as CampPhase | 'all')}>
              <option value="all">Any phase</option>
              {(Object.keys(CAMP_PHASE_LABELS) as CampPhase[]).map(p => (
                <option key={p} value={p}>{CAMP_PHASE_LABELS[p]}</option>
              ))}
            </select>
          </label>

          {tab === 'exercise' ? (
            <label className="block">
              <span className="label">Energy system</span>
              <select className="select py-2 text-sm" value={energySystem} onChange={e => setEnergySystem(e.target.value as EnergySystem | 'all')}>
                <option value="all">Any system</option>
                {(Object.keys(ENERGY_SYSTEM_LABELS) as EnergySystem[]).map(s => (
                  <option key={s} value={s}>{ENERGY_SYSTEM_LABELS[s]}</option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="block">
                <span className="label">Intent</span>
                <select className="select py-2 text-sm" value={intent} onChange={e => setIntent(e.target.value as TechniqueIntent | 'all')}>
                  <option value="all">Any intent</option>
                  {(Object.keys(INTENT_LABELS) as TechniqueIntent[]).map(i => (
                    <option key={i} value={i}>{INTENT_LABELS[i]}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Drill format</span>
                <select className="select py-2 text-sm" value={drillFormat} onChange={e => setDrillFormat(e.target.value as DrillFormat | 'all')}>
                  <option value="all">Any format</option>
                  {(Object.keys(FORMAT_LABELS) as DrillFormat[]).map(f => (
                    <option key={f} value={f}>{FORMAT_LABELS[f]}</option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
      )}

      {/* Today's session — pinned so the queue is never lost while browsing. */}
      {activeQueue.length > 0 && (
        <div className="sticky top-0 z-20 mt-3 bg-dark-900/95 backdrop-blur border-y border-dark-600">
          <button
            onClick={() => { setQueueDate(activeQueueDate); setShowQueue(true); }}
            className="w-full flex items-center gap-2 text-left px-4 py-2.5"
          >
            <ClipboardList size={16} className="text-brand-400 flex-shrink-0" />
            <span className="text-xs font-semibold text-white">
              {activeQueueDate === today ? 'Today\u2019s session' : format(parseISO(activeQueueDate), 'EEE d MMM')}
              {' · '}{activeQueue.length} item{activeQueue.length !== 1 ? 's' : ''}
            </span>
            <span className="text-xs text-gray-400">~{queueMinutes(activeQueue)} min</span>
            {queueDates.length > 1 && (
              <span className="text-xs text-gray-400">+{queueDates.length - 1} more day{queueDates.length > 2 ? 's' : ''}</span>
            )}
            <span className="ml-auto text-xs font-semibold text-brand-400">Review</span>
          </button>
        </div>
      )}

      {/* Results count */}
      <div className="mx-4 mt-3 mb-2 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {filtered.length} {tab === 'exercise' ? 'exercise' : 'technique'}{filtered.length !== 1 ? 's' : ''}
        </p>
        {(search || difficulty !== 'all' || category !== 'all' || discipline !== 'all' || equipment !== 'all'
          || campPhase !== 'all' || energySystem !== 'all' || intent !== 'all' || drillFormat !== 'all'
          || favoritesOnly || reviewOnly) && (
          <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-white font-semibold flex items-center gap-1">
            <X size={11} /> Clear
          </button>
        )}
      </div>

      {/* Items */}
      <div className="mx-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-dark-700 flex items-center justify-center">
              <Dumbbell size={22} className="text-gray-400" />
            </div>
            <p className="text-sm text-gray-400">
              {reviewOnly
                ? 'Nothing is due for review — everything logged has been drilled recently.'
                : 'Nothing matches your search.'}
            </p>
            <button onClick={clearFilters} className="text-xs text-brand-400 font-semibold">Clear filters</button>
          </div>
        ) : (
          filtered.map(item => (
            <LibraryCard
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId(id => (id === item.id ? null : item.id))}
              onAddToSession={() => setAddItem(item)}
              onLogResult={() => setLogItem({ item })}
            />
          ))
        )}
      </div>

      {addItem && <AddToSessionSheet item={addItem} onClose={() => setAddItem(null)} />}
      {logItem && (
        <LogResultSheet
          item={logItem.item}
          prefillWork={logItem.prefillWork}
          onClose={() => setLogItem(null)}
        />
      )}
      {showQueue && (
        <SessionQueueSheet
          date={activeQueueDate}
          dates={queueDates}
          entries={activeQueue}
          onDateChange={setQueueDate}
          onClose={() => setShowQueue(false)}
          onLogSession={onLogSession}
          onLogItem={(item, prefillWork) => setLogItem({ item, prefillWork })}
        />
      )}
    </div>
  );
}
