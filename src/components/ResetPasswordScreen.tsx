import { useId, useState } from 'react';
import { Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../hooks/useDialog';
import { passwordProblem } from '../utils/authRecovery';

/**
 * The other half of "Forgot your password?".
 *
 * Shown when the app was opened from a recovery link. Deliberately **not**
 * dismissable by backdrop tap or Escape: at this point the recovery session is
 * live and the link is already spent, so a stray tap would leave the fighter
 * signed in with the password they could not remember and no way back to this
 * screen. The explicit "I'll do this later" button is the only way out, and it
 * says what it costs.
 */
export default function ResetPasswordScreen() {
  const titleId = useId();
  const { recovery, completePasswordReset, dismissRecovery } = useAuth();
  // onClose is a no-op: useDialog still gives focus trapping and initial focus,
  // which is what this needs. Escape deliberately does nothing here.
  const panelRef = useDialog({ onClose: () => {} });

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit() {
    setError('');
    const problem = passwordProblem(password, confirm);
    if (problem) { setError(problem); return; }

    setLoading(true);
    const res = await completePasswordReset(password);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    setDone(true);
  }

  // A link that expired or was already used. There is no session and nothing to
  // set, so this offers the one useful next step rather than a dead form.
  if (recovery.error) {
    return (
      <div className="fixed inset-0 bg-black/85 z-[70] flex items-center justify-center p-4">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="bg-dark-800 rounded-2xl border border-dark-500 w-full max-w-sm p-5 outline-none"
        >
          <div className="w-12 h-12 rounded-xl bg-red-900/40 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={22} className="text-red-400" />
          </div>
          <h2 id={titleId} className="text-base font-bold text-white text-center mb-2">
            That link didn&apos;t work
          </h2>
          <p className="text-sm text-gray-400 text-center mb-6">{recovery.error}</p>
          <button onClick={dismissRecovery} className="btn-primary w-full">Back to the app</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-[70] flex items-center justify-center p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-dark-800 rounded-2xl border border-dark-500 w-full max-w-sm p-5 outline-none"
      >
        {done ? (
          <>
            <div className="w-12 h-12 rounded-xl bg-green-900/40 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={22} className="text-green-400" />
            </div>
            <h2 id={titleId} className="text-base font-bold text-white text-center mb-2">
              Password updated
            </h2>
            <p className="text-sm text-gray-400 text-center mb-6">
              You&apos;re signed in. Use the new password next time.
            </p>
            <button onClick={dismissRecovery} className="btn-primary w-full">Continue</button>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-wider">Account</p>
            <h2 id={titleId} className="text-lg font-black text-white leading-tight mb-1">
              Set a new password
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              You opened a reset link. Choose a new password to finish.
            </p>

            <div className="space-y-3">
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="input pl-9"
                  type="password"
                  placeholder="New password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="input pl-9"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void submit(); }}
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                  <AlertCircle size={12} /> {error}
                </p>
              )}

              <button onClick={submit} disabled={loading} className="btn-primary w-full disabled:opacity-50">
                {loading ? '…' : 'Save new password'}
              </button>
              {/* Names the cost. Backing out here means the spent link cannot be
                  reused, so the honest label is not "Cancel". */}
              <button
                onClick={dismissRecovery}
                className="text-xs text-gray-400 hover:text-gray-300 block mx-auto"
              >
                I&apos;ll do this later — I&apos;ll need a new reset link
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
