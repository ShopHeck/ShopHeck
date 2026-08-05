import { describe, it, expect } from 'vitest';
import {
  readRecoveryParams,
  urlWithoutAuthParams,
  friendlyRecoveryError,
  passwordProblem,
} from '../src/utils/authRecovery';

const SITE = 'https://fightcamp.netlify.app';

describe('readRecoveryParams — implicit flow (the default here)', () => {
  it('reads tokens out of the hash', () => {
    const url = `${SITE}/#access_token=AAA&refresh_token=BBB&type=recovery&expires_in=3600`;
    expect(readRecoveryParams(url)).toEqual({
      kind: 'tokens', accessToken: 'AAA', refreshToken: 'BBB',
    });
  });

  it('ignores a hash session that is not a recovery', () => {
    // A sign-in callback also carries tokens. Throwing a set-password screen at
    // someone who just signed in would be its own bug.
    const url = `${SITE}/#access_token=AAA&refresh_token=BBB&type=signup`;
    expect(readRecoveryParams(url)).toBeNull();
  });

  it('ignores a recovery hash missing its refresh token', () => {
    expect(readRecoveryParams(`${SITE}/#access_token=AAA&type=recovery`)).toBeNull();
  });
});

describe('readRecoveryParams — PKCE flow', () => {
  it('reads a code when the URL says it is a recovery', () => {
    expect(readRecoveryParams(`${SITE}/?code=XYZ&type=recovery`)).toEqual({
      kind: 'code', code: 'XYZ',
    });
  });

  it('ignores a bare code, which is also how OAuth sign-in returns', () => {
    expect(readRecoveryParams(`${SITE}/?code=XYZ`)).toBeNull();
  });
});

describe('readRecoveryParams — errors', () => {
  it('surfaces an expired link from the hash', () => {
    const url = `${SITE}/#error=access_denied&error_description=Email+link+is+invalid+or+has+expired`;
    const params = readRecoveryParams(url);
    expect(params?.kind).toBe('error');
    expect((params as { message: string }).message).toMatch(/expired/i);
  });

  it('surfaces an error from the query too', () => {
    const url = `${SITE}/?error=access_denied&error_description=Email+link+is+invalid`;
    expect(readRecoveryParams(url)?.kind).toBe('error');
  });
});

describe('readRecoveryParams — nothing to do', () => {
  it('returns null for an ordinary app URL', () => {
    expect(readRecoveryParams(`${SITE}/`)).toBeNull();
    expect(readRecoveryParams(`${SITE}/?shot=1`)).toBeNull();
  });

  it('returns null rather than throwing on an unparseable URL', () => {
    expect(readRecoveryParams('not a url')).toBeNull();
    expect(readRecoveryParams('')).toBeNull();
  });

  it('handles the native origin', () => {
    const url = 'capacitor://localhost/#access_token=AAA&refresh_token=BBB&type=recovery';
    expect(readRecoveryParams(url)?.kind).toBe('tokens');
  });
});

describe('urlWithoutAuthParams', () => {
  it('strips the hash, which is where the credentials live', () => {
    const url = `${SITE}/#access_token=AAA&refresh_token=BBB&type=recovery`;
    expect(urlWithoutAuthParams(url)).toBe(`${SITE}/`);
  });

  it('strips auth query params but keeps the rest', () => {
    const url = `${SITE}/?code=XYZ&type=recovery&shot=1`;
    expect(urlWithoutAuthParams(url)).toBe(`${SITE}/?shot=1`);
  });

  it('leaves an ordinary URL alone', () => {
    expect(urlWithoutAuthParams(`${SITE}/`)).toBe(`${SITE}/`);
  });

  it('returns the input rather than throwing on garbage', () => {
    expect(urlWithoutAuthParams('not a url')).toBe('not a url');
  });
});

describe('friendlyRecoveryError', () => {
  it('rewrites the expired case into something actionable', () => {
    expect(friendlyRecoveryError('Email+link+is+invalid+or+has+expired'))
      .toMatch(/expired.*request a new one/i);
  });

  it('decodes plus-encoding on an unrecognised message', () => {
    expect(friendlyRecoveryError('Something+odd+happened')).toBe('Something odd happened');
  });
});

describe('passwordProblem', () => {
  it('rejects a short password', () => {
    expect(passwordProblem('abc', 'abc')).toMatch(/6 characters/);
  });

  it('rejects a mismatch', () => {
    expect(passwordProblem('abcdef', 'abcdeg')).toMatch(/match/);
  });

  it('accepts a valid pair', () => {
    expect(passwordProblem('abcdef', 'abcdef')).toBeNull();
  });

  it('reports length before mismatch, so the first fix is the obvious one', () => {
    expect(passwordProblem('abc', 'xyz')).toMatch(/6 characters/);
  });
});
