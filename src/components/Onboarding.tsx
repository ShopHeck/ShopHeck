import { useRef, useState } from 'react';
import { Flame, ChevronRight, Shield, User, Check, Zap, Dumbbell, Cloud } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import AuthScreen from './AuthScreen';
import Modal from './shared/Modal';
import GlassSurface from './shared/GlassSurface';
import UpgradeModal from './shared/UpgradeModal';
import PressableButton from './shared/PressableButton';
import AccentButton from './onboarding/AccentButton';
import CampSetupFields from './onboarding/CampSetupFields';
import ChoiceTile from './onboarding/ChoiceTile';
import OnboardingHero from './onboarding/OnboardingHero';
import PlanSummary from './onboarding/PlanSummary';
import StepRail from './onboarding/StepRail';
import { OFF_SEASON_GOALS, ctaColors, planSummaryRows } from './onboarding/config';
import { PRICES } from '../utils/pricing';
import { isPro } from '../utils/subscription';
import { tint } from '../utils/designTokens';
import type { Sport, WeightClass, ExperienceLevel, UserRole, OffSeasonGoal } from '../types';
import { addDays, format } from 'date-fns';
import { parseWeightInput } from '../utils/validation';

const WEIGHT_CLASSES: WeightClass[] = [
  'Strawweight', 'Flyweight', 'Bantamweight', 'Featherweight',
  'Lightweight', 'Welterweight', 'Middleweight', 'Light Heavyweight',
  'Heavyweight', 'Super Heavyweight',
];

const SPORTS: Sport[] = ['Boxing', 'MMA', 'Muay Thai', 'Kickboxing', 'Wrestling', 'BJJ', 'Bare Knuckle'];

const EXPERIENCE_LEVELS: ExperienceLevel[] = ['Beginner', 'Amateur', 'Semi-Pro', 'Professional'];

const FREE_FEATURES = [
  'Periodized week-by-week camp plan',
  'Pro round timer with live heart-rate zones',
  'Training, sparring & weigh-in logging',
  'Progress charts & fight readiness',
];

