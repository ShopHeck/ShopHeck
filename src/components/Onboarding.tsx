import { useState } from 'react';
import { Flame, ChevronRight, Shield, User, X, CheckCircle, Eye, EyeOff, Star, Brain } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Sport, WeightClass, ExperienceLevel, UserRole } from '../types';
import { addDays, format } from 'date-fns';
import { getApiKey, setApiKey } from '../utils/apiKey';

// TODO: replace with the real App Store listing ID once published
const APP_STORE_URL = 'https://apps.apple.com/app/id000000000';

const WEIGHT_CLASSES: WeightClass[] = [
  'Strawweight', 'Flyweight', 'Bantamweight', 'Featherweight',
  'Lightweight', 'Welterweight', 'Middleweight', 'Light Heavyweight',
  'Heavyweight', 'Super Heavyweight',
];

const SPORTS: Sport[] = ['Boxing', 'MMA', 'Muay Thai', 'Kickboxing', 'Wrestling', 'BJJ', 'Bare Knuckle'];

const EXPERIENCE_LEVELS: ExperienceLevel[] = ['Beginner', 'Amateur', 'Semi-Pro', 'Professional'];

interface Props {
  campOnly?: boolean;
  onClose?: () => void;
}

export default function Onboarding({ campOnly = false, onClose }: Props) {
  const { state, dispatch } = useApp();
  const [step, setStep] = useState(campOnly ? 1 : 0);
  const [role, setRole] = useState<UserRole>('fighter');

  // Profile
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sport, setSport] = useState<Sport>('Boxing');
  const [weightClass, setWeightClass] = useState<WeightClass>('Lightweight');
  const [experience, setExperience] = useState<ExperienceLevel>('Amateur');
  const [gym, setGym] = useState('');

  // Camp
  const [fightDate, setFightDate] = useState('');
  const [opponent, setOpponent] = useState('');
  const [rounds, setRounds] = useState('3');
  const [roundDuration, setRoundDuration] = useState('3');
  const [currentWeight, setCurrentWeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [campWeeks, setCampWeeks] = useState('8');

  // Integrations
  const [anthropicKey, setAnthropicKey] = useState(getApiKey());
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);

  const minDate = format(addDays(new Date(), 42), 'yyyy-MM-dd');
  const maxDate = format(addDays(new Date(), 365), 'yyyy-MM-dd');

  function handleProfileNext() {
    if (!name.trim() || !age) return;
    if (role === 'coach') {
      setStep(3);
    } else {
      setStep(1);
    }
  }

  function handleCampNext() {
    if (!fightDate || !currentWeight || !targetWeight) return;
    setStep(2);
  }

  function handleIntegrationsNext() {
    if (anthropicKey.trim()) setApiKey(anthropicKey.trim());
    setStep(4);
  }

  function handleFinish() {
    const fightDateObj = new Date(fightDate);
    const campWeeksNum = parseInt(campWeeks);
    const startDate = format(addDays(fightDateObj, -(campWeeksNum * 7)), 'yyyy-MM-dd');

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
      const user = state.currentUser;
      dispatch({
        type: 'CREATE_CAMP',
        payload: {
          fightDate,
          opponent: opponent.trim() || undefined,
          weightClass: campOnly ? (user?.weightClass ?? weightClass) : weightClass,
          currentWeight: parseFloat(currentWeight),
          targetWeight: parseFloat(targetWeight),
          rounds: parseInt(rounds),
          roundDuration: parseInt(roundDuration),
          sport: campOnly ? (user?.sport ?? sport) : sport,
          experienceLevel: campOnly ? (user?.experienceLevel ?? experience) : experience,
          campWeeks: campWeeksNum,
          startDate,
        },
      });
    }

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
              {step === 1 ? 'New Fight Camp' : 'Camp Generated!'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
              <X size={20} />
            </button>
          </div>
          <div className="overflow-y-auto flex-1 px-4 py-4">
            {step === 1 && (
              <div className="flex flex-col gap-5">
                <div>
                  <label className="label">Fight Date *</label>
                  <input className="input" type="date" min={minDate} value={fightDate} onChange={e => setFightDate(e.target.value)} />
                </div>
                <div>
                  <label className="label">Opponent (Optional)</label>
                  <input className="input" placeholder="Opponent's name" value={opponent} onChange={e => setOpponent(e.target.value)} />
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
                    <label className="label">Rounds</label>
                    <select className="select" value={rounds} onChange={e => setRounds(e.target.value)}>
                      {[3,4,5,6,8,10,12,15].map(n => <option key={n} value={n}>{n} rounds</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Round Duration</label>
                    <select className="select" value={roundDuration} onChange={e => setRoundDuration(e.target.value)}>
                      <option value="2">2 minutes</option>
                      <option value="3">3 minutes</option>
                      <option value="5">5 minutes</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Current Weight (lbs) *</label>
                    <input className="input" type="number" placeholder="e.g. 160" value={currentWeight} onChange={e => setCurrentWeight(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Target Weight (lbs) *</label>
                    <input className="input" type="number" placeholder="e.g. 155" value={targetWeight} onChange={e => setTargetWeight(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="label">Camp Length</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['6','8','10'].map(w => (
                      <button key={w} onClick={() => setCampWeeks(w)}
                        className={`py-3 rounded-xl text-sm font-semibold border-2 transition-all ${campWeeks === w ? 'border-brand-500 bg-brand-900/30 text-brand-400' : 'border-dark-400 bg-dark-600 text-gray-400'}`}>
                        {w} Weeks
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleCampNext}
                  disabled={!fightDate || !currentWeight || !targetWeight}
                  className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  Generate Camp <Flame size={16} />
                </button>
              </div>
            )}
            {step === 2 && (
              <div className="flex flex-col gap-5 text-center">
                <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                  <Flame size={32} className="text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">Camp Generated!</h3>
                  <p className="text-gray-400 text-sm mt-1">Your {campWeeks}-week program is ready.</p>
                </div>
                <div className="bg-dark-600 rounded-xl border border-dark-400 p-4 text-left space-y-2">
                  <div className="flex justify-between"><span className="text-gray-500 text-sm">Fight Date</span><span className="text-white font-semibold text-sm">{new Date(fightDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 text-sm">Camp Length</span><span className="text-brand-400 font-bold text-sm">{campWeeks} Weeks</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 text-sm">Weight Cut</span><span className="text-white font-semibold text-sm">{currentWeight} → {targetWeight} lbs</span></div>
                </div>
                <button onClick={handleFinish} className="btn-primary flex items-center justify-center gap-2">
                  Start Camp <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Full first-run onboarding ───────────────────────────────────────────────

  // Step indicator dots — only shown during the "form" steps
  // Fighters: 0 (profile), 1 (camp), 3 (integrations)
  // Coaches:  0 (profile), 3 (integrations)
  const fighterDotSteps = [0, 1, 3];
  const coachDotSteps   = [0, 3];
  const dotSteps        = role === 'coach' ? coachDotSteps : fighterDotSteps;
  const showDots        = dotSteps.includes(step);

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      {/* Hero banner — only on step 0 */}
      {step === 0 && (
        <div className="relative overflow-hidden bg-gradient-to-b from-brand-900/40 to-dark-900 px-6 pt-16 pb-8 text-center">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23f97316%22%20fill-opacity%3D%220.03%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-30" />
          <div className="relative">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-2xl mb-4 shadow-lg shadow-brand-900/50">
              <Flame size={32} className="text-white" />
            </div>
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
              <label className="label">Full Name *</label>
              <input className="input" placeholder="Enter your name" value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Age *</label>
                <input className="input" type="number" placeholder="Age" min={16} max={60} value={age} onChange={e => setAge(e.target.value)} />
              </div>
              <div>
                <label className="label">Sport *</label>
                <select className="select" value={sport} onChange={e => setSport(e.target.value as Sport)}>
                  {SPORTS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Weight Class *</label>
              <select className="select" value={weightClass} onChange={e => setWeightClass(e.target.value as WeightClass)}>
                {WEIGHT_CLASSES.map(wc => <option key={wc}>{wc}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Experience Level *</label>
              <div className="grid grid-cols-2 gap-2">
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
              <label className="label">Gym / Team (Optional)</label>
              <input className="input" placeholder="Your gym or team name" value={gym} onChange={e => setGym(e.target.value)} />
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

        {/* ── Step 1: Fight Camp Setup ── */}
        {step === 1 && (
          <div className="flex flex-col gap-5 mt-2">
            <div>
              <h2 className="text-xl font-black text-white">Fight Camp Setup</h2>
              <p className="text-gray-500 text-sm mt-1">Tell us about your upcoming fight</p>
            </div>

            <div>
              <label className="label">Fight Date *</label>
              <input className="input" type="date" min={minDate} max={maxDate} value={fightDate} onChange={e => setFightDate(e.target.value)} />
            </div>

            <div>
              <label className="label">Opponent (Optional)</label>
              <input className="input" placeholder="Opponent's name" value={opponent} onChange={e => setOpponent(e.target.value)} />
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
                <label className="label">Rounds</label>
                <select className="select" value={rounds} onChange={e => setRounds(e.target.value)}>
                  {[3, 4, 5, 6, 8, 10, 12, 15].map(n => (
                    <option key={n} value={n}>{n} rounds</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Round Duration</label>
                <select className="select" value={roundDuration} onChange={e => setRoundDuration(e.target.value)}>
                  <option value="2">2 minutes</option>
                  <option value="3">3 minutes</option>
                  <option value="5">5 minutes</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Current Weight (lbs) *</label>
                <input className="input" type="number" placeholder="e.g. 160" value={currentWeight} onChange={e => setCurrentWeight(e.target.value)} />
              </div>
              <div>
                <label className="label">Target Weight (lbs) *</label>
                <input className="input" type="number" placeholder="e.g. 155" value={targetWeight} onChange={e => setTargetWeight(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="label">Camp Length</label>
              <div className="grid grid-cols-3 gap-2">
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

            <button
              onClick={handleCampNext}
              disabled={!fightDate || !currentWeight || !targetWeight}
              className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Generate Training Camp
              <Flame size={18} />
            </button>
          </div>
        )}

        {/* ── Step 2: Camp Preview ── */}
        {step === 2 && (
          <div className="flex flex-col gap-6 mt-4 text-center">
            <div className="flex justify-center">
              <div className="w-20 h-20 bg-brand-600 rounded-2xl flex items-center justify-center shadow-xl shadow-brand-900/50">
                <Flame size={40} className="text-white" />
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-black text-white">Camp Generated!</h2>
              <p className="text-gray-400 mt-2 text-sm">
                Your {campWeeks}-week training program is ready. Stay disciplined, trust the process.
              </p>
            </div>

            <div className="bg-dark-700 rounded-xl border border-dark-500 p-4 text-left space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-sm">Fighter</span>
                <span className="text-white font-semibold">{name}</span>
              </div>
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
                <span className="text-white font-semibold">{currentWeight} → {targetWeight} lbs</span>
              </div>
            </div>

            <button onClick={() => setStep(3)} className="btn-primary flex items-center justify-center gap-2 text-lg py-4">
              Continue
              <ChevronRight size={20} />
            </button>
          </div>
        )}

        {/* ── Step 3: Integrations ── */}
        {step === 3 && (
          <div className="flex flex-col gap-6 mt-4">
            <div>
              <h2 className="text-2xl font-black text-white">Supercharge Your Training</h2>
              <p className="text-gray-500 text-sm mt-1">
                Optional — you can always add these later in Settings.
              </p>
            </div>

            {/* AI Coach card */}
            <div className="bg-dark-700 rounded-2xl border border-dark-500 p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-brand-900/60 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Brain size={20} className="text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">AI Coach Insights</p>
                  <p className="text-xs text-gray-400 mt-0.5">Personalised training analysis powered by Claude AI</p>
                </div>
              </div>
              <div className="relative">
                <input
                  className="input pr-10 text-sm"
                  type={showAnthropicKey ? 'text' : 'password'}
                  placeholder="Paste Anthropic API key…"
                  value={anthropicKey}
                  onChange={e => setAnthropicKey(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowAnthropicKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  tabIndex={-1}
                >
                  {showAnthropicKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p className="text-xs text-gray-600">
                Get your key at{' '}
                <span className="text-brand-500">console.anthropic.com</span>
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleIntegrationsNext}
                className="btn-primary flex items-center justify-center gap-2"
              >
                Continue
                <ChevronRight size={18} />
              </button>
              <button
                onClick={() => setStep(4)}
                className="text-sm text-gray-500 hover:text-gray-300 py-2 transition-colors"
              >
                Skip for now →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: All Set + Review ── */}
        {step === 4 && (
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

            {/* Camp summary — fighters only */}
            {role === 'fighter' && fightDate && (
              <div className="bg-dark-700 rounded-xl border border-dark-500 p-4 text-left space-y-2.5">
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
                    <span className="text-white font-semibold text-sm">{currentWeight} → {targetWeight} lbs</span>
                  </div>
                )}
              </div>
            )}

            {/* Primary CTA */}
            <button onClick={handleFinish} className="btn-primary flex items-center justify-center gap-2 text-lg py-4">
              {role === 'fighter' ? 'Enter the Camp' : 'Enter the App'}
              <ChevronRight size={20} />
            </button>

            {/* Subtle review ask */}
            <div className="pt-2 border-t border-dark-600">
              <div className="flex justify-center gap-1 mb-2">
                {[0, 1, 2, 3, 4].map(i => (
                  <Star key={i} size={16} className="text-brand-500 fill-brand-500" />
                ))}
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Loving Fight Camp? A quick App Store review helps other fighters find us.
              </p>
              <button
                onClick={() => window.open(APP_STORE_URL, '_blank')}
                className="w-full py-2.5 rounded-xl border border-dark-400 text-sm font-semibold text-gray-300 hover:border-brand-600 hover:text-brand-400 transition-all"
              >
                ⭐ Leave a Review
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
