import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Rendered in a sticky footer below the scrollable content — ideal for submit buttons */
  footer?: React.ReactNode;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ title, onClose, children, footer }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Latest onClose without re-running the mount effect (which owns body scroll
  // lock and focus restore, and must run exactly once per open).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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

    // Dialog semantics: take focus on open, hold Tab inside, hand focus back
    // to the opener on close (keyboard and VoiceOver users otherwise land in
    // the page behind the sheet).
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => el.offsetParent !== null);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    const update = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      setMaxH(`${Math.floor(h * 0.92)}px`);
    };

    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown, true);
      window.visualViewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
      opener?.focus();
    };
  }, []);

  return (
    // z-[200] ensures this is above bottom nav (z-50) regardless of any ancestor stacking context
    <div className="fixed inset-0 z-[200]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      {/* absolute bottom-0 avoids flex centering issues; sm:relative for desktop centering */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute bottom-0 left-0 right-0 sm:relative sm:mx-auto sm:bottom-auto sm:max-w-lg bg-dark-700 rounded-t-2xl sm:rounded-2xl border border-dark-400 flex flex-col sm:my-auto outline-none"
        style={{ maxHeight: maxH }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-dark-500 flex-shrink-0">
          <h2 id={titleId} className="text-base font-bold text-white">{title}</h2>
          {/* p-3 -m-2 keeps the visual size while growing the hit area to ~44pt */}
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white transition-colors p-3 -m-2">
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
