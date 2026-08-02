import { useRef, useState } from 'react';
import { Flame, ChevronRight, Shield, User, X, Check, CheckCircle, Zap, Dumbbell, Cloud } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import AuthScreen from './AuthScreen';
import AppMark from './shared/AppMark';
import UpgradeModal from './shared/UpgradeModal';
import { PRICES } from '../utils/pricing';
import { isPro } from '../utils/subscription';
import type { Sport, WeightClass, ExperienceLevel, UserRole, OffSeasonGoal } from '../types';
import { addDays, format } from 'date-fns';
import { parseWeightInput, weightRangeHint } from '../utils/validation';

const OFF_SEASON_GOALS: { value: OffSeasonGoal; label: string; desc: string }[] = [
  { value: 'base-building', label: 'Base Building', desc: 'Aerobic engine, technical drilling, volume work' },
  { value: 'strength',      label: 'Build Strength', desc: 'Power, hypertrophy, functional strength' },
  { value: 'maintain',      label: 'Maintain & Sharpen', desc: 'Balanced training to stay competition-ready' },
  { value: 'recovery',      label: 'Active Recovery', desc: 'Light training, deload, coming back from injury' },
];

const WEIGHT_CLASSES: WeightClass[] = [
  'Strawweight', 'Flyweight', 'Bantamweight', 'Featherweight',
  'Lightweight', 'Welterweight', 'Middleweight', 'Light Heavyweight',
  'Heavyweight', 'Super Heavyweight',
];

const SPORTS: Sport[] = ['Boxing', 'MMA', 'Muay Thai', 'Kickboxing', 'Wrestling', 'BJJ', 'Bare Knuckle'];

const EXPERIENCE_LEVELS: ExperienceLevel[] = ['Beginner', 'Amateur', 'Semi-Pro', 'Professional'];

interface Props {
  campOnly?: boolean;
  /** Pre-selects off-season mode and hides the fight camp toggle */
  offSeasonOnly?: boolean;
  onClose?: () => void;
}

