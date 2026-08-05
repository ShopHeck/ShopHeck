import { useState, useId } from 'react';
import { X, Mail, Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AppleSignInButton from './shared/AppleSignInButton';
import { useDialog } from '../hooks/useDialog';

interface Props {
  onClose: () => void;
}

type Mode = 'signin' | 'signup' | 'reset';

export default function AuthScreen({ onClose }: Props) {
  const titleId = useId();
  const panelRef = useDialog({ onClose });
  const { signInEmail, signUpEmail, signInApple, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit() {
    setError('');
    setNotice('');

    if (mode === 'reset') {
      if (!email.trim()) {
        setError('Enter the email address on your account.');
        return;
      }
      setLoading(true);
      const res = await resetPassword(email);
      setLoading(false);
      if (res.error) { setError(res.error); return; }
      // Worded so it says nothing about whether the address has an account —
      // the context layer deliberately doesn't reveal that, and neither should
      // the copy.
      setNotice('If that email has an account, a reset link is on its way.');
      return;
    }

    if (!email.trim() || password.length < 6) {
      setError('Enter an email and a password of at least 6 characters.');
      return;
    }
    setLoading(true);
    const res = mode === 'signin'
      ? await signInEmail(email, password)
      : await signUpEmail(email, password, name.trim() || undefined);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    if ('needsConfirmation' in res && res.needsConfirmation) {
      setNotice('Check your email to confirm your account, then sign in.');
      setMode('signin');
      return;
    }
    onClose(); // signed in
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setNotice('');
  }

  async function apple() {
    setError('');
    setLoading(true);
    const res = await signInApple();
    setLoading(false);
    if (res.error) setError(res.error);
    // On success the OAuth redirect takes over.
  }

  // A backdrop tap used to discard a half-typed form silently. Only the
  // explicit close button does that now; tapping outside is a no-op once
  // there's something on the form to lose.
  const hasDraft = !!(name || email || password);

  return (
    <div
      className="fixed inset-0 bg-black/80 z-[60] flex items-end sm:items-center justify-center p-4"
      onClick={hasDraft ? undefined : onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-dark-800 rounded-2xl border border-dark-500 w-full max-w-sm overflow-hidden outline-none"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-wider">Account</p>
            <h2 id={titleId} className="text-lg font-black text-white leading-tight">
              {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white p-3 -m-2 transition-colors"><X size={20} /></button>
        </div>

        <div className="px-5 pb-5 space-y-3">
          <p className="text-xs text-gray-400">
            {mode === 'reset'
              ? 'Enter your email and we’ll send you a link to set a new password.'
              : `Sync your camps across devices${mode === 'signin' ? '' : ' and connect with your coach'}. Optional — the app works fine without an account.`}
          </p>

          {/* Apple sign-in and the "or" divider are hidden while resetting:
              they offer a different way in, not a way to finish this task, and
              an Apple-only account has no password to reset in the first place. */}
          {mode !== 'reset' && (
            <>
              <AppleSignInButton onClick={apple} disabled={loading} />

              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-dark-500" />
                <span className="text-xs text-gray-450">or</span>
                <div className="flex-1 h-px bg-dark-500" />
              </div>
            </>
          )}

          {mode === 'signup' && (
            <input className="input" placeholder="Name (optional)" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
          )}
          <div className="relative">
            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" />
          </div>
          {mode !== 'reset' && (
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input pl-9" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
            </div>
          )}

          {error && <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle size={12} /> {error}</p>}
          {notice && <p className="text-xs text-green-400 flex items-center gap-1.5"><CheckCircle size={12} /> {notice}</p>}

          <button onClick={submit} disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? '…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </button>

          {mode === 'signin' && (
            <button
              onClick={() => switchMode('reset')}
              className="text-xs text-gray-400 hover:text-gray-300 block mx-auto"
            >
              Forgot your password?
            </button>
          )}

          <button
            onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
            className="text-xs text-gray-400 hover:text-gray-300 block mx-auto"
          >
            {mode === 'signin' ? 'New here? Create an account'
              : mode === 'signup' ? 'Have an account? Sign in'
              : 'Back to sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
