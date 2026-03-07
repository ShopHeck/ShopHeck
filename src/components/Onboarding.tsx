import { useState } from 'react';
import { Flame, ChevronRight, Shield, User } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Sport, WeightClass, ExperienceLevel, UserRole } from '../types';
import { addDays, format } from 'date-fns';

const WEIGHT_CLASSES: WeightClass[] = [
  'Strawweight', 'Flyweight', 'Bantamweight', 'Featherweight',
  'Lightweight', 'Welterweight', 'Middleweight', 'Light Heavyweight',
  'Heavyweight', 'Super Heavyweight',
];

const SPORTS: Sport[] = ['Boxing', 'MMA', 'Muay Thai', 'Kickboxing', 'Wrestling', 'BJJ'];

const EXPERIENCE_LEVELS: ExperienceLevel[] = ['Beginner', 'Amateur', 'Semi-Pro', 'Professional'];

export default function Onboarding() {
  const { dispatch } = useApp();
  const [step, setStep] = useState(0);
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

  const minDate = format(addDays(new Date(), 42), 'yyyy-MM-dd');
  const maxDate = format(addDays(new Date(), 365), 'yyyy-MM-dd');

  function handleProfileNext() {
    if (!name.trim() || !age) return;
    setStep(1);
  }

  function handleCampNext() {
    if (!fightDate || !currentWeight || !targetWeight) return;
    setStep(2);
  }

  function handleFinish() {
    const fightDateObj = new Date(fightDate);
    const campWeeksNum = parseInt(campWeeks);
    const startDate = format(addDays(fightDateObj, -(campWeeksNum * 7)), 'yyyy-MM-dd');

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

    if (role === 'fighter') {
      dispatch({
        type: 'CREATE_CAMP',
        payload: {
          fightDate,
          opponent: opponent.trim() || undefined,
          weightClass,
          currentWeight: parseFloat(currentWeight),
          targetWeight: parseFloat(targetWeight),
          rounds: parseInt(rounds),
          roundDuration: parseInt(roundDuration),
          sport,
          experienceLevel: experience,
          campWeeks: campWeeksNum,
          startDate,
        },
      });
    }
  }

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      {/* Hero Banner */}
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
        {/* Step Indicators */}
        {step < 2 && (
          <div className="flex gap-2 justify-center py-4">
            {[0, 1].map(i => (
              <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-brand-500' : i < step ? 'w-4 bg-brand-700' : 'w-4 bg-dark-500'}`} />
            ))}
          </div>
        )}

        {/* Step 0: Role + Profile */}
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
              <input
                className="input"
                placeholder="Enter your name"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Age *</label>
                <input
                  className="input"
                  type="number"
                  placeholder="Age"
                  min={16}
                  max={60}
                  value={age}
                  onChange={e => setAge(e.target.value)}
                />
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
              <input
                className="input"
                placeholder="Your gym or team name"
                value={gym}
                onChange={e => setGym(e.target.value)}
              />
            </div>

            <button
              onClick={role === 'coach' ? handleFinish : handleProfileNext}
              disabled={!name.trim() || !age}
              className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {role === 'coach' ? 'Create Coach Profile' : 'Next: Set Up Fight Camp'}
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* Step 1: Fight Camp Setup */}
        {step === 1 && (
          <div className="flex flex-col gap-5 mt-2">
            <div>
              <h2 className="text-xl font-black text-white">Fight Camp Setup</h2>
              <p className="text-gray-500 text-sm mt-1">Tell us about your upcoming fight</p>
            </div>

            <div>
              <label className="label">Fight Date *</label>
              <input
                className="input"
                type="date"
                min={minDate}
                max={maxDate}
                value={fightDate}
                onChange={e => setFightDate(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Opponent (Optional)</label>
              <input
                className="input"
                placeholder="Opponent's name"
                value={opponent}
                onChange={e => setOpponent(e.target.value)}
              />
            </div>

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
                  <option value="3">3 minutes</option>
                  <option value="5">5 minutes</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Current Weight (lbs) *</label>
                <input
                  className="input"
                  type="number"
                  placeholder="e.g. 160"
                  value={currentWeight}
                  onChange={e => setCurrentWeight(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Target Weight (lbs) *</label>
                <input
                  className="input"
                  type="number"
                  placeholder="e.g. 155"
                  value={targetWeight}
                  onChange={e => setTargetWeight(e.target.value)}
                />
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

        {/* Step 2: Confirm */}
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

            <button onClick={handleFinish} className="btn-primary flex items-center justify-center gap-2 text-lg py-4">
              Enter the Camp
              <ChevronRight size={20} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
