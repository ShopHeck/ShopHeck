import { useState } from 'react';
import { X, Check, Zap, Trophy } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { RevenueCat } from '../../plugins/RevenueCat';
import { useApp } from '../../context/AppContext';

interface Props {
  onClose: () => void;
}

const FIGHTER_PRO_FEATURES = [
  'Gym Display — fullscreen big-screen mode',
  '8 saved custom timer presets',
  'Warning bell > 10 seconds',
  'Sport-specific reaction prompts',
  'Timer session history',
  'AI Insights & coach analysis',
  'Apple Health sync',
  'Game Plan Builder',
  'Nutrition tracker',
  'Unlimited fight camps',
];

const COACH_PRO_FEATURES = [
  'Everything in Fighter Pro',
  'Coach dashboard & fighter notes',
  'Unlimited linked fighters',
  'Team analytics overview',
];

// Stripe Payment Link URLs — set via .env (see .env.example)
// Each link's success URL must include: ?tier=fighter_pro&stripe_session={CHECKOUT_SESSION_ID}
const LINKS = {
  fighter: {
    monthly: import.meta.env.VITE_STRIPE_FIGHTER_PRO_MONTHLY as string | undefined,
    annual:  import.meta.env.VITE_STRIPE_FIGHTER_PRO_ANNUAL  as string | undefined,
  },
  coach: {
    monthly: import.meta.env.VITE_STRIPE_COACH_PRO_MONTHLY as string | undefined,
    annual:  import.meta.env.VITE_STRIPE_COACH_PRO_ANNUAL  as string | undefined,
  },
};

const PRICES = {
  fighter: { monthly: '$7.99', annual: '$59.99', annualMonthly: '$5.00', saving: '37%' },
  coach:   { monthly: '$19.99', annual: '$149.99', annualMonthly: '$12.50', saving: '37%' },
};

const PRO_SUBSCRIPTION = { tier: 'fighter_pro' as const, expiresAt: null, source: 'revenuecat' as const };

export default function UpgradeModal({ onClose }: Props) {
  const { dispatch } = useApp();
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubscribe(tier: 'fighter' | 'coach') {
    if (Capacitor.isNativePlatform()) {
      setLoading(true);
      try {
        await RevenueCat.presentPaywall();
        const { isPro } = await RevenueCat.getCustomerInfo();
        if (isPro) {
          dispatch({ type: 'SET_SUBSCRIPTION', payload: PRO_SUBSCRIPTION });
          onClose();
        }
      } catch {
        setNotice('Purchase failed. Please try again.');
      } finally {
        setLoading(false);
      }
    } else {
      const url = LINKS[tier][billing];
      if (url) {
        window.location.href = url;
      } else {
        setNotice('Payment links not yet configured — check back soon!');
      }
    }
  }

  async function handleRestore() {
    if (!Capacitor.isNativePlatform()) return;
    setLoading(true);
    try {
      const { isPro } = await RevenueCat.restorePurchases();
      if (isPro) {
        dispatch({ type: 'SET_SUBSCRIPTION', payload: PRO_SUBSCRIPTION });
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
              <span className="ml-auto text-xs text-gray-400">7-day free trial</span>
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
                {loading ? '...' : 'Start Free Trial'}
              </button>
            </div>
          </div>

          {/* Coach Pro card */}
          <div className="bg-gradient-to-br from-purple-900/30 to-dark-700 border border-purple-700/40 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Trophy size={16} className="text-purple-400" />
              <span className="text-sm font-bold text-white">Coach Pro</span>
              <span className="ml-auto text-xs text-gray-400">7-day free trial</span>
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
                {loading ? '...' : 'Start Free Trial'}
              </button>
            </div>
          </div>

          {notice && (
            <p className="text-center text-xs text-brand-400 font-medium">{notice}</p>
          )}

          <p className="text-center text-xs text-gray-600">
            Cancel anytime. No commitment required.
          </p>

          {Capacitor.isNativePlatform() && (
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