const PRO_FEATURES = [
  'Your AI corner — camp insights, cut guidance & post-fight breakdowns',
  'Nutrition tracking with macro targets',
  'Game plan builder for your opponent',
  'Unlimited camps that learn from every fight',
  'Gym Display big-screen timer',
];

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

  const cta = ctaColors(isOffSeason);
  const modeAccent = cta.accent;

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

  const goalLabel = OFF_SEASON_GOALS.find(g => g.value === offSeasonGoal)?.label;

  const summaryInput = {
    isOffSeason,
    offSeasonGoalLabel: goalLabel,
    fightDate,
    campWeeks,
    currentWeight,
    targetWeight,
    unit,
  };

  const setupFields = (
    <CampSetupFields
      unit={unit}
      offSeasonOnly={offSeasonOnly}
      isOffSeason={isOffSeason}
      onIsOffSeasonChange={setIsOffSeason}
      offSeasonGoal={offSeasonGoal}
      onOffSeasonGoalChange={setOffSeasonGoal}
      fightDate={fightDate}
      onFightDateChange={setFightDate}
      opponent={opponent}
      onOpponentChange={setOpponent}
      rounds={rounds}
      onRoundsChange={setRounds}
      roundDuration={roundDuration}
      onRoundDurationChange={setRoundDuration}
      currentWeight={currentWeight}
      onCurrentWeightChange={setCurrentWeight}
      targetWeight={targetWeight}
      onTargetWeightChange={setTargetWeight}
      campWeeks={campWeeks}
      onCampWeeksChange={setCampWeeks}
      showWeightHint={showWeightHint}
      minDate={minDate}
      maxDate={maxDate}
    />
  );

  // The crest shown on the "plan is ready" screens, in the mode's own accent.
  const readyCrest = (size: number) => (
    <div
      className="mx-auto flex items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: 'var(--radius-md)',
        backgroundColor: modeAccent,
        boxShadow: `var(--shadow-2), 0 0 24px ${tint(modeAccent, 0.4)}`,
        color: cta.foreground,
      }}
      aria-hidden="true"
    >
      {isOffSeason ? <Dumbbell size={size / 2} /> : <Flame size={size / 2} />}
    </div>
  );

  // ─── campOnly modal ─────────────────────────────────────────────────────────
  // Uses the shared <Modal>, which brings the focus trap, Escape-to-close,
  // body-scroll lock and keyboard-aware height this sheet used to do without —
  // it was the app's one hand-rolled dialog.
  if (campOnly) {
    return (
      <Modal
        title={
          step === 1
            ? (isOffSeason ? 'Off Season Plan' : 'New Fight Camp')
            : (isOffSeason ? 'Plan Ready!' : 'Camp Generated!')
        }
        onClose={() => onClose?.()}
        footer={
          step === 1 ? (
            <AccentButton
              onClick={handleCampNext}
              disabled={!canContinueCamp}
              accent={cta.accent}
              foreground={cta.foreground}
            >
              {isOffSeason ? <Dumbbell size={16} /> : <Flame size={16} />}
              {isOffSeason ? 'Generate Off Season Plan' : 'Generate Camp'}
            </AccentButton>
          ) : (
            <AccentButton onClick={handleFinish} accent={cta.accent} foreground={cta.foreground}>
              {isOffSeason ? 'Start Off Season' : 'Start Camp'}
              <ChevronRight size={18} />
            </AccentButton>
          )
        }
      >
        {step === 1 && setupFields}

        {step === 2 && (
          <div className="flex flex-col gap-5 text-center">
            {readyCrest(64)}
            <div>
              <h3 className="type-section text-white">
                {isOffSeason ? 'Off Season Plan Ready!' : 'Camp Generated!'}
              </h3>
              <p className="type-body mt-1" style={{ color: 'var(--text-secondary)' }}>
                {isOffSeason
                  ? '12-week off season program is ready.'
                  : `Your ${campWeeks}-week program is ready.`}
              </p>
            </div>
            <div className="text-left">
              <PlanSummary rows={planSummaryRows(summaryInput)} />
            </div>
          </div>
        )}
      </Modal>
    );
  }

  // ─── Account gate (first run, before the profile form) ──────────────────────
  // Shown only when cloud accounts are available and nobody is signed in. Signing
  // in restores an existing user's data; guests skip straight to profile setup.
  if (!campOnly && authConfigured && !authUser && !continueAsGuest) {
    return (
      <div className="min-h-screen flex flex-col">
        <OnboardingHero />

        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full px-5 gap-4">
          <GlassSurface cornerRadius="md" className="flex items-start gap-3 p-3.5">
            <Cloud size={18} style={{ color: 'var(--accent-flame)' }} className="mt-0.5 flex-shrink-0" />
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Create an account to back up your camps and sync across devices — or jump
              straight in as a guest. You can always create one later in Settings.
            </p>
          </GlassSurface>

          <AccentButton
            onClick={() => setShowAuth(true)}
            accent="var(--accent-flame)"
            foreground="#FFFFFF"
          >
            <User size={18} /> Create account or sign in
          </AccentButton>
          <PressableButton onClick={() => setContinueAsGuest(true)} className="btn-secondary w-full">
            Continue as guest
          </PressableButton>
        </div>

        {showAuth && <AuthScreen onClose={() => setShowAuth(false)} />}
      </div>
    );
  }

  // ─── Full first-run onboarding ───────────────────────────────────────────────

  // The rail is built from the steps this user will actually be shown, so it
  // never promises a screen that will be skipped: a coach has two, and an
  // account that already has Pro does not get an offer step in its count.
  const flow: { step: number; label: string }[] =
    role === 'coach'
      ? [{ step: 0, label: 'Profile' }, { step: 4, label: 'Ready' }]
      : [
          { step: 0, label: 'Profile' },
          { step: 1, label: 'Camp' },
          { step: 2, label: 'Review' },
          ...(alreadyPro ? [] : [{ step: 3, label: 'Pro' }]),
          { step: 4, label: 'Ready' },
        ];
  // Step 3 renders the finish screen once the account is Pro, so it is the
  // "Ready" step as far as progress is concerned.
  const effectiveStep = step === 3 && alreadyPro ? 4 : step;
  const railIndex = Math.max(0, flow.findIndex(s => s.step === effectiveStep));

  return (
    <div className="min-h-screen flex flex-col">
      {step === 0 && <OnboardingHero />}

      <div className="flex-1 flex flex-col max-w-lg mx-auto w-full px-4 pb-8">
        {step > 0 && <OnboardingHero variant="compact" />}

        <StepRail labels={flow.map(s => s.label)} current={railIndex} accent={modeAccent} />

        {/* ── Step 0: Role + Profile ── */}
        {step === 0 && (
          <div className="flex flex-col gap-5 mt-2">
            <div>
              <span className="type-caption block mb-3" style={{ color: 'var(--text-tertiary)' }}>
                I am a...
              </span>
              <div role="group" aria-label="I am a" className="grid grid-cols-2 gap-3">
                {(['fighter', 'coach'] as UserRole[]).map(r => (
                  <ChoiceTile
                    key={r}
                    size="tile"
                    selected={role === r}
                    onSelect={() => setRole(r)}
                    // The coach role has been violet since long before the
                    // design system; §2.6 records it rather than recolouring it.
                    accent={r === 'coach' ? 'var(--accent-violet)' : 'var(--accent-flame)'}
                    icon={r === 'fighter' ? <User size={28} /> : <Shield size={28} />}
                    label={r === 'fighter' ? 'Fighter' : 'Coach'}
                    sublabel={r === 'fighter' ? 'Train for a fight' : 'Run a team'}
                  />
                ))}
              </div>
            </div>

            <label className="block">
              <span className="label">Full Name *</span>
              <input className="input" placeholder="Enter your name" value={name} onChange={e => setName(e.target.value)} />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label">Age *</span>
                <input className="input" type="number" inputMode="numeric" placeholder="Age" min={16} max={60} value={age} onChange={e => setAge(e.target.value)} />
              </label>
              <label className="block">
                <span className="label">Sport *</span>
                <select className="select" value={sport} onChange={e => setSport(e.target.value as Sport)}>
                  {SPORTS.map(s => <option key={s}>{s}</option>)}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="label">Weight Class *</span>
              <select className="select" value={weightClass} onChange={e => setWeightClass(e.target.value as WeightClass)}>
                {WEIGHT_CLASSES.map(wc => <option key={wc}>{wc}</option>)}
              </select>
            </label>

            <div>
              <span className="label">Experience Level *</span>
              <div role="group" aria-label="Experience Level" className="grid grid-cols-2 gap-2">
                {EXPERIENCE_LEVELS.map(level => (
                  <ChoiceTile
                    key={level}
                    selected={experience === level}
                    onSelect={() => setExperience(level)}
                    accent="var(--accent-flame)"
                    label={level}
                  />
                ))}
              </div>
            </div>

            <label className="block">
              <span className="label">Gym / Team (Optional)</span>
              <input className="input" placeholder="Your gym or team name" value={gym} onChange={e => setGym(e.target.value)} />
            </label>

            <AccentButton
              onClick={handleProfileNext}
              disabled={!name.trim() || !age}
              accent="var(--accent-flame)"
              foreground="#FFFFFF"
              className="mt-2"
            >
              {role === 'coach' ? 'Next: Quick Setup' : 'Next: Set Up Fight Camp'}
              <ChevronRight size={18} />
            </AccentButton>
          </div>
        )}

        {/* ── Step 1: Training Setup ── */}
        {step === 1 && (
          <div className="flex flex-col gap-5 mt-2">
            <div>
              <h2 className="type-section text-white">
                {isOffSeason ? 'Off Season Setup' : 'Fight Camp Setup'}
              </h2>
              <p className="type-body mt-1" style={{ color: 'var(--text-secondary)' }}>
                {isOffSeason ? 'Set your goal and start training' : 'Tell us about your upcoming fight'}
              </p>
            </div>

            {setupFields}

            <AccentButton
              onClick={handleCampNext}
              disabled={!canContinueCamp}
              accent={cta.accent}
              foreground={cta.foreground}
            >
              {isOffSeason ? <Dumbbell size={18} /> : <Flame size={18} />}
              {isOffSeason ? 'Generate Off Season Plan' : 'Generate Training Camp'}
            </AccentButton>
          </div>
        )}

        {/* ── Step 2: Preview ── */}
        {step === 2 && (
          <div className="flex flex-col gap-6 mt-4 text-center">
            {readyCrest(80)}

            <div>
              <h2 className="type-hero text-white">
                {isOffSeason ? 'Off Season Plan Ready!' : 'Camp Generated!'}
              </h2>
              <p className="type-body mt-2" style={{ color: 'var(--text-secondary)' }}>
                {isOffSeason
                  ? 'Your 12-week program is set. Stay consistent, build your base.'
                  : `Your ${campWeeks}-week training program is ready. Stay disciplined, trust the process.`}
              </p>
            </div>

            <div className="text-left">
              <PlanSummary rows={planSummaryRows({ ...summaryInput, name, weightClass })} />
            </div>

            <AccentButton
              onClick={() => setStep(alreadyPro ? 4 : 3)}
              accent={cta.accent}
              foreground={cta.foreground}
            >
              Continue
              <ChevronRight size={20} />
            </AccentButton>
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
              <h2 className="type-hero text-white">Your camp is built.</h2>
              <p className="type-body mt-1" style={{ color: 'var(--text-secondary)' }}>
                Everything below is free. Pro adds your corner team.
              </p>
            </div>

            <GlassSurface cornerRadius="md" className="p-4">
              <p className="type-caption mb-2" style={{ color: 'var(--text-tertiary)' }}>
                Free — yours already
              </p>
              <ul className="space-y-1.5">
                {FREE_FEATURES.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <Check size={13} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                    {f}
                  </li>
                ))}
              </ul>
            </GlassSurface>

            <GlassSurface
              cornerRadius="md"
              elevated
              accentGlow={tint('var(--accent-flame)', 0.28)}
              className="p-4"
              style={{
                backgroundImage: `linear-gradient(135deg, ${tint('var(--accent-flame)', 0.18)}, transparent 65%)`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Zap size={15} style={{ color: 'var(--accent-flame)' }} />
                <p className="type-card-title text-white">Fighter Pro adds</p>
                {Capacitor.isNativePlatform() && (
                  <span
                    className="ml-auto text-xs font-semibold px-2 py-0.5"
                    style={{
                      color: 'var(--accent-flame)',
                      backgroundColor: tint('var(--accent-flame)', 0.16),
                      borderRadius: 'var(--radius-full)',
                    }}
                  >
                    7-day free trial
                  </span>
                )}
              </div>
              <ul className="space-y-1.5">
                {PRO_FEATURES.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                    <Check size={13} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-flame)' }} />
                    {f}
                  </li>
                ))}
              </ul>
              <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>
                {PRICES.fighter.monthly}/month or {PRICES.fighter.annual}/year · cancel anytime
              </p>
            </GlassSurface>

            <div className="flex flex-col gap-2">
              <AccentButton
                onClick={() => setShowUpgrade(true)}
                accent="var(--accent-flame)"
                foreground="#FFFFFF"
              >
                <Zap size={16} />
                {Capacitor.isNativePlatform() ? 'Start 7-day free trial' : 'See Pro plans'}
              </AccentButton>
              <PressableButton
                onClick={() => setStep(4)}
                className="text-sm py-3 min-h-[44px] transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                Continue with the free app →
              </PressableButton>
            </div>
          </div>
        )}

        {/* ── Step 4: All Set (also shown when the offer step resolves Pro) ── */}
        {(step === 4 || (step === 3 && alreadyPro)) && (
          <div className="flex flex-col gap-6 mt-6 text-center">
            {readyCrest(80)}

            <div>
              <h2 className="type-hero text-white">
                {name ? `You're locked in, ${name.split(' ')[0]}.` : "You're all set."}
              </h2>
              <p className="type-body mt-2" style={{ color: 'var(--text-secondary)' }}>
                {role === 'fighter'
                  ? 'Your camp is built. Now it\'s time to put in the work.'
                  : 'Your coach profile is ready. Time to build champions.'}
              </p>
            </div>

            {/* Summary — fighters only */}
            {role === 'fighter' && (fightDate || isOffSeason) && (
              <div className="text-left">
                <PlanSummary rows={planSummaryRows({ ...summaryInput, weightClass })} />
              </div>
            )}

            <AccentButton onClick={handleFinish} accent={cta.accent} foreground={cta.foreground}>
              {role === 'fighter'
                ? (isOffSeason ? 'Start Off Season' : 'Enter the Camp')
                : 'Enter the App'}
              <ChevronRight size={20} />
            </AccentButton>

            <p className="text-xs -mt-2" style={{ color: 'var(--text-tertiary)' }}>
              By continuing you agree to our{' '}
              <a href="https://fightcamp.netlify.app/terms.html" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--text-secondary)' }}>Terms of Service</a>
              {' '}and{' '}
              <a href="https://fightcamp.netlify.app/privacy.html" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--text-secondary)' }}>Privacy Policy</a>.
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
