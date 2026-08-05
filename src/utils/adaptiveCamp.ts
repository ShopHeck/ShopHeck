import { differenceInCalendarDays, parseISO, subDays } from 'date-fns';
import type { AppState, FightCamp, TrainingWeek, TrainingSession, CampAdaptation, AdaptationKind } from '../types';
import { computeReadiness } from './readiness';
import { getWeekNumberForDate, generateTrainingCamp } from './campGenerator';
import { weekAdherence } from './adherence';

/**
 * Adaptive Camp — the generated plan reacts to how the fighter is actually
 * holding up.
 *
 * The app already measured readiness, HRV and adherence, but the schedule was
 * generated once at camp creation and never moved. A fighter whose HRV had been
 * suppressed for a week was still being handed the same twelve sparring rounds,
 * and the app's own dashboard was telling them so while the plan ignored it.
 *
 * Three rules make this safe rather than clever:
 *
 * 1. **Nothing is applied without consent.** `proposeAdaptation` returns a
 *    suggestion; the reducer only changes the plan once the fighter (or their
 *    coach) accepts it. An app that silently rewrites a fight camp is not
 *    trustworthy, and a coach who finds the week changed underneath them stops
 *    using it.
 *
 * 2. **Adaptations are stored, not derived.** An accepted adaptation is a row in
 *    state. If the plan were recomputed live from today's readiness, the
 *    schedule would flicker as data arrived, and every historical camp would be
 *    re-scored against a plan that never existed.
 *
 * 3. **An adaptation never changes the SHAPE of a week** — same days, same
 *    number of sessions per day, same rest days. Only the content of a session
 *    changes (title, duration, intensity, description). This is load-bearing:
 *    `utils/adherence.ts` keys ticks on `${campId}-${week}-${day}-${index}`, so
 *    adding or removing a session would orphan the fighter's existing ticks and
 *    make a coach's adherence figure disagree with the fighter's own. Pinned by
 *    a test that asserts the session keys are identical before and after.
 */

// ─── Signals ─────────────────────────────────────────────────────────────────

export interface AdaptationSignals {
  /** 0–100 readiness, or null when there is no camp to score. */
  readiness: number | null;
  readinessConfidence: 'low' | 'medium' | 'high';
  /** Recent HRV vs the fighter's own baseline, as a percentage. Negative = suppressed. */
  hrvDeltaPct: number | null;
  /** This week's schedule adherence, 0–100. */
  weekAdherencePct: number | null;
  /** Mean RPE across sessions logged in the last 7 days. */
  avgRpe7d: number | null;
  /** Sessions logged in the last 7 days — context for the two above. */
  sessions7d: number;
}

/** Days of HRV used as the fighter's own baseline. */
const HRV_BASELINE_DAYS = 28;
/** Days of HRV treated as "recent" and compared against that baseline. */
const HRV_RECENT_DAYS = 5;
/** Minimum readings in each window before an HRV comparison means anything. */
const HRV_MIN_READINGS = 3;

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * HRV as a percentage of the fighter's own rolling baseline.
 *
 * Deliberately relative, never absolute: population HRV ranges span an order of
 * magnitude, so "RMSSD 45" says nothing without knowing whose wrist it came
 * from. The baseline window excludes the recent window so a genuinely
 * suppressed stretch cannot drag its own comparison down and hide itself.
 */
export function hrvDeltaPct(state: AppState, now: Date): number | null {
  const entries = (state.hrvEntries ?? [])
    .filter(e => state.activeCamp === null || e.campId === state.activeCamp.id);
  if (entries.length === 0) return null;

  const recentFrom = subDays(now, HRV_RECENT_DAYS);
  const baselineFrom = subDays(now, HRV_BASELINE_DAYS);

  const recent: number[] = [];
  const baseline: number[] = [];
  for (const e of entries) {
    const d = parseISO(e.date);
    if (d > now) continue; // never let a future-dated entry leak in
    if (d >= recentFrom) recent.push(e.rmssd);
    else if (d >= baselineFrom) baseline.push(e.rmssd);
  }

  if (recent.length < HRV_MIN_READINGS || baseline.length < HRV_MIN_READINGS) return null;

  const r = mean(recent)!;
  const b = mean(baseline)!;
  if (b <= 0) return null;
  return Math.round(((r - b) / b) * 100);
}

