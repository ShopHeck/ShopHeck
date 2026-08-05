import { describe, it, expect } from 'vitest';
import { buildTeamOverview } from '../src/utils/teamOverview';
import { generateTrainingCamp } from '../src/utils/campGenerator';
import { weekSessionKeys } from '../src/utils/adherence';
import type { TeamFighterSnapshot } from '../src/lib/coachLinks';
import type { FightCamp } from '../src/types';

const NOW = new Date('2026-03-01T12:00:00.000Z');

function camp(overrides: Partial<FightCamp> = {}): FightCamp {
  return {
    id: 'camp-1',
    weightClass: 'Lightweight',
    currentWeight: 165,
    targetWeight: 155,
    rounds: 3,
    roundDuration: 5,
    sport: 'MMA',
    experienceLevel: 'Amateur',
    campWeeks: 8,
    startDate: '2026-02-01',
    createdAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

function snap(overrides: Partial<TeamFighterSnapshot> = {}): TeamFighterSnapshot {
  return {
    fighterId: 'f1',
    name: 'Alex Rivera',
    sport: 'MMA',
    camp: camp(),
    completedSessions: {},
    workoutDates: [],
    weights: [],
    ...overrides,
  };
}

/** Tick every session the schedule defines, so adherence is exactly 100%. */
function allTicks(c: FightCamp): Record<string, boolean> {
  const schedule = generateTrainingCamp(c);
  const out: Record<string, boolean> = {};
  for (const week of schedule) {
    for (const key of weekSessionKeys(c.id, week)) out[key] = true;
  }
  return out;
}

describe('buildTeamOverview — no camp', () => {
  it('renders a fighter with no camp without inventing numbers', () => {
    const [row] = buildTeamOverview([snap({ camp: null })], NOW);
    expect(row.hasCamp).toBe(false);
    expect(row.daysOut).toBeNull();
    expect(row.adherencePct).toBeNull();
    expect(row.latestWeight).toBeNull();
    expect(row.flags).toEqual([]);
  });
});

describe('buildTeamOverview — adherence', () => {
  it('reports 100% when every scheduled session is ticked', () => {
    const c = camp();
    const [row] = buildTeamOverview([snap({ camp: c, completedSessions: allTicks(c) })], NOW);
    expect(row.adherencePct).toBe(100);
    expect(row.adherenceDone).toBe(row.adherencePlanned);
    expect(row.flags).not.toContain('low-adherence');
  });

  it('reports 0% and flags it when nothing is ticked', () => {
    const [row] = buildTeamOverview([snap()], NOW);
    expect(row.adherencePct).toBe(0);
    expect(row.flags).toContain('low-adherence');
  });

  it('never lets done exceed planned, even with stale ticks', () => {
    // A tick whose session no longer exists (the schedule shrank) must not be
    // counted — the same invariant utils/adherence.ts exists to hold.
    const c = camp();
    const [row] = buildTeamOverview([snap({
      camp: c,
      completedSessions: { ...allTicks(c), 'camp-1-99-3-0': true, 'camp-1-99-3-1': true },
    })], NOW);
    expect(row.adherenceDone).toBeLessThanOrEqual(row.adherencePlanned);
    expect(row.adherencePct).toBe(100);
  });
});

describe('buildTeamOverview — activity', () => {
  it('counts only sessions inside the last 7 days', () => {
    const [row] = buildTeamOverview([snap({
      workoutDates: ['2026-02-28', '2026-02-26', '2026-02-23', '2026-02-01'],
    })], NOW);
    // 2026-02-23 is 6 days before 2026-03-01; 2026-02-01 is well outside.
    expect(row.sessionsLast7).toBe(3);
  });

  it('measures the gap from the most recent date, not array position', () => {
    // A back-dated log can arrive after a newer one; taking the first element
    // would report the fighter as quiet when they trained yesterday.
    const [row] = buildTeamOverview([snap({
      workoutDates: ['2026-01-05', '2026-02-28'],
    })], NOW);
    expect(row.daysSinceLastSession).toBe(1);
    expect(row.flags).not.toContain('quiet');
  });

  it('flags a fighter who has gone quiet', () => {
    const [row] = buildTeamOverview([snap({ workoutDates: ['2026-02-20'] })], NOW);
    expect(row.daysSinceLastSession).toBe(9);
    expect(row.flags).toContain('quiet');
  });

  it('does not flag a brand-new camp as quiet', () => {
    // A camp created today has no sessions yet by definition — flagging it on
    // day one is noise, not a signal.
    const [row] = buildTeamOverview([snap({
      camp: camp({ startDate: '2026-02-28' }),
      workoutDates: [],
    })], NOW);
    expect(row.flags).not.toContain('quiet');
  });

  it('does flag an established camp that has never logged anything', () => {
    const [row] = buildTeamOverview([snap({ workoutDates: [] })], NOW);
    expect(row.daysSinceLastSession).toBeNull();
    expect(row.flags).toContain('quiet');
  });
});

describe('buildTeamOverview — fight week', () => {
  it('flags a camp inside its final week', () => {
    const [row] = buildTeamOverview([snap({
      camp: camp({ fightDate: '2026-03-06' }),
    })], NOW);
    expect(row.daysOut).toBe(5);
    expect(row.flags).toContain('fight-week');
  });

  it('does not flag a camp still weeks out', () => {
    const [row] = buildTeamOverview([snap({
      camp: camp({ fightDate: '2026-04-15' }),
    })], NOW);
    expect(row.flags).not.toContain('fight-week');
  });
});

describe('buildTeamOverview — ordering', () => {
  it('puts the fighter with the most flags first', () => {
    const rows = buildTeamOverview([
      // Healthy: everything ticked, trained yesterday, no fight booked.
      snap({
        fighterId: 'healthy', name: 'Healthy',
        completedSessions: allTicks(camp()),
        workoutDates: ['2026-02-28'],
      }),
      // Struggling: silent for weeks, nothing ticked, fight in days.
      snap({
        fighterId: 'struggling', name: 'Struggling',
        camp: camp({ fightDate: '2026-03-04' }),
        workoutDates: ['2026-02-10'],
      }),
    ], NOW);
    expect(rows[0].fighterId).toBe('struggling');
    expect(rows[1].fighterId).toBe('healthy');
  });

  it('breaks a tie on the nearest fight date', () => {
    const rows = buildTeamOverview([
      snap({ fighterId: 'far', name: 'Far', camp: camp({ fightDate: '2026-05-01' }), completedSessions: allTicks(camp({ fightDate: '2026-05-01' })), workoutDates: ['2026-02-28'] }),
      snap({ fighterId: 'near', name: 'Near', camp: camp({ fightDate: '2026-04-01' }), completedSessions: allTicks(camp({ fightDate: '2026-04-01' })), workoutDates: ['2026-02-28'] }),
    ], NOW);
    expect(rows.map(r => r.fighterId)).toEqual(['near', 'far']);
  });

  it('sorts a fighter with no fight date last among equals', () => {
    const rows = buildTeamOverview([
      snap({ fighterId: 'undated', name: 'Undated', completedSessions: allTicks(camp()), workoutDates: ['2026-02-28'] }),
      snap({ fighterId: 'dated', name: 'Dated', camp: camp({ fightDate: '2026-06-01' }), completedSessions: allTicks(camp({ fightDate: '2026-06-01' })), workoutDates: ['2026-02-28'] }),
    ], NOW);
    expect(rows.map(r => r.fighterId)).toEqual(['dated', 'undated']);
  });
});
