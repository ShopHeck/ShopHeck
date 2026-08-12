import { describe, expect, it } from 'vitest';
import {
  HOME_ITEMS,
  applyOrder,
  defaultPinnedIds,
  effectiveIds,
  itemsFor,
  move,
  resolvePinned,
  togglePin,
  type HomeItemId,
} from '../src/utils/homeLayout';
import { createDefaultState, setDashboardPrefs } from '../src/utils/storage';
import type { DashboardPrefs } from '../src/types';

describe('registry invariants', () => {
  it('gives every item a unique id', () => {
    const ids = HOME_ITEMS.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every tool a view to navigate to, and no card one', () => {
    for (const item of HOME_ITEMS) {
      if (item.kind === 'tool') expect(item.view, item.id).toBeTruthy();
      else expect(item.view, item.id).toBeUndefined();
    }
  });

  it('puts every item in at least one mode', () => {
    for (const item of HOME_ITEMS) expect(item.modes.length, item.id).toBeGreaterThan(0);
  });

  it('only default-pins items into modes they belong to', () => {
    for (const item of HOME_ITEMS.filter(i => i.defaultPinned)) {
      for (const mode of item.modes) {
        if (mode === 'coach') continue;
        expect(defaultPinnedIds(item.kind, mode), item.id).toContain(item.id);
      }
    }
  });

  it('keeps tools out of a mode whose destination screen refuses to render', () => {
    // Regression: a tool is only offerable where the screen behind it works.
    // `fight-readiness` was pinnable in off-season while FightReadiness.tsx
    // rejects off-season camps outright ("off-season blocks don't have a
    // countdown to score against"), so pinning it put a tile on Home whose tap
    // landed on an unavailable-state message. `game-plan` is the same shape —
    // there is no opponent to plan for in a block.
    //
    // Add to this list when a destination grows a mode guard; the alternative
    // is finding out from a fighter who tapped it.
    const campOnlyDestinations = ['fight-readiness', 'game-plan'];
    for (const id of campOnlyDestinations) {
      const item = HOME_ITEMS.find(i => i.id === id);
      expect(item, id).toBeDefined();
      expect(item!.modes, id).toEqual(['camp']);
      expect(itemsFor('tool', 'offseason').map(i => i.id), id).not.toContain(id);
    }
  });

  it('fills both grid rows on each fighter Home by default', () => {
    // Four tools is two rows of the 2-up grid. A default of one or three
    // leaves a visibly half-empty row on first run.
    expect(defaultPinnedIds('tool', 'camp')).toHaveLength(4);
    expect(defaultPinnedIds('tool', 'offseason')).toHaveLength(4);
  });
});

describe('itemsFor', () => {
  it('keeps the fight-only game plan off the off-season Home', () => {
    expect(itemsFor('tool', 'camp').map(i => i.id)).toContain('game-plan');
    expect(itemsFor('tool', 'offseason').map(i => i.id)).not.toContain('game-plan');
  });

  it('keeps the off-season session mix out of a fight camp', () => {
    expect(itemsFor('card', 'offseason').map(i => i.id)).toContain('training-variety');
    expect(itemsFor('card', 'camp').map(i => i.id)).not.toContain('training-variety');
  });

  it('never mixes kinds', () => {
    expect(itemsFor('card', 'camp').every(i => i.kind === 'card')).toBe(true);
    expect(itemsFor('tool', 'camp').every(i => i.kind === 'tool')).toBe(true);
  });
});

describe('resolvePinned', () => {
  it('falls back to defaults when never customised', () => {
    expect(resolvePinned(undefined, 'tool', 'camp').map(i => i.id))
      .toEqual(defaultPinnedIds('tool', 'camp'));
  });

  it('stays empty when everything was unpinned', () => {
    // The distinction that matters: [] is a choice, undefined is silence.
    // Collapsing them would make "unpin everything" spring back on reload.
    expect(resolvePinned([], 'tool', 'camp')).toEqual([]);
  });

  it('preserves the stored order rather than registry order', () => {
    const ids = ['trackers', 'ai-insights', 'nutrition'];
    expect(resolvePinned(ids, 'tool', 'camp').map(i => i.id)).toEqual(ids);
  });

  it('drops an id whose item no longer exists', () => {
    // Regression: the orphaned-key bug class. A pin written by a build that
    // still had the feature must not blow up (or render a hole) in one that
    // does not.
    expect(resolvePinned(['nutrition', 'gym-display-v1'], 'tool', 'camp').map(i => i.id))
      .toEqual(['nutrition']);
  });

  it('drops an item pinned in a mode it does not belong to', () => {
    // Pin Game Plan during a camp, then finish the camp and start an
    // off-season block: the tile must not survive into a Home where tapping
    // it opens a screen about an opponent who does not exist.
    expect(resolvePinned(['game-plan', 'nutrition'], 'tool', 'offseason').map(i => i.id))
      .toEqual(['nutrition']);
    expect(resolvePinned(['game-plan', 'nutrition'], 'tool', 'camp').map(i => i.id))
      .toEqual(['game-plan', 'nutrition']);
  });

  it('drops an id of the wrong kind', () => {
    expect(resolvePinned(['recent-activity', 'nutrition'], 'tool', 'camp').map(i => i.id))
      .toEqual(['nutrition']);
  });

  it('collapses a duplicated id', () => {
    // A double-tap that raced the write must not render the same tile twice
    // (and React would warn on the duplicate key).
    expect(resolvePinned(['nutrition', 'nutrition'], 'tool', 'camp').map(i => i.id))
      .toEqual(['nutrition']);
  });
});