export function readAdaptationSignals(state: AppState, now: Date = new Date()): AdaptationSignals {
  const readinessResult = computeReadiness(state, now);

  const camp = state.activeCamp;
  const weekNumber = camp ? getWeekNumberForDate(camp, now) : null;
  const week = weekNumber !== null
    ? state.trainingSchedule.find(w => w.weekNumber === weekNumber)
    : undefined;
  const adherence = camp
    ? weekAdherence(state.completedSessions ?? {}, camp.id, week)
    : { done: 0, planned: 0, pct: null };

  const from = subDays(now, 7);
  const recentLogs = (state.workoutLogs ?? []).filter(l => {
    if (camp && l.campId !== camp.id) return false;
    const d = parseISO(l.date);
    return d >= from && d <= now;
  });
  const rpes = recentLogs.map(l => l.rpe).filter(r => typeof r === 'number' && r > 0);
  const avg = mean(rpes);

  return {
    readiness: readinessResult?.overall ?? null,
    readinessConfidence: readinessResult?.confidence ?? 'low',
    hrvDeltaPct: hrvDeltaPct(state, now),
    weekAdherencePct: adherence.pct,
    avgRpe7d: avg === null ? null : Math.round(avg * 10) / 10,
    sessions7d: recentLogs.length,
  };
}

// ─── Proposal ────────────────────────────────────────────────────────────────

export interface AdaptationProposal {
  kind: AdaptationKind;
  campId: string;
  weekNumber: number;
  headline: string;
  reasons: string[];
  signals: AdaptationSignals;
  /** Stable identity, so a dismissal sticks and the same card cannot re-nag. */
  key: string;
}

export function adaptationKey(campId: string, weekNumber: number, kind: AdaptationKind): string {
  return `${campId}:${weekNumber}:${kind}`;
}

/** HRV this far below baseline is a genuine suppression rather than noise. */
const HRV_SUPPRESSED_PCT = -8;
/** HRV comfortably above baseline — the fighter has absorbed the load. */
const HRV_ELEVATED_PCT = 4;
/** Readiness below this is a fighter who is not absorbing the plan. */
const READINESS_LOW = 55;
/** Readiness above this, with the work actually done, means room to push. */
const READINESS_HIGH = 80;
/** Mean RPE above this over a week is a fighter grinding through sessions. */
const RPE_HIGH = 8.3;
/** Below this, sessions are being logged as comfortably inside the range. */
const RPE_LOW = 6.5;
/** Adherence above this means the plan is genuinely being followed. */
const ADHERENCE_STRONG = 85;
/** Sessions in the last week below which nothing here is trustworthy. */
const MIN_SESSIONS_FOR_SIGNAL = 3;

/**
 * The single most appropriate adaptation for right now, or null.
 *
 * Returns null far more often than not, and that is the point. A plan that
 * changes every few days is not a plan, and a proposal driven by two data
 * points is worse than no proposal — `readAdaptationSignals` can legitimately
 * return all-nulls for a fighter who logs nothing, and this must stay quiet for
 * them rather than inventing a reason to intervene.
 *
 * Recovery outranks deload outranks intensify: when a fighter is both behind on
 * adherence and suppressed, the answer is never "add volume".
 */
