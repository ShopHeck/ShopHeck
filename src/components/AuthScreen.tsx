import { useState } from 'react';
import { X, Mail, Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AppleSignInButton from './shared/AppleSignInButton';

interface Props {
  onClose: () => void;
}

type Mode = 'signin' | 'signup';

export default function AuthScreen({ onClose }: Props) {
  const { signInEmail, signUpEmail, signInApple } = useAuth();
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

  async function apple() {
    setError('');
    setLoading(true);
    const res = await signInApple();
    setLoading(false);
    if (res.error) setError(res.error);
    // On success the OAuth redirect takes over.
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dark-800 rounded-2xl border border-dark-500 w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-wider">Account</p>
            <h2 className="text-lg font-black text-white leading-tight">
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1 transition-colors"><X size={20} /></button>
        </div>

        <div className="px-5 pb-5 space-y-3">
          <p className="text-xs text-gray-500">
            Sync your camps across devices{mode === 'signin' ? '' : ' and connect with your coach'}. Optional — the app works fine without an account.
          </p>

          <AppleSignInButton onClick={apple} disabled={loading} />

          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-dark-500" />
            <span className="text-xs text-gray-600">or</span>
            <div className="flex-1 h-px bg-dark-500" />
          </div>

          {mode === 'signup' && (
            <input className="input" placeholder="Name (optional)" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
          )}
          <div className="relative">
            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input className="input pl-9" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" />
          </div>
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input className="input pl-9" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
          </div>

          {error && <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle size={12} /> {error}</p>}
          {notice && <p className="text-xs text-green-400 flex items-center gap-1.5"><CheckCircle size={12} /> {notice}</p>}

          <button onClick={submit} disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>

          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setNotice(''); }}
            className="text-xs text-gray-500 hover:text-gray-300 block mx-auto"
          >
            {mode === 'signin' ? "New here? Create an account" : 'Have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
