// Type-only import: erased at build time, so naming the SDK here costs no
// bytes. The runtime `createClient` is pulled in by `getSupabase()` below.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Env values arrive here from three places that all mangle strings differently:
 * a local `.env`, Netlify's UI, and GitHub Actions secrets. Wrapping quotes and
 * a trailing newline survive all three and land in the bundle verbatim, so
 * `https://x.supabase.co\n` becomes a request URL that WKWebView refuses before
 * it ever hits the network — surfacing to the user as a bare "Load failed" with
 * nothing naming the cause. Strip the usual damage before validating.
 */
function clean(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^["']|["']$/g, '').trim();
}

const rawUrl = clean(import.meta.env.VITE_SUPABASE_URL);
const rawKey = clean(import.meta.env.VITE_SUPABASE_ANON_KEY);

/** Values that mean "nobody filled this in", not "this is the credential". */
function isPlaceholder(value: string): boolean {
  return /^<|>$|your[-_]?project|your[-_]?anon|replace[-_]?me|xxx+/i.test(value);
}

interface Config {
  url: string;
  key: string;
  /** Human-readable reason the config is unusable, or null when it's fine. */
  error: string | null;
}

/**
 * Decides whether the baked-in Supabase credentials can possibly work, before
 * any request is made. A malformed value is worth catching here because every
 * downstream symptom of one looks identical to "the network is down".
 *
 * Absent-but-consistent (neither var set) is not an error: the app is
 * local-first and simply runs without accounts.
 */
function resolveConfig(url: string, key: string): Config {
  if (!url && !key) return { url, key, error: null };

  if (!url) return { url, key, error: 'VITE_SUPABASE_URL is missing from this build (the anon key is set, so this is a build-config mistake, not a deliberate offline build).' };
  if (!key) return { url, key, error: 'VITE_SUPABASE_ANON_KEY is missing from this build (the project URL is set, so this is a build-config mistake, not a deliberate offline build).' };

  if (isPlaceholder(url)) return { url, key, error: `VITE_SUPABASE_URL is still a placeholder ("${url}").` };
  if (isPlaceholder(key)) return { url, key, error: 'VITE_SUPABASE_ANON_KEY is still a placeholder.' };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { url, key, error: `VITE_SUPABASE_URL is not a valid URL ("${url}"). It should look like https://<project-ref>.supabase.co` };
  }

  if (parsed.protocol !== 'https:') {
    return { url, key, error: `VITE_SUPABASE_URL must use https (got "${parsed.protocol}//"). iOS App Transport Security blocks plain http, which fails as an unexplained "Load failed".` };
  }

  // Deliberately lenient — self-hosted Supabase lives on arbitrary domains, so
  // the only thing worth rejecting is a host that can't resolve at all.
  if (!parsed.host.includes('.')) {
    return { url, key, error: `VITE_SUPABASE_URL host "${parsed.host}" isn't a routable domain.` };
  }

  // Anon keys are either a JWT (three dot-separated segments) or one of the
  // newer `sb_publishable_…` keys. Anything else — most often the service_role
  // key or a truncated paste — is rejected by the API in a way that reads like
  // a server outage.
  const looksLikeJwt = key.split('.').length === 3;
  const looksLikePublishable = key.startsWith('sb_');
  if (!looksLikeJwt && !looksLikePublishable) {
    return { url, key, error: 'VITE_SUPABASE_ANON_KEY is not a recognisable Supabase key (expected a JWT or an sb_publishable_… key). Check for a truncated paste.' };
  }

  // Trailing slashes double up into `//auth/v1/token` on some paths.
  return { url: url.replace(/\/+$/, ''), key, error: null };
}

const config = resolveConfig(rawUrl, rawKey);

/**
 * Non-null when the build carries Supabase credentials that cannot work —
 * distinct from carrying none at all. Shown verbatim in Settings → Diagnostics
 * and in the sign-in sheet, because the alternative is a user staring at
 * "Load failed" with no way to tell a bad build from a bad connection.
 */
export const supabaseConfigError: string | null = config.error;

