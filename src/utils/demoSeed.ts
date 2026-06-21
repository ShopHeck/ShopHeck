import type {
  AppState, FighterProfile, FightCamp, WorkoutLog, WeightEntry, SparringLog, SessionType,
} from '../types';
import { defaultState, createProfile, createCamp, generateId } from './storage';

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
    startDate: isoDate(-7 * 2),    // started 2 weeks ago
  });

  const workout = (
    offset: number, sessionType: SessionType, title: string, duration: number, rpe: number,
  ): WorkoutLog => ({
    id: generateId(), campId: camp.id, date: isoDate(offset), weekNumber: 1, dayLabel: 'Mon',
    sessionType, title, duration, rpe, notes: '', completed: true, createdAt: ts(isoDate(offset)),
  });
  const workoutLogs: WorkoutLog[] = [
    workout(-1, 'sparring', 'Sparring — 6 rounds', 45, 8),
    workout(-2, 'conditioning', 'Roadwork + intervals', 40, 7),
    workout(-3, 'skill', 'Mitts & footwork', 50, 6),
    workout(-4, 'strength', 'Strength — lower body', 55, 7),
    workout(-6, 'sparring', 'Sparring — 8 rounds', 50, 9),
    workout(-7, 'conditioning', 'Bag intervals', 35, 7),
  ];

  const weightEntries: WeightEntry[] = [148, 147, 146, 145.5, 144, 143, 142].map((weight, i) => {
    const day = isoDate(-12 + i * 2);
    return { id: generateId(), campId: camp.id, date: day, weight, notes: '', createdAt: ts(day) };
  });

  const sparringLogs: SparringLog[] = [{
    id: generateId(), campId: camp.id, date: isoDate(-1), weekNumber: 1, rounds: 6, roundDuration: 3,
    partnerName: 'Devon', partnerLevel: 'Pro', focus: 'Counter-punching', performance: 4, notes: '',
    createdAt: ts(isoDate(-1)),
  }];

  return {
    ...defaultState,
    currentUser: fighter,
    fighters: [fighter],
    camps: [camp],
    activeCamp: camp,            // AppContext regenerates trainingSchedule from this
    workoutLogs,
    weightEntries,
    sparringLogs,
    subscription: { tier: 'coach_pro', expiresAt: null, source: 'stripe_server' },
  };
}
