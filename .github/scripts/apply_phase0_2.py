from __future__ import annotations

from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one match, found {count}: {old[:120]!r}")
    write(path, content.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    content = read(path)
    updated, count = re.subn(pattern, replacement, content, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{path}: regex expected one match, found {count}: {pattern[:140]!r}")
    write(path, updated)


def prepend_once(path: str, line: str) -> None:
    content = read(path)
    if content.startswith(line):
        return
    write(path, line + content)


# ---------------------------------------------------------------------------
# Phase 0: account-scoped local persistence and complete erasure primitives
# ---------------------------------------------------------------------------
write(
    "src/utils/accountStorage.ts",
    r'''/** Account-scoped browser storage and deletion helpers.
 *
 * Every authenticated account gets a separate local namespace. Guest data is
 * kept separately, so signing into a second account can never merge or upload
 * the previous fighter's local records.
 */

export type StorageOwner = 'guest' | `user:${string}`;

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const ACTIVE_OWNER_KEY = 'fightcamp_active_owner';
const APP_PREFIX = 'fightcamp_';

const VOLATILE_KEYS = new Set([
  'fightcamp_timer_v2',
  'fightcamp_timer_logged',
  'fightcamp_timer_presets',
  'fightcamp_custom_bell',
  'fightcamp_reminders',
  'fightcamp_round_alerts',
]);

function browserStorage(): StorageLike {
  const storage = globalThis.localStorage;
  if (!storage) throw new Error('Local storage is unavailable.');
  return storage;
}

export function storageOwnerForUser(userId: string | null | undefined): StorageOwner {
  return userId ? `user:${userId}` : 'guest';
}

export function scopedStorageKey(base: string, owner: StorageOwner): string {
  return `${base}:${owner}`;
}

export function getActiveStorageOwner(storage: StorageLike = browserStorage()): StorageOwner {
  const raw = storage.getItem(ACTIVE_OWNER_KEY);
  return raw === 'guest' || raw?.startsWith('user:') ? raw as StorageOwner : 'guest';
}

export function setActiveStorageOwner(owner: StorageOwner, storage: StorageLike = browserStorage()): void {
  storage.setItem(ACTIVE_OWNER_KEY, owner);
}

function keys(storage: StorageLike): string[] {
  return Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k): k is string => !!k);
}

export function eraseStorageOwner(
  owner: StorageOwner,
  options: { includeVolatile?: boolean } = {},
  storage: StorageLike = browserStorage(),
): void {
  const suffix = `:${owner}`;
  for (const key of keys(storage)) {
    if (key.startsWith(APP_PREFIX) && key.endsWith(suffix)) storage.removeItem(key);
    if (options.includeVolatile && VOLATILE_KEYS.has(key)) storage.removeItem(key);
  }
  if (getActiveStorageOwner(storage) === owner) setActiveStorageOwner('guest', storage);
}

export function eraseAllFightCampData(storage: StorageLike = browserStorage()): void {
  for (const key of keys(storage)) {
    if (key.startsWith(APP_PREFIX)) storage.removeItem(key);
  }
}
''',
)

replace_once(
    "src/utils/storage.ts",
    "import { defaultGamificationState } from './gamification';\n",
    "import { defaultGamificationState } from './gamification';\nimport { getActiveStorageOwner, scopedStorageKey, type StorageOwner } from './accountStorage';\n",
)
regex_once(
    "src/utils/storage.ts",
    r"export function loadState\(\): AppState \{.*?\n\}\n\nexport function saveState\(state: AppState\): void \{.*?\n\}",
    r'''export function loadState(owner: StorageOwner = getActiveStorageOwner()): AppState {
  try {
    const key = scopedStorageKey(STORAGE_KEY, owner);
    let raw = localStorage.getItem(key);
    // One-time migration of pre-account-scoping installs. Legacy data is
    // treated as guest data; it is never silently claimed by a signed-in user.
    if (!raw && owner === 'guest') {
      raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        localStorage.setItem(key, raw);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    if (!raw) return { ...defaultState };
    return { ...defaultState, ...JSON.parse(raw) };
  } catch {
    return { ...defaultState };
  }
}

export function saveState(state: AppState, owner: StorageOwner = getActiveStorageOwner()): void {
  try {
    localStorage.setItem(scopedStorageKey(STORAGE_KEY, owner), JSON.stringify(state));
  } catch {
    console.error('Failed to save state');
  }
}''',
    flags=re.S,
)
replace_once(
    "src/utils/storage.ts",
    "export function addWeightEntry(state: AppState, entry: Omit<WeightEntry, 'id' | 'createdAt'>): AppState {\n  const newEntry: WeightEntry = { ...entry, id: generateId(), createdAt: new Date().toISOString() };\n  return { ...state, weightEntries: [newEntry, ...state.weightEntries] };\n}",
    "export function addWeightEntry(state: AppState, entry: Omit<WeightEntry, 'id' | 'createdAt'>): AppState {\n  const existing = state.weightEntries.find(e => e.campId === entry.campId && e.date === entry.date);\n  if (existing) {\n    return {\n      ...state,\n      weightEntries: state.weightEntries.map(e => e.id === existing.id ? { ...existing, ...entry } : e),\n    };\n  }\n  const newEntry: WeightEntry = { ...entry, id: generateId(), createdAt: new Date().toISOString() };\n  return { ...state, weightEntries: [newEntry, ...state.weightEntries] };\n}",
)

replace_once(
    "src/utils/subscription.ts",
    "import type { SubscriptionState, SubscriptionTier } from '../types';\n",
    "import type { SubscriptionState } from '../types';\nimport { getActiveStorageOwner, scopedStorageKey } from './accountStorage';\n",
)
replace_once(
    "src/utils/subscription.ts",
    "    const raw = localStorage.getItem(SUB_KEY);",
    "    const raw = localStorage.getItem(scopedStorageKey(SUB_KEY, getActiveStorageOwner()));",
)
replace_once(
    "src/utils/subscription.ts",
    "  try { localStorage.setItem(SUB_KEY, JSON.stringify(s)); } catch { /* noop */ }",
    "  try { localStorage.setItem(scopedStorageKey(SUB_KEY, getActiveStorageOwner()), JSON.stringify(s)); } catch { /* noop */ }",
)
regex_once(
    "src/utils/subscription.ts",
    r"const COMP_PRO_EMAILS: ReadonlySet<string> = new Set\(\n  \['michaelheckert@heckholdings\.com', \.\.\.\(import\.meta\.env\.VITE_COMP_PRO_EMAILS \?\? ''\)\.split\(','\)\]\n    \.map\(\(e: string\) => e\.trim\(\)\.toLowerCase\(\)\)\n    \.filter\(Boolean\),\n\);",
    "const COMP_PRO_EMAILS: ReadonlySet<string> = new Set(\n  (import.meta.env.VITE_COMP_PRO_EMAILS ?? '').split(',')\n    .map((e: string) => e.trim().toLowerCase())\n    .filter(Boolean),\n);",
)
regex_once(
    "src/utils/subscription.ts",
    r"\n/\*\*\n \* Reads Stripe Payment Link return params.*?\nexport function processStripeReturn\(\): SubscriptionState \| null \{.*?\n\}",
    "",
    flags=re.S,
)

# App context: account switching, pure reset, server-verified checkout return.
replace_once(
    "src/context/AppContext.tsx",
    "import React, { createContext, useContext, useReducer, useEffect } from 'react';",
    "/* eslint-disable react-refresh/only-export-components */\nimport React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';",
)
replace_once(
    "src/context/AppContext.tsx",
    "import { processStripeReturn, saveSubscription, checkNativeSubscription, identifyNativeSubscriber, isCompEmail, COMP_SUBSCRIPTION, DEFAULT_SUBSCRIPTION } from '../utils/subscription';",
    "import { saveSubscription, checkNativeSubscription, identifyNativeSubscriber, isCompEmail, COMP_SUBSCRIPTION, DEFAULT_SUBSCRIPTION } from '../utils/subscription';",
)
replace_once(
    "src/context/AppContext.tsx",
    "  setDashboardPrefs,\n} from '../utils/storage';",
    "  setDashboardPrefs,\n  defaultState,\n} from '../utils/storage';\nimport { getActiveStorageOwner, setActiveStorageOwner, storageOwnerForUser } from '../utils/accountStorage';",
)
regex_once(
    "src/context/AppContext.tsx",
    r"    case 'RESET':\n      // Drop the local↔cloud id ledger too,.*?\n      return \{.*?\n      \};",
    "    case 'RESET':\n      return { ...defaultState, gamification: defaultGamificationState() };",
    flags=re.S,
)
replace_once(
    "src/context/AppContext.tsx",
    "  const { user, loading: authLoading } = useAuth();\n\n  // Process Stripe Payment Link return on web mount\n  useEffect(() => {\n    const sub = processStripeReturn();\n    if (sub) dispatch({ type: 'SET_SUBSCRIPTION', payload: sub });\n  // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, []);",
    "  const { user, loading: authLoading } = useAuth();\n  const hydratedOwnerRef = useRef(getActiveStorageOwner());\n  const switchingOwnerRef = useRef(false);\n\n  // Switch local stores before cloud reconciliation when the authenticated\n  // account changes. Each account and guest mode has an isolated cache.\n  useEffect(() => {\n    if (authLoading) return;\n    const nextOwner = storageOwnerForUser(user?.id);\n    if (nextOwner === hydratedOwnerRef.current) return;\n    switchingOwnerRef.current = true;\n    setActiveStorageOwner(nextOwner);\n    let loaded = loadState(nextOwner);\n    if (loaded.activeCamp) {\n      loaded = setSchedule(loaded, generateTrainingCamp(loaded.activeCamp, loaded.currentUser?.factorWeights));\n    }\n    hydratedOwnerRef.current = nextOwner;\n    dispatch({ type: 'SET_STATE', payload: loaded });\n    queueMicrotask(() => { switchingOwnerRef.current = false; });\n  }, [authLoading, user?.id]);",
)
replace_once(
    "src/context/AppContext.tsx",
    "  useEffect(() => {\n    saveState(state);\n  }, [state]);",
    "  useEffect(() => {\n    if (!switchingOwnerRef.current) saveState(state, hydratedOwnerRef.current);\n  }, [state]);",
)
# Insert checkout reconciliation before normal server entitlement reconciliation.
replace_once(
    "src/context/AppContext.tsx",
    "  // Server-verified entitlement. Once a payment webhook records a subscription",
    "  // Returning from server-created Stripe Checkout: the webhook may land a\n  // fraction after the browser redirect, so poll briefly and apply only the\n  // server-authoritative row. URL parameters never grant access themselves.\n  useEffect(() => {\n    if (authLoading || !user?.id || typeof window === 'undefined') return;\n    const params = new URLSearchParams(window.location.search);\n    if (params.get('checkout') !== 'success') return;\n    let cancelled = false;\n    void (async () => {\n      for (let attempt = 0; attempt < 6 && !cancelled; attempt++) {\n        const server = await fetchServerSubscription(user.id);\n        if (server && server.tier !== 'free') {\n          dispatch({ type: 'SET_SUBSCRIPTION', payload: server });\n          break;\n        }\n        await new Promise(resolve => setTimeout(resolve, 750 * (attempt + 1)));\n      }\n      if (!cancelled) {\n        const clean = new URL(window.location.href);\n        clean.searchParams.delete('checkout');\n        window.history.replaceState({}, '', clean.toString());\n      }\n    })();\n    return () => { cancelled = true; };\n  }, [authLoading, user?.id]);\n\n  // Server-verified entitlement. Once a payment webhook records a subscription",
)

# Sync ledgers are per authenticated account.
regex_once(
    "src/lib/sync.ts",
    r"const IDMAP_KEY = 'fightcamp_sync_idmap';.*?// ─── Dirty tracking ─────────────────────────────────────────────────────────",
    r'''const IDMAP_PREFIX = 'fightcamp_sync_idmap';
const HASH_PREFIX = 'fightcamp_sync_hashes';
const idMapKey = (userId: string) => `${IDMAP_PREFIX}:user:${userId}`;
const hashKey = (userId: string) => `${HASH_PREFIX}:user:${userId}`;

function loadIdMap(userId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(idMapKey(userId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveIdMap(userId: string, map: Record<string, string>): void {
  try { localStorage.setItem(idMapKey(userId), JSON.stringify(map)); } catch { /* noop */ }
}

export function clearIdMap(userId?: string): void {
  try {
    if (userId) {
      localStorage.removeItem(idMapKey(userId));
      localStorage.removeItem(hashKey(userId));
      return;
    }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${IDMAP_PREFIX}:`) || key?.startsWith(`${HASH_PREFIX}:`)) {
        localStorage.removeItem(key);
      }
    }
  } catch { /* noop */ }
}

// ─── Dirty tracking ─────────────────────────────────────────────────────────''',
    flags=re.S,
)
replace_once("src/lib/sync.ts", "const HASH_KEY = 'fightcamp_sync_hashes';\n", "")
replace_once("src/lib/sync.ts", "    const raw = localStorage.getItem(HASH_KEY);", "    const raw = localStorage.getItem(hashKey(userId));")
replace_once("src/lib/sync.ts", "  try { localStorage.setItem(HASH_KEY, JSON.stringify(store)); } catch { /* noop */ }", "  try { localStorage.setItem(hashKey(store.userId), JSON.stringify(store)); } catch { /* noop */ }")
replace_once("src/lib/sync.ts", "export function forceFullResync(): void {\n  try {\n    const raw = localStorage.getItem(HASH_KEY);", "export function forceFullResync(userId: string): void {\n  try {\n    const raw = localStorage.getItem(hashKey(userId));")
# Function calls inside push/pull.
content = read("src/lib/sync.ts")
content = content.replace("const map = loadIdMap();", "const map = loadIdMap(userId);")
content = content.replace("saveIdMap(map);", "saveIdMap(userId, map);")
write("src/lib/sync.ts", content)
replace_once("src/context/SyncContext.tsx", "      forceFullResync();", "      forceFullResync(user.id);")
# Let the parent account-scope effect commit before a newly enabled sync begins.
replace_once(
    "src/context/SyncContext.tsx",
    "    void (async () => {\n      await restore();",
    "    void (async () => {\n      await new Promise(resolve => setTimeout(resolve, 0));\n      await restore();",
)
prepend_once("src/context/SyncContext.tsx", "/* eslint-disable react-refresh/only-export-components */\n")
prepend_once("src/context/AuthContext.tsx", "/* eslint-disable react-refresh/only-export-components */\n")
prepend_once("src/context/TimerContext.tsx", "/* eslint-disable react-refresh/only-export-components */\n")

replace_once(
    "src/context/AuthContext.tsx",
    "import { supabase, isSupabaseConfigured, supabaseConfigError, supabaseHost, supabaseUrl } from '../lib/supabase';\n",
    "import { supabase, isSupabaseConfigured, supabaseConfigError, supabaseHost, supabaseUrl } from '../lib/supabase';\nimport { eraseStorageOwner, storageOwnerForUser } from '../utils/accountStorage';\n",
)
replace_once(
    "src/context/AuthContext.tsx",
    "    // The auth row is gone; clear the local session so the app returns to signed-out.\n    await supabase.auth.signOut();",
    "    // Erase only this account's device cache, then clear the session. Guest\n    // data and other account namespaces remain isolated and untouched.\n    eraseStorageOwner(storageOwnerForUser(session?.user.id), { includeVolatile: true });\n    await supabase.auth.signOut();",
)

replace_once(
    "src/components/Settings.tsx",
    "import { supabaseConfigError } from '../lib/supabase';\n",
    "import { supabaseConfigError } from '../lib/supabase';\nimport { eraseAllFightCampData } from '../utils/accountStorage';\n",
)
replace_once(
    "src/components/Settings.tsx",
    "  function handleReset() {\n    dispatch({ type: 'RESET' });\n  }",
    "  async function handleReset() {\n    eraseAllFightCampData();\n    dispatch({ type: 'RESET' });\n    await authSignOut();\n  }",
)
replace_once(
    "src/components/Settings.tsx",
    "  const [showUpgrade, setShowUpgrade] = useState(false);",
    "  const [showUpgrade, setShowUpgrade] = useState(false);\n  const [renderNow] = useState(() => Date.now());",
)
replace_once(
    "src/components/Settings.tsx",
    "new Date(camp.fightDate).getTime() - Date.now()",
    "new Date(camp.fightDate).getTime() - renderNow",
)

# ---------------------------------------------------------------------------
# Phase 0: authenticated server-created Stripe Checkout and trusted entitlements
# ---------------------------------------------------------------------------
write(
    "src/lib/checkout.ts",
    r'''import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

export type CheckoutTier = 'fighter_pro' | 'coach_pro';
export type CheckoutBilling = 'monthly' | 'annual';

const PROD_BASE = 'https://fightcamp.netlify.app';
const FUNCTIONS_BASE =
  (import.meta.env.VITE_FUNCTIONS_BASE as string | undefined) ??
  (Capacitor.isNativePlatform() ? PROD_BASE : '');

export async function startStripeCheckout(
  tier: CheckoutTier,
  billing: CheckoutBilling,
): Promise<string> {
  if (!supabase) throw new Error('Accounts are not configured in this build.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in before starting checkout so your purchase can be attached to your account.');

  const response = await fetch(`${FUNCTIONS_BASE}/.netlify/functions/create-checkout-session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ tier, billing }),
  });
  const body = await response.json().catch(() => ({})) as { url?: string; message?: string };
  if (!response.ok || !body.url) {
    throw new Error(body.message || 'Checkout is unavailable right now. Please try again.');
  }
  return body.url;
}
''',
)

write(
    "netlify/functions/create-checkout-session.ts",
    r'''import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

type Tier = 'fighter_pro' | 'coach_pro';
type Billing = 'monthly' | 'annual';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });

export default async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json(405, { message: 'POST only.' });

  const {
    STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_PRICE_FIGHTER_MONTHLY, STRIPE_PRICE_FIGHTER_ANNUAL,
    STRIPE_PRICE_COACH_MONTHLY, STRIPE_PRICE_COACH_ANNUAL,
    URL = 'https://fightcamp.netlify.app',
  } = process.env;
  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(503, { message: 'Checkout is not configured.' });
  }

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { message: 'Sign in before checkout.' });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return json(401, { message: 'Your sign-in expired. Please sign in again.' });

  let tier: Tier;
  let billing: Billing;
  try {
    const body = await req.json() as { tier?: Tier; billing?: Billing };
    if (!['fighter_pro', 'coach_pro'].includes(body.tier ?? '')) throw new Error();
    if (!['monthly', 'annual'].includes(body.billing ?? '')) throw new Error();
    tier = body.tier as Tier;
    billing = body.billing as Billing;
  } catch {
    return json(400, { message: 'Invalid checkout selection.' });
  }

  const prices: Record<Tier, Record<Billing, string | undefined>> = {
    fighter_pro: { monthly: STRIPE_PRICE_FIGHTER_MONTHLY, annual: STRIPE_PRICE_FIGHTER_ANNUAL },
    coach_pro: { monthly: STRIPE_PRICE_COACH_MONTHLY, annual: STRIPE_PRICE_COACH_ANNUAL },
  };
  const price = prices[tier][billing];
  if (!price || !/^price_/.test(price)) return json(503, { message: 'This subscription option is not configured.' });

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const base = URL.replace(/\/$/, '');
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    client_reference_id: data.user.id,
    customer_email: data.user.email,
    metadata: { supabase_user_id: data.user.id, tier },
    subscription_data: { metadata: { supabase_user_id: data.user.id, tier } },
    success_url: `${base}/?checkout=success`,
    cancel_url: `${base}/?checkout=cancelled`,
    allow_promotion_codes: true,
  });
  if (!session.url) return json(500, { message: 'Stripe did not return a checkout URL.' });
  return json(200, { url: session.url });
};
''',
)

# Upgrade modal: remove public payment links and call the authenticated endpoint.
replace_once(
    "src/components/shared/UpgradeModal.tsx",
    "import { PRICES } from '../../utils/pricing';\n",
    "import { PRICES } from '../../utils/pricing';\nimport { startStripeCheckout } from '../../lib/checkout';\nimport AuthScreen from '../AuthScreen';\n",
)
regex_once(
    "src/components/shared/UpgradeModal.tsx",
    r"\n// Stripe Payment Link URLs\..*?\nconst LINKS = \{.*?\n\};\n",
    "\n",
    flags=re.S,
)
replace_once(
    "src/components/shared/UpgradeModal.tsx",
    "  const [loading, setLoading] = useState(false);",
    "  const [loading, setLoading] = useState(false);\n  const [showAuth, setShowAuth] = useState(false);",
)
regex_once(
    "src/components/shared/UpgradeModal.tsx",
    r"    \} else \{\n      const base = LINKS\[tier\]\[billing\];.*?\n    \}\n  \}",
    r'''    } else {
      if (!user) {
        setNotice('Sign in first so the purchase is securely attached to your account.');
        setShowAuth(true);
        return;
      }
      setLoading(true);
      setNotice('');
      try {
        onBeforeWebCheckout?.();
        const url = await startStripeCheckout(
          tier === 'coach' ? 'coach_pro' : 'fighter_pro',
          billing,
        );
        window.location.assign(url);
      } catch (e) {
        setNotice(purchaseErrorMessage(e));
        setLoading(false);
      }
    }
  }''',
    flags=re.S,
)
replace_once(
    "src/components/shared/UpgradeModal.tsx",
    "      </div>\n    </div>\n  );\n}",
    "      </div>\n      {showAuth && <AuthScreen onClose={() => setShowAuth(false)} />}\n    </div>\n  );\n}",
)

# Stripe webhook maps exact configured price IDs, never product names/defaults.
regex_once(
    "netlify/functions/stripe-webhook.ts",
    r"  // Map the purchased product to our tier\..*?\n  const tierFor = .*?;\n",
    r'''  const tierForPrice = (priceId: string | null | undefined): 'coach_pro' | 'fighter_pro' | null => {
    const pairs: Array<[string | undefined, 'coach_pro' | 'fighter_pro']> = [
      [process.env.STRIPE_PRICE_FIGHTER_MONTHLY, 'fighter_pro'],
      [process.env.STRIPE_PRICE_FIGHTER_ANNUAL, 'fighter_pro'],
      [process.env.STRIPE_PRICE_COACH_MONTHLY, 'coach_pro'],
      [process.env.STRIPE_PRICE_COACH_ANNUAL, 'coach_pro'],
    ];
    return pairs.find(([id]) => !!id && id === priceId)?.[1] ?? null;
  };
''',
    flags=re.S,
)
replace_once(
    "netlify/functions/stripe-webhook.ts",
    "    const product = item?.price?.product as Stripe.Product | Stripe.DeletedProduct | string | undefined;\n    const productName = product && typeof product === 'object' && 'name' in product ? product.name : null;",
    "    const tier = tierForPrice(item?.price?.id);\n    if (!tier) throw new Error(`Unrecognized Stripe price: ${item?.price?.id ?? 'missing'}`);",
)
replace_once("netlify/functions/stripe-webhook.ts", "        tier: tierFor(productName),", "        tier,")
replace_once(
    "netlify/functions/stripe-webhook.ts",
    "        const userId = session.client_reference_id;",
    "        const metadataUserId = session.metadata?.supabase_user_id;\n        const userId = metadataUserId ?? session.client_reference_id;\n        if (metadataUserId && session.client_reference_id && metadataUserId !== session.client_reference_id) {\n          throw new Error('Checkout user attribution mismatch');\n        }",
)

# AI authorizes only server-verified grants and server-side comp accounts.
regex_once(
    "netlify/functions/ai-coach.ts",
    r"\n  if \(!isPro\) \{\n    // Client-attested fallback.*?\n  \}\n\n  if \(FEATURES\[feature\]\.proOnly",
    "\n  if (FEATURES[feature].proOnly",
    flags=re.S,
)

# RevenueCat TRANSFER revokes source access and carries a known verified row to
# the destination account when possible.
replace_once(
    "netlify/functions/revenuecat-webhook.ts",
    "  event_timestamp_ms?: number;\n}",
    "  event_timestamp_ms?: number;\n  transferred_from?: string[];\n  transferred_to?: string[];\n}",
)
replace_once(
    "netlify/functions/revenuecat-webhook.ts",
    "  // TRANSFER moves entitlements between subscribers and carries no\n  // entitlement_ids; the destination user's next real event (or the client\n  // SDK) carries the truth. Skipping keeps this handler single-shaped.\n  if (event.type === 'TRANSFER') return ok('transfer events are not mirrored');\n\n",
    "",
)
replace_once(
    "netlify/functions/revenuecat-webhook.ts",
    "  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {\n    auth: { persistSession: false, autoRefreshToken: false },\n  });\n\n  // The write goes through record_revenuecat_event",
    "  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {\n    auth: { persistSession: false, autoRefreshToken: false },\n  });\n\n  if (event.type === 'TRANSFER') {\n    const fromIds = (event.transferred_from ?? []).filter(id => UUID_RE.test(id));\n    const toId = (event.transferred_to ?? []).find(id => UUID_RE.test(id));\n    let source: Record<string, unknown> | null = null;\n    if (fromIds.length > 0) {\n      const { data } = await supabase.from('revenuecat_subscriptions').select('*').in('user_id', fromIds).limit(1).maybeSingle();\n      source = data;\n    }\n    if (toId && source) {\n      const { user_id: _oldUser, ...grant } = source;\n      const { error } = await supabase.from('revenuecat_subscriptions').upsert({\n        ...grant, user_id: toId, rc_app_user_id: toId, last_event_type: 'TRANSFER',\n        last_event_at: event.event_timestamp_ms ? new Date(event.event_timestamp_ms).toISOString() : new Date().toISOString(),\n      }, { onConflict: 'user_id' });\n      if (error) return new Response('Handler error', { status: 500 });\n    }\n    if (fromIds.length > 0) {\n      const { error } = await supabase.from('revenuecat_subscriptions').delete().in('user_id', fromIds);\n      if (error) return new Response('Handler error', { status: 500 });\n    }\n    return ok(toId && source ? 'entitlement transferred' : 'source entitlement revoked; destination awaits authoritative refresh');\n  }\n\n  // The write goes through record_revenuecat_event",
)

# ---------------------------------------------------------------------------
# Database authorization and validation migration
# ---------------------------------------------------------------------------
write(
    "supabase/migrations/20260803193000_phase0_security_hardening.sql",
    r'''-- Phase 0 authorization and data-integrity hardening.

-- Linked identities are immutable after consent creates the relationship.
create or replace function public.prevent_link_principal_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.coach_id <> old.coach_id or new.fighter_id <> old.fighter_id then
    raise exception 'coach_id and fighter_id are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists cfl_principals_immutable on public.coach_fighter_links;
create trigger cfl_principals_immutable before update on public.coach_fighter_links
  for each row execute function public.prevent_link_principal_change();

-- Clients revoke by DELETE. Relationship creation/reactivation remains inside
-- the two audited SECURITY DEFINER redemption functions.
drop policy if exists "cfl_update" on public.coach_fighter_links;

-- Notes require an active relationship and a camp owned by that fighter.
drop policy if exists "coach_notes_write" on public.coach_notes;
drop policy if exists "coach_notes_insert" on public.coach_notes;
drop policy if exists "coach_notes_update" on public.coach_notes;
drop policy if exists "coach_notes_delete" on public.coach_notes;

create policy "coach_notes_insert" on public.coach_notes
  for insert to authenticated
  with check (
    coach_id = (select auth.uid())
    and public.is_coach_of(fighter_id)
    and exists (
      select 1 from public.camps c
      where c.id = camp_id and c.user_id = fighter_id and c.deleted_at is null
    )
  );

create policy "coach_notes_update" on public.coach_notes
  for update to authenticated
  using (coach_id = (select auth.uid()) and public.is_coach_of(fighter_id))
  with check (
    coach_id = (select auth.uid())
    and public.is_coach_of(fighter_id)
    and exists (
      select 1 from public.camps c
      where c.id = camp_id and c.user_id = fighter_id and c.deleted_at is null
    )
  );

create policy "coach_notes_delete" on public.coach_notes
  for delete to authenticated
  using (coach_id = (select auth.uid()) and public.is_coach_of(fighter_id));

-- Prevent note reassignment even inside an otherwise valid linked relationship.
create or replace function public.prevent_note_principal_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.coach_id <> old.coach_id or new.fighter_id <> old.fighter_id or new.camp_id <> old.camp_id then
    raise exception 'coach note principals are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists coach_notes_principals_immutable on public.coach_notes;
create trigger coach_notes_principals_immutable before update on public.coach_notes
  for each row execute function public.prevent_note_principal_change();

-- Both invite redemption functions are callable only by authenticated users.
revoke execute on function public.redeem_coach_invite(text) from public, anon;
grant execute on function public.redeem_coach_invite(text) to authenticated;
revoke execute on function public.redeem_fighter_invite(text) from public, anon;
grant execute on function public.redeem_fighter_invite(text) to authenticated;
revoke execute on function public.is_coach_of(uuid) from public, anon;
grant execute on function public.is_coach_of(uuid) to authenticated;

-- Server-only RPCs need explicit EXECUTE after PUBLIC is revoked. The service
-- role still bypasses RLS, but it does not implicitly bypass function ACLs.
grant execute on function public.record_revenuecat_event(uuid, text, text, text, text, timestamptz, text, timestamptz) to service_role;
grant execute on function public.increment_ai_usage(uuid, text, integer) to service_role;
grant execute on function public.refund_ai_usage(uuid, text) to service_role;

-- New writes must remain physically plausible. NOT VALID preserves rollout on
-- installations that may already contain legacy rows while enforcing all new
-- inserts and updates immediately.
alter table public.camps add constraint camps_rounds_valid check (rounds between 1 and 15) not valid;
alter table public.camps add constraint camps_round_duration_valid check (round_duration between 1 and 10) not valid;
alter table public.camps add constraint camps_weights_valid check (current_weight >= 0 and target_weight >= 0) not valid;
alter table public.workout_logs add constraint workout_duration_valid check (duration between 0 and 1440) not valid;
alter table public.conditioning_tests add constraint conditioning_value_valid check (value >= 0) not valid;
alter table public.weight_entries add constraint weight_value_valid check (weight > 0 and weight < 1500) not valid;
alter table public.fight_results add constraint fight_weights_valid check (
  (weigh_in_weight is null or weigh_in_weight > 0)
  and (fight_night_weight is null or fight_night_weight > 0)
) not valid;

revoke execute on function public.prevent_link_principal_change() from public, anon, authenticated;
revoke execute on function public.prevent_note_principal_change() from public, anon, authenticated;
''',
)

# ---------------------------------------------------------------------------
# Phase 2: deterministic timer and direction-aware conditioning analytics
# ---------------------------------------------------------------------------
write(
    "src/utils/timerMath.ts",
    r'''export function completedTimerDurationSeconds(rounds: number, workSec: number, restSec: number): number {
  const safeRounds = Math.max(0, Math.floor(rounds));
  const work = Math.max(0, workSec);
  const rest = Math.max(0, restSec);
  if (safeRounds === 0) return 0;
  return safeRounds * work + Math.max(0, safeRounds - 1) * rest;
}

/** Preserve the original wall-clock schedule instead of accumulating interval delay. */
export function advanceDeadline(previousDeadline: number, phaseDurationMs: number): number {
  return previousDeadline + Math.max(0, phaseDurationMs);
}
''',
)
write(
    "src/utils/conditioningMetrics.ts",
    r'''export interface ConditioningPoint {
  testType: string;
  value: number;
  date: string;
  unit: string;
}

export type MetricDirection = 'higher' | 'lower';

const LOWER_IS_BETTER = new Set(['3-Mile Run', '1-Mile Run', '400m Sprint', 'Jump Rope (5min)']);

export function conditioningMetricDirection(testType: string): MetricDirection {
  return LOWER_IS_BETTER.has(testType) ? 'lower' : 'higher';
}

export interface ConditioningProgress {
  testType: string;
  first: number;
  latest: number;
  percentImprovement: number;
  improved: boolean;
  stable: boolean;
  unit: string;
}

export function compareConditioningProgress(entries: ConditioningPoint[]): ConditioningProgress | null {
  const groups = new Map<string, ConditioningPoint[]>();
  for (const entry of entries) {
    const group = groups.get(entry.testType) ?? [];
    group.push(entry);
    groups.set(entry.testType, group);
  }
  const eligible = [...groups.entries()]
    .map(([testType, points]) => [testType, [...points].sort((a, b) => a.date.localeCompare(b.date))] as const)
    .filter(([, points]) => points.length >= 2)
    .sort((a, b) => b[1][b[1].length - 1].date.localeCompare(a[1][a[1].length - 1].date));
  if (eligible.length === 0) return null;

  const [testType, points] = eligible[0];
  const first = points[0].value;
  const latest = points[points.length - 1].value;
  const rawChange = first === 0 ? 0 : ((latest - first) / Math.abs(first)) * 100;
  const percentImprovement = conditioningMetricDirection(testType) === 'lower' ? -rawChange : rawChange;
  return {
    testType, first, latest, percentImprovement,
    improved: percentImprovement > 2,
    stable: Math.abs(percentImprovement) <= 2,
    unit: points[points.length - 1].unit,
  };
}
''',
)
replace_once(
    "src/components/RoundTimer.tsx",
    "import { getCurrentWeekNumber } from '../utils/campGenerator';\n",
    "import { getCurrentWeekNumber } from '../utils/campGenerator';\nimport { completedTimerDurationSeconds } from '../utils/timerMath';\n",
)
replace_once(
    "src/components/RoundTimer.tsx",
    "    const totalSec = rounds * (workSec + restSec);",
    "    const totalSec = completedTimerDurationSeconds(rounds, workSec, restSec);",
)
# Wall-clock deadline transitions and lazy audio activation.
content = read("src/hooks/useRoundTimer.ts")
content = content.replace("const newDeadline = Date.now() + workSecRef.current * 1000;", "const newDeadline = deadlineRef.current + workSecRef.current * 1000;")
content = content.replace("const newDeadline = Date.now() + restSecRef.current * 1000;", "const newDeadline = deadlineRef.current + restSecRef.current * 1000;")
content = content.replace("      const ctx = getAudioCtx();\n\n      // Configurable warning", "      // Configurable warning")
content = content.replace("        playClapper(ctx); scheduleCtxSuspend();", "        playClapper(getAudioCtx()); scheduleCtxSuspend();")
content = content.replace("        playTick(ctx);", "        playTick(getAudioCtx());")
write("src/hooks/useRoundTimer.ts", content)

replace_once(
    "src/utils/readiness.ts",
    "import { formatWeightDelta } from './units';\n",
    "import { formatWeightDelta } from './units';\nimport { getCurrentWeekNumber } from './campGenerator';\nimport { compareConditioningProgress } from './conditioningMetrics';\n",
)
replace_once(
    "src/utils/readiness.ts",
    "    currentUser,\n  } = state;",
    "    currentUser,\n    trainingSchedule,\n  } = state;",
)
replace_once(
    "src/utils/readiness.ts",
    "  const campProgress = Math.min(1, daysIntoCamp / totalCampDays);",
    "  const campProgress = Math.min(1, daysIntoCamp / totalCampDays);\n  const currentPhase = trainingSchedule[getCurrentWeekNumber(activeCamp) - 1]?.phase ?? '';\n  const isRecoveryPhase = currentPhase === 'Taper' || currentPhase === 'Active Recovery';",
)
regex_once(
    "src/utils/readiness.ts",
    r"  // ── 3\. Session Quality / RPE.*?  const qualityScore = scale\(qualityRatio, w\.sessionQuality\);",
    r'''  // ── 3. Session Quality / RPE (phase-aware) ─────────────────────────
  const recentRPEs = recentWorkouts.map(wl => wl.rpe).filter(r => r > 0);
  let qualityRatio: number;
  let qualityDetail: string;
  if (recentRPEs.length === 0) {
    qualityRatio = 0.5;
    qualityDetail = 'Log sessions with RPE to score this';
  } else {
    const avg = recentRPEs.reduce((a, b) => a + b, 0) / recentRPEs.length;
    const idealLow = isRecoveryPhase ? 4 : currentPhase === 'Base Building' ? 6 : 7;
    const idealHigh = isRecoveryPhase ? 7 : currentPhase === 'Peak' || currentPhase === 'Fight Specific' ? 9 : 8.5;
    if (avg >= idealLow && avg <= idealHigh) {
      qualityRatio = 1;
      qualityDetail = `Avg RPE ${avg.toFixed(1)} — appropriate for ${currentPhase || 'this phase'}`;
    } else if (avg < idealLow) {
      qualityRatio = isRecoveryPhase ? 0.8 : 0.5;
      qualityDetail = `Avg RPE ${avg.toFixed(1)} — ${isRecoveryPhase ? 'recovery load is appropriately light' : 'below the planned phase range'}`;
    } else {
      qualityRatio = isRecoveryPhase ? 0.35 : 0.6;
      qualityDetail = `Avg RPE ${avg.toFixed(1)} — high for ${currentPhase || 'this phase'}; monitor recovery`;
    }
  }
  const qualityScore = scale(qualityRatio, w.sessionQuality);''',
    flags=re.S,
)
replace_once(
    "src/utils/readiness.ts",
    "  if (campSparring.length === 0) {\n    sparRatio = 0;\n    sparDetail = 'No sparring logged yet';",
    "  if (campSparring.length === 0) {\n    sparRatio = isRecoveryPhase || currentPhase === 'Base Building' ? 0.7 : 0;\n    sparDetail = isRecoveryPhase || currentPhase === 'Base Building'\n      ? `No sparring expected during ${currentPhase}`\n      : 'No sparring logged yet';",
)
regex_once(
    "src/utils/readiness.ts",
    r"  // ── 5\. Conditioning.*?  const condScore = scale\(condRatio, w\.conditioning\);",
    r'''  // ── 5. Conditioning (compare like-for-like, correct direction) ───────
  let condRatio: number;
  let condDetail: string;
  if (campTests.length === 0) {
    condRatio = 0.5;
    condDetail = 'Log a test to benchmark fitness';
  } else {
    const progress = compareConditioningProgress(campTests);
    if (!progress) {
      condRatio = 0.7;
      const last = campTests[campTests.length - 1];
      condDetail = `${last.testType}: ${last.value} ${last.unit} — repeat this test to measure progress`;
    } else if (progress.improved) {
      condRatio = 1;
      condDetail = `${progress.testType} improving ↑`;
    } else if (progress.stable) {
      condRatio = 0.7;
      condDetail = `${progress.testType} stable`;
    } else {
      condRatio = 0.4;
      condDetail = `${progress.testType} declining ↓`;
    }
  }
  const condScore = scale(condRatio, w.conditioning);''',
    flags=re.S,
)

# Camp generator fixes: sleep copy, bidirectional sparring adaptation, real strength emphasis.
replace_once(
    "src/utils/campGenerator.ts",
    "  conditioningLoad: number;\n}",
    "  conditioningLoad: number;\n  strengthBonus?: number;\n}",
)
replace_once(
    "src/utils/campGenerator.ts",
    "  const { intensity, sparringRounds, conditioningLoad } = phase;",
    "  const { intensity, sparringRounds, conditioningLoad, strengthBonus = 0 } = phase;",
)
content = read("src/utils/campGenerator.ts")
content = content.replace("duration: 60,\n        description: isBKFC\n          ? bkfcStrengthDesc", "duration: 60 + strengthBonus,\n        description: isBKFC\n          ? bkfcStrengthDesc", 1)
content = content.replace("'Max 8hrs sleep per night'", "'Aim for 8+ hours of sleep per night'")
content = content.replace("sparringRounds = Math.max(p.sparringRounds, Math.round(p.sparringRounds * scale));", "sparringRounds = Math.max(0, Math.round(p.sparringRounds * scale));")
content = content.replace("    return { ...p, sparringRounds, conditioningLoad };", "    const strengthBonus = weights.strengthEmphasis && (p.phase === 'Base Building' || p.phase === 'Strength & Conditioning') ? 15 : p.strengthBonus;\n    return { ...p, sparringRounds, conditioningLoad, strengthBonus };")
write("src/utils/campGenerator.ts", content)

# Date-only correctness and future-date guards.
replace_once(
    "src/components/Onboarding.tsx",
    "import { addDays, format } from 'date-fns';",
    "import { addDays, format, parseISO } from 'date-fns';",
)
content = read("src/components/Onboarding.tsx").replace("new Date(fightDate)", "parseISO(fightDate)")
write("src/components/Onboarding.tsx", content)
replace_once(
    "src/components/Dashboard.tsx",
    "import { format, parseISO } from 'date-fns';",
    "import { differenceInCalendarDays, format, parseISO } from 'date-fns';",
)
replace_once(
    "src/components/Dashboard.tsx",
    "  const showPostFightCta = !!activeCamp.fightDate\n    && parseISO(activeCamp.fightDate) < new Date()\n    && !campFightResult;",
    "  const showPostFightCta = !!activeCamp.fightDate\n    && differenceInCalendarDays(new Date(), parseISO(activeCamp.fightDate)) > 0\n    && !campFightResult;",
)
replace_once(
    "src/components/WeightTracker.tsx",
    "<input className=\"input\" type=\"date\" value={date} onChange={e => setDate(e.target.value)} />",
    "<input className=\"input\" type=\"date\" max={format(new Date(), 'yyyy-MM-dd')} value={date} onChange={e => setDate(e.target.value)} />",
)
# Workout logger: allow historical dates, never future records, and document the intentional prop sync.
replace_once(
    "src/components/WorkoutLogger.tsx",
    "  useEffect(() => {\n    if (prefill) {\n      setWType(prefill.sessionType);",
    "  useEffect(() => {\n    if (prefill) {\n      // The planner shortcut deliberately hydrates this controlled modal form.\n      // eslint-disable-next-line react-hooks/set-state-in-effect\n      setWType(prefill.sessionType);",
)
content = read("src/components/WorkoutLogger.tsx")
content = content.replace("<input className=\"input\" type=\"date\" value={wDate}", "<input className=\"input\" type=\"date\" max={format(new Date(), 'yyyy-MM-dd')} value={wDate}")
content = content.replace("<input className=\"input\" type=\"date\" value={sDate}", "<input className=\"input\" type=\"date\" max={format(new Date(), 'yyyy-MM-dd')} value={sDate}")
content = content.replace("<input className=\"input\" type=\"date\" value={cDate}", "<input className=\"input\" type=\"date\" max={format(new Date(), 'yyyy-MM-dd')} value={cDate}")
write("src/components/WorkoutLogger.tsx", content)

# Existing lint blockers: narrowly document intentional effects instead of
# weakening the project-wide rules.
replace_once(
    "src/components/GamePlanBuilder.tsx",
    "    if (p) {\n      setForm({",
    "    if (p) {\n      // Existing camp selection hydrates the controlled editor.\n      // eslint-disable-next-line react-hooks/set-state-in-effect\n      setForm({",
)
replace_once(
    "src/components/shared/ConnectionDiagnostics.tsx",
    "  useEffect(() => { void run(); }, [run]);",
    "  useEffect(() => {\n    const id = setTimeout(() => { void run(); }, 0);\n    return () => clearTimeout(id);\n  }, [run]);",
)

# ---------------------------------------------------------------------------
# Phase 1: executable regression/security suite and CI gates
# ---------------------------------------------------------------------------
write(
    "tests/unit/timerMath.test.ts",
    r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { completedTimerDurationSeconds, advanceDeadline } from '../../src/utils/timerMath.ts';

test('timer excludes rest after the final round', () => {
  assert.equal(completedTimerDurationSeconds(12, 180, 60), 2820);
  assert.equal(completedTimerDurationSeconds(1, 180, 60), 180);
});

test('deadline advances from the schedule rather than current time', () => {
  assert.equal(advanceDeadline(10_000, 3_000), 13_000);
});
''',
)
write(
    "tests/unit/conditioningMetrics.test.ts",
    r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { compareConditioningProgress, conditioningMetricDirection } from '../../src/utils/conditioningMetrics.ts';

test('run and sprint times improve when values fall', () => {
  assert.equal(conditioningMetricDirection('1-Mile Run'), 'lower');
  const result = compareConditioningProgress([
    { testType: '1-Mile Run', value: 8, date: '2026-01-01', unit: 'minutes' },
    { testType: '1-Mile Run', value: 7.5, date: '2026-02-01', unit: 'minutes' },
  ]);
  assert.equal(result?.improved, true);
});

test('strength tests improve when values rise and never compare unlike tests', () => {
  const result = compareConditioningProgress([
    { testType: 'Push-up Max', value: 40, date: '2026-01-01', unit: 'reps' },
    { testType: '1-Mile Run', value: 7, date: '2026-01-15', unit: 'minutes' },
    { testType: 'Push-up Max', value: 50, date: '2026-02-01', unit: 'reps' },
  ]);
  assert.equal(result?.testType, 'Push-up Max');
  assert.equal(result?.improved, true);
});
''',
)
write(
    "tests/unit/accountStorage.test.ts",
    r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { eraseAllFightCampData, eraseStorageOwner, scopedStorageKey, storageOwnerForUser, type StorageLike } from '../../src/utils/accountStorage.ts';

class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

test('account namespaces cannot overlap', () => {
  const a = storageOwnerForUser('a');
  const b = storageOwnerForUser('b');
  assert.notEqual(scopedStorageKey('fightcamp_app', a), scopedStorageKey('fightcamp_app', b));
});

test('owner erase removes only that account unless full reset is requested', () => {
  const storage = new MemoryStorage();
  storage.setItem('fightcamp_app:user:a', 'A');
  storage.setItem('fightcamp_app:user:b', 'B');
  storage.setItem('unrelated', 'keep');
  eraseStorageOwner('user:a', {}, storage);
  assert.equal(storage.getItem('fightcamp_app:user:a'), null);
  assert.equal(storage.getItem('fightcamp_app:user:b'), 'B');
  eraseAllFightCampData(storage);
  assert.equal(storage.getItem('fightcamp_app:user:b'), null);
  assert.equal(storage.getItem('unrelated'), 'keep');
});
''',
)
write(
    "tests/security/hardening.test.mjs",
    r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('client URL parameters cannot grant Pro', () => {
  const source = read('src/utils/subscription.ts');
  assert.doesNotMatch(source, /processStripeReturn|stripe_session/);
});

test('AI endpoint does not trust client-synced subscription JSON', () => {
  const source = read('netlify/functions/ai-coach.ts');
  assert.doesNotMatch(source, /from\('user_state'\)[\s\S]*select\('subscription'\)/);
});

test('checkout is authenticated and exact-price based', () => {
  const checkout = read('netlify/functions/create-checkout-session.ts');
  const webhook = read('netlify/functions/stripe-webhook.ts');
  assert.match(checkout, /auth\.getUser\(token\)/);
  assert.match(webhook, /tierForPrice/);
  assert.doesNotMatch(webhook, /tierFor\(productName\)/);
});

test('RLS migration locks link principals and coach notes', () => {
  const sql = read('supabase/migrations/20260803193000_phase0_security_hardening.sql');
  assert.match(sql, /cfl_principals_immutable/);
  assert.match(sql, /public\.is_coach_of\(fighter_id\)/);
  assert.match(sql, /coach notes? principals are immutable/i);
  assert.match(sql, /grant execute on function public\.increment_ai_usage.*service_role/);
});
''',
)

# Package scripts use Node 24's built-in TypeScript stripping; no new runtime or
# lockfile dependency is introduced.
package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
package["scripts"]["test:unit"] = "node --experimental-strip-types --test tests/unit/*.test.ts"
package["scripts"]["test:security"] = "node --test tests/security/*.test.mjs"
package["scripts"]["validate"] = "npm run lint && npm run test:unit && npm run test:security && npm run build"
package_path.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")

write(
    ".github/workflows/ci.yml",
    r'''name: App validation

on:
  pull_request:
    branches:
      - claude/fight-training-camp-app-ggs3g
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: app-validation-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm
      - run: npm ci
      - name: Lint
        run: npm run lint
      - name: Unit tests
        run: npm run test:unit
      - name: Security regression tests
        run: npm run test:security
      - name: Production build
        run: npm run build
      - name: Production dependency audit
        continue-on-error: true
        run: npm audit --omit=dev --audit-level=high --json > dependency-audit.json
      - name: Upload dependency audit
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: dependency-audit
          retention-days: 7
          if-no-files-found: warn
          path: dependency-audit.json
''',
)

write(
    "README.md",
    r'''# Fight Camp Training

A local-first combat-sports camp planner and tracking app for fighters and coaches. The app is built with React, TypeScript, Vite, Capacitor, Supabase, Stripe, RevenueCat, and Netlify Functions.

## Safety and trust model

- Training data is stored in an account-scoped local namespace and optionally synchronized to Supabase.
- Supabase RLS restricts athlete data to its owner and explicitly linked coaches.
- Stripe and RevenueCat entitlements are recorded by verified server webhooks; URL parameters and client JSON never authorize paid server resources.
- AI requests use the app's server-side provider key and require an authenticated account. Paid AI features accept only server-verified entitlements.
- Weight-cut and readiness outputs are planning indicators, not medical advice.

## Local development

```bash
npm ci
npm run dev
```

Copy `.env.example` to `.env.local` and configure only public `VITE_` values there. Server secrets belong in Netlify environment variables and must never be prefixed with `VITE_`.

## Validation

```bash
npm run validate
```

This runs lint, deterministic unit tests, security regression tests, and a production build. Pull requests run the same gate in GitHub Actions and attach a production-dependency audit.

## Database changes

Database changes are committed as timestamped files in `supabase/migrations`. Apply migrations to staging first, run Supabase security/performance advisors, exercise account linking and deletion, then promote the same migration to production.

## Deployment prerequisites

Server-side environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_FIGHTER_MONTHLY`
- `STRIPE_PRICE_FIGHTER_ANNUAL`
- `STRIPE_PRICE_COACH_MONTHLY`
- `STRIPE_PRICE_COACH_ANNUAL`
- `REVENUECAT_WEBHOOK_SECRET`
- `ANTHROPIC_API_KEY`

See `.env.example` and the files under `docs/` for platform-specific setup.

## Release process

1. Merge only after the App validation workflow passes.
2. Apply and verify migrations in staging.
3. Test email/Apple sign-in, account switching, account deletion, checkout, restore purchases, AI quotas, coach linking, timer backgrounding, and offline restore.
4. Deploy the web/Netlify build.
5. Archive and upload the iOS build through the existing Fastlane workflow.
6. Monitor Sentry, Stripe webhook delivery, RevenueCat delivery, and Supabase logs during rollout.
''',
)

# Legal copy now matches server-side AI and account-scoped storage.
write(
    "public/privacy.html",
    r'''<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy Policy — Fight Camp Training</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:auto;padding:2rem 1.25rem 4rem;background:#0a0a0a;color:#d1d5db;line-height:1.7}h1{color:#fff}h2{color:#f3f4f6;margin-top:2rem}a{color:#f97316}.meta{color:#6b7280}</style></head><body>
<h1>Privacy Policy</h1><p class="meta">Last updated: August 2026</p>
<p>Fight Camp Training is a combat-sports planning and tracking app for athletes and coaches. This policy describes the information processed by the app and its service providers.</p>
<h2>Local and account data</h2><p>The app is local-first. Guest data stays on the device. When you sign in, the device stores that account in a separate local namespace and may synchronize profile, camp, workout, sparring, conditioning, weight, nutrition, recovery, fight-result, game-plan and coach-note data through Supabase. Account namespaces are isolated so one signed-in account is not merged into another.</p>
<h2>Coach access</h2><p>A coach receives access only after an invite is redeemed. Linked coaches can read the training data covered by that relationship and may add coach notes. Either party can revoke the link. Database row-level security enforces these relationships.</p>
<h2>AI coach</h2><p>When you request AI analysis, the app sends the camp information needed for that report to our authenticated server endpoint, which uses Anthropic. This may include profile and camp details, training metrics, weights, opponent or sparring-partner labels, and free-text notes you entered. Do not enter information you do not want processed. The provider key is held server-side; users are not asked to supply an API key. AI output is informational and is not medical advice.</p>
<h2>Health and device integrations</h2><p>With permission, the iOS app can read or write selected Apple Health data and can connect to supported heart-rate or wearable services. These integrations are optional and governed by the provider's privacy terms.</p>
<h2>Payments</h2><p>Web subscriptions are processed by Stripe. iOS subscriptions are processed by Apple and managed through RevenueCat. We store plan and entitlement status, not payment-card details, to unlock features across signed-in devices.</p>
<h2>Diagnostics and advertising</h2><p>Sentry may receive crash and performance diagnostics. Free-tier web users may see Google advertising when configured. Pro subscribers do not see ads. We configure diagnostics to avoid intentionally sending training-note content.</p>
<h2>Retention and deletion</h2><p>Signing out stops synchronization and switches away from that account's isolated local cache. Deleting your account removes the Supabase account and cloud data and erases that account's device cache. “Reset Everything” removes all Fight Camp data stored by the app on that device. App Store subscription billing must be cancelled separately in Apple settings.</p>
<h2>Children</h2><p>The service is not directed to children under 13. Do not create an account if you are under the minimum age required in your country.</p>
<h2>Contact</h2><p>Questions: <a href="mailto:heck@kingkillers.co">heck@kingkillers.co</a>.</p>
</body></html>''',
)
write(
    "public/terms.html",
    r'''<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Terms of Use — Fight Camp Training</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:auto;padding:2rem 1.25rem 4rem;background:#0a0a0a;color:#d1d5db;line-height:1.7}h1{color:#fff}h2{color:#f3f4f6;margin-top:2rem}a{color:#f97316}.meta{color:#6b7280}</style></head><body>
<h1>Terms of Use</h1><p class="meta">Last updated: August 2026</p>
<p>By using Fight Camp Training, you agree to these terms.</p>
<h2>Use of the service</h2><p>Athletes may use the service for personal training management. Coaches and gyms may use coach features to support athletes they are authorized to work with. You must use the service lawfully and be at least 13 or the higher minimum age required where you live.</p>
<h2>Your content and coach relationships</h2><p>You retain ownership of information you enter. You are responsible for having permission to enter information about opponents, partners or other people. Invite codes grant access to training information; share them only with the intended person and revoke relationships that are no longer active.</p>
<h2>Subscriptions</h2><p>Fighter Pro and Coach Pro may renew automatically. iOS purchases are billed by Apple; web purchases are billed by Stripe. Trials, renewal periods, prices and cancellation terms are displayed before purchase. Deleting an account does not automatically cancel App Store billing.</p>
<h2>AI features</h2><p>AI reports are generated from training information you choose to submit through our server-side AI service. They may be incomplete or wrong and must not replace a qualified coach, doctor, dietitian or other professional.</p>
<h2>Health, weight cutting and combat-sports risk</h2><p>Combat sports, intense training and rapid weight loss can cause serious injury or illness. The app provides planning and tracking information only. Do not use a readiness score or weight projection as clearance to train, compete, dehydrate or ignore symptoms. Seek qualified medical and coaching supervision.</p>
<h2>Availability and warranties</h2><p>The service is provided “as is” and may change or experience interruptions. To the extent allowed by law, we disclaim implied warranties and are not liable for indirect or consequential loss.</p>
<h2>Account deletion</h2><p>You can delete a signed-in account from Settings. Cloud data associated with the account is removed subject to operational backup-retention requirements. Local app data can be removed with the reset controls.</p>
<h2>Contact</h2><p>Questions: <a href="mailto:heck@kingkillers.co">heck@kingkillers.co</a>.</p>
</body></html>''',
)

# Environment documentation: public checkout links are retired; exact server
# price IDs are now the authorization allowlist.
env_path = ".env.example"
env = read(env_path)
env = re.sub(
    r"# Stripe Payment Link URLs.*?VITE_STRIPE_COACH_PRO_ANNUAL=\n\n",
    "# Stripe checkout is created server-side. The client has no payment-link or price secrets.\n\n",
    env,
    flags=re.S,
)
env += "\n# Server-side Stripe Checkout price allowlist (Netlify only)\n# STRIPE_PRICE_FIGHTER_MONTHLY=price_...\n# STRIPE_PRICE_FIGHTER_ANNUAL=price_...\n# STRIPE_PRICE_COACH_MONTHLY=price_...\n# STRIPE_PRICE_COACH_ANNUAL=price_...\n"
write(env_path, env)

print('Phase 0-2 guarded transformations applied successfully.')
