import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const failures = [];

function requireText(source, expected, label) {
  if (!source.includes(expected)) failures.push(`${label}: missing ${JSON.stringify(expected)}`);
}

function forbidText(source, forbidden, label) {
  if (source.includes(forbidden)) failures.push(`${label}: contains forbidden ${JSON.stringify(forbidden)}`);
}

const [
  aiCoach,
  subscription,
  upgradeModal,
  appContext,
  authContext,
  hardeningMigration,
  privacy,
  terms,
] = await Promise.all([
  read('netlify/functions/ai-coach.ts'),
  read('src/utils/subscription.ts'),
  read('src/components/shared/UpgradeModal.tsx'),
  read('src/context/AppContext.tsx'),
  read('src/context/AuthContext.tsx'),
  read('supabase/migrations/20260803190000_harden_authorization.sql'),
  read('public/privacy.html'),
  read('public/terms.html'),
]);

forbidText(aiCoach, ".from('user_state')", 'AI authorization');
requireText(aiCoach, 'server-authoritative sources only', 'AI authorization');

forbidText(subscription, '30-day soft unlock', 'Stripe return');
forbidText(subscription, "source: 'stripe_payment_link'", 'Stripe return');
requireText(subscription, 'never grant', 'Stripe return');
requireText(upgradeModal, 'if (!user?.id || !user.email)', 'Web checkout attribution');

requireText(appContext, 'clearFightCampLocalData()', 'Complete reset');
requireText(appContext, 'return createDefaultState()', 'Complete reset');
requireText(authContext, 'reconcileLocalAccount', 'Account isolation');
requireText(authContext, 'notifyLocalDataCleared', 'Account isolation');

requireText(hardeningMigration, 'prevent_link_principal_change', 'Coach-link hardening');
requireText(hardeningMigration, 'coach_notes_identity_immutable', 'Coach-note hardening');
requireText(hardeningMigration, 'grant execute on function public.increment_ai_usage', 'Service RPC permissions');

forbidText(privacy, 'your own API key', 'Privacy policy');
forbidText(terms, 'must provide your own Anthropic API key', 'Terms');

if (failures.length > 0) {
  console.error('Security regression checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Security regression checks passed.');
