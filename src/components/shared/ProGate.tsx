import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Lock, Crown, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { isPro, isCoachPro } from '../../utils/subscription';
import type { SubscriptionTier } from '../../types';
import UpgradeModal from './UpgradeModal';

interface ProGateProps {
  required: Exclude<SubscriptionTier, 'free'>;
  children: React.ReactNode;
  /** When true, wraps children with a lock-badge overlay instead of blocking entirely */
  inline?: boolean;
  /**
   * When true, render a full-page upgrade screen (icon, title, description and a
   * prominent Upgrade button) instead of dimming the children. Use this for
   * whole-view gates so a locked feature never looks like a blank screen.
   */
  page?: boolean;
  /** Human label for the gated feature, shown on the full-page upgrade screen. */
  feature?: string;
  /** Short description of what the feature does, shown on the full-page upgrade screen. */
  featureDescription?: string;
  /** What the feature includes — the gate sells specifics, not just a sentence. */
  bullets?: string[];
  /** Optional callback when the locked area is tapped (overrides default modal) */
  onUpgrade?: () => void;
}

/**
 * Wraps a feature behind a subscription gate.
 * - If the user has the required tier: renders children normally.
 * - If not: renders children dimmed with a PRO lock badge overlay.
 *   Tapping the overlay opens UpgradeModal (or calls onUpgrade if provided).
 */
export default function ProGate({
  required,
  children,
  inline = true,
  page = false,
  feature,
  featureDescription,
  bullets,
  onUpgrade,
}: ProGateProps) {
  const { state } = useApp();
  const [showModal, setShowModal] = useState(false);

  const sub = state.subscription;
  const hasAccess = required === 'coach_pro' ? isCoachPro(sub) : isPro(sub);

  if (hasAccess) return <>{children}</>;

  const handleTap = () => {
    if (onUpgrade) onUpgrade();
    else setShowModal(true);
  };

  // Full-page upsell: a real screen with copy + CTA, never a blank/dimmed view.
  if (page) {
    const tierLabel = required === 'coach_pro' ? 'Coach Pro' : 'Fighter Pro';
    return (
      <>
        <div className="mx-4 mt-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-900/40 border border-brand-700/50 flex items-center justify-center mb-4">
            <Crown size={28} className="text-brand-400" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-brand-400 mb-1">{tierLabel}</span>
          <h2 className="text-lg font-black text-white mb-2">{feature ?? 'This is a Pro feature'}</h2>
          {featureDescription && (
            <p className={`text-sm text-gray-400 max-w-xs leading-relaxed ${bullets?.length ? 'mb-4' : 'mb-6'}`}>{featureDescription}</p>
          )}
          {bullets && bullets.length > 0 && (
            <ul className="text-left space-y-1.5 mb-6 max-w-xs w-full">
              {bullets.map(b => (
                <li key={b} className="flex items-start gap-2 text-sm text-gray-300">
                  <Check size={13} className="text-brand-400 mt-0.5 flex-shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
          )}
          <button onClick={handleTap} className="btn-primary px-6 py-3 text-sm font-semibold flex items-center gap-2">
            <Lock size={14} />
            Unlock with {tierLabel}
          </button>
          {/* Trial exists only on the App Store (RevenueCat); web Stripe links have none. */}
          <p className="text-xs text-gray-500 mt-3">
            {Capacitor.isNativePlatform() ? '7-day free trial · cancel anytime' : 'Cancel anytime'}
          </p>
        </div>
        {showModal && <UpgradeModal onClose={() => setShowModal(false)} />}
      </>
    );
  }

  if (!inline) {
    return (
      <>
        <button
          onClick={handleTap}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-600 border border-dark-400 text-gray-400 text-sm cursor-pointer hover:border-brand-600 transition-colors"
        >
          <Lock size={13} className="text-brand-500" />
          <span>PRO</span>
        </button>
        {showModal && <UpgradeModal onClose={() => setShowModal(false)} />}
      </>
    );
  }

  return (
    <>
      <div className="relative">
        <div className="pointer-events-none opacity-40">{children}</div>
        <button
          onClick={handleTap}
          className="absolute inset-0 flex items-center justify-center rounded-lg"
          aria-label="Upgrade to Pro to unlock this feature"
        >
          <span className="flex items-center gap-1.5 bg-dark-800/90 border border-brand-600/60 rounded-full px-3 py-1 text-xs font-bold text-brand-400 shadow-lg">
            <Lock size={11} />
            PRO
          </span>
        </button>
      </div>
      {showModal && <UpgradeModal onClose={() => setShowModal(false)} />}
    </>
  );
}
