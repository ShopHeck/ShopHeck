// Client for the server-side AI coach (netlify/functions/ai-coach).
//
// The app builds the prompt from local camp data and streams the analysis back
// through our own endpoint — subscribers never need an API key. Errors carry a
// typed `code` so screens can route the user (sign in / upgrade) instead of
// showing a raw message.

import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

export type AiFeature = 'insights' | 'cut' | 'postfight';

export type AiCoachErrorCode =
  | 'signin_required'
  | 'upgrade_required'
  | 'quota_exhausted'
  | 'not_configured'
  | 'unavailable';

export class AiCoachError extends Error {
  code: AiCoachErrorCode;
  constructor(code: AiCoachErrorCode, message: string) {
    super(message);
    this.name = 'AiCoachError';
    this.code = code;
  }
}

// On the web a relative URL keeps deploy previews working; the native app runs
// from capacitor://localhost, so it needs the absolute site URL. Same
// env-with-production-fallback pattern as the Stripe links.
const PROD_BASE = 'https://fightcamp.netlify.app';
const FUNCTIONS_BASE =
  (import.meta.env.VITE_FUNCTIONS_BASE as string | undefined) ??
  (Capacitor.isNativePlatform() ? PROD_BASE : '');

const SIGNIN_MESSAGE = 'Sign in to use your included AI coach — it needs your account to track your monthly analyses.';

/**
 * Streams an analysis from the AI coach. `onDelta` fires per text chunk;
 * resolves with the full text. Throws AiCoachError with a routable `code`.
 */
export async function streamAiCoach(
  feature: AiFeature,
  prompt: string,
  onDelta: (text: string) => void,
): Promise<string> {
  if (!supabase) throw new AiCoachError('signin_required', SIGNIN_MESSAGE);

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AiCoachError('signin_required', SIGNIN_MESSAGE);

  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/.netlify/functions/ai-coach`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ feature, prompt }),
    });
  } catch {
    throw new AiCoachError('unavailable', 'Couldn’t reach the AI coach. Check your connection and try again.');
  }

  if (!res.ok) {
    let code: AiCoachErrorCode = 'unavailable';
    let message = 'The AI coach is unavailable right now. Please try again.';
    try {
      const body = (await res.json()) as { code?: string; message?: string };
      if (
        body.code === 'signin_required' ||
        body.code === 'upgrade_required' ||
        body.code === 'quota_exhausted' ||
        body.code === 'not_configured'
      ) {
        code = body.code;
      }
      if (body.message) message = body.message;
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    throw new AiCoachError(code, message);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new AiCoachError('unavailable', 'Streaming is not available in this browser.');

  const decoder = new TextDecoder();
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    if (text) {
      full += text;
      onDelta(text);
    }
  }
  return full;
}