describe('togglePin', () => {
  it('appends to the end so a new pin is where you last looked', () => {
    const next = togglePin(['nutrition'], 'trackers', 'tool', 'camp');
    expect(next).toEqual(['nutrition', 'trackers']);
  });

  it('removes without disturbing the rest of the order', () => {
    const next = togglePin(['nutrition', 'trackers', 'ai-insights'], 'trackers', 'tool', 'camp');
    expect(next).toEqual(['nutrition', 'ai-insights']);
  });

  it('writes defaults-plus-the-change on the first ever toggle', () => {
    // Regression: resolving first is what stops the first tap from writing an
    // array containing only the item just tapped — which would silently unpin
    // the three defaults the fighter never touched.
    const next = togglePin(undefined, 'meal-library', 'tool', 'camp');
    expect(next).toEqual([...defaultPinnedIds('tool', 'camp'), 'meal-library']);
  });

  it('unpins a default on the first ever toggle without dropping the others', () => {
    const next = togglePin(undefined, 'nutrition', 'tool', 'camp');
    expect(next).toEqual(defaultPinnedIds('tool', 'camp').filter(id => id !== 'nutrition'));
    expect(next.length).toBe(3);
  });

  it('keeps a pin belonging to the other Home', () => {
    // Regression: Game Plan is camp-only. Toggling anything from the
    // off-season Home resolved the visible list and wrote that back, which
    // deleted the camp-only pin the fighter could not even see to defend.
    const next = togglePin(['game-plan', 'nutrition'], 'trackers', 'tool', 'offseason');
    expect(next).toContain('game-plan');
    expect(next).toContain('trackers');
    expect(resolvePinned(next, 'tool', 'camp').map(i => i.id)).toContain('game-plan');
  });

  it('drops an id that no longer exists rather than preserving it forever', () => {
    const next = togglePin(['gone-in-v2', 'nutrition'], 'trackers', 'tool', 'camp');
    expect(next).not.toContain('gone-in-v2');
  });
});

describe('applyOrder', () => {
  it('writes the visible order through', () => {
    expect(applyOrder(['nutrition', 'trackers'], 'tool', 'camp', ['trackers', 'nutrition']))
      .toEqual(['trackers', 'nutrition']);
  });

  it('keeps other-Home pins alive behind the visible order', () => {
    const stored = ['game-plan', 'nutrition', 'trackers'];
    const next = applyOrder(stored, 'tool', 'offseason', ['trackers', 'nutrition']);
    expect(next).toEqual(['trackers', 'nutrition', 'game-plan']);
    expect(resolvePinned(next, 'tool', 'offseason').map(i => i.id)).toEqual(['trackers', 'nutrition']);
    expect(resolvePinned(next, 'tool', 'camp').map(i => i.id)).toEqual(['trackers', 'nutrition', 'game-plan']);
  });

  it('survives a reorder round-trip in the mode that cannot see the extra pin', () => {
    let stored: string[] = ['game-plan', 'nutrition', 'trackers'];
    for (let i = 0; i < 5; i++) {
      const visible = resolvePinned(stored, 'tool', 'offseason').map(x => x.id);
      stored = applyOrder(stored, 'tool', 'offseason', move(visible, 0, 1));
    }
    expect(stored).toContain('game-plan');
  });
});

