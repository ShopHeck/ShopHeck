import type {
  AppState, FighterProfile, FightCamp, WorkoutLog, WeightEntry, SparringLog, SessionType,
} from '../types';
import { createDefaultState, createProfile, createCamp, generateId } from './storage';

/**
 * Builds a realistic, fully-populated demo AppState for App Store screenshots.
 * Activated only by the `?shot` URL param (see AppContext) — never used in normal
 * runtime. Reuses the app's real factory functions so it stays valid as the state
 * shape evolves.
 *
 * The subscription is seeded as `stripe_server` (not `comp`) on purpose: the
 * AppContext reconcile effects only revert a `comp` source when the signed-in
 * email isn't allow-listed, and only touch `stripe_server` when a user is signed
 * in — neither applies to the signed-out screenshot session, so Pro stays on.
 */
export function seedDemoState(): AppState {
  const isoDate = (offsetDays: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };
  const ts = (isoDay: string): string => `${isoDay}T12:00:00.000Z`;

  const fighter: FighterProfile = createProfile({
    name: 'Alex Rivera',
    age: 26,
    sport: 'Boxing',
    weightClass: 'Lightweight',
    experienceLevel: 'Amateur',
    role: 'fighter',
    gym: 'Westside Boxing Club',
    record: '8-2',
  });

  /** Days between the camp's first day and today. Week 1 starts here. */
  const CAMP_START = -7 * 2;         // started 2 weeks ago → currently in week 3

  const camp: FightCamp = createCamp({
    fightDate: isoDate(7 * 6),     // 6 weeks out
    opponent: 'Marcus Chen',
    weightClass: 'Lightweight',
    currentWeight: 142,
    targetWeight: 135,
    rounds: 3,
    roundDuration: 3,
    sport: 'Boxing',
    experienceLevel: 'Amateur',
    campWeeks: 8,
    startDate: isoDate(CAMP_START),
  });

  /** Camp week a day-offset falls in (week 1 = the first seven days). */
  const weekOf = (offset: number): number => Math.floor((offset - CAMP_START) / 7) + 1;
  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayLabel = (offset: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return DAY_LABELS[d.getDay()];
  };

  const workout = (
    offset: number, sessionType: SessionType, title: string, duration: number, rpe: number,
  ): WorkoutLog => ({
    id: generateId(), campId: camp.id, date: isoDate(offset),
    // Progress charts bucket volume and RPE by weekNumber — hard-coding week 1
    // collapses the whole camp into a single bar.
    weekNumber: weekOf(offset), dayLabel: dayLabel(offset),
    sessionType, title, duration, rpe, notes: '', completed: true, createdAt: ts(isoDate(offset)),
  });
  const workoutLogs: WorkoutLog[] = [
    // Week 1
    workout(-14, 'strength', 'Strength — full body', 55, 7),
    workout(-13, 'skill', 'Technique & drills', 45, 5),
    workout(-12, 'conditioning', 'Roadwork + intervals', 40, 7),
    workout(-11, 'sparring', 'Sparring — 5 rounds', 45, 8),
    workout(-9, 'conditioning', 'Bag intervals', 35, 7),
    workout(-8, 'skill', 'Mitts & footwork', 50, 6),
    // Week 2
    workout(-7, 'conditioning', 'Bag intervals', 35, 7),
    workout(-6, 'sparring', 'Sparring — 8 rounds', 50, 9),
    workout(-4, 'strength', 'Strength — lower body', 55, 7),
    workout(-3, 'skill', 'Mitts & footwork', 50, 6),
    workout(-2, 'conditioning', 'Roadwork + intervals', 40, 7),
    workout(-1, 'sparring', 'Sparring — 6 rounds', 45, 8),
  ];

  /**
   * Tick off the sessions in the weeks that have already happened.
   *
   * Adherence is read from `completedSessions`, keyed
   * `${campId}-${week}-${dayOfWeek}-${sessionIndex}` against the schedule
   * AppContext regenerates from the camp — so without this the Progress screen
   * reports a flat "0% overall adherence (0/67 planned)" over an empty chart.
   * The schedule doesn't exist yet at seed time, so we write keys for every
   * plausible day/session slot in the elapsed weeks; adherence only ever looks
   * up keys it derives from the real schedule, so the extras are inert. The
   * skip rule leaves a few sessions unticked, because a spotless 100% camp
   * looks staged.
   */
  const completedSessions: Record<string, boolean> = {};
  const elapsedWeeks = Math.max(0, Math.floor(-CAMP_START / 7));
  for (let week = 1; week <= elapsedWeeks; week++) {
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      for (let session = 0; session < 3; session++) {
        if ((week * 3 + dayOfWeek * 2 + session) % 7 === 0) continue;
        completedSessions[`${camp.id}-${week}-${dayOfWeek}-${session}`] = true;
      }
    }
  }

  const weightEntries: WeightEntry[] = [148, 147, 146, 145.5, 144, 143, 142].map((weight, i) => {
    const day = isoDate(-12 + i * 2);
    return { id: generateId(), campId: camp.id, date: day, weight, notes: '', createdAt: ts(day) };
  });

  const sparring = (
    offset: number, rounds: number, partnerName: string,
    partnerLevel: SparringLog['partnerLevel'], focus: string,
    performance: SparringLog['performance'],
  ): SparringLog => ({
    id: generateId(), campId: camp.id, date: isoDate(offset), weekNumber: weekOf(offset),
    rounds, roundDuration: 3, partnerName, partnerLevel, focus, performance, notes: '',
    createdAt: ts(isoDate(offset)),
  });
  const sparringLogs: SparringLog[] = [
    sparring(-11, 5, 'Ray', 'Amateur', 'Distance control', 3),
    sparring(-6, 8, 'Devon', 'Pro', 'Body work', 4),
    sparring(-1, 6, 'Devon', 'Pro', 'Counter-punching', 4),
  ];

  return {
    ...createDefaultState(),
    currentUser: fighter,
    fighters: [fighter],
    camps: [camp],
    activeCamp: camp,            // AppContext regenerates trainingSchedule from this
    workoutLogs,
    weightEntries,
    sparringLogs,
    completedSessions,
    subscription: { tier: 'coach_pro', expiresAt: null, source: 'stripe_server' },
  };
}
