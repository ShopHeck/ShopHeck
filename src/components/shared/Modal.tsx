import { X } from 'lucide-react';
import { useEffect } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Rendered in a sticky footer below the scrollable content — ideal for submit buttons */
  footer?: React.ReactNode;
}

export default function Modal({ title, onClose, children, footer }: Props) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-dark-700 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-dark-400 max-h-[90vh] flex flex-col">
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
