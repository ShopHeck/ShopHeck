/**
 * Password-recovery link handling.
 *
 * `resetPasswordForEmail` was added without the other half of the flow: the
 * client is created with `detectSessionInUrl: false` (Capacitor's WKWebView
 * doesn't expose the OAuth redirect hash the way a browser tab does, so
 * callbacks are handled explicitly), and nothing parsed the recovery redirect.
 * A fighter who tapped "Forgot your password?" got an email, tapped the link,
 * and landed on the app with no way to set a new password. Caught in review on
 * PR #91.
 *
 * Parsing lives here rather than in `AuthContext` so the URL shapes — including
 * the error ones — can be tested without a Supabase client.
 */

export type RecoveryParams =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string };

/**
 * Read a recovery redirect out of a URL, or null when it isn't one.
 *
 * Two shapes, because which one arrives depends on the client's `flowType`:
 *
 * - **Implicit** (supabase-js v2's browser default, and what this project gets
 *   since it never sets `flowType`) puts the tokens in the URL **hash** along
 *   with `type=recovery`.
 * - **PKCE** puts a `code` in the **query**. A bare `?code=` is ambiguous — it
 *   is also how an OAuth sign-in returns — so a code is only treated as
 *   recovery when `type=recovery` says so explicitly. Getting that wrong would
 *   throw a set-password screen at someone who just signed in with Apple.
 */
export function readRecoveryParams(url: string): RecoveryParams | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // The hash carries its own query string after the '#'.
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const query = parsed.searchParams;

  // Errors arrive in the hash for implicit and the query for PKCE. Surfaced
  // rather than swallowed: an expired link is the single most likely outcome
  // here, and silence would look like the app ignoring the tap.
  const error = hash.get('error_description') ?? hash.get('error')
    ?? query.get('error_description') ?? query.get('error');
  if (error) return { kind: 'error', message: friendlyRecoveryError(error) };

  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  if (hash.get('type') === 'recovery' && accessToken && refreshToken) {
    return { kind: 'tokens', accessToken, refreshToken };
  }

  const code = query.get('code');
  if (code && query.get('type') === 'recovery') {
    return { kind: 'code', code };
  }

  return null;
}

/** Supabase's raw text is URL-encoded and machine-shaped; make it readable. */
export function friendlyRecoveryError(raw: string): string {
  const decoded = raw.replace(/\+/g, ' ');
  if (/expired/i.test(decoded)) {
    return 'That reset link has expired. Request a new one and try again.';
  }
  if (/invalid/i.test(decoded)) {
    return 'That reset link is no longer valid. Request a new one and try again.';
  }
  return decoded;
}

/**
 * The current URL with every auth parameter stripped.
 *
 * The recovery tokens are credentials sitting in the address bar. They are
 * consumed once, but leaving them there means they survive into history, a
 * screenshot, or a shared link — so the URL is rewritten as soon as they have
 * been read.
 */
export function urlWithoutAuthParams(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  for (const key of ['code', 'type', 'error', 'error_description', 'error_code']) {
    parsed.searchParams.delete(key);
  }
  parsed.hash = '';
  return parsed.toString();
}

/** Why a password is rejected, or null when it is acceptable. */
export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < 6) return 'Use at least 6 characters.';
  if (password !== confirm) return 'Those two passwords don’t match.';
  return null;
}
