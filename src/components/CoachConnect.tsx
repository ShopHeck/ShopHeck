import { useEffect, useState } from 'react';
import { Link2, Copy, Check, Users, AlertCircle, Unlink } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { createInvite, listInvites, redeemInvite, unlinkAllCoaches } from '../lib/coachLinks';

/**
 * Settings card for cloud coach<->fighter linking. Coaches mint invite codes;
 * fighters redeem them. Only meaningful when signed in.
 */
export default function CoachConnect() {
  const { state } = useApp();
  const { configured, user } = useAuth();
  const role = state.currentUser?.role ?? 'fighter';

  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  // Fighter side
  const [entry, setEntry] = useState('');
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    if (configured && user && role === 'coach') listInvites(user.id).then(setCodes);
  }, [configured, user, role]);

  if (!configured || !user) return null;

  async function generate() {
    if (!user) return;
    setBusy(true);
    setError('');
    const res = await createInvite(user.id);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    if (res.code) setCodes(prev => [res.code!, ...prev]);
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(''), 1500);
    } catch { /* clipboard unavailable */ }
  }

  async function connect() {
    if (!entry.trim()) return;
    setBusy(true);
    setError('');
    const res = await redeemInvite(entry);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setLinked(true);
    setEntry('');
  }

  async function unlink() {
    if (!user) return;
    await unlinkAllCoaches(user.id);
    setLinked(false);
  }

  return (
    <div className="mx-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        {role === 'coach' ? 'Your Fighters' : 'Your Coach'}
      </p>
      <div className="card space-y-3">
        {role === 'coach' ? (
          <>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-brand-900/40 rounded-xl flex items-center justify-center flex-shrink-0">
                <Users size={18} className="text-brand-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Invite a fighter</p>
                <p className="text-xs text-gray-500">Share a code — once they enter it, you'll see their training.</p>
              </div>
            </div>

            {codes.length > 0 && (
              <div className="space-y-2">
                {codes.map(code => (
                  <div key={code} className="flex items-center justify-between bg-dark-700 border border-dark-500 rounded-xl px-3 py-2">
                    <span className="font-mono text-lg font-bold tracking-[0.3em] text-white">{code}</span>
                    <button onClick={() => copy(code)} className="flex items-center gap-1 text-xs font-semibold text-brand-400 hover:text-brand-300">
                      {copied === code ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button onClick={generate} disabled={busy} className="btn-secondary w-full flex items-center justify-center gap-2 disabled:opacity-50">
              <Link2 size={16} /> {busy ? '…' : 'Generate invite code'}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-brand-900/40 rounded-xl flex items-center justify-center flex-shrink-0">
                <Link2 size={18} className="text-brand-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Connect your coach</p>
                <p className="text-xs text-gray-500">Enter the invite code your coach gave you.</p>
              </div>
            </div>

            {linked ? (
              <div className="flex items-center justify-between bg-green-900/20 border border-green-800/40 rounded-xl px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm text-green-400"><Check size={16} /> Connected to your coach</span>
                <button onClick={unlink} className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-red-400">
                  <Unlink size={14} /> Unlink
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  className="input flex-1 font-mono tracking-[0.2em] uppercase"
                  placeholder="CODE"
                  maxLength={6}
                  value={entry}
                  onChange={e => setEntry(e.target.value.toUpperCase())}
                />
                <button onClick={connect} disabled={busy || !entry.trim()} className="btn-primary px-4 disabled:opacity-50">
                  {busy ? '…' : 'Connect'}
                </button>
              </div>
            )}
          </>
        )}

        {error && <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle size={12} /> {error}</p>}
      </div>
    </div>
  );
}
