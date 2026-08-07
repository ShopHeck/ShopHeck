import { describe, expect, it } from 'vitest';
import { scrubSentryEvent } from '../src/utils/sentryScrub';
import { fitbitRedirectUri } from '../src/utils/fitbitAuth';

describe('scrubSentryEvent', () => {
  it('redacts token-like keys and JWT strings', () => {
    const event = scrubSentryEvent({
      message: 'failed',
      extra: {
        accessToken: 'secret-value-here',
        nested: { refreshToken: 'r', weight: 155 },
        safe: 'ok',
        jwt: 'aaa.bbb.ccc',
      },
      request: {
        headers: { Authorization: 'Bearer abc', 'Content-Type': 'application/json' },
      },
    });
    expect(event.extra.accessToken).toBe('[redacted]');
    expect((event.extra.nested as { refreshToken: string }).refreshToken).toBe('[redacted]');
    expect((event.extra.nested as { weight: unknown }).weight).toBe('[redacted]');
    expect(event.extra.safe).toBe('ok');
    expect(event.extra.jwt).toBe('[redacted]');
    expect(event.request.headers.Authorization).toBe('[redacted]');
    expect(event.request.headers['Content-Type']).toBe('application/json');
  });
});

describe('fitbitRedirectUri', () => {
  it('returns a stable absolute URI without search or hash', () => {
    const uri = fitbitRedirectUri();
    expect(uri).not.toContain('?');
    expect(uri).not.toContain('#');
    // Node test env has no window → production site fallback; browser uses origin.
    expect(uri.startsWith('http')).toBe(true);
  });
});
