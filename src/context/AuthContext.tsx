import { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const APPLE_BUNDLE_ID = 'app.fightcamptraining';

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
  signInApple: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signInEmail(email: string, password: string) {
    if (!supabase) return { error: 'Accounts are not available right now.' };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? { error: error.message } : {};
  }

  async function signUpEmail(email: string, password: string, name?: string) {
    if (!supabase) return { error: 'Accounts are not available right now.' };
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: name ? { name } : undefined },
    });
    if (error) return { error: error.message };
    // When email confirmation is on, there's no session until the link is clicked.
    return { needsConfirmation: !data.session };
  }

  async function signInApple() {
    if (!supabase) return { error: 'Accounts are not available right now.' };

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
          redirectURI: `${supabase ? new URL(import.meta.env.VITE_SUPABASE_URL as string).origin : ''}/auth/v1/callback`,
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
        return error ? { error: error.message } : {};
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Apple sign-in failed.';
        // User cancelling the native sheet shouldn't read as an error.
        if (/cancel/i.test(msg)) return {};
        return { error: msg };
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

  const value: AuthValue = {
    configured: isSupabaseConfigured,
    loading,
    session,
    user: session?.user ?? null,
    signInEmail,
    signUpEmail,
    signInApple,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
