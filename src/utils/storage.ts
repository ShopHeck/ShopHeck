import type { AppState, FightCamp, FighterProfile, WorkoutLog, SparringLog, ConditioningTest, WeightEntry, TrainingWeek, GamePlan, NutritionLog, CoachNote, CustomTimerPreset, HRVEntry, FitbitConfig, FightResult, CampFactorWeights, DashboardPrefs } from '../types';
import { DEFAULT_SUBSCRIPTION } from './subscription';
import { defaultGamificationState } from './gamification';

const STORAGE_KEY = 'fightcamp_app';

/** A new object graph for first run, reset and account-boundary changes. */
export function createDefaultState(): AppState {
  return {
    currentUser: null,
    activeCamp: null,
    camps: [],
    trainingSchedule: [],
    workoutLogs: [],
    sparringLogs: [],
    conditioningTests: [],
    weightEntries: [],
    fighters: [],
    coaches: [],
    completedSessions: {},
    dayOverrides: {},
    gamePlans: {},
    nutritionLogs: [],
    coachNotes: [],
    subscription: { ...DEFAULT_SUBSCRIPTION },
    hrvEntries: [],
    fightResults: [],
    gamification: defaultGamificationState(),
    dashboardPrefs: { progressWidgetCollapsed: false, progressWidgetHidden: false },
  };
}

export function setDashboardPrefs(state: AppState, prefs: Partial<DashboardPrefs>): AppState {
  // Rebuilt key-by-key (not `...state.dashboardPrefs`) so the shape stays the
  // allowlist — but every key MUST be carried here, or dispatching one pref
  // silently drops the others. weightUnit is deliberately NOT defaulted:
  // undefined means "never chosen", which is what lets mergeCloud restore the
  // account's synced choice on a fresh device (defaulting it here would stamp
  // 'lbs' as an explicit choice the moment any other pref is toggled).
  return {
    ...state,
    dashboardPrefs: {
      progressWidgetCollapsed: state.dashboardPrefs?.progressWidgetCollapsed ?? false,
      progressWidgetHidden: state.dashboardPrefs?.progressWidgetHidden ?? false,
      weightUnit: state.dashboardPrefs?.weightUnit,
      ...prefs,
    },
  };
}

export function toggleSessionComplete(state: AppState, key: string): AppState {
  return {
    ...state,
    completedSessions: {
      ...state.completedSessions,
      [key]: !state.completedSessions[key],
    },
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    const stored = JSON.parse(raw) as Partial<AppState>;
    const defaults = createDefaultState();

    // A top-level spread alone is not enough. It replaces each nested slice
    // wholesale, so a document written before a key was added to `gamification`
    // / `dashboardPrefs` / `subscription` keeps its OLD shape and the new key
    // stays undefined after the upgrade — `gam.challenges.filter(...)` in
    // ProgressWidget then throws on a store that merely predates challenges.
    // One level deeper is the right depth, and no deeper: `belt` and `streak`
    // are recomputed from raw logs by the boot-time RECOMPUTE_GAMIFICATION, so
    // they only need to EXIST here; the slices that do not self-heal
    // (challenges, achievements, personalRecords, totalXp) are all at this level.
    //
    // weightUnit is deliberately absent from the defaults, so it stays
    // undefined ("never chosen") unless the stored document set it — that is
    // what lets mergeCloud restore the account's synced choice on a new device.
    return {
      ...defaults,
      ...stored,
      gamification: stored.gamification
        ? { ...defaults.gamification, ...stored.gamification }
        : defaults.gamification,
      dashboardPrefs: stored.dashboardPrefs
        ? { ...defaults.dashboardPrefs, ...stored.dashboardPrefs }
        : defaults.dashboardPrefs,
      subscription: stored.subscription
        ? { ...defaults.subscription, ...stored.subscription }
        : defaults.subscription,
    };
  } catch {
    return createDefaultState();
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    console.error('Failed to save state');
  }
}

// ─── Deferred persistence ─────────────────────────────────────────────────
//
// saveState serializes the ENTIRE account document — every camp, log, weigh-in,
// nutrition day, HRV entry, fight result and the gamification slice — and
// localStorage.setItem is synchronous. Running it on every dispatch meant eight
// taps on the nutrition +8oz button cost eight full serializations on the main
// thread, on a phone, mid-camp.
//
// Writes are coalesced into one, then handed to an idle slot so they never
// compete with the tap that caused them. Nothing is lost: every path that can
// end the session (backgrounding, tab close, native app suspend) flushes first.

const SAVE_DEBOUNCE_MS = 500;

let pendingState: AppState | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let idleHandle: number | null = null;

/** requestIdleCallback where it exists — Safari/WKWebView still lacks it. */
function runWhenIdle(fn: () => void): number {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
    .requestIdleCallback;
  if (ric) return ric(fn, { timeout: 1000 });
  return setTimeout(fn, 0) as unknown as number;
}

