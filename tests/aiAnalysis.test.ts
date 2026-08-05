import { describe, it, expect } from 'vitest';
import {
  aiAnalysisKey,
  saveAiAnalysis,
  clearAiAnalysis,
  createDefaultState,
  deleteCamp,
  deleteFightResult,
} from '../src/utils/storage';
import type { AppState, FightCamp, FightResult } from '../src/types';

function camp(id: string): FightCamp {
  return {
    id,
    weightClass: 'Lightweight',
    currentWeight: 165,
    targetWeight: 155,
    rounds: 3,
    roundDuration: 5,
    sport: 'MMA',
    experienceLevel: 'Amateur',
    campWeeks: 8,
    startDate: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function fight(id: string, campId: string): FightResult {
  return {
    id,
    campId,
    date: '2026-03-01',
    opponent: 'Opponent',
    outcome: 'win',
    method: 'decision',
    rounds: [],
    createdAt: '2026-03-01T00:00:00.000Z',
  } as FightResult;
}

function stateWith(overrides: Partial<AppState> = {}): AppState {
  return { ...createDefaultState(), ...overrides };
}

describe('aiAnalysisKey', () => {
  it('namespaces by kind so a camp and a fight sharing an id never collide', () => {
    expect(aiAnalysisKey('insights', 'x')).not.toBe(aiAnalysisKey('post-fight', 'x'));
  });
});

describe('saveAiAnalysis', () => {
  it('stores content under the kind+subject key', () => {
    const next = saveAiAnalysis(stateWith(), {
      kind: 'insights', subjectId: 'camp-1', content: 'Camp is on track.',
    });
    expect(next.aiAnalyses?.[aiAnalysisKey('insights', 'camp-1')]).toMatchObject({
      kind: 'insights', subjectId: 'camp-1', content: 'Camp is on track.',
    });
  });

  it('stamps a generatedAt when none is supplied', () => {
    const next = saveAiAnalysis(stateWith(), {
      kind: 'insights', subjectId: 'camp-1', content: 'x',
    });
    const at = next.aiAnalyses?.[aiAnalysisKey('insights', 'camp-1')].generatedAt;
    expect(at).toBeTruthy();
    expect(Number.isNaN(Date.parse(at!))).toBe(false);
  });

  it('replaces a previous analysis for the same subject rather than accumulating', () => {
    let s = saveAiAnalysis(stateWith(), { kind: 'insights', subjectId: 'camp-1', content: 'old' });
    s = saveAiAnalysis(s, { kind: 'insights', subjectId: 'camp-1', content: 'new' });
    expect(Object.keys(s.aiAnalyses ?? {})).toHaveLength(1);
    expect(s.aiAnalyses?.[aiAnalysisKey('insights', 'camp-1')].content).toBe('new');
  });

  it('keeps analyses for different subjects side by side', () => {
    let s = saveAiAnalysis(stateWith(), { kind: 'insights', subjectId: 'camp-1', content: 'a' });
    s = saveAiAnalysis(s, { kind: 'insights', subjectId: 'camp-2', content: 'b' });
    s = saveAiAnalysis(s, { kind: 'post-fight', subjectId: 'fight-1', content: 'c' });
    expect(Object.keys(s.aiAnalyses ?? {})).toHaveLength(3);
  });

  it('does not mutate the input state', () => {
    const before = stateWith();
    const snapshot = JSON.stringify(before);
    saveAiAnalysis(before, { kind: 'insights', subjectId: 'camp-1', content: 'x' });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('clearAiAnalysis', () => {
  it('removes only the named analysis', () => {
    let s = saveAiAnalysis(stateWith(), { kind: 'insights', subjectId: 'camp-1', content: 'a' });
    s = saveAiAnalysis(s, { kind: 'insights', subjectId: 'camp-2', content: 'b' });
    const next = clearAiAnalysis(s, 'insights', 'camp-1');
    expect(next.aiAnalyses?.[aiAnalysisKey('insights', 'camp-1')]).toBeUndefined();
    expect(next.aiAnalyses?.[aiAnalysisKey('insights', 'camp-2')]).toBeDefined();
  });

  it('returns the same state object when there is nothing to clear', () => {
    const s = stateWith();
    expect(clearAiAnalysis(s, 'insights', 'nope')).toBe(s);
  });
});

describe('cascades', () => {
  it('deleteCamp drops the camp analysis and its fights’ breakdowns', () => {
    let s = stateWith({
      camps: [camp('camp-1'), camp('camp-2')],
      fightResults: [fight('fight-1', 'camp-1'), fight('fight-2', 'camp-2')],
    });
    s = saveAiAnalysis(s, { kind: 'insights', subjectId: 'camp-1', content: 'a' });
    s = saveAiAnalysis(s, { kind: 'insights', subjectId: 'camp-2', content: 'b' });
    s = saveAiAnalysis(s, { kind: 'post-fight', subjectId: 'fight-1', content: 'c' });
    s = saveAiAnalysis(s, { kind: 'post-fight', subjectId: 'fight-2', content: 'd' });

    const next = deleteCamp(s, 'camp-1');

    expect(next.aiAnalyses?.[aiAnalysisKey('insights', 'camp-1')]).toBeUndefined();
    expect(next.aiAnalyses?.[aiAnalysisKey('post-fight', 'fight-1')]).toBeUndefined();
    // The surviving camp keeps both of its own.
    expect(next.aiAnalyses?.[aiAnalysisKey('insights', 'camp-2')]).toBeDefined();
    expect(next.aiAnalyses?.[aiAnalysisKey('post-fight', 'fight-2')]).toBeDefined();
  });

  it('deleteCamp does not drop a camp whose id merely shares a prefix', () => {
    // camp-1 vs camp-10 — the same prefix trap the camp-key cascade guards.
    let s = stateWith({ camps: [camp('camp-1'), camp('camp-10')] });
    s = saveAiAnalysis(s, { kind: 'insights', subjectId: 'camp-10', content: 'keep' });
    const next = deleteCamp(s, 'camp-1');
    expect(next.aiAnalyses?.[aiAnalysisKey('insights', 'camp-10')]).toBeDefined();
  });

  it('deleteFightResult drops its breakdown', () => {
    let s = stateWith({ fightResults: [fight('fight-1', 'camp-1')] });
    s = saveAiAnalysis(s, { kind: 'post-fight', subjectId: 'fight-1', content: 'c' });
    const next = deleteFightResult(s, 'fight-1');
    expect(next.fightResults).toHaveLength(0);
    expect(next.aiAnalyses?.[aiAnalysisKey('post-fight', 'fight-1')]).toBeUndefined();
  });
});