describe('move', () => {
  const list = ['a', 'b', 'c', 'd'];

  it('moves down', () => expect(move(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']));
  it('moves up', () => expect(move(list, 3, 1)).toEqual(['a', 'd', 'b', 'c']));

  it('returns the same array reference when nothing moves', () => {
    expect(move(list, 1, 1)).toBe(list);
  });

  it('clamps a drop past the end instead of leaving a hole', () => {
    expect(move(list, 0, 99)).toEqual(['b', 'c', 'd', 'a']);
    expect(move(list, 3, -5)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('ignores an out-of-range source', () => {
    expect(move(list, 9, 0)).toBe(list);
    expect(move(list, -1, 0)).toBe(list);
  });

  it('does not mutate the input', () => {
    move(list, 0, 3);
    expect(list).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('effectiveIds', () => {
  const legacy = (hidden: boolean): DashboardPrefs =>
    ({ progressWidgetCollapsed: false, progressWidgetHidden: hidden });

  it('seeds the defaults for a document that predates pinning', () => {
    expect(effectiveIds(legacy(false), 'card', 'camp')).toEqual(defaultPinnedIds('card', 'camp'));
    expect(effectiveIds(legacy(false), 'tool', 'camp')).toEqual(defaultPinnedIds('tool', 'camp'));
  });

  it('carries over an existing "I hid the progress widget"', () => {
    expect(effectiveIds(legacy(true), 'card', 'camp')).not.toContain('belt-streak');
    // …and does not touch anything else it was never about.
    expect(effectiveIds(legacy(true), 'tool', 'camp')).toEqual(defaultPinnedIds('tool', 'camp'));
  });

  it('stops consulting the legacy flag once real pins exist', () => {
    const prefs: DashboardPrefs = {
      progressWidgetCollapsed: false,
      progressWidgetHidden: true,
      pinnedCards: ['belt-streak'],
      pinnedTools: [],
    };
    expect(effectiveIds(prefs, 'card', 'camp')).toEqual(['belt-streak']);
  });

  it('keeps an emptied Home empty', () => {
    // [] is customisation. Falling back to defaults here would resurrect Home
    // for someone who deliberately stripped it.
    const prefs: DashboardPrefs = {
      progressWidgetCollapsed: false,
      progressWidgetHidden: false,
      pinnedCards: [],
      pinnedTools: [],
    };
    expect(effectiveIds(prefs, 'card', 'camp')).toEqual([]);
    expect(effectiveIds(prefs, 'tool', 'camp')).toEqual([]);
  });

  it('handles prefs being absent entirely', () => {
    expect(effectiveIds(undefined, 'tool', 'camp')).toEqual(defaultPinnedIds('tool', 'camp'));
  });

  it('feeds the first toggle so the untouched defaults survive it', () => {
    // The whole reason every caller routes writes through this: toggling one
    // tool on a never-customised Home must not write a one-element array.
    const prefs = legacy(false);
    const next = togglePin(effectiveIds(prefs, 'tool', 'camp'), 'meal-library', 'tool', 'camp');
    expect(next).toEqual([...defaultPinnedIds('tool', 'camp'), 'meal-library']);
  });

  it('keeps the hidden widget hidden through an unrelated first toggle', () => {
    const prefs = legacy(true);
    const next = togglePin(effectiveIds(prefs, 'card', 'camp'), 'weight-status', 'card', 'camp');
    expect(next).not.toContain('belt-streak');
    expect(next).toContain('weight-status');
  });
});

describe('persistence', () => {
  it('carries pins through setDashboardPrefs', () => {
    // Regression: setDashboardPrefs rebuilds dashboardPrefs key-by-key as an
    // allowlist, so a key it does not name is dropped on the next unrelated
    // dispatch. Toggling the weight unit used to be enough to wipe a Home.
    const state = setDashboardPrefs(createDefaultState(), {
      pinnedCards: ['weight-status'],
      pinnedTools: ['nutrition'],
    });
    const after = setDashboardPrefs(state, { weightUnit: 'kg' });
    expect(after.dashboardPrefs?.pinnedCards).toEqual(['weight-status']);
    expect(after.dashboardPrefs?.pinnedTools).toEqual(['nutrition']);
  });

  it('leaves pins undefined until something sets them', () => {
    const after = setDashboardPrefs(createDefaultState(), { weightUnit: 'kg' });
    expect(after.dashboardPrefs?.pinnedCards).toBeUndefined();
    expect(after.dashboardPrefs?.pinnedTools).toBeUndefined();
  });

  it('keeps an emptied Home empty across an unrelated pref change', () => {
    const state = setDashboardPrefs(createDefaultState(), { pinnedCards: [], pinnedTools: [] });
    const after = setDashboardPrefs(state, { progressWidgetCollapsed: true });
    expect(after.dashboardPrefs?.pinnedTools).toEqual([]);
    expect(resolvePinned(after.dashboardPrefs?.pinnedTools, 'tool', 'camp')).toEqual([]);
  });
});

describe('every default pin resolves', () => {
  it('has no default that filters itself out', () => {
    for (const mode of ['camp', 'offseason'] as const) {
      for (const kind of ['card', 'tool'] as const) {
        const ids = defaultPinnedIds(kind, mode) as HomeItemId[];
        expect(resolvePinned(ids, kind, mode).map(i => i.id), `${kind}/${mode}`).toEqual(ids);
      }
    }
  });
});
