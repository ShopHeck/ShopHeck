import { useState } from 'react';
import { X, Check, Zap, Trophy } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { RevenueCat } from '../../plugins/RevenueCat';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';

interface Props {
  onClose: () => void;
}

// Every line here must describe something that actually ships — this list is
// App Store metadata in spirit (Guideline 2.3.1) and drifts silently if it
// isn't checked against the real ProGate call sites when features change.
const FIGHTER_PRO_FEATURES = [
  'AI Insights & AI Cut Coach — included, no setup',
  'Nutrition tracker — hydration, meals & macros',
  'Game Plan Builder for fight strategy',
  'Unlimited fight camps & camp comparison',
  'Gym Display — fullscreen big-screen timer',
  'Apple Health sync',
  'Unlimited custom timer presets',
  'Sport-specific reaction prompts',
  'Extended warning bells (15–30s)',
];

const COACH_PRO_FEATURES = [
  'Everything in Fighter Pro',
  'Coach dashboard — every linked fighter at a glance',
  'Fighter detail views: training, weight cut & readiness',
];

// Stripe Payment Link URLs. Env vars (set in the host, e.g. Netlify) take
// precedence; the literals are the production fallback so the buttons work even
// when env vars aren't configured. Payment Link URLs are public, not secrets.
// Each link's success URL is configured in Stripe to redirect back with
// ?tier=<fighter_pro|coach_pro>&stripe_session={CHECKOUT_SESSION_ID}.
const LINKS = {
  fighter: {
    monthly: (import.meta.env.VITE_STRIPE_FIGHTER_PRO_MONTHLY as string | undefined) || 'https://buy.stripe.com/aFa28r7BY2t13JafKwgYU00',
    annual:  (import.meta.env.VITE_STRIPE_FIGHTER_PRO_ANNUAL  as string | undefined) || 'https://buy.stripe.com/4gMfZh7BYaZx1B20PCgYU03',
  },
  coach: {
    monthly: (import.meta.env.VITE_STRIPE_COACH_PRO_MONTHLY as string | undefined) || 'https://buy.stripe.com/cNi3cvf4q2t1cfG41OgYU01',
    annual:  (import.meta.env.VITE_STRIPE_COACH_PRO_ANNUAL  as string | undefined) || 'https://buy.stripe.com/28EcN57BY2t13Ja55SgYU02',
  },
};

const PRICES = {
  fighter: { monthly: '$7.99', annual: '$59.99', annualMonthly: '$5.00', saving: '37%' },
  coach:   { monthly: '$19.99', annual: '$149.99', annualMonthly: '$12.50', saving: '37%' },
};

