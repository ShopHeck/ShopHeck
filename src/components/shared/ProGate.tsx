import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { isPro, isCoachPro } from '../../utils/subscription';
import type { SubscriptionTier } from '../../types';
import UpgradeModal from './UpgradeModal';

interface ProGateProps {
  required: Exclude<SubscriptionTier, 'free'>;
  children: React.ReactNode;
  /** When true, wraps children with a lock-badge overlay instead of blocking entirely */
  inline?: boolean;
  /** Optional callback when the locked area is tapped (overrides default modal) */
  onUpgrade?: () => void;
}

/**
 * Wraps a feature behind a subscription gate.
 * - If the user has the required tier: renders children normally.
 * - If not: renders children dimmed with a PRO lock badge overlay.
 *   Tapping the overlay opens UpgradeModal (or calls onUpgrade if provided).
 */
export default function ProGate({ required, children, inline = true, onUpgrade }: ProGateProps) {
  const { state } = useApp();
  const [showModal, setShowModal] = useState(false);

  const sub = state.subscription;
  const hasAccess = required === 'coach_pro' ? isCoachPro(sub) : isPro(sub);

  if (hasAccess) return <>{children}</>;

  const handleTap = () => {
    if (onUpgrade) onUpgrade();
    else setShowModal(true);
  };

  if (!inline) {
    return (
      <>
        <button
          onClick={handleTap}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-600 border border-dark-400 text-gray-500 text-sm cursor-pointer hover:border-brand-600 transition-colors"
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
