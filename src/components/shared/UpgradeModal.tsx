import { useState } from 'react';
import { X, Check, Zap, Trophy } from 'lucide-react';

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

export default function UpgradeModal({ onClose }: Props) {
  const [notice, setNotice] = useState('');

  function handleSubscribe(tier: 'fighter' | 'coach') {
    // TODO: Replace with real Stripe Payment Link URLs once created in Stripe dashboard.
    // URL should include ?tier=fighter_pro&stripe_session={CHECKOUT_SESSION_ID} on success
    // so processStripeReturn() can unlock the subscription client-side.
    setNotice(`${tier === 'fighter' ? 'Fighter Pro' : 'Coach Pro'} payments are coming soon — stay tuned!`);
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
                <span className="text-xl font-black text-white">$7.99</span>
                <span className="text-xs text-gray-400">/mo</span>
                <p className="text-xs text-gray-500">or $59.99/yr (save 37%)</p>
              </div>
              <button
                onClick={() => handleSubscribe('fighter')}
                className="btn-primary text-sm py-2 px-4"
              >
                Start Free Trial
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
                <span className="text-xl font-black text-white">$19.99</span>
                <span className="text-xs text-gray-400">/mo</span>
                <p className="text-xs text-gray-500">or $149.99/yr (save 37%)</p>
              </div>
              <button
                onClick={() => handleSubscribe('coach')}
                className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm py-2 px-4 rounded-xl transition-all active:scale-95"
              >
                Start Free Trial
              </button>
            </div>
          </div>

          {notice && (
            <p className="text-center text-xs text-brand-400 font-medium">{notice}</p>
          )}

          <p className="text-center text-xs text-gray-600">
            Cancel anytime. No commitment required.
          </p>
        </div>
      </div>
    </div>
  );
}