export default function UpgradeModal({ onClose }: Props) {
  const { dispatch } = useApp();
  const { user } = useAuth();
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  // Screenshot harness (?shot): render the iOS footer (auto-renew disclosure +
  // Restore Purchases) so App Store review screenshots match the native app.
  // Purchase/restore behavior still keys off the real platform.
  const showNativeFooter =
    Capacitor.isNativePlatform() ||
    (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('shot'));

  function applyRevenueCatResult(isPro: boolean, tier: string) {
    if (!isPro) return false;
    dispatch({
      type: 'SET_SUBSCRIPTION',
      payload: {
        tier: (tier === 'coach_pro' ? 'coach_pro' : 'fighter_pro') as import('../../types').SubscriptionTier,
        expiresAt: null,
        source: 'revenuecat',
      },
    });
    return true;
  }

  async function handleSubscribe(tier: 'fighter' | 'coach') {
    if (Capacitor.isNativePlatform()) {
      setLoading(true);
      try {
        // Resolves after the paywall sheet is dismissed — with the resulting
        // entitlements. Closing the sheet without buying is not an error, so
        // no notice is shown for it.
        const result = await RevenueCat.presentPaywall();
        if (applyRevenueCatResult(result.isPro, result.tier)) onClose();
      } catch {
        setNotice('The purchase screen couldn’t be opened. Please try again in a moment.');
      } finally {
        setLoading(false);
      }
    } else {
      const base = LINKS[tier][billing];
      if (base) {
        // Tie the checkout to the signed-in account so the Stripe webhook can
        // grant the entitlement server-side: Stripe echoes client_reference_id
        // back on checkout.session.completed. prefilled_email saves a keystroke.
        const url = new URL(base);
        if (user?.id) url.searchParams.set('client_reference_id', user.id);
        if (user?.email) url.searchParams.set('prefilled_email', user.email);
        window.location.href = url.toString();
      } else {
        setNotice('Payment links not yet configured — check back soon!');
      }
    }
  }

  async function handleRestore() {
    if (!Capacitor.isNativePlatform()) return;
    setLoading(true);
    try {
      const result = await RevenueCat.restorePurchases();
      if (applyRevenueCatResult(result.isPro, result.tier)) {
        onClose();
      } else {
        setNotice('No active subscription found to restore.');
      }
    } catch {
      setNotice('Restore failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center p-4" onClick={onClose}>
      <div
        className="bg-dark-800 rounded-2xl border border-dark-500 w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-wider">Upgrade</p>
            <h2 className="text-lg font-black text-white leading-tight">Unlock the full platform</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Billing toggle */}
        <div className="px-5 pb-3">
          <div className="flex bg-dark-700 rounded-xl p-1 gap-1">
            <button
              onClick={() => setBilling('monthly')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${billing === 'monthly' ? 'bg-dark-500 text-white' : 'text-gray-500'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${billing === 'annual' ? 'bg-dark-500 text-white' : 'text-gray-500'}`}
            >
              Annual <span className="text-brand-400">Save 37%</span>
            </button>
          </div>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Fighter Pro card */}
          <div className="bg-gradient-to-br from-brand-900/40 to-dark-700 border border-brand-700/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-brand-400" />
              <span className="text-sm font-bold text-white">Fighter Pro</span>
              {/* The 7-day trial is configured in RevenueCat (App Store);
                  the web Stripe Payment Links have no trial — don't claim one. */}
              <span className="ml-auto text-xs text-gray-400">{showNativeFooter ? '7-day free trial' : 'Cancel anytime'}</span>
            </div>
            <ul className="space-y-1.5">
              {FIGHTER_PRO_FEATURES.slice(0, 5).map(f => (
                <li key={f} className="flex items-start gap-2 text-xs text-gray-300">
                  <Check size={11} className="text-brand-400 mt-0.5 flex-shrink-0" />
                  {f}
                </li>
              ))}
              <li className="text-xs text-gray-500">+ {FIGHTER_PRO_FEATURES.length - 5} more features</li>
            </ul>
            <div className="flex items-center justify-between pt-1">
              <div>
                {billing === 'monthly' ? (
                  <>
                    <span className="text-xl font-black text-white">{PRICES.fighter.monthly}</span>
                    <span className="text-xs text-gray-400">/mo</span>
                  </>
                ) : (
                  <>
                    <span className="text-xl font-black text-white">{PRICES.fighter.annual}</span>
                    <span className="text-xs text-gray-400">/yr</span>
                    <p className="text-xs text-brand-400">{PRICES.fighter.annualMonthly}/mo · save {PRICES.fighter.saving}</p>
                  </>
                )}
              </div>
              <button
                onClick={() => handleSubscribe('fighter')}
                disabled={loading}
                className="btn-primary text-sm py-2 px-4 disabled:opacity-50"
              >
                {loading ? '...' : showNativeFooter ? 'Start Free Trial' : 'Subscribe'}
              </button>
            </div>
          </div>

          {/* Coach Pro card */}
          <div className="bg-gradient-to-br from-purple-900/30 to-dark-700 border border-purple-700/40 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Trophy size={16} className="text-purple-400" />
              <span className="text-sm font-bold text-white">Coach Pro</span>
              <span className="ml-auto text-xs text-gray-400">{showNativeFooter ? '7-day free trial' : 'Cancel anytime'}</span>
            </div>
            <ul className="space-y-1.5">
              {COACH_PRO_FEATURES.map(f => (
                <li key={f} className="flex items-start gap-2 text-xs text-gray-300">
                  <Check size={11} className="text-purple-400 mt-0.5 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between pt-1">
              <div>
                {billing === 'monthly' ? (
                  <>
                    <span className="text-xl font-black text-white">{PRICES.coach.monthly}</span>
                    <span className="text-xs text-gray-400">/mo</span>
                  </>
                ) : (
                  <>
                    <span className="text-xl font-black text-white">{PRICES.coach.annual}</span>
                    <span className="text-xs text-gray-400">/yr</span>
                    <p className="text-xs text-purple-400">{PRICES.coach.annualMonthly}/mo · save {PRICES.coach.saving}</p>
                  </>
                )}
              </div>
              <button
                onClick={() => handleSubscribe('coach')}
                disabled={loading}
                className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm py-2 px-4 rounded-xl transition-all active:scale-95 disabled:opacity-50"
              >
                {loading ? '...' : showNativeFooter ? 'Start Free Trial' : 'Subscribe'}
              </button>
            </div>
          </div>

          {notice && (
            <p className="text-center text-xs text-brand-400 font-medium">{notice}</p>
          )}

          <p className="text-center text-[11px] leading-relaxed text-gray-600">
            {showNativeFooter
              ? 'Subscriptions auto-renew until canceled. Your Apple ID is charged at confirmation of purchase, then again within 24 hours before each period ends. Manage or cancel anytime in your device Settings.'
              : 'Cancel anytime. No commitment required.'}
          </p>

          <p className="text-center text-[11px] text-gray-500">
            <a href="https://fightcamp.netlify.app/terms.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">Terms of Use (EULA)</a>
            <span className="mx-1.5">·</span>
            <a href="https://fightcamp.netlify.app/privacy.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300">Privacy Policy</a>
          </p>

          {showNativeFooter && (
            <button
              onClick={handleRestore}
              disabled={loading}
              className="text-xs text-gray-500 underline block mx-auto disabled:opacity-50"
            >
              Restore Purchases
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
