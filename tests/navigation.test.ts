import { describe, expect, it } from 'vitest';
import { nextHistory, popHistory } from '../src/utils/navigation';

// The fighter tab bar. Anything not in here is a detail view that has to be
// backable-out-of, which is the whole reason the stack exists.
const TABS = ['dashboard', 'planner', 'log', 'timer', 'weight', 'settings'];

describe('view stack', () => {
  it('pushes a detail view so it can be backed out of', () => {
    expect(nextHistory(['dashboard'], 'camp-history', TABS))
      .toEqual(['dashboard', 'camp-history']);
  });

  it('stacks detail views on each other', () => {
    expect(nextHistory(['dashboard', 'camp-history'], 'fight-breakdown', TABS))
      .toEqual(['dashboard', 'camp-history', 'fight-breakdown']);
  });

  it('resets to root on a tab switch, so tabs are peers not a trail', () => {
    expect(nextHistory(['dashboard', 'camp-history', 'fight-breakdown'], 'weight', TABS))
      .toEqual(['weight']);
  });

  it('treats navigating to the current view as a no-op', () => {
    const prev = ['dashboard', 'camp-history'];
    // Same array reference back, so React skips the re-render.
    expect(nextHistory(prev, 'camp-history', TABS)).toBe(prev);
  });

  it('replaces the top entry instead of stacking on it', () => {
    // The fight form hands off to the breakdown: backing out of the breakdown
    // must not land on a freshly mounted, blank result form.
    expect(nextHistory(['dashboard', 'fight-log'], 'fight-breakdown', TABS, { replace: true }))
      .toEqual(['dashboard', 'fight-breakdown']);
  });

  it('never empties the stack when replacing at the root', () => {
    expect(nextHistory(['dashboard'], 'camp-history', TABS, { replace: true }))
      .toEqual(['dashboard', 'camp-history']);
  });

  it('pops back to where the user came from', () => {
    expect(popHistory(['dashboard', 'camp-history', 'fight-breakdown']))
      .toEqual(['dashboard', 'camp-history']);
  });

  it('bottoms out rather than emptying', () => {
    const prev = ['dashboard'];
    expect(popHistory(prev)).toBe(prev);
  });

  it('leaves a detail view reachable from more than one parent', () => {
    // Fight Breakdown used to hardcode its back target to camp-history, which
    // stranded anyone who arrived from the dashboard.
    const fromDashboard = nextHistory(['dashboard'], 'fight-breakdown', TABS);
    const fromHistory = nextHistory(['dashboard', 'camp-history'], 'fight-breakdown', TABS);
    expect(popHistory(fromDashboard)).toEqual(['dashboard']);
    expect(popHistory(fromHistory)).toEqual(['dashboard', 'camp-history']);
  });
});
