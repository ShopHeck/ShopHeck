import { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User, SupabaseClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { getSupabase, isSupabaseConfigured, supabaseConfigError, supabaseHost, supabaseUrl } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import {
  notifyLocalDataCleared,
  reconcileLocalAccount,
} from '../utils/localData';
import {
  readRecoveryParams,
  urlWithoutAuthParams,
  friendlyRecoveryError,
} from '../utils/authRecovery';

const APPLE_BUNDLE_ID = 'app.fightcamptraining';
const REQUEST_SIGN_OUT_EVENT = 'fightcamp:request-sign-out';

/**
 * Where Supabase should send a user after they click a link in an email.
 *
 * Confirmation and password-reset links are opened from a mail client, which
 * has no idea the native app exists — `window.location.origin` there is
 * `capacitor://localhost`, a scheme only the installed app can resolve, so a
 * link built from it dead-ends in the browser. The deployed site handles both
 * link types (Netlify's SPA catch-all rewrites any path to index.html, and the
 * Supabase client parses the token out of the URL on load), so the web origin
 * is the destination in both builds.
 *
 * On iOS the web origin is no longer a dead end: `/auth/recovery` is claimed as
 * a universal link (see public/.well-known/apple-app-site-association and the
 * associated-domains entitlement), so tapping a reset link in Mail opens the
 * installed app straight onto the set-a-new-password screen. The URL still has
 * to be an https one on the associated domain — that is how universal links
 * work — so this function is unchanged in shape; what changed is that the link
 * it builds is now intercepted.
 *
 * Same env-with-production-fallback pattern as `VITE_FUNCTIONS_BASE` in
 * lib/aiCoach.ts, deliberately sharing that variable rather than adding a
 * second URL to keep in step with it.
 */
const PROD_SITE = 'https://fightcamp.netlify.app';

/**
 * The path password-reset links land on.
 *
 * Its own path rather than the site root because the associated-domains file
 * claims paths, not fragments: a rule broad enough to catch a recovery link at
 * `/` would claim every URL on the domain, so tapping a link to the privacy
 * policy or the support page would launch the app instead of opening the page.
 * Netlify's SPA catch-all serves index.html here, so the web flow is unchanged.
 */
const RECOVERY_PATH = '/auth/recovery';

function emailRedirectUrl(path = ''): string {
  const configured = import.meta.env.VITE_FUNCTIONS_BASE as string | undefined;
  const base = configured ?? (Capacitor.isNativePlatform() ? PROD_SITE : window.location.origin);
  return `${base.replace(/\/$/, '')}${path}`;
}

function randomNonce(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

interface AuthValue {
  /** True when Supabase env is present — i.e. accounts are available at all. */
  configured: boolean;
  /** Initial session check in flight. */
  loading: boolean;
  session: Session | null;
  user: User | null;
  signInEmail: (email: string, password: string) => Promise<{ error?: string }>;
  signUpEmail: (email: string, password: string, name?: string) => Promise<{ error?: string; needsConfirmation?: boolean }>;
  /** Sends a password-reset email. Never reveals whether the address exists. */
  resetPassword: (email: string) => Promise<{ error?: string }>;
  /**
   * Set when the app was opened from a password-reset link, so the shell can
   * show the set-a-new-password screen. Carries a message instead when the link
   * was expired or already used.
   */
  recovery: { active: boolean; error?: string };
  /** Finish a recovery: set the new password and clear recovery mode. */
  completePasswordReset: (password: string) => Promise<{ error?: string }>;
  /** Leave recovery mode without changing anything. */
  dismissRecovery: () => void;
  signInApple: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  /** Permanently deletes the signed-in user's account and all their data, then signs out. */
  deleteAccount: () => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Supabase's own auth copy ("Invalid login credentials") reads fine, but
 *  transport failures surface as raw fetch errors — translate those.
 *
 *  WKWebView words a failed fetch as "Load failed", which users reasonably
 *  read as an app bug rather than a connection problem. Naming the host we
 *  couldn't reach also makes a wrong-project build self-evident from a
 *  screenshot, which is otherwise only visible by unpacking the .ipa. */
function friendlyAuthError(message: string): string {
  if (/failed to fetch|network|fetch failed|load failed/i.test(message)) {
    return supabaseHost
      ? `Can't reach ${supabaseHost} — check your connection and try again.`
      : "Can't reach the server — check your connection and try again.";
  }
  return message;
}

/** Why sign-in is unavailable. A build carrying broken credentials is a
 *  different problem from one deliberately built without any, and only the
 *  first is worth reporting in detail. */
function unavailableReason(): string {
  return supabaseConfigError
    ? `Accounts are unavailable in this build — ${supabaseConfigError}`
    : 'Accounts are not available right now.';
}

type ClientResult =
  | { ok: true; client: SupabaseClient<Database> }
  | { ok: false; error: string };

/**
 * Resolve the Supabase client for an action the user just took.
 *
 * Three ways it can be unavailable, and they are not the same thing: the build
 * carries no credentials, the build carries broken ones, or the SDK chunk
 * itself failed to arrive. The last one is a transport failure — the user is
 * offline or holding a stale cache after a deploy — so it borrows the wording
 * transport failures already get rather than claiming, wrongly, that accounts
 * don't exist in this build.
 *
 * Module scope rather than the component body so the recovery effect can call
 * it without taking it as a dependency (it closes over nothing that renders).
 */
async function requireClient(): Promise<ClientResult> {
  let client: SupabaseClient<Database> | null;
  try {
    client = await getSupabase();
  } catch {
    return { ok: false, error: friendlyAuthError('Load failed') };
  }
  return client ? { ok: true, client } : { ok: false, error: unavailableReason() };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [recovery, setRecovery] = useState<{ active: boolean; error?: string }>({ active: false });

  useEffect(() => {
    /**
     * Apply local account isolation before exposing the new session to the app.
     * This ordering prevents SyncProvider from seeing user B while user A's
     * local state and sync-id ledger are still mounted.
     */
    const applySession = (next: Session | null) => {
      const changedAccount = reconcileLocalAccount(next?.user.id ?? null);
      if (changedAccount) notifyLocalDataCleared();
      setSession(next);
    };

    if (!isSupabaseConfigured) {
      reconcileLocalAccount(null);
      setLoading(false);
      return;
    }

    let active = true;
    // Assigned once the subscription and listener exist. The cleanup below runs
    // it if it is set; the async body runs it itself if unmount beat it there.
    let teardown: (() => void) | null = null;

    void (async () => {
      let client: SupabaseClient<Database> | null;
      try {
        client = await getSupabase();
      } catch {
        // The SDK chunk could not be fetched. Nothing is signed in and nothing
        // can be, so settle into the same state as an unconfigured build rather
        // than leaving the app stuck on `loading` forever.
        client = null;
      }
      if (!active) return;
      if (!client) {
        reconcileLocalAccount(null);
        setLoading(false);
        return;
      }

      const { data } = await client.auth.getSession();
      if (!active) return;
      applySession(data.session);
      setLoading(false);

      const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
        applySession(next);
        setLoading(false);
      });

      const requestedSignOut = () => { void client.auth.signOut(); };
      window.addEventListener(REQUEST_SIGN_OUT_EVENT, requestedSignOut);

      teardown = () => {
        sub.subscription.unsubscribe();
        window.removeEventListener(REQUEST_SIGN_OUT_EVENT, requestedSignOut);
      };
      // Unmounting between the `active` check above and this assignment would
      // otherwise leak the subscription — the cleanup has already run and will
      // not run again.
      if (!active) { teardown(); teardown = null; }
    })();

    return () => {
      active = false;
      teardown?.();
    };
  }, []);

  async function signInEmail(email: string, password: string) {
    const r = await requireClient();
    if (!r.ok) return { error: r.error };
    const { error } = await r.client.auth.signInWithPassword({ email: email.trim(), password });
    return error ? { error: friendlyAuthError(error.message) } : {};
  }

  async function signUpEmail(email: string, password: string, name?: string) {
    const r = await requireClient();
    if (!r.ok) return { error: r.error };
    const { data, error } = await r.client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: name ? { name } : undefined,
        // Without this the confirmation link uses the project's default Site
        // URL, which dead-ends outside the app.
        emailRedirectTo: emailRedirectUrl(),
      },
    });
    if (error) return { error: friendlyAuthError(error.message) };
    // When email confirmation is on, there's no session until the link is clicked.
    return { needsConfirmation: !data.session };
  }

  /**
   * Send a password-reset email. Deliberately reports success even when the
   * address has no account: telling an anonymous caller which emails are
   * registered is an account-enumeration oracle, and Supabase's own response
   * does not distinguish the two either.
   */
  async function resetPassword(email: string) {
    const r = await requireClient();
    if (!r.ok) return { error: r.error };
    const { error } = await r.client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: emailRedirectUrl(RECOVERY_PATH),
    });
    return error ? { error: friendlyAuthError(error.message) } : {};
  }

  /**
   * Consume a password-reset redirect, from either of the two ways one arrives.
   *
   * **On load** — the web build, and the cold-start case on iOS. The tokens
   * live in the URL and are stripped as soon as they are read, so this runs
   * before anything else can navigate; an effect that happened to rewrite the
   * location first would destroy them. `detectSessionInUrl` is off (see
   * lib/supabase.ts), which is exactly why this has to be explicit.
   *
   * **From `appUrlOpen`** — a universal link tapped while the app is already
   * running. iOS hands the URL to the app without navigating the WebView, so
   * `window.location` never changes and the load path above would never see it.
   * This is the ordinary case, not the edge one: the app is usually still in
   * the background when a fighter switches to Mail to find the link.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;

    async function consume(url: string, fromLocation: boolean) {
      const params = readRecoveryParams(url);
      if (!params) return;

      // Strip immediately — these are credentials in the address bar, and they
      // would otherwise survive into history or a screenshot. Only meaningful
      // for the on-load path; an appUrlOpen URL was never in the address bar.
      if (fromLocation) {
        window.history.replaceState({}, '', urlWithoutAuthParams(window.location.href));
      }

      if (params.kind === 'error') {
        if (!cancelled) setRecovery({ active: false, error: params.message });
        return;
      }
      // Unconfigured builds ignore recovery links exactly as before. A failure
      // to *fetch* the SDK is new and is reported: the alternative is dropping
      // the user on a normal-looking dashboard with their reset silently lost.
      if (!isSupabaseConfigured) return;
      const r = await requireClient();
      if (cancelled) return;
      if (!r.ok) { setRecovery({ active: false, error: r.error }); return; }

      const { error } = params.kind === 'tokens'
        ? await r.client.auth.setSession({
            access_token: params.accessToken,
            refresh_token: params.refreshToken,
          })
        : await r.client.auth.exchangeCodeForSession(params.code);

      if (cancelled) return;
      setRecovery(error
        ? { active: false, error: friendlyRecoveryError(error.message) }
        : { active: true });
    }

    void consume(window.location.href, true);

    if (!Capacitor.isNativePlatform()) return () => { cancelled = true; };

    // Imported lazily so the web bundle never pulls in the native plugin, and
    // so a build without it configured cannot break sign-in on the web.
    const handle = CapacitorApp.addListener('appUrlOpen', event => {
      void consume(event.url, false);
    });

    return () => {
      cancelled = true;
      void handle.then(h => h.remove());
    };
  }, []);

  async function completePasswordReset(password: string) {
    const r = await requireClient();
    if (!r.ok) return { error: r.error };
    const { error } = await r.client.auth.updateUser({ password });
    if (error) return { error: friendlyAuthError(error.message) };
    // Recovery is over; the user is now signed in with the new password. The
    // session established above is a real one, so there is nothing to sign out
    // of — dropping the flag returns the app to its normal shell.
    setRecovery({ active: false });
    return {};
  }

  function dismissRecovery() {
    setRecovery({ active: false });
  }

  async function signInApple() {
    const r = await requireClient();
    if (!r.ok) return { error: r.error };

    // Native iOS: use the real "Sign in with Apple" sheet and exchange the
    // identity token with Supabase. A nonce (hashed for Apple, raw for Supabase)
    // guards against replay.
    if (Capacitor.isNativePlatform()) {
      try {
        const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');
        const rawNonce = randomNonce();
        const hashedNonce = await sha256Hex(rawNonce);
        const result = await SignInWithApple.authorize({
          clientId: APPLE_BUNDLE_ID,
          // Normalized, not the raw env var: a stray quote or newline in the
          // secret makes `new URL()` throw, and the throw lands in the catch
          // below as a generic "Apple sign-in failed" that names nothing.
          redirectURI: `${supabaseUrl}/auth/v1/callback`,
          scopes: 'email name',
          nonce: hashedNonce,
        });
        const idToken = result.response?.identityToken;
        if (!idToken) return { error: 'Apple sign-in was cancelled.' };
        const { error } = await r.client.auth.signInWithIdToken({
          provider: 'apple',
          token: idToken,
          nonce: rawNonce,
        });
        return error ? { error: friendlyAuthError(error.message) } : {};
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Apple sign-in failed.';
        // User cancelling the native sheet shouldn't read as an error.
        if (/cancel/i.test(msg)) return {};
        return { error: friendlyAuthError(msg) };
      }
    }

    // Web: standard OAuth redirect flow.
    const { error } = await r.client.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: window.location.origin },
    });
    return error ? { error: error.message } : {};
  }

  async function signOut() {
    const r = await requireClient();
    if (!r.ok) return;
    await r.client.auth.signOut();
  }

  async function deleteAccount() {
    const r = await requireClient();
    if (!r.ok) return { error: r.error };
    // Server-side cascade delete via SECURITY DEFINER RPC (see supabase/schema.sql).
    const { error } = await r.client.rpc('delete_account');
    if (error) return { error: error.message };
    // The auth row is gone; clear the local session. Auth-state handling clears
    // every Fight Camp-owned local key before exposing the signed-out session.
    await r.client.auth.signOut();
    return {};
  }

  const value: AuthValue = {
    configured: isSupabaseConfigured,
    loading,
    session,
    user: session?.user ?? null,
    signInEmail,
    signUpEmail,
    resetPassword,
    recovery,
    completePasswordReset,
    dismissRecovery,
    signInApple,
    signOut,
    deleteAccount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