/**
 * The normalized project URL (quotes/whitespace/trailing slash removed), or ''
 * when unconfigured. Always prefer this over reading the raw env var back —
 * the raw value is the one that throws in `new URL()`.
 */
export const supabaseUrl: string = config.error ? '' : config.url;

/** The project host (no credentials) — safe to display for diagnostics. */
export const supabaseHost: string | null = (() => {
  if (!config.url || config.error) return null;
  try { return new URL(config.url).host; } catch { return null; }
})();

/**
 * True when Supabase env vars are present *and* usable. The app is local-first:
 * when this is false everything still works offline — sign-in / cloud sync just
 * stay hidden.
 */
export const isSupabaseConfigured = !!(config.url && config.key && !config.error);

/** Memoised client promise — the SDK is fetched and constructed at most once. */
let clientPromise: Promise<SupabaseClient<Database> | null> | null = null;

/**
 * The Supabase client, or null when unconfigured. Callers must null-check
 * (or gate on `isSupabaseConfigured`) so a missing env never crashes the app.
 *
 * **Why this is async.** `@supabase/supabase-js` is 203 kB raw / 54 kB gzipped
 * — the single largest dependency in the app. It used to be a static import
 * here, and because `AuthContext` (mounted eagerly from `main.tsx`) imported
 * this module, every cold start downloaded and parsed the whole SDK *before
 * first paint* — in an app whose defining property is that it works offline
 * with no account. `vite.config.ts` made it worse by naming a `supabase`
 * manual chunk, which promotes a chunk to a static import of the entry and
 * earns it a `<link rel="modulepreload">` (that config's own comment explains
 * this, for recharts).
 *
 * Deferring it costs nothing in practice: everything reachable before sign-in
 * needs only the synchronous config exports above, which carry no SDK code.
 * A build with no Supabase env never fetches the SDK at all, and a configured
 * one fetches it in parallel with the first render instead of ahead of it.
 * The chunk is still precached by the service worker (`globPatterns` covers
 * `**\/*.js`), so an installed PWA opened in a gym with no signal is unaffected.
 */
export function getSupabase(): Promise<SupabaseClient<Database> | null> {
  if (!isSupabaseConfigured) return Promise.resolve(null);

  // Not cached on failure: a chunk fetch can lose to a flaky connection, and
  // caching the rejection would make the first failure permanent for the whole
  // session — sign-in would stay broken until the app was force-quit.
  clientPromise ??= import('@supabase/supabase-js')
    .then(({ createClient }) => createClient<Database>(config.url, config.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Capacitor WKWebView doesn't expose the OAuth redirect hash the way a
        // browser tab does; we handle the Apple/Google callback explicitly.
        detectSessionInUrl: false,
      },
    }))
    .catch((e: unknown) => {
      clientPromise = null;
      throw e;
    });

  return clientPromise;
}

/**
 * Unauthenticated liveness probe against GoTrue. Used by Settings →
 * Diagnostics to separate "this build points somewhere wrong" from "this phone
 * has no route to the internet" — the two causes of a failed sign-in that are
 * otherwise identical from the user's side.
 */
export async function probeSupabase(timeoutMs = 8000): Promise<{ ok: boolean; detail: string }> {
  if (supabaseConfigError) return { ok: false, detail: supabaseConfigError };
  if (!config.url) return { ok: false, detail: 'No Supabase project is configured in this build.' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.url}/auth/v1/health`, {
      headers: { apikey: config.key },
      signal: controller.signal,
    });
    // Any HTTP response at all proves the host resolved and TLS completed,
    // which is the thing we actually need to know.
    return res.ok
      ? { ok: true, detail: `Reachable (HTTP ${res.status}).` }
      : { ok: false, detail: `Reached ${supabaseHost} but it answered HTTP ${res.status}.` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/abort/i.test(msg)) return { ok: false, detail: `No response from ${supabaseHost} within ${timeoutMs / 1000}s.` };
    return { ok: false, detail: `Could not reach ${supabaseHost} — ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
