import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { isPro } from '../../utils/subscription';

const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
const ADSENSE_SLOT   = import.meta.env.VITE_ADSENSE_SLOT_BANNER as string | undefined;

/**
 * Whether Google's AdSense library is actually on the page.
 *
 * The loader <script> in index.html is commented out, so `window.adsbygoogle`
 * never exists and the `push({})` below only appends to a plain array. With
 * both env vars set, that rendered a permanently blank 50px strip above the tab
 * bar for every free user — real layout cost, no ad. Configuration alone is not
 * enough; the library has to be there too. Uncommenting the loader in
 * index.html is all that is needed to turn the banner back on.
 */
function adsenseLoaderPresent(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector('script[src*="pagead2.googlesyndication.com"]');
}

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

export default function AdBanner() {
  const { state } = useApp();
  const pushed = useRef(false);
  // Evaluated once — the loader is a static tag in index.html's <head>, so it
  // is either there at first paint or not there at all.
  const [loaderPresent] = useState(adsenseLoaderPresent);

  // Pro subscribers see no ads; nothing renders until AdSense is configured AND
  // its library is actually loaded.
  // NB: compute these as values — never early-return before the hook below, or
  // the hook count changes when `isPro` flips (e.g. a subscription sync lands)
  // and React throws "rendered fewer hooks than expected".
  const showAd = !isPro(state.subscription) && !!ADSENSE_CLIENT && !!ADSENSE_SLOT && loaderPresent;

  // Request the ad once, after the <ins> is in the DOM. The hook runs on every
  // render (Rules of Hooks); the guard lives inside it.
  useEffect(() => {
    if (!showAd || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch { /* noop */ }
  }, [showAd]);

  if (!showAd) return null;

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
