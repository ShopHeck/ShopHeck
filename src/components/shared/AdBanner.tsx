import { useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { isPro } from '../../utils/subscription';

const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
const ADSENSE_SLOT   = import.meta.env.VITE_ADSENSE_SLOT_BANNER as string | undefined;

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

export default function AdBanner() {
  const { state } = useApp();
  const pushed = useRef(false);

  // Pro subscribers see no ads
  if (isPro(state.subscription)) return null;
  // Don't render if AdSense isn't configured yet
  if (!ADSENSE_CLIENT || !ADSENSE_SLOT) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch { /* noop */ }
  }, []);

  return (
    <div className="flex-shrink-0 bg-dark-800 border-t border-dark-600" style={{ minHeight: 50 }}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', height: 50 }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={ADSENSE_SLOT}
        data-ad-format="banner"
        data-full-width-responsive="false"
      />
    </div>
  );
}