function cancelIdle(handle: number): void {
  const cic = (globalThis as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
  if (cic) cic(handle);
  else clearTimeout(handle);
}

/** Coalesce a write; the newest state wins and lands within ~500ms. */
export function scheduleSaveState(state: AppState): void {
  pendingState = state;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    idleHandle = runWhenIdle(() => {
      idleHandle = null;
      flushSaveState();
    });
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Write any coalesced state immediately. Safe to call when nothing is pending.
 * MUST be called before the page can go away, or the last edits before a
 * backgrounding are lost.
 */
export function flushSaveState(): void {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  if (idleHandle !== null) { cancelIdle(idleHandle); idleHandle = null; }
  if (!pendingState) return;
  const state = pendingState;
  pendingState = null;
  saveState(state);
}

/**
 * Throw away a coalesced write without performing it.
 *
 * Pairs with wiping the store (reset, account switch): a queued write holds the
 * state of the account being discarded, and letting it land after the wipe
 * would write that data straight back.
 */
export function discardPendingSave(): void {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  if (idleHandle !== null) { cancelIdle(idleHandle); idleHandle = null; }
  pendingState = null;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createProfile(profile: Omit<FighterProfile, 'id' | 'createdAt'>): FighterProfile {
  return {
    ...profile,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
}

export function createCamp(camp: Omit<FightCamp, 'id' | 'createdAt'>): FightCamp {
  return {
    ...camp,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
}

export function addWorkoutLog(state: AppState, log: Omit<WorkoutLog, 'id' | 'createdAt'>): AppState {
  const newLog: WorkoutLog = { ...log, id: generateId(), createdAt: new Date().toISOString() };
  return { ...state, workoutLogs: [newLog, ...state.workoutLogs] };
}

export function addSparringLog(state: AppState, log: Omit<SparringLog, 'id' | 'createdAt'>): AppState {
  const newLog: SparringLog = { ...log, id: generateId(), createdAt: new Date().toISOString() };
  return { ...state, sparringLogs: [newLog, ...state.sparringLogs] };
}

export function addConditioningTest(state: AppState, test: Omit<ConditioningTest, 'id' | 'createdAt'>): AppState {
  const newTest: ConditioningTest = { ...test, id: generateId(), createdAt: new Date().toISOString() };
  return { ...state, conditioningTests: [newTest, ...state.conditioningTests] };
}

export function addWeightEntry(state: AppState, entry: Omit<WeightEntry, 'id' | 'createdAt'>): AppState {
  // One canonical weigh-in per camp/date. Re-logging the same day corrects the
  // existing value instead of creating duplicate chart points and conflicting
  // cut projections. The original id/createdAt stay stable for cloud sync.
  const existing = state.weightEntries.find(
    item => item.campId === entry.campId && item.date === entry.date,
  );
  if (existing) {
    return {
      ...state,
      weightEntries: state.weightEntries.map(item =>
        item.id === existing.id ? { ...existing, ...entry } : item
      ),
    };
  }

  const newEntry: WeightEntry = { ...entry, id: generateId(), createdAt: new Date().toISOString() };
  return { ...state, weightEntries: [newEntry, ...state.weightEntries] };
}

export function deleteWorkoutLog(state: AppState, id: string): AppState {
  return { ...state, workoutLogs: state.workoutLogs.filter(l => l.id !== id) };
}

export function deleteSparringLog(state: AppState, id: string): AppState {
  return { ...state, sparringLogs: state.sparringLogs.filter(l => l.id !== id) };
}

export function deleteConditioningTest(state: AppState, id: string): AppState {
  return { ...state, conditioningTests: state.conditioningTests.filter(t => t.id !== id) };
}

export function deleteWeightEntry(state: AppState, id: string): AppState {
  return { ...state, weightEntries: state.weightEntries.filter(e => e.id !== id) };
}

export function updateProfile(state: AppState, profile: FighterProfile): AppState {
  const fighters = state.fighters.map(f => f.id === profile.id ? profile : f);
  const coaches = state.coaches.map(c => c.id === profile.id ? profile : c);
  const currentUser = state.currentUser?.id === profile.id ? profile : state.currentUser;
  return { ...state, fighters, coaches, currentUser };
}

export function deleteCamp(state: AppState, campId: string): AppState {
  const camps = state.camps.filter(c => c.id !== campId);
  const activeCamp = state.activeCamp?.id === campId
    ? (camps[camps.length - 1] ?? null)
    : state.activeCamp;

  // Cascade across EVERY camp-scoped collection. Nutrition, HRV, fight results,
  // the game plan and the camp-keyed session/day maps used to survive the
  // delete: their rows kept feeding streaks, achievements and cloud pushes for
  // a camp the fighter could no longer see, and a new camp that happened to
  // reuse the id prefix inherited the old ticks.
  const prefix = `${campId}-`;
  const withoutCampKeys = (map: Record<string, boolean>): Record<string, boolean> =>
    Object.fromEntries(Object.entries(map).filter(([k]) => !k.startsWith(prefix)));

  const { [campId]: _removedPlan, ...gamePlans } = state.gamePlans;
  void _removedPlan;

  return {
    ...state,
    camps,
    activeCamp,
    workoutLogs: state.workoutLogs.filter(l => l.campId !== campId),
    sparringLogs: state.sparringLogs.filter(l => l.campId !== campId),
    conditioningTests: state.conditioningTests.filter(t => t.campId !== campId),
    weightEntries: state.weightEntries.filter(e => e.campId !== campId),
    nutritionLogs: state.nutritionLogs.filter(n => n.campId !== campId),
    hrvEntries: (state.hrvEntries ?? []).filter(h => h.campId !== campId),
    fightResults: (state.fightResults ?? []).filter(r => r.campId !== campId),
    gamePlans,
    completedSessions: withoutCampKeys(state.completedSessions),
    dayOverrides: withoutCampKeys(state.dayOverrides),
  };
}

export function setSchedule(state: AppState, schedule: TrainingWeek[]): AppState {
  return { ...state, trainingSchedule: schedule };
}

export function saveGamePlan(state: AppState, plan: GamePlan): AppState {
  return { ...state, gamePlans: { ...state.gamePlans, [plan.campId]: plan } };
}

export function upsertNutritionLog(state: AppState, log: Omit<NutritionLog, 'id' | 'createdAt'>): AppState {
  const existing = state.nutritionLogs.find(n => n.campId === log.campId && n.date === log.date);
  if (existing) {
    return {
      ...state,
      nutritionLogs: state.nutritionLogs.map(n =>
        n.id === existing.id ? { ...existing, ...log, updatedAt: new Date().toISOString() } : n
      ),
    };
  }
  const newLog: NutritionLog = { ...log, id: generateId(), createdAt: new Date().toISOString() };
  return { ...state, nutritionLogs: [newLog, ...state.nutritionLogs] };
}

export function deleteNutritionLog(state: AppState, id: string): AppState {
  return { ...state, nutritionLogs: state.nutritionLogs.filter(n => n.id !== id) };
}

export function addCoachNote(state: AppState, note: Omit<CoachNote, 'id' | 'createdAt'>): AppState {
  const newNote: CoachNote = { ...note, id: generateId(), createdAt: new Date().toISOString() };
  return { ...state, coachNotes: [newNote, ...state.coachNotes] };
}

export function deleteCoachNote(state: AppState, id: string): AppState {
  return { ...state, coachNotes: state.coachNotes.filter(n => n.id !== id) };
}

export function linkCoach(state: AppState, coachId: string | null): AppState {
  if (!state.currentUser) return state;
  const updated = { ...state.currentUser, coachId: coachId ?? undefined };
  return updateProfile(state, updated);
}

// ─── HRV ─────────────────────────────────────────────────────────────────

export function addHRVEntry(state: AppState, entry: Omit<HRVEntry, 'id' | 'createdAt'>): AppState {
  const newEntry: HRVEntry = { ...entry, id: generateId(), createdAt: new Date().toISOString() };
  return { ...state, hrvEntries: [newEntry, ...(state.hrvEntries ?? [])] };
}

export function deleteHRVEntry(state: AppState, id: string): AppState {
  return { ...state, hrvEntries: (state.hrvEntries ?? []).filter(e => e.id !== id) };
}

export function setFitbitConfig(state: AppState, config: FitbitConfig | null): AppState {
  return { ...state, fitbitConfig: config ?? undefined };
}

// ─── Fight Results ────────────────────────────────────────────────────────

export function buildFightResult(input: Omit<FightResult, 'id' | 'createdAt'>): FightResult {
  return { ...input, id: generateId(), createdAt: new Date().toISOString() };
}

export function addFightResult(state: AppState, result: FightResult): AppState {
  return { ...state, fightResults: [result, ...(state.fightResults ?? [])] };
}

export function updateFightResult(state: AppState, result: FightResult): AppState {
  return {
    ...state,
    fightResults: (state.fightResults ?? []).map(r => r.id === result.id ? result : r),
  };
}

export function deleteFightResult(state: AppState, id: string): AppState {
  return { ...state, fightResults: (state.fightResults ?? []).filter(r => r.id !== id) };
}

export function applyFactorWeights(state: AppState, fighterId: string, weights: CampFactorWeights): AppState {
  const updateFn = (p: FighterProfile): FighterProfile =>
    p.id === fighterId ? { ...p, factorWeights: weights } : p;
  return {
    ...state,
    fighters: state.fighters.map(updateFn),
    coaches: state.coaches.map(updateFn),
    currentUser: state.currentUser?.id === fighterId ? updateFn(state.currentUser) : state.currentUser,
  };
}

// ─── Custom Timer Presets ─────────────────────────────────────────────────

const PRESETS_KEY = 'fightcamp_timer_presets';

export function loadCustomPresets(): CustomTimerPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveCustomPresets(presets: CustomTimerPreset[]): void {
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); } catch { /* noop */ }
}
