import { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { supabase, isSupabaseConfigured, supabaseConfigError, supabaseHost, supabaseUrl } from '../lib/supabase';
import {
  notifyLocalDataCleared,
  reconcileLocalAccount,
} from '../utils/localData';

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
 * Same env-with-production-fallback pattern as `VITE_FUNCTIONS_BASE` in
 * lib/aiCoach.ts, deliberately sharing that variable rather than adding a
 * second URL to keep in step with it.
 */
const PROD_SITE = 'https://fightcamp.netlify.app';
function emailRedirectUrl(): string {
  const configured = import.meta.env.VITE_FUNCTIONS_BASE as string | undefined;
  if (configured) return configured;
  return Capacitor.isNativePlatform() ? PROD_SITE : window.location.origin;
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
  signInApple: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  /** Permanently deletes the signed-in user's account and all their data, then signs out. */
  deleteAccount: () => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

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

    // Capture the configured client in a non-null local. TypeScript cannot keep
    // a module-level nullable import narrowed inside later callback closures.
    const client = supabase;
    if (!client) {
      reconcileLocalAccount(null);
      setLoading(false);
      return;
    }

    let active = true;
    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      applySession(data.session);
      setLoading(false);
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      applySession(next);
      setLoading(false);
    });

    const requestedSignOut = () => { void client.auth.signOut(); };
    window.addEventListener(REQUEST_SIGN_OUT_EVENT, requestedSignOut);

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      window.removeEventListener(REQUEST_SIGN_OUT_EVENT, requestedSignOut);
    };
  }, []);

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

  async function signInEmail(email: string, password: string) {
    if (!supabase) return { error: unavailableReason() };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? { error: friendlyAuthError(error.message) } : {};
  }

  async function signUpEmail(email: string, password: string, name?: string) {
    if (!supabase) return { error: unavailableReason() };
    const { data, error } = await supabase.auth.signUp({
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
    if (!supabase) return { error: unavailableReason() };
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: emailRedirectUrl(),
    });
    return error ? { error: friendlyAuthError(error.message) } : {};
  }

  async function signInApple() {
    if (!supabase) return { error: unavailableReason() };

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
        const { error } = await supabase.auth.signInWithIdToken({
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: window.location.origin },
    });
    return error ? { error: error.message } : {};
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  async function deleteAccount() {
    if (!supabase) return { error: unavailableReason() };
    // Server-side cascade delete via SECURITY DEFINER RPC (see supabase/schema.sql).
    const { error } = await supabase.rpc('delete_account');
    if (error) return { error: error.message };
    // The auth row is gone; clear the local session. Auth-state handling clears
    // every Fight Camp-owned local key before exposing the signed-out session.
    await supabase.auth.signOut();
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
