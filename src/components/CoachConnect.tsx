import { useEffect, useState } from 'react';
import { Link2, Copy, Check, Users, AlertCircle, Unlink, Share2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  createInvite, listInvites, redeemInvite, unlinkAllCoaches,
  createFighterInvite, redeemFighterInvite, hasActiveCoachLink,
} from '../lib/coachLinks';

const APP_URL = 'https://fightcamp.netlify.app';

/**
 * Settings card for cloud coach<->fighter linking. Works from either side:
 * coaches mint codes fighters redeem, and fighters mint codes to share OUT to
 * a coach who isn't on the app yet (the invite-your-coach loop — every
 * invited coach is a prospective Coach Pro account). Only meaningful when
 * signed in.
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
  const [shared, setShared] = useState(false);

  // Coach side: redeeming a code a fighter shared
  const [fighterEntry, setFighterEntry] = useState('');
  const [fighterLinked, setFighterLinked] = useState(false);

  useEffect(() => {
    if (!configured || !user) return;
    if (role === 'coach') {
      listInvites(user.id).then(setCodes);
    } else {
      // Linked state must come from the server: the link can be created from
      // the COACH's side (redeeming a shared fighter code), and the Unlink
      // button is the fighter's only way to revoke that access.
      hasActiveCoachLink(user.id).then(setLinked);
    }
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

  /** Fighter → coach: share the app + a redeemable code in one message. */
  async function inviteCoach() {
    if (!user) return;
    setBusy(true);
    setError('');
    // Fresh code per share: fighter codes are single-use (consumed on
    // redemption — they grant access to this fighter's data), so a reused
    // code could already be spent by the time the second recipient tries it.
    const res = await createFighterInvite(user.id);
    if (res.error || !res.code) {
      setBusy(false);
      setError(res.error ?? 'Could not create an invite.');
      return;
    }
    const code = res.code;
    const message =
      `Be my coach on Fight Camp Training 🥊 Get the app at ${APP_URL}, ` +
      `create a coach account, then enter my code ${code} under Settings → Your Fighters ` +
      `to see my full camp — training, sparring, weight cut and readiness.`;
    try {
      if (navigator.share) {
        await navigator.share({ text: message });
        setShared(true);
        setTimeout(() => setShared(false), 2500);
      } else {
        await navigator.clipboard.writeText(message);
        setCopied('invite');
        setTimeout(() => setCopied(''), 2500);
      }
    } catch { /* user closed the share sheet — not an error */ }
    setBusy(false);
  }

  /** Coach: redeem a code a fighter shared out. */
  async function connectFighter() {
    if (!fighterEntry.trim()) return;
    setBusy(true);
    setError('');
    const res = await redeemFighterInvite(fighterEntry);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setFighterLinked(true);
    setFighterEntry('');
  }

  return (
    <div className="mx-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
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
                <p className="text-xs text-gray-400">Share a code — once they enter it, you'll see their training.</p>
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

            {/* The other direction: a fighter shared THEIR code with this coach. */}
            <div className="border-t border-dark-600 pt-3">
              <p className="text-xs text-gray-400 mb-2">Got a code from a fighter? Enter it to add them to your roster.</p>
              {fighterLinked ? (
                <div className="flex items-center gap-2 bg-green-900/20 border border-green-800/40 rounded-xl px-3 py-2.5 text-sm text-green-400">
                  <Check size={16} /> Fighter linked — they're on your dashboard.
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    className="input flex-1 font-mono tracking-[0.2em] uppercase"
                    placeholder="CODE"
                    maxLength={6}
                    value={fighterEntry}
                    onChange={e => setFighterEntry(e.target.value.toUpperCase())}
                  />
                  <button onClick={connectFighter} disabled={busy || !fighterEntry.trim()} className="btn-primary px-4 disabled:opacity-50">
                    {busy ? '…' : 'Add'}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-brand-900/40 rounded-xl flex items-center justify-center flex-shrink-0">
                <Link2 size={18} className="text-brand-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Connect your coach</p>
                <p className="text-xs text-gray-400">Enter the invite code your coach gave you.</p>
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

            {/* The outbound loop: coach isn't on the app yet, so send them the
                app + a code in one message instead of waiting for one. */}
            <div className="border-t border-dark-600 pt-3">
              <p className="text-xs text-gray-400 mb-2">
                Coach not on the app yet? Send them the app and your code in one message — when they
                join, they'll see your whole camp.
              </p>
              <button onClick={inviteCoach} disabled={busy} className="btn-secondary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                <Share2 size={16} />
                {busy ? '…' : shared ? 'Invite sent' : copied === 'invite' ? 'Invite copied' : 'Invite your coach'}
              </button>
            </div>
          </>
        )}

        {error && <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle size={12} /> {error}</p>}
      </div>
    </div>
  );
}