export function proposeAdaptation(
  state: AppState,
  now: Date = new Date(),
  signals: AdaptationSignals = readAdaptationSignals(state, now),
): AdaptationProposal | null {
  const camp = state.activeCamp;
  if (!camp || camp.isOffSeason) return null;

  // The taper exists to shed fatigue and is already the lightest week in the
  // camp. Deloading it is meaningless and intensifying it is actively harmful.
  const weekNumber = getWeekNumberForDate(camp, now);
  const week = state.trainingSchedule.find(w => w.weekNumber === weekNumber);
  if (week?.phase === 'Taper' || week?.phase === 'Active Recovery') return null;

  // Fight week is not the moment to start rewriting the plan.
  if (camp.fightDate) {
    const daysOut = differenceInCalendarDays(parseISO(camp.fightDate), now);
    if (daysOut >= 0 && daysOut <= 7) return null;
  }

  if (signals.sessions7d < MIN_SESSIONS_FOR_SIGNAL) return null;

  const suppressed = signals.hrvDeltaPct !== null && signals.hrvDeltaPct <= HRV_SUPPRESSED_PCT;
  const grinding = signals.avgRpe7d !== null && signals.avgRpe7d >= RPE_HIGH;
  const lowReadiness = signals.readiness !== null
    && signals.readiness < READINESS_LOW
    && signals.readinessConfidence !== 'low';

  const make = (kind: AdaptationKind, headline: string, reasons: string[]): AdaptationProposal => ({
    kind,
    campId: camp.id,
    weekNumber,
    headline,
    reasons,
    signals,
    key: adaptationKey(camp.id, weekNumber, kind),
  });

  // Recovery — the strongest signal set. Two independent measures both say the
  // fighter is not absorbing the work, so the hard sessions come out entirely.
  if (suppressed && (grinding || lowReadiness)) {
    const reasons = [`HRV is ${Math.abs(signals.hrvDeltaPct!)}% below your baseline`];
    if (grinding) reasons.push(`sessions are averaging RPE ${signals.avgRpe7d}`);
    if (lowReadiness) reasons.push(`readiness is at ${signals.readiness}`);
    return make('recovery', 'Take a recovery week', reasons);
  }

  // Deload — one clear signal. Same sessions, meaningfully lighter.
  if (suppressed || grinding || lowReadiness) {
    const reasons: string[] = [];
    if (suppressed) reasons.push(`HRV is ${Math.abs(signals.hrvDeltaPct!)}% below your baseline`);
    if (grinding) reasons.push(`sessions are averaging RPE ${signals.avgRpe7d}`);
    if (lowReadiness) reasons.push(`readiness is at ${signals.readiness}`);
    return make('deload', 'Lighten this week', reasons);
  }

  // Intensify — deliberately the hardest to trigger. Adding load to a fighter
  // who is quietly accumulating fatigue is the one failure here with a real
  // injury cost, so it needs every signal pointing the same way at once.
  const recovered = signals.hrvDeltaPct !== null && signals.hrvDeltaPct >= HRV_ELEVATED_PCT;
  const easy = signals.avgRpe7d !== null && signals.avgRpe7d <= RPE_LOW;
  const highReadiness = signals.readiness !== null
    && signals.readiness >= READINESS_HIGH
    && signals.readinessConfidence === 'high';
  const following = signals.weekAdherencePct !== null && signals.weekAdherencePct >= ADHERENCE_STRONG;

  if (recovered && easy && highReadiness && following) {
    return make('intensify', 'Add load this week', [
      `HRV is ${signals.hrvDeltaPct}% above your baseline`,
      `sessions are averaging RPE ${signals.avgRpe7d}`,
      `readiness is at ${signals.readiness}`,
      `you've hit ${signals.weekAdherencePct}% of this week's plan`,
    ]);
  }

  return null;
}

// ─── Application ─────────────────────────────────────────────────────────────

const INTENSITY_ORDER: TrainingWeek['intensity'][] = ['Low', 'Medium', 'High', 'Very High'];

function shiftIntensity(intensity: TrainingWeek['intensity'], steps: number): TrainingWeek['intensity'] {
  const i = INTENSITY_ORDER.indexOf(intensity);
  if (i === -1) return intensity;
  return INTENSITY_ORDER[Math.min(INTENSITY_ORDER.length - 1, Math.max(0, i + steps))];
}

/** Round to the nearest 5 minutes — a 43-minute session reads like a bug. */
function roundDuration(minutes: number): number {
  return Math.max(15, Math.round(minutes / 5) * 5);
}

