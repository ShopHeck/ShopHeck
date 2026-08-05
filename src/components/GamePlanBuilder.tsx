import { useState, useEffect } from 'react';
import { Shield, Target, AlertTriangle, MessageSquare, User, ChevronDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { GamePlan } from '../types';

const STANCES = ['Orthodox', 'Southpaw', 'Switch'] as const;

const EMPTY_PLAN: Omit<GamePlan, 'campId' | 'updatedAt'> = {
  opponentName: '',
  opponentStance: undefined,
  opponentHeight: '',
  opponentReach: '',
  styleNotes: '',
  earlyRoundPlan: '',
  midRoundPlan: '',
  lateRoundPlan: '',
  keyTechniques: '',
  thingsToAvoid: '',
  cornerInstructions: '',
};

export default function GamePlanBuilder() {
  const { state, dispatch } = useApp();
  const { activeCamp, gamePlans } = state;

  const existing = activeCamp ? gamePlans[activeCamp.id] : null;
  const [form, setForm] = useState<Omit<GamePlan, 'campId' | 'updatedAt'>>(
    existing ? {
      opponentName: existing.opponentName ?? '',
      opponentStance: existing.opponentStance,
      opponentHeight: existing.opponentHeight ?? '',
      opponentReach: existing.opponentReach ?? '',
      styleNotes: existing.styleNotes,
      earlyRoundPlan: existing.earlyRoundPlan,
      midRoundPlan: existing.midRoundPlan,
      lateRoundPlan: existing.lateRoundPlan,
      keyTechniques: existing.keyTechniques,
      thingsToAvoid: existing.thingsToAvoid,
      cornerInstructions: existing.cornerInstructions,
    } : { ...EMPTY_PLAN }
  );
  const [saved, setSaved] = useState(false);

  // Auto-load when camp changes
  const activeCampId = activeCamp?.id;
  useEffect(() => {
    const p = activeCampId ? gamePlans[activeCampId] : null;
    if (p) {
      setForm({
        opponentName: p.opponentName ?? '',
        opponentStance: p.opponentStance,
        opponentHeight: p.opponentHeight ?? '',
        opponentReach: p.opponentReach ?? '',
        styleNotes: p.styleNotes,
        earlyRoundPlan: p.earlyRoundPlan,
        midRoundPlan: p.midRoundPlan,
        lateRoundPlan: p.lateRoundPlan,
        keyTechniques: p.keyTechniques,
        thingsToAvoid: p.thingsToAvoid,
        cornerInstructions: p.cornerInstructions,
      });
    } else {
      setForm({ ...EMPTY_PLAN });
    }
    // `gamePlans` is a real dependency: it is also how a cloud restore that
    // lands while this screen is mounted reaches the form. The only in-app
    // writer is this screen's own save, after which the form already matches,
    // so re-hydrating on it is harmless.
  }, [activeCampId, gamePlans]);

  const set = (key: keyof typeof form, val: string) => {
    setForm(f => ({ ...f, [key]: val }));
    setSaved(false);
  };

  const save = () => {
    if (!activeCamp) return;
    dispatch({
      type: 'SAVE_GAME_PLAN',
      payload: {
        ...form,
        campId: activeCamp.id,
        updatedAt: new Date().toISOString(),
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!activeCamp) {
    return (
      <div className="mx-4 mt-4 card text-center py-12">
        <Shield size={40} className="text-gray-450 mx-auto mb-3" />
        <p className="text-gray-400 font-semibold">No active fight camp</p>
        <p className="text-sm text-gray-450 mt-1">Set up a fight camp to build your game plan</p>
      </div>
    );
  }

  const opponentDisplay = form.opponentName || activeCamp.opponent || 'Unknown Opponent';

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="mx-4 mt-4 bg-gradient-to-br from-red-900/30 to-dark-700 rounded-2xl border border-red-900/40 p-4">
        <p className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-1">Fight Game Plan</p>
        <p className="text-white font-bold text-lg">vs {opponentDisplay}</p>
        <p className="text-gray-400 text-sm">{activeCamp.rounds}R · {activeCamp.roundDuration}min · {activeCamp.weightClass}</p>
      </div>

      {/* Opponent Info */}
      <section className="mx-4">
        <div className="flex items-center gap-2 mb-2">
          <User size={14} className="text-gray-400" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Opponent Intel</p>
        </div>
        <div className="card space-y-3">
          <div>
            <label className="block">
              <span className="label">Opponent Name</span>
              <input
              className="input"
              placeholder="e.g. John Smith"
              value={form.opponentName}
              onChange={e => set('opponentName', e.target.value)}
            />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label" htmlFor="gameplan-stance">Stance</label>
              <div className="relative">
                <select
                  id="gameplan-stance"
                  className="input appearance-none pr-8"
                  value={form.opponentStance ?? ''}
                  onChange={e => set('opponentStance', e.target.value)}
                >
                  <option value="">–</option>
                  {STANCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block">
                <span className="label">Height</span>
                <input
                className="input"
                placeholder="5'11&quot;"
                value={form.opponentHeight}
                onChange={e => set('opponentHeight', e.target.value)}
              />
              </label>
            </div>
            <div>
              <label className="block">
                <span className="label">Reach</span>
                <input
                className="input"
                placeholder='74"'
                value={form.opponentReach}
                onChange={e => set('opponentReach', e.target.value)}
              />
              </label>
            </div>
          </div>
          <div>
            <label className="block">
              <span className="label">Style & Tendencies</span>
              <textarea
              className="input resize-none"
              rows={3}
              placeholder="e.g. Heavy southpaw, likes to come forward, strong left hand, tends to drop right hand after jab..."
              value={form.styleNotes}
              onChange={e => set('styleNotes', e.target.value)}
            />
            </label>
          </div>
        </div>
      </section>

      {/* Round-by-Round Plan */}
      <section className="mx-4">
        <div className="flex items-center gap-2 mb-2">
          <Target size={14} className="text-gray-400" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Round-by-Round Strategy</p>
        </div>
        <div className="card space-y-4">
          <div>
            <label className="block">
              <span className="label">Early Rounds (Rds 1–3)</span>
              <textarea
              className="input resize-none"
              rows={3}
              placeholder="e.g. Use the jab to establish range, stay on the outside, feel him out, don't get drawn into exchanges..."
              value={form.earlyRoundPlan}
              onChange={e => set('earlyRoundPlan', e.target.value)}
            />
            </label>
          </div>
          <div>
            <label className="block">
              <span className="label">Middle Rounds (Rds 4–8)</span>
              <textarea
              className="input resize-none"
              rows={3}
              placeholder="e.g. Start working the body, look to cut the ring, step up pressure after establishing jab..."
              value={form.midRoundPlan}
              onChange={e => set('midRoundPlan', e.target.value)}
            />
            </label>
          </div>
          {activeCamp.rounds > 8 && (
            <div>
              <label className="block">
                <span className="label">Championship Rounds (Rds 9+)</span>
                <textarea
                className="input resize-none"
                rows={3}
                placeholder="e.g. Push the pace, take calculated risks, work the combinations..."
                value={form.lateRoundPlan}
                onChange={e => set('lateRoundPlan', e.target.value)}
              />
              </label>
            </div>
          )}
        </div>
      </section>

      {/* Weapons & Threats */}
      <section className="mx-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={14} className="text-gray-400" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Weapons & Threats</p>
        </div>
        <div className="card space-y-4">
          <div>
            <label className="block">
              <span className="label">Key Techniques to Execute</span>
              <textarea
              className="input resize-none"
              rows={3}
              placeholder="e.g. Jab-cross-left hook, right uppercut on the inside, left hook to the body..."
              value={form.keyTechniques}
              onChange={e => set('keyTechniques', e.target.value)}
            />
            </label>
          </div>
          <div>
            <label className="block">
              <span className="label">Things to Watch Out For</span>
              <textarea
              className="input resize-none"
              rows={3}
              placeholder="e.g. Dangerous right hand counter, strong clinch game, tends to headbutt when pressured..."
              value={form.thingsToAvoid}
              onChange={e => set('thingsToAvoid', e.target.value)}
            />
            </label>
          </div>
        </div>
      </section>

      {/* Corner Instructions */}
      <section className="mx-4">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare size={14} className="text-gray-400" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Corner Instructions</p>
        </div>
        <div className="card">
          <label className="block">
            <span className="label">Between-Round Cues</span>
            <textarea
            className="input resize-none"
            rows={4}
            placeholder="e.g. Stay relaxed, hands up, jab jab cross, work the body, don't let him breathe, move after combinations..."
            value={form.cornerInstructions}
            onChange={e => set('cornerInstructions', e.target.value)}
          />
          </label>
        </div>
      </section>

      {/* Save */}
      <div className="mx-4">
        <button
          onClick={save}
          className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-98 ${
            saved
              ? 'bg-green-700 text-green-100'
              : 'btn-primary'
          }`}
        >
          {saved ? '✓ Game Plan Saved' : 'Save Game Plan'}
        </button>
        {existing && (
          <p className="text-center text-xs text-gray-450 mt-2">
            Last updated {new Date(existing.updatedAt).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}
