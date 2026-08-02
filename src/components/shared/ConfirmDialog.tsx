import { AlertTriangle } from 'lucide-react';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The app's one delete/confirm pattern — native confirm() sheets look foreign
 * on iOS and can't be styled or made consistent with the rest of the UI.
 */
export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onCancel} />
      <div role="alertdialog" aria-label={title} className="relative bg-dark-700 rounded-2xl border border-dark-400 p-5 w-full max-w-sm">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 ${danger ? 'bg-red-900/40' : 'bg-brand-900/40'}`}>
          <AlertTriangle size={22} className={danger ? 'text-red-400' : 'text-brand-400'} />
        </div>
        <h3 className="text-base font-bold text-white text-center mb-2">{title}</h3>
        <p className="text-sm text-gray-400 text-center mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95 ${danger ? 'bg-red-700 hover:bg-red-600 text-white' : 'btn-primary'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
