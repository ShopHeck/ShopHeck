import { describe, expect, it } from 'vitest';
import { getLibraryItem } from '../src/data/library';
import { matchesQuery } from '../src/utils/library';

/**
 * Falsified against the pre-tokenization matcher: it treated the whole query
 * as one substring of a single field, so "teep kick" missed Teep (Push Kick)
 * and "deadlift hinge" missed Conventional Deadlift. Reintroduce
 * `haystack.some(v => v.toLowerCase().includes(q))` and these fail.
 */

const deadlift = getLibraryItem('s1');
const teep = getLibraryItem('t2');

describe('matchesQuery', () => {
  it('has the fixtures this file is pinned to', () => {
    expect(deadlift?.name).toBe('Conventional Deadlift');
    expect(teep?.name).toBe('Teep (Push Kick)');
  });

  it('matches everything when the query is empty or whitespace', () => {
    expect(matchesQuery(deadlift!, '')).toBe(true);
    expect(matchesQuery(deadlift!, '   ')).toBe(true);
    expect(matchesQuery(teep!, '')).toBe(true);
  });

  it('still matches a single word in the name', () => {
    expect(matchesQuery(deadlift!, 'deadlift')).toBe(true);
    expect(matchesQuery(teep!, 'teep')).toBe(true);
  });

  it('requires every token to appear somewhere (AND), not the whole phrase in one field', () => {
    // No single field contains the substring "teep kick".
    expect(matchesQuery(teep!, 'teep kick')).toBe(true);
    // "deadlift" is the name; "hinge" is a movement pattern / instruction.
    expect(matchesQuery(deadlift!, 'deadlift hinge')).toBe(true);
    // Intent + name, split across fields.
    expect(matchesQuery(teep!, 'teep defense')).toBe(true);
  });

  it('rejects a token that is nowhere on the item', () => {
    expect(matchesQuery(teep!, 'teep kick xyz')).toBe(false);
    expect(matchesQuery(deadlift!, 'deadlift swimming')).toBe(false);
  });

  it('does not match an unrelated item just because one token is common', () => {
    expect(matchesQuery(deadlift!, 'teep kick')).toBe(false);
    expect(matchesQuery(teep!, 'deadlift hinge')).toBe(false);
  });
});
