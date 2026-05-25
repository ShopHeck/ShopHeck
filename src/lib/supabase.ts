import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    '[FightCamp] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env.local and fill them in.'
  );
}

export const supabase = createClient<Database>(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Capacitor WKWebView doesn't expose the OAuth redirect URL hash on
    // window.location the same way a browser tab does — detectSessionInUrl
    // off prevents a confused initial-session attempt; we handle the OAuth
    // callback explicitly in the SignInWithApple / Google flows.
    detectSessionInUrl: false,
  },
});
