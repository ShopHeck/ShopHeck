import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Rendered in a sticky footer below the scrollable content — ideal for submit buttons */
  footer?: React.ReactNode;
}

export default function Modal({ title, onClose, children, footer }: Props) {
  // Use JS-computed pixel height instead of dvh/vh CSS units.
  // visualViewport shrinks when keyboard opens (works with resize:'native' in Capacitor).
  // This avoids: dvh browser support gaps, fixed-in-scrollable-container WKWebView bugs,
  // and stacking context issues from opacity animations on ancestor elements.
  const [maxH, setMaxH] = useState(() => {
    const h = window.visualViewport?.height ?? window.innerHeight;
    return `${Math.floor(h * 0.92)}px`;
  });

  useEffect(() => {
    document.body.style.overflow = 'hidden';

    const update = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      setMaxH(`${Math.floor(h * 0.92)}px`);
    };

    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);

    return () => {
      document.body.style.overflow = '';
      window.visualViewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    // z-[200] ensures this is above bottom nav (z-50) regardless of any ancestor stacking context
    <div className="fixed inset-0 z-[200]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      {/* absolute bottom-0 avoids flex centering issues; sm:relative for desktop centering */}
      <div
        className="absolute bottom-0 left-0 right-0 sm:relative sm:mx-auto sm:bottom-auto sm:max-w-lg bg-dark-700 rounded-t-2xl sm:rounded-2xl border border-dark-400 flex flex-col sm:my-auto"
        style={{ maxHeight: maxH }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-dark-500 flex-shrink-0">
          <h2 className="text-base font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
            <X size={20} />
          </button>
        </div>
        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 p-4">
          {children}
        </div>
        {/* Sticky footer for submit button */}
        {footer && (
          <div
            className="flex-shrink-0 px-4 pb-4 pt-3 border-t border-dark-500"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
