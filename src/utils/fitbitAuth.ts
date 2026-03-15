/**
 * Fitbit OAuth 2.0 with PKCE — fully client-side, no backend required.
 *
 * Setup (one-time, user does this):
 *  1. Go to https://dev.fitbit.com/apps/new
 *  2. Create a "Personal" app (OAuth 2.0 Application Type: Personal)
 *  3. Set Redirect URI to this app's URL (e.g. https://yourapp.com)
 *  4. Copy the Client ID into Settings → Fitness Trackers
 *
 * PKCE flow:
 *  connect()   → store verifier in sessionStorage, redirect to Fitbit
 *  handleCallback() → exchange code for tokens, store in app state
 *  fetchHRV / fetchRestingHR → call Fitbit Web API with stored token
 */

const PKCE_VERIFIER_KEY  = 'fitbit_pkce_verifier';
const PKCE_CLIENT_ID_KEY = 'fitbit_pkce_client_id';

// ─── PKCE helpers ─────────────────────────────────────────────────────────

function base64URLEncode(buffer: Uint8Array): string {
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const verifier = base64URLEncode(raw);

  const encoded = new TextEncoder().encode(verifier);
  const digest  = await crypto.subtle.digest('SHA-256', encoded);
  const challenge = base64URLEncode(new Uint8Array(digest));

  return { verifier, challenge };
}

// ─── Auth URL ─────────────────────────────────────────────────────────────

function redirectURI(): string {
  // Use origin + pathname so hash and search params are excluded
  return window.location.origin + window.location.pathname;
}

export function buildFitbitAuthURL(clientId: string, challenge: string): string {
  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             clientId,
    redirect_uri:          redirectURI(),
    scope:                 'heartrate profile',
    code_challenge:        challenge,
    code_challenge_method: 'S256',
  });
  return `https://www.fitbit.com/oauth2/authorize?${params}`;
}

// ─── Initiate connect (call from UI) ──────────────────────────────────────

export async function initiateFitbitConnect(clientId: string): Promise<void> {
  const { verifier, challenge } = await generatePKCE();
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(PKCE_CLIENT_ID_KEY, clientId);
  window.location.href = buildFitbitAuthURL(clientId, challenge);
}

// ─── Handle OAuth callback ────────────────────────────────────────────────

export interface FitbitTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;   // ISO date string
  userId: string;
}

export async function handleFitbitCallback(
  code: string
): Promise<FitbitTokens | null> {
  const verifier  = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  const clientId  = sessionStorage.getItem(PKCE_CLIENT_ID_KEY);
  if (!verifier || !clientId) return null;

  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(PKCE_CLIENT_ID_KEY);

  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectURI(),
    client_id:     clientId,
    code_verifier: verifier,
  });

  const res = await fetch('https://api.fitbit.com/oauth2/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  if (!res.ok) return null;

  const json = await res.json();
  return {
    accessToken:  json.access_token,
    refreshToken: json.refresh_token,
    expiresAt:    new Date(Date.now() + json.expires_in * 1000).toISOString(),
    userId:       json.user_id,
  };
}

// ─── Refresh token ────────────────────────────────────────────────────────

export async function refreshFitbitToken(
  refreshToken: string,
  clientId: string
): Promise<FitbitTokens | null> {
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     clientId,
  });

  const res = await fetch('https://api.fitbit.com/oauth2/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  if (!res.ok) return null;
  const json = await res.json();
  return {
    accessToken:  json.access_token,
    refreshToken: json.refresh_token,
    expiresAt:    new Date(Date.now() + json.expires_in * 1000).toISOString(),
    userId:       json.user_id,
  };
}

// ─── Data fetching ────────────────────────────────────────────────────────

export interface FitbitHRVDay {
  date: string;          // YYYY-MM-DD
  dailyRmssd: number;    // ms
  deepRmssd:  number;    // ms (deep-sleep HRV, more stable)
}

export interface FitbitActivityDay {
  date: string;
  restingHR: number | null;
}

export async function fetchFitbitHRV(
  accessToken: string,
  date = 'today'
): Promise<FitbitHRVDay | null> {
  const res = await fetch(`https://api.fitbit.com/1/user/-/hrv/date/${date}.json`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const entry = json?.hrv?.[0];
  if (!entry) return null;
  return {
    date:        entry.dateTime,
    dailyRmssd:  Math.round(entry.value?.dailyRmssd ?? 0),
    deepRmssd:   Math.round(entry.value?.deepRmssd ?? 0),
  };
}

export async function fetchFitbitRestingHR(
  accessToken: string,
  date = 'today'
): Promise<FitbitActivityDay | null> {
  const res = await fetch(
    `https://api.fitbit.com/1/user/-/activities/heart/date/${date}/1d.json`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  const json  = await res.json();
  const entry = json?.['activities-heart']?.[0];
  if (!entry) return null;
  return {
    date:      entry.dateTime,
    restingHR: entry.value?.restingHeartRate ?? null,
  };
}

// Fetch last N days of HRV from Fitbit (batch)
export async function fetchFitbitHRVRange(
  accessToken: string,
  startDate: string, // YYYY-MM-DD
  endDate:   string  // YYYY-MM-DD
): Promise<FitbitHRVDay[]> {
  const res = await fetch(
    `https://api.fitbit.com/1/user/-/hrv/date/${startDate}/${endDate}.json`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return [];
  const json = await res.json();
  return (json?.hrv ?? []).map((e: { dateTime: string; value: { dailyRmssd?: number; deepRmssd?: number } }) => ({
    date:        e.dateTime,
    dailyRmssd:  Math.round(e.value?.dailyRmssd ?? 0),
    deepRmssd:   Math.round(e.value?.deepRmssd  ?? 0),
  }));
}

// ─── Check for OAuth callback in URL ─────────────────────────────────────

export function getFitbitCallbackCode(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('code');
}

export function clearFitbitCallbackParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  window.history.replaceState({}, '', url.toString());
}