export default function Onboarding({ campOnly = false, offSeasonOnly = false, onClose }: Props) {
  const { state, dispatch } = useApp();
  const unit = state.dashboardPrefs?.weightUnit ?? 'lbs';
  const { configured: authConfigured, user: authUser } = useAuth();
  const [step, setStep] = useState(campOnly ? 1 : 0);
  const [role, setRole] = useState<UserRole>('fighter');

  // First-run account gate: offer cloud account vs. guest before the profile form.
  const [continueAsGuest, setContinueAsGuest] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  // Profile
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sport, setSport] = useState<Sport>('Boxing');
  const [weightClass, setWeightClass] = useState<WeightClass>('Lightweight');
  const [experience, setExperience] = useState<ExperienceLevel>('Amateur');
  const [gym, setGym] = useState('');

  // Camp mode
  const [isOffSeason, setIsOffSeason] = useState(offSeasonOnly);
  const [offSeasonGoal, setOffSeasonGoal] = useState<OffSeasonGoal>('maintain');

  // Camp
  const [fightDate, setFightDate] = useState('');
  const [opponent, setOpponent] = useState('');
  const [rounds, setRounds] = useState('3');
  const [roundDuration, setRoundDuration] = useState('3');
  const [currentWeight, setCurrentWeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [campWeeks, setCampWeeks] = useState('8');

  // 7-day floor (matching the camp editor in Settings) — short-notice fights
  // are exactly who downloads a fight-camp app; the generator clamps the
  // current week, so a camp that starts "in the past" still renders correctly.
  const minDate = format(addDays(new Date(), 7), 'yyyy-MM-dd');
  const maxDate = format(addDays(new Date(), 365), 'yyyy-MM-dd');

  // Pro offer step: shown once, after the camp is generated (peak intent) and
  // never to accounts that already have Pro (comp sign-ins, restored users).
  const [showUpgrade, setShowUpgrade] = useState(false);
  const alreadyPro = isPro(state.subscription);

  function handleProfileNext() {
    if (!name.trim() || !age) return;
    if (role === 'coach') {
      setStep(4);
    } else {
      setStep(1);
    }
  }

  // A fight camp's start/target weights drive the cut projection and the
  // unsafe-cut alert from day one, so they're required and range-checked. In
  // off-season mode both are optional (the fields say so) and simply omitted.
  const parsedCurrentWeight = parseWeightInput(currentWeight, unit);
  const parsedTargetWeight = parseWeightInput(targetWeight, unit);
  const campWeightsOk = isOffSeason
    ? (!currentWeight.trim() || parsedCurrentWeight !== null) &&
      (!targetWeight.trim() || parsedTargetWeight !== null)
    : parsedCurrentWeight !== null && parsedTargetWeight !== null;
  const showWeightHint =
    (currentWeight.trim() !== '' && parsedCurrentWeight === null) ||
    (targetWeight.trim() !== '' && parsedTargetWeight === null);
  const canContinueCamp = (isOffSeason || !!fightDate) && campWeightsOk;

  function handleCampNext() {
    if (!canContinueCamp) return;
    setStep(2);
  }

  // The profile/camp dispatches live in commitDraft (idempotent) rather than
  // only in handleFinish: the web checkout on the offer step leaves the page
  // via a Stripe redirect, and without committing first the paying user would
  // return to a wiped, restarted onboarding. Once CREATE_PROFILE lands,
  // AppShell switches to the main app, so the Stripe return loads a working
  // dashboard whether the purchase completed or was abandoned.
  const draftCommitted = useRef(false);

  function commitDraft() {
    if (draftCommitted.current) return;
    draftCommitted.current = true;
    if (!campOnly) {
      dispatch({
        type: 'CREATE_PROFILE',
        payload: {
          name: name.trim(),
          age: parseInt(age),
          sport,
          weightClass,
          experienceLevel: experience,
          role,
          gym: gym.trim() || undefined,
        },
      });
    }

    if (campOnly || role === 'fighter') {
      // Date math is camp-only — coaches skip CREATE_CAMP and never reach this branch.
      // Computing startDate unconditionally would throw for coaches because fightDate is empty.
      const campWeeksNum = isOffSeason ? 12 : parseInt(campWeeks);
      const startDate = isOffSeason
        ? format(new Date(), 'yyyy-MM-dd')
        : format(addDays(new Date(fightDate), -(campWeeksNum * 7)), 'yyyy-MM-dd');

      const user = state.currentUser;
      dispatch({
        type: 'CREATE_CAMP',
        payload: {
          fightDate: isOffSeason ? undefined : fightDate,
          opponent: (!isOffSeason && opponent.trim()) ? opponent.trim() : undefined,
          weightClass: campOnly ? (user?.weightClass ?? weightClass) : weightClass,
          currentWeight: parsedCurrentWeight ?? 0,
          targetWeight: parsedTargetWeight ?? parsedCurrentWeight ?? 0,
          rounds: parseInt(rounds),
          roundDuration: parseInt(roundDuration),
          sport: campOnly ? (user?.sport ?? sport) : sport,
          experienceLevel: campOnly ? (user?.experienceLevel ?? experience) : experience,
          campWeeks: campWeeksNum,
          startDate,
          isOffSeason: isOffSeason || undefined,
          offSeasonGoal: isOffSeason ? offSeasonGoal : undefined,
        },
      });
    }
  }

  function handleFinish() {
    commitDraft();
    onClose?.();
  }

  // ─── campOnly modal (unchanged) ─────────────────────────────────────────────
  if (campOnly) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-dark-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-dark-400 max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-4 py-4 border-b border-dark-500 flex-shrink-0">
            <h2 className="text-base font-bold text-white">
              {step === 1
                ? (isOffSeason ? 'Off Season Plan' : 'New Fight Camp')
                : (isOffSeason ? 'Plan Ready!' : 'Camp Generated!')}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
              <X size={20} />
            </button>
          </div>
          <div className="overflow-y-auto flex-1 px-4 py-4">
            {step === 1 && (
              <div className="flex flex-col gap-5">
                {/* Mode toggle — hidden when offSeasonOnly is forced from outside */}
                {!offSeasonOnly && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setIsOffSeason(false)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${!isOffSeason ? 'border-brand-500 bg-brand-900/30 text-brand-400' : 'border-dark-400 bg-dark-700 text-gray-400 hover:border-dark-300'}`}
                    >
                      <Flame size={20} />
                      <span className="text-xs font-semibold">Fight Camp</span>
                    </button>
                    <button
                      onClick={() => setIsOffSeason(true)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${isOffSeason ? 'border-teal-500 bg-teal-900/20 text-teal-400' : 'border-dark-400 bg-dark-700 text-gray-400 hover:border-dark-300'}`}
                    >
                      <Dumbbell size={20} />
                      <span className="text-xs font-semibold">Off Season</span>
                    </button>
                  </div>
                )}

                {/* Off Season Goal Selector */}
                {isOffSeason ? (
                  <div>
                    <label className="label">Training Goal</label>
                    <div role="group" aria-label="Training Goal" className="flex flex-col gap-2">
                      {OFF_SEASON_GOALS.map(g => (
                        <button
                          key={g.value}
                          onClick={() => setOffSeasonGoal(g.value)}
                          className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all text-left ${offSeasonGoal === g.value ? 'border-teal-500 bg-teal-900/20' : 'border-dark-400 bg-dark-700 hover:border-dark-300'}`}
                        >
                          <div className={`mt-0.5 w-3 h-3 rounded-full border-2 flex-shrink-0 ${offSeasonGoal === g.value ? 'border-teal-400 bg-teal-400' : 'border-gray-600'}`} />
                          <div>
                            <p className={`text-sm font-bold ${offSeasonGoal === g.value ? 'text-teal-300' : 'text-white'}`}>{g.label}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{g.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block">
                        <span className="label">Fight Date *</span>
                        <input className="input" type="date" min={minDate} value={fightDate} onChange={e => setFightDate(e.target.value)} />
                      </label>
                    </div>
                    <div>
                      <label className="block">
                        <span className="label">Opponent (Optional)</span>
                        <input className="input" placeholder="Opponent's name" value={opponent} onChange={e => setOpponent(e.target.value)} />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setRounds('5'); setRoundDuration('2'); }}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left w-full ${rounds === '5' && roundDuration === '2' ? 'border-red-600 bg-red-950/30' : 'border-dark-400 bg-dark-700 hover:border-red-800/60'}`}
                    >
                      <div className="w-9 h-9 bg-red-900/40 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Flame size={16} className="text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white">BKFC Format</p>
                        <p className="text-xs text-red-400">5 rounds · 2 min · 1 min rest — bare knuckle rules</p>
                      </div>
                      {rounds === '5' && roundDuration === '2' && (
                        <CheckCircle size={16} className="text-red-400 flex-shrink-0" />
                      )}
                    </button>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block">
                          <span className="label">Rounds</span>
                          <select className="select" value={rounds} onChange={e => setRounds(e.target.value)}>
                          {[3,4,5,6,8,10,12,15].map(n => <option key={n} value={n}>{n} rounds</option>)}
                        </select>
                        </label>
                      </div>
                      <div>
                        <label className="block">
                          <span className="label">Round Duration</span>
                          <select className="select" value={roundDuration} onChange={e => setRoundDuration(e.target.value)}>
                          <option value="2">2 minutes</option>
                          <option value="3">3 minutes</option>
                          <option value="5">5 minutes</option>
                        </select>
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {/* Weight fields — always shown, optional in off-season */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block">
                      <span className="label">Current Weight ({unit}){!isOffSeason && ' *'}</span>
                      <input className="input" type="number" placeholder={isOffSeason ? 'optional' : 'e.g. 160'} value={currentWeight} onChange={e => setCurrentWeight(e.target.value)} />
                    </label>
                  </div>
                  <div>
                    <label className="block">
                      <span className="label">{isOffSeason ? `Goal Weight (${unit})` : `Target Weight (${unit}) *`}</span>
                      <input className="input" type="number" placeholder={isOffSeason ? 'optional' : 'e.g. 155'} value={targetWeight} onChange={e => setTargetWeight(e.target.value)} />
                    </label>
                  </div>
                </div>
                {showWeightHint && (
                  <p className="-mt-3 text-xs text-red-400">{weightRangeHint(unit)}</p>
                )}

                {/* Camp Length — fight camp only (off-season is always 12 weeks) */}
                {!isOffSeason && (
                  <div>
                    <label className="label">Camp Length</label>
                    <div role="group" aria-label="Camp Length" className="grid grid-cols-3 gap-2">
                      {['6','8','10'].map(w => (
                        <button key={w} onClick={() => setCampWeeks(w)}
                          className={`py-3 rounded-xl text-sm font-semibold border-2 transition-all ${campWeeks === w ? 'border-brand-500 bg-brand-900/30 text-brand-400' : 'border-dark-400 bg-dark-600 text-gray-400'}`}>
                          {w} Weeks
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleCampNext}
                  disabled={!canContinueCamp}
                  className={`flex items-center justify-center gap-2 disabled:opacity-50 ${isOffSeason ? 'btn-secondary border-2 border-teal-700 !bg-teal-900/30 !text-teal-300 hover:!bg-teal-900/50' : 'btn-primary'}`}
                >
                  {isOffSeason ? <><Dumbbell size={16} /> Generate Off Season Plan</> : <><Flame size={16} /> Generate Camp</>}
                </button>
              </div>
            )}
            {step === 2 && (
              <div className="flex flex-col gap-5 text-center">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-lg ${isOffSeason ? 'bg-teal-700' : 'bg-brand-600'}`}>
                  {isOffSeason ? <Dumbbell size={32} className="text-white" /> : <Flame size={32} className="text-white" />}
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">{isOffSeason ? 'Off Season Plan Ready!' : 'Camp Generated!'}</h3>
                  <p className="text-gray-400 text-sm mt-1">
                    {isOffSeason ? '12-week off season program is ready.' : `Your ${campWeeks}-week program is ready.`}
                  </p>
                </div>
                <div className="bg-dark-600 rounded-xl border border-dark-400 p-4 text-left space-y-2">
                  {isOffSeason ? (
                    <>
                      <div className="flex justify-between"><span className="text-gray-500 text-sm">Mode</span><span className="text-teal-400 font-bold text-sm">Off Season</span></div>
                      <div className="flex justify-between"><span className="text-gray-500 text-sm">Goal</span><span className="text-white font-semibold text-sm capitalize">{OFF_SEASON_GOALS.find(g => g.value === offSeasonGoal)?.label}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500 text-sm">Duration</span><span className="text-teal-400 font-bold text-sm">12 Weeks (3 cycles)</span></div>
                      {currentWeight && <div className="flex justify-between"><span className="text-gray-500 text-sm">Starting Weight</span><span className="text-white font-semibold text-sm">{currentWeight} {unit}</span></div>}
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between"><span className="text-gray-500 text-sm">Fight Date</span><span className="text-white font-semibold text-sm">{new Date(fightDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500 text-sm">Camp Length</span><span className="text-brand-400 font-bold text-sm">{campWeeks} Weeks</span></div>
                      <div className="flex justify-between"><span className="text-gray-500 text-sm">Weight Cut</span><span className="text-white font-semibold text-sm">{currentWeight} → {targetWeight} {unit}</span></div>
                    </>
                  )}
                </div>
                <button onClick={handleFinish} className={`flex items-center justify-center gap-2 ${isOffSeason ? 'btn-secondary border-2 border-teal-700 !bg-teal-900/30 !text-teal-300' : 'btn-primary'}`}>
                  {isOffSeason ? 'Start Off Season' : 'Start Camp'} <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Account gate (first run, before the profile form) ──────────────────────
  // Shown only when cloud accounts are available and nobody is signed in. Signing
  // in restores an existing user's data; guests skip straight to profile setup.
  if (!campOnly && authConfigured && !authUser && !continueAsGuest) {
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col">
        <div className="relative overflow-hidden bg-gradient-to-b from-brand-900/40 to-dark-900 px-6 pt-16 pb-8 text-center">
          <div className="relative">
            <AppMark size={72} rounded="rounded-2xl" className="mx-auto mb-4 shadow-lg shadow-black/50" />
            <h1 className="text-3xl font-black text-white mb-2 tracking-tight">FIGHT CAMP</h1>
            <p className="text-brand-400 font-semibold text-sm uppercase tracking-widest">Training Platform</p>
            <p className="text-gray-400 text-sm mt-3 max-w-xs mx-auto">
              Plan your camp. Track your progress. Win on fight night.
            </p>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full px-5 gap-4">
          <div className="flex items-start gap-3 text-left bg-dark-800/60 border border-dark-600 rounded-xl p-3.5">
            <Cloud size={18} className="text-brand-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-gray-400 leading-relaxed">
              Create an account to back up your camps and sync across devices — or jump
              straight in as a guest. You can always create one later in Settings.
            </p>
          </div>

          <button onClick={() => setShowAuth(true)} className="btn-primary w-full flex items-center justify-center gap-2">
            <User size={18} /> Create account or sign in
          </button>
          <button
            onClick={() => setContinueAsGuest(true)}
            className="btn-secondary w-full"
          >
            Continue as guest
          </button>
        </div>

        {showAuth && <AuthScreen onClose={() => setShowAuth(false)} />}
      </div>
    );
  }

  // ─── Full first-run onboarding ───────────────────────────────────────────────

  // Step indicator dots — only shown during the fighter "form" steps
  // (0 profile, 1 camp). Coaches have a single form step, so no dots.
  const dotSteps = [0, 1];
  const showDots = role !== 'coach' && dotSteps.includes(step);

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      {/* Hero banner — only on step 0 */}
      {step === 0 && (
        <div className="relative overflow-hidden bg-gradient-to-b from-brand-900/40 to-dark-900 px-6 pt-16 pb-8 text-center">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23f97316%22%20fill-opacity%3D%220.03%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-30" />
          <div className="relative">
            <AppMark size={72} rounded="rounded-2xl" className="mx-auto mb-4 shadow-lg shadow-black/50" />
            <h1 className="text-3xl font-black text-white mb-2 tracking-tight">FIGHT CAMP</h1>
            <p className="text-brand-400 font-semibold text-sm uppercase tracking-widest">Training Platform</p>
            <p className="text-gray-400 text-sm mt-3 max-w-xs mx-auto">
              Plan your camp. Track your progress. Win on fight night.
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col max-w-lg mx-auto w-full px-4 pb-8">
        {/* Step dots */}
        {showDots && (
          <div className="flex gap-2 justify-center py-4">
            {dotSteps.map(s => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  s === step ? 'w-8 bg-brand-500' : s < step ? 'w-4 bg-brand-700' : 'w-4 bg-dark-500'
                }`}
              />
            ))}
          </div>
        )}

        {/* ── Step 0: Role + Profile ── */}
        {step === 0 && (
          <div className="flex flex-col gap-5 mt-2">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">I am a...</p>
              <div className="grid grid-cols-2 gap-3">
                {(['fighter', 'coach'] as UserRole[]).map(r => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      role === r
                        ? 'border-brand-500 bg-brand-900/30 text-brand-400'
                        : 'border-dark-400 bg-dark-700 text-gray-400 hover:border-dark-300'
                    }`}
                  >
                    {r === 'fighter' ? <User size={28} /> : <Shield size={28} />}
                    <span className="font-semibold capitalize">{r}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block">
                <span className="label">Full Name *</span>
                <input className="input" placeholder="Enter your name" value={name} onChange={e => setName(e.target.value)} />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block">
                  <span className="label">Age *</span>
                  <input className="input" type="number" placeholder="Age" min={16} max={60} value={age} onChange={e => setAge(e.target.value)} />
                </label>
              </div>
              <div>
                <label className="block">
                  <span className="label">Sport *</span>
                  <select className="select" value={sport} onChange={e => setSport(e.target.value as Sport)}>
                  {SPORTS.map(s => <option key={s}>{s}</option>)}
                </select>
                </label>
              </div>
            </div>

            <div>
              <label className="block">
                <span className="label">Weight Class *</span>
                <select className="select" value={weightClass} onChange={e => setWeightClass(e.target.value as WeightClass)}>
                {WEIGHT_CLASSES.map(wc => <option key={wc}>{wc}</option>)}
              </select>
              </label>
            </div>

            <div>
              <label className="label">Experience Level *</label>
              <div role="group" aria-label="Experience Level" className="grid grid-cols-2 gap-2">
                {EXPERIENCE_LEVELS.map(level => (
                  <button
                    key={level}
                    onClick={() => setExperience(level)}
                    className={`py-2.5 px-3 rounded-xl text-sm font-medium border-2 transition-all ${
                      experience === level
                        ? 'border-brand-500 bg-brand-900/30 text-brand-400'
                        : 'border-dark-400 bg-dark-700 text-gray-400 hover:border-dark-300'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block">
                <span className="label">Gym / Team (Optional)</span>
                <input className="input" placeholder="Your gym or team name" value={gym} onChange={e => setGym(e.target.value)} />
              </label>
            </div>

            <button
              onClick={handleProfileNext}
              disabled={!name.trim() || !age}
              className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {role === 'coach' ? 'Next: Quick Setup' : 'Next: Set Up Fight Camp'}
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* ── Step 1: Training Setup ── */}
        {step === 1 && (
          <div className="flex flex-col gap-5 mt-2">
            <div>
              <h2 className="text-xl font-black text-white">
                {isOffSeason ? 'Off Season Setup' : 'Fight Camp Setup'}
              </h2>
              <p className="text-gray-500 text-sm mt-1">
                {isOffSeason ? 'Set your goal and start training' : 'Tell us about your upcoming fight'}
              </p>
            </div>

            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setIsOffSeason(false)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 transition-all text-sm font-semibold ${!isOffSeason ? 'border-brand-500 bg-brand-900/30 text-brand-400' : 'border-dark-400 bg-dark-700 text-gray-400 hover:border-dark-300'}`}
              >
                <Flame size={16} /> Fight Camp
              </button>
              <button
                onClick={() => setIsOffSeason(true)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 transition-all text-sm font-semibold ${isOffSeason ? 'border-teal-500 bg-teal-900/20 text-teal-400' : 'border-dark-400 bg-dark-700 text-gray-400 hover:border-dark-300'}`}
              >
                <Dumbbell size={16} /> Off Season
              </button>
            </div>

            {/* Off Season Goal Selector */}
            {isOffSeason ? (
              <div>
                <label className="label">Training Goal</label>
                <div role="group" aria-label="Training Goal" className="flex flex-col gap-2">
                  {OFF_SEASON_GOALS.map(g => (
                    <button
                      key={g.value}
                      onClick={() => setOffSeasonGoal(g.value)}
                      className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all text-left ${offSeasonGoal === g.value ? 'border-teal-500 bg-teal-900/20' : 'border-dark-400 bg-dark-700 hover:border-dark-300'}`}
                    >
                      <div className={`mt-0.5 w-3 h-3 rounded-full border-2 flex-shrink-0 ${offSeasonGoal === g.value ? 'border-teal-400 bg-teal-400' : 'border-gray-600'}`} />
                      <div>
                        <p className={`text-sm font-bold ${offSeasonGoal === g.value ? 'text-teal-300' : 'text-white'}`}>{g.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{g.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div>
                  <label className="block">
                    <span className="label">Fight Date *</span>
                    <input className="input" type="date" min={minDate} max={maxDate} value={fightDate} onChange={e => setFightDate(e.target.value)} />
                  </label>
                </div>
                <div>
                  <label className="block">
                    <span className="label">Opponent (Optional)</span>
                    <input className="input" placeholder="Opponent's name" value={opponent} onChange={e => setOpponent(e.target.value)} />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => { setRounds('5'); setRoundDuration('2'); }}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left w-full ${rounds === '5' && roundDuration === '2' ? 'border-red-600 bg-red-950/30' : 'border-dark-400 bg-dark-700 hover:border-red-800/60'}`}
                >
                  <div className="w-9 h-9 bg-red-900/40 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Flame size={16} className="text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">BKFC Format</p>
                    <p className="text-xs text-red-400">5 rounds · 2 min · 1 min rest — bare knuckle rules</p>
                  </div>
                  {rounds === '5' && roundDuration === '2' && (
                    <CheckCircle size={16} className="text-red-400 flex-shrink-0" />
                  )}
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block">
                      <span className="label">Rounds</span>
                      <select className="select" value={rounds} onChange={e => setRounds(e.target.value)}>
                      {[3, 4, 5, 6, 8, 10, 12, 15].map(n => (
                        <option key={n} value={n}>{n} rounds</option>
                      ))}
                    </select>
                    </label>
                  </div>
                  <div>
                    <label className="block">
                      <span className="label">Round Duration</span>
                      <select className="select" value={roundDuration} onChange={e => setRoundDuration(e.target.value)}>
                      <option value="2">2 minutes</option>
                      <option value="3">3 minutes</option>
                      <option value="5">5 minutes</option>
                    </select>
                    </label>
                  </div>
                </div>
              </>
            )}

            {/* Weight fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block">
                  <span className="label">Current Weight ({unit}){!isOffSeason && ' *'}</span>
                  <input className="input" type="number" placeholder={isOffSeason ? 'optional' : 'e.g. 160'} value={currentWeight} onChange={e => setCurrentWeight(e.target.value)} />
                </label>
              </div>
              <div>
                <label className="block">
                  <span className="label">{isOffSeason ? `Goal Weight (${unit})` : `Target Weight (${unit}) *`}</span>
                  <input className="input" type="number" placeholder={isOffSeason ? 'optional' : 'e.g. 155'} value={targetWeight} onChange={e => setTargetWeight(e.target.value)} />
                </label>
              </div>
            </div>
            {showWeightHint && (
              <p className="-mt-3 text-xs text-red-400">{weightRangeHint(unit)}</p>
            )}

            {/* Camp Length — fight camp only */}
            {!isOffSeason && (
              <div>
                <label className="label">Camp Length</label>
                <div role="group" aria-label="Camp Length" className="grid grid-cols-3 gap-2">
                  {['6', '8', '10'].map(w => (
                    <button
                      key={w}
                      onClick={() => setCampWeeks(w)}
                      className={`py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                        campWeeks === w
                          ? 'border-brand-500 bg-brand-900/30 text-brand-400'
                          : 'border-dark-400 bg-dark-700 text-gray-400 hover:border-dark-300'
                      }`}
                    >
                      {w} Weeks
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleCampNext}
              disabled={!canContinueCamp}
              className={`flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${isOffSeason ? 'btn-secondary border-2 border-teal-700 !bg-teal-900/30 !text-teal-300 hover:!bg-teal-900/50' : 'btn-primary'}`}
            >
              {isOffSeason ? <><Dumbbell size={18} /> Generate Off Season Plan</> : <>Generate Training Camp <Flame size={18} /></>}
            </button>
          </div>
        )}

        {/* ── Step 2: Preview ── */}
        {step === 2 && (
          <div className="flex flex-col gap-6 mt-4 text-center">
            <div className="flex justify-center">
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center shadow-xl ${isOffSeason ? 'bg-teal-700 shadow-teal-900/50' : 'bg-brand-600 shadow-brand-900/50'}`}>
                {isOffSeason ? <Dumbbell size={40} className="text-white" /> : <Flame size={40} className="text-white" />}
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-black text-white">
                {isOffSeason ? 'Off Season Plan Ready!' : 'Camp Generated!'}
              </h2>
              <p className="text-gray-400 mt-2 text-sm">
                {isOffSeason
                  ? 'Your 12-week program is set. Stay consistent, build your base.'
                  : `Your ${campWeeks}-week training program is ready. Stay disciplined, trust the process.`}
              </p>
            </div>

            <div className="bg-dark-700 rounded-xl border border-dark-500 p-4 text-left space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-sm">{isOffSeason ? 'Athlete' : 'Fighter'}</span>
                <span className="text-white font-semibold">{name}</span>
              </div>
              {isOffSeason ? (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">Mode</span>
                    <span className="text-teal-400 font-bold">Off Season</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">Goal</span>
                    <span className="text-white font-semibold">{OFF_SEASON_GOALS.find(g => g.value === offSeasonGoal)?.label}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">Duration</span>
                    <span className="text-teal-400 font-bold">12 Weeks · 3 Cycles</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">Fight Date</span>
                    <span className="text-white font-semibold">{new Date(fightDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">Weight Class</span>
                    <span className="text-white font-semibold">{weightClass}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">Camp Duration</span>
                    <span className="text-brand-400 font-bold">{campWeeks} Weeks</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">Weight Cut</span>
                    <span className="text-white font-semibold">{currentWeight} → {targetWeight} {unit}</span>
                  </div>
                </>
              )}
            </div>

            <button onClick={() => setStep(alreadyPro ? 4 : 3)} className={`flex items-center justify-center gap-2 text-lg py-4 ${isOffSeason ? 'btn-secondary border-2 border-teal-700 !bg-teal-900/30 !text-teal-300' : 'btn-primary'}`}>
              Continue
              <ChevronRight size={20} />
            </button>
          </div>
        )}

        {/* ── Step 3: Pro offer — one honest, skippable screen at peak intent.
               Rendered from live subscription state, not step number alone:
               the moment a purchase (native sheet, restore, comp) flips the
               account Pro, this screen yields to the finish screen — no stale
               callback deciding the advance. ── */}
        {step === 3 && !alreadyPro && (
          <div className="flex flex-col gap-5 mt-4">
            <div>
              <h2 className="text-2xl font-black text-white">Your camp is built.</h2>
              <p className="text-gray-500 text-sm mt-1">
                Everything below is free. Pro adds your corner team.
              </p>
            </div>

            <div className="card">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Free — yours already</p>
              <ul className="space-y-1.5">
                {[
                  'Periodized week-by-week camp plan',
                  'Pro round timer with live heart-rate zones',
                  'Training, sparring & weigh-in logging',
                  'Progress charts & fight readiness',
                ].map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-400">
                    <Check size={13} className="text-gray-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-gradient-to-br from-brand-900/40 to-dark-700 border border-brand-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={15} className="text-brand-400" />
                <p className="text-sm font-bold text-white">Fighter Pro adds</p>
                {Capacitor.isNativePlatform() && (
                  <span className="ml-auto text-xs text-gray-400">7-day free trial</span>
                )}
              </div>
              <ul className="space-y-1.5">
                {[
                  'Your AI corner — camp insights, cut guidance & post-fight breakdowns',
                  'Nutrition tracking with macro targets',
                  'Game plan builder for your opponent',
                  'Unlimited camps that learn from every fight',
                  'Gym Display big-screen timer',
                ].map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                    <Check size={13} className="text-brand-400 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-500 mt-3">
                {PRICES.fighter.monthly}/month or {PRICES.fighter.annual}/year · cancel anytime
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => setShowUpgrade(true)}
                className="btn-primary flex items-center justify-center gap-2"
              >
                <Zap size={16} />
                {Capacitor.isNativePlatform() ? 'Start 7-day free trial' : 'See Pro plans'}
              </button>
              <button
                onClick={() => setStep(4)}
                className="text-sm text-gray-500 hover:text-gray-300 py-2 transition-colors"
              >
                Continue with the free app →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: All Set (also shown when the offer step resolves Pro) ── */}
        {(step === 4 || (step === 3 && alreadyPro)) && (
          <div className="flex flex-col gap-6 mt-6 text-center">
            <div className="flex justify-center">
              <div className="w-20 h-20 bg-brand-600 rounded-2xl flex items-center justify-center shadow-xl shadow-brand-900/50">
                <Flame size={40} className="text-white" />
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-black text-white">
                {name ? `You're locked in, ${name.split(' ')[0]}.` : "You're all set."}
              </h2>
              <p className="text-gray-400 mt-2 text-sm">
                {role === 'fighter'
                  ? 'Your camp is built. Now it\'s time to put in the work.'
                  : 'Your coach profile is ready. Time to build champions.'}
              </p>
            </div>

            {/* Summary — fighters only */}
            {role === 'fighter' && (fightDate || isOffSeason) && (
              <div className="bg-dark-700 rounded-xl border border-dark-500 p-4 text-left space-y-2.5">
                {isOffSeason ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 text-sm">Mode</span>
                      <span className="text-teal-400 font-bold text-sm">Off Season</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 text-sm">Goal</span>
                      <span className="text-white font-semibold text-sm">{OFF_SEASON_GOALS.find(g => g.value === offSeasonGoal)?.label}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 text-sm">Duration</span>
                      <span className="text-teal-400 font-bold text-sm">12 Weeks</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 text-sm">Fight Date</span>
                      <span className="text-white font-semibold text-sm">
                        {new Date(fightDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 text-sm">Camp Length</span>
                      <span className="text-brand-400 font-bold text-sm">{campWeeks} Weeks</span>
                    </div>
                    {currentWeight && targetWeight && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500 text-sm">Weight Cut</span>
                        <span className="text-white font-semibold text-sm">{currentWeight} → {targetWeight} {unit}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Primary CTA */}
            <button onClick={handleFinish} className="btn-primary flex items-center justify-center gap-2 text-lg py-4">
              {role === 'fighter'
                ? (isOffSeason ? 'Start Off Season' : 'Enter the Camp')
                : 'Enter the App'}
              <ChevronRight size={20} />
            </button>

            <p className="text-xs text-gray-600 -mt-2">
              By continuing you agree to our{' '}
              <a href="https://fightcamp.netlify.app/terms.html" target="_blank" rel="noopener noreferrer" className="text-gray-500 underline hover:text-gray-400">Terms of Service</a>
              {' '}and{' '}
              <a href="https://fightcamp.netlify.app/privacy.html" target="_blank" rel="noopener noreferrer" className="text-gray-500 underline hover:text-gray-400">Privacy Policy</a>.
            </p>

          </div>
        )}
      </div>

      {/* The offer's checkout: web navigation persists the draft first; a
          native purchase advances via the alreadyPro render condition above. */}
      {showUpgrade && (
        <UpgradeModal
          onClose={() => setShowUpgrade(false)}
          onBeforeWebCheckout={commitDraft}
        />
      )}
    </div>
  );
}
