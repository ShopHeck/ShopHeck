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
  // When the software keyboard opens, visualViewport.height shrinks while
  // window.innerHeight stays fixed. Shift the sheet up by the difference so
  // the footer (submit button) stays visible above the keyboard.
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    document.body.style.overflow = 'hidden';

    const vv = window.visualViewport;
    if (vv) {
      const update = () => setKeyboardOffset(Math.max(0, window.innerHeight - vv.height));
      vv.addEventListener('resize', update);
      update(); // initialise in case keyboard is already up
      return () => {
        document.body.style.overflow = '';
        vv.removeEventListener('resize', update);
      };
    }

    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-dark-700 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-dark-400 max-h-[90dvh] flex flex-col"
        style={{
          marginBottom: keyboardOffset,
          transition: 'margin-bottom 120ms ease-out',
        }}
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
