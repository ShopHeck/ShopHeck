import { describe, expect, it } from 'vitest';
import {
  generateTrainingCamp,
  getCampProgress,
  getDaysUntilFight,
  getWeekNumberForDate,
} from '../src/utils/campGenerator';
import type { CampFactorWeights, FightCamp } from '../src/types';

function camp(overrides: Partial<FightCamp> = {}): FightCamp {
  return {
    id: 'camp-1',
    fightDate: '2026-10-10',
    opponent: 'Opponent',
    weightClass: 'Lightweight',
    currentWeight: 160,
    targetWeight: 155,
    rounds: 3,
    roundDuration: 3,
    sport: 'Boxing',
    experienceLevel: 'Amateur',
    campWeeks: 8,
    startDate: '2026-08-15',
    createdAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

function factorWeights(overrides: Partial<CampFactorWeights> = {}): CampFactorWeights {
  return {
    weightCut: 20,
    trainingVolume: 25,
    sessionQuality: 15,
    sparring: 20,
    conditioning: 10,
    nutrition: 10,
    updatedAt: '2026-08-03T12:00:00.000Z',
    derivedFromFightId: 'fight-1',
    ...overrides,
  };
}

function allGeneratedText(schedule: ReturnType<typeof generateTrainingCamp>): string {
  return schedule.flatMap(week => [
    week.focus,
    ...week.weeklyGoals,
    ...week.days.flatMap(day => day.sessions.flatMap(session => [session.title, session.description])),
  ]).join(' ');
}

describe('fight-camp generator safety and personalization', () => {
  it('uses recovery-positive sleep guidance during taper', () => {
    const schedule = generateTrainingCamp(camp());
    const taper = schedule.find(week => week.phase === 'Taper');

    expect(taper?.weeklyGoals).toContain('Aim for 8+ hours sleep per night');
    expect(taper?.weeklyGoals.join(' ')).not.toContain('Max 8hrs sleep');
  });

  it('allows a learned sparring target to reduce peak-week volume', () => {
    const schedule = generateTrainingCamp(
      camp(),
      factorWeights({ sparringRoundsTarget: 20 }),
    );
    const peak = schedule.find(week => week.phase === 'Peak');
    const tuesdaySparring = peak?.days
      .find(day => day.dayOfWeek === 2)
      ?.sessions.find(session => session.type === 'sparring');

    expect(tuesdaySparring?.description).toContain('5 rounds');
  });

  it('applies high and low learned strength emphasis to session duration', () => {
    const sixWeekCamp = camp({ campWeeks: 6, startDate: '2026-08-29' });
    const high = generateTrainingCamp(
      sixWeekCamp,
      factorWeights({ strengthEmphasis: 'high' }),
    );
    const low = generateTrainingCamp(
      sixWeekCamp,
      factorWeights({ strengthEmphasis: 'low' }),
    );

    const tuesdayStrength = (schedule: ReturnType<typeof generateTrainingCamp>) =>
      schedule[0].days
        .find(day => day.dayOfWeek === 2)
        ?.sessions.find(session => session.type === 'strength');

    expect(tuesdayStrength(high)?.duration).toBe(75);
    expect(tuesdayStrength(high)?.title).toContain('High Emphasis');
    expect(tuesdayStrength(low)?.duration).toBe(45);
    expect(tuesdayStrength(low)?.title).toContain('Maintenance');
  });

  it('removes unsafe bare-knuckle contact prescriptions while keeping ruleset specificity', () => {
    const text = allGeneratedText(generateTrainingCamp(camp({ sport: 'Bare Knuckle' })));

    expect(text).toContain('no bare-knuckle head contact');
    expect(text).toContain('qualified coach');
    expect(text).not.toContain('competitive BK sparring');
    expect(text).not.toContain('knuckle conditioning on bare bag');
    expect(text).not.toContain('embrace discomfort');
    expect(text).not.toContain('Last 2 rounds: bare hands');
  });
});

describe('calendar-day camp calculations', () => {
  it('treats the entire fight date as zero days out', () => {
    expect(getDaysUntilFight('2026-08-03', new Date(2026, 7, 3, 0, 1))).toBe(0);
    expect(getDaysUntilFight('2026-08-03', new Date(2026, 7, 3, 23, 59))).toBe(0);
  });

  it('returns one day out on the prior local calendar day', () => {
    expect(getDaysUntilFight('2026-08-04', new Date(2026, 7, 3, 23, 59))).toBe(1);
  });

  it('calculates progress from calendar days rather than rolling 24-hour periods', () => {
    const fourWeekCamp = camp({
      campWeeks: 4,
      startDate: '2026-08-01',
      fightDate: '2026-08-29',
    });

    expect(getCampProgress(fourWeekCamp, new Date(2026, 7, 15, 23, 59))).toBe(50);
  });

  it('assigns week numbers using calendar boundaries', () => {
    const fourWeekCamp = camp({
      campWeeks: 4,
      startDate: '2026-08-03', // Monday
      fightDate: '2026-08-31',
    });

    expect(getWeekNumberForDate(fourWeekCamp, new Date(2026, 7, 9, 23, 59))).toBe(1);
    expect(getWeekNumberForDate(fourWeekCamp, new Date(2026, 7, 10, 0, 1))).toBe(2);
  });
});
