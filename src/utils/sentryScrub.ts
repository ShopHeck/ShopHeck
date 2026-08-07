/**
 * Sentry event scrubbing — strip credentials and health identifiers before
 * anything leaves the device. The crash boundary must still fire; this only
 * redacts payloads.
 */

const SENSITIVE_KEY = /token|password|authorization|cookie|secret|refresh|access_token|id_token|client_secret|bearer|session|email|phone|ssn|weight|hrv|rmssd|fitbit|stripe|revenuecat/i;

const REDACTED = '[redacted]';

function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (typeof value === 'string') {
    // JWT-shaped secrets (three base64url segments)
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value) && value.length >= 10) {
      return REDACTED;
    }
    if (/Bearer\s+\S+/i.test(value)) return value.replace(/Bearer\s+\S+/gi, `Bearer ${REDACTED}`);
    return value;
  }
  if (Array.isArray(value)) return value.map(v => scrubValue(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : scrubValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Pure scrubber used by Sentry.init beforeSend and unit tests. */
export function scrubSentryEvent<T extends Record<string, unknown>>(event: T): T {
  const next = scrubValue(event) as T;
  // Request headers / breadcrumbs often carry Authorization
  const req = (next as { request?: { headers?: Record<string, string>; cookies?: string } }).request;
  if (req?.headers) {
    for (const key of Object.keys(req.headers)) {
      if (SENSITIVE_KEY.test(key)) req.headers[key] = REDACTED;
    }
  }
  if (req && 'cookies' in req) req.cookies = REDACTED;
  return next;
}
