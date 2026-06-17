import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * True when Supabase env vars are present. The app is local-first: when this is
 * false everything still works offline — sign-in / cloud sync just stay hidden.
 */
export const isSupabaseConfigured = !!(url && key);

/**
 * The Supabase client, or null when unconfigured. Callers must null-check
 * (or gate on `isSupabaseConfigured`) so a missing env never crashes the app.
 */
export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Capacitor WKWebView doesn't expose the OAuth redirect hash the way a
        // browser tab does; we handle the Apple/Google callback explicitly.
        detectSessionInUrl: false,
      },
    })
  : null;