function adaptSession(session: TrainingSession, kind: AdaptationKind): TrainingSession {
  if (kind === 'intensify') {
    return {
      ...session,
      duration: roundDuration(session.duration * 1.15),
      notes: [session.notes, 'Added load: readiness and HRV both say you can absorb more this week.']
        .filter(Boolean).join(' '),
    };
  }

  // Recovery pulls the hard work out; deload keeps the session but lightens it.
  const isHard = session.type === 'sparring' || session.type === 'conditioning';

  if (kind === 'recovery' && isHard) {
    return {
      ...session,
      // The TYPE changes but the slot does not — the week keeps its shape, so
      // the fighter's existing ticks for this day stay valid.
      type: 'recovery',
      title: session.type === 'sparring' ? 'Technical Drilling (was sparring)' : 'Active Recovery (was conditioning)',
      duration: roundDuration(session.duration * 0.6),
      description: session.type === 'sparring'
        ? 'Flow rounds and technical drilling only — no live sparring this week. Movement quality over output.'
        : 'Easy aerobic work, mobility and breathing. Keep it conversational; this is recovery, not a session.',
      notes: [session.notes, 'Swapped for recovery: your HRV and readiness both dropped.']
        .filter(Boolean).join(' '),
    };
  }

  if (kind === 'recovery') {
    return { ...session, duration: roundDuration(session.duration * 0.75) };
  }

  return {
    ...session,
    duration: roundDuration(session.duration * (isHard ? 0.7 : 0.85)),
    notes: [session.notes, 'Deloaded: same session, lighter. Leave two reps in reserve.']
      .filter(Boolean).join(' '),
  };
}

const KIND_SUFFIX: Record<AdaptationKind, string> = {
  recovery: 'Recovery week — hard sessions swapped for technical and aerobic work.',
  deload: 'Deload week — same sessions, reduced volume.',
  intensify: 'Loaded week — volume increased while readiness allows.',
};

/**
 * Apply accepted adaptations to a generated schedule.
 *
 * Pure, and shape-preserving by construction: every day is mapped one-to-one and
 * every session is mapped one-to-one, so `weekSessionKeys` produces an identical
 * key set before and after. Only one adaptation per week is applied — the most
 * recently accepted — because two stacked deloads would compound into a week
 * with no training in it.
 */
export function applyAdaptations(
  weeks: TrainingWeek[],
  adaptations: CampAdaptation[],
): TrainingWeek[] {
  if (adaptations.length === 0) return weeks;

  const byWeek = new Map<number, CampAdaptation>();
  for (const a of adaptations) {
    const prev = byWeek.get(a.weekNumber);
    if (!prev || a.createdAt > prev.createdAt) byWeek.set(a.weekNumber, a);
  }
  if (byWeek.size === 0) return weeks;

  return weeks.map(week => {
    const adaptation = byWeek.get(week.weekNumber);
    if (!adaptation) return week;
    const { kind } = adaptation;

    return {
      ...week,
      intensity: shiftIntensity(week.intensity, kind === 'intensify' ? 1 : kind === 'recovery' ? -2 : -1),
      focus: `${week.focus} · ${KIND_SUFFIX[kind]}`,
      days: week.days.map(day =>
        // Rest days are already rest; touching them would change the week's
        // shape in the one way the key builder actually notices.
        day.isRestDay ? day : { ...day, sessions: day.sessions.map(s => adaptSession(s, kind)) },
      ),
    };
  });
}

/** The adaptations that belong to one camp. */
export function adaptationsForCamp(state: AppState, campId: string): CampAdaptation[] {
  return (state.campAdaptations ?? []).filter(a => a.campId === campId);
}

/**
 * The schedule as the fighter should see it: generated, then adapted.
 *
 * Every place that puts weeks into `state.trainingSchedule` goes through here,
 * so the planner and dashboard can never disagree about whether an accepted
 * adaptation is in effect.
 *
 * `utils/adherence.ts` and `utils/teamOverview.ts` deliberately do NOT use this
 * and call `generateTrainingCamp` directly. That is correct, not an oversight:
 * adaptations are shape-preserving, so both produce identical session keys, and
 * scoring stays independent of a slice that is currently local-only — which is
 * what lets a coach's adherence figure match their fighter's.
 */
export function buildSchedule(state: AppState, camp: FightCamp | null): TrainingWeek[] {
  if (!camp) return [];
  return applyAdaptations(
    generateTrainingCamp(camp, state.currentUser?.factorWeights),
    adaptationsForCamp(state, camp.id),
  );
}
