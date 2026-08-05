import { useState, useRef } from 'react';
import { Award, ChevronRight, Eye, EyeOff, Flame, Plus, Trash2, Check, Edit3, LogOut, Brain, Heart, UserCheck, Users, Zap, Trophy, Bluetooth, BluetoothOff, Bell, HeartPulse, Scale, AlertCircle, Stethoscope, Watch } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { ZONE_COLORS, ZONE_LABELS } from '../hooks/useBluetoothHR';
import IconChipRow from './shared/IconChipRow';
import { useHeartRate } from '../context/HeartRateContext';
import { estimateMaxHR } from '../utils/maxHR';
import UpgradeModal from './shared/UpgradeModal';
import { isPro, isCoachPro } from '../utils/subscription';
import { RevenueCat } from '../plugins/RevenueCat';
import { useApp } from '../context/AppContext';
import { hasCustomBell, setCustomBell, clearCustomBell, fileToDataUrl } from '../utils/customBell';
import { notificationsSupported, remindersEnabled, setRemindersEnabled, requestNotificationPermission, syncReminders, disableReminders, syncStreakRiskAlert, syncWeeklyReport, REMINDER_CATEGORIES, getReminderCategories, setReminderCategoryEnabled, type ReminderCategory } from '../utils/notifications';
import { computeWeekReportStats } from '../utils/weeklyReport';
import { isHealthWriteEnabled, setHealthWriteEnabled } from '../utils/healthSync';
import { parseWeightInput, weightRangeHint } from '../utils/validation';
import { toDisplayWeight } from '../utils/units';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import AuthScreen from './AuthScreen';
import CoachConnect from './CoachConnect';
import ConnectionDiagnostics from './shared/ConnectionDiagnostics';
import { supabaseConfigError } from '../lib/supabase';
import type { Sport, WeightClass, ExperienceLevel, FightCamp } from '../types';
import { format, addDays, parseISO } from 'date-fns';
import Modal from './shared/Modal';
import ConfirmDialog from './shared/ConfirmDialog';

const WEIGHT_CLASSES: WeightClass[] = [
  'Strawweight', 'Flyweight', 'Bantamweight', 'Featherweight',
  'Lightweight', 'Welterweight', 'Middleweight', 'Light Heavyweight',
  'Heavyweight', 'Super Heavyweight',
];
const SPORTS: Sport[] = ['Boxing', 'MMA', 'Muay Thai', 'Kickboxing', 'Wrestling', 'BJJ'];
const EXPERIENCE_LEVELS: ExperienceLevel[] = ['Beginner', 'Amateur', 'Semi-Pro', 'Professional'];

interface Props {
  onNewCamp: () => void;
  onNavigate?: (view: string) => void;
}

export default function Settings({ onNewCamp, onNavigate }: Props) {
  const { state, dispatch } = useApp();
  const { currentUser, camps, activeCamp, coaches } = state;
  const weightUnit = state.dashboardPrefs?.weightUnit ?? 'lbs';
  const [showUpgrade, setShowUpgrade] = useState(false);
  const sub = state.subscription;
  const userIsPro = isPro(sub);
  const userIsCoachPro = isCoachPro(sub);

  // Bluetooth HR — the app's single connection (see context/HeartRateContext).
  // `maxHRDefault` is the age *estimate* alone, not `deriveMaxHR`: it backs the
  // "reset to estimate" behaviour of the editor below, which must not read back
  // the saved override it is replacing.
  const maxHRDefault = estimateMaxHR(currentUser?.age);
  const hr = useHeartRate();
  const [editingMaxHR, setEditingMaxHR] = useState(false);
  const [maxHRDraft, setMaxHRDraft] = useState(String(currentUser?.maxHR ?? maxHRDefault));
  const [editingMEP, setEditingMEP] = useState(false);
  const [mepDraft, setMepDraft] = useState(String(currentUser?.mepTarget ?? 65));

  function saveMaxHR() {
    if (!currentUser) return;
    dispatch({ type: 'UPDATE_PROFILE', payload: { ...currentUser, maxHR: parseInt(maxHRDraft) || maxHRDefault } });
    setEditingMaxHR(false);
  }
  function saveMEPTarget() {
    if (!currentUser) return;
    dispatch({ type: 'UPDATE_PROFILE', payload: { ...currentUser, mepTarget: parseInt(mepDraft) || 65 } });
    setEditingMEP(false);
  }

  // Custom bell
  const bellInputRef = useRef<HTMLInputElement>(null);
  const [bellFile, setBellFile] = useState<File | null>(null);
  const [bellSaved, setBellSaved] = useState(false);
  const [hasBell, setHasBell] = useState(hasCustomBell());

  // Account (cloud sync — optional)
  const { configured: authConfigured, user: authUser, signOut: authSignOut, deleteAccount } = useAuth();
  const { status: syncStatus, lastSyncedAt, error: syncError, syncNow } = useSync();
  const [showAuth, setShowAuth] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const syncLabel = syncStatus === 'syncing' ? 'Syncing…'
    : syncStatus === 'error' ? (syncError ?? 'Sync failed')
    : lastSyncedAt ? `Backed up ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : 'Synced across your devices';

  // Training reminders (local notifications)
  const [reminders, setReminders] = useState(remindersEnabled());
  async function toggleReminders() {
    if (reminders) {
      await disableReminders();
      setReminders(false);
      return;
    }
    const granted = await requestNotificationPermission();
    if (!granted) return; // user denied at OS level
    setRemindersEnabled(true);
    setReminders(true);
    const weighIn = !!(activeCamp && !activeCamp.isOffSeason && activeCamp.fightDate);
    await syncReminders({ weighIn });
    // The streak alert and weekly recap reconcile on state changes; flipping
    // the pref on is one more moment they must catch, or an already-at-risk
    // streak / already-trained week stays silent until the next workout.
    if (state.gamification?.streak) await syncStreakRiskAlert(state.gamification.streak);
    await syncWeeklyReport(computeWeekReportStats(state));
  }

  // Per-category reminder switches. Each flip has to re-run the reconcilers,
  // not just write the preference: every sync function cancels its own
  // notifications before rescheduling, so re-running them is what actually
  // clears an alert the user just switched off (or arms one they switched on)
  // instead of leaving it queued in the OS until the next unrelated state
  // change.
  const [reminderCategories, setReminderCategories] = useState(getReminderCategories());
  async function toggleReminderCategory(key: ReminderCategory) {
    const next = !reminderCategories[key];
    setReminderCategoryEnabled(key, next);
    setReminderCategories(getReminderCategories());

    if (key === 'checkIn' || key === 'weighIn') {
      const weighIn = !!(activeCamp && !activeCamp.isOffSeason && activeCamp.fightDate);
      await syncReminders({ weighIn });
    } else if (key === 'streakRisk') {
      // An empty snapshot still reaches the cancel at the top of the reconciler,
      // which is the whole point of the call when switching the category off.
      await syncStreakRiskAlert(
        state.gamification?.streak ?? { current: 0, lastWorkoutAt: null, expired: true },
      );
    } else {
      await syncWeeklyReport(computeWeekReportStats(state));
    }
  }

  const activeReminderCount = REMINDER_CATEGORIES.filter(c => reminderCategories[c.key]).length;
  const remindersSummary = activeReminderCount === REMINDER_CATEGORIES.length
    ? 'On — all four reminder types'
    : activeReminderCount === 0
      ? 'On — but every type is switched off below'
      : `On — ${activeReminderCount} of ${REMINDER_CATEGORIES.length} types`;

  // Apple Health write-back (native iOS only)
  const [healthSync, setHealthSync] = useState(isHealthWriteEnabled());
  async function toggleHealthSync() {
    const result = await setHealthWriteEnabled(!healthSync);
    setHealthSync(result);
  }

  async function handleSaveBell() {
    if (!bellFile) return;
    const dataUrl = await fileToDataUrl(bellFile);
    setCustomBell(dataUrl);
    setHasBell(true);
    setBellSaved(true);
    setBellFile(null);
    setTimeout(() => setBellSaved(false), 1500);
  }

  // Profile editing
  const [editingProfile, setEditingProfile] = useState(false);
  const [pName, setPName] = useState(currentUser?.name ?? '');
  const [pAge, setPAge] = useState(String(currentUser?.age ?? ''));
  const [pSport, setPSport] = useState<Sport>(currentUser?.sport ?? 'Boxing');
  const [pWeightClass, setPWeightClass] = useState<WeightClass>(currentUser?.weightClass ?? 'Lightweight');
  const [pExperience, setPExperience] = useState<ExperienceLevel>(currentUser?.experienceLevel ?? 'Amateur');
  const [pGym, setPGym] = useState(currentUser?.gym ?? '');
  const [pRecord, setPRecord] = useState(currentUser?.record ?? '');
  const [profileSaved, setProfileSaved] = useState(false);

  // Camp editing
  const [editingCamp, setEditingCamp] = useState<FightCamp | null>(null);
  const [cFightDate, setCFightDate] = useState('');
  const [cOpponent, setCOpponent] = useState('');
  const [cRounds, setCRounds] = useState('3');
  const [cRoundDuration, setCRoundDuration] = useState('3');
  const [cCurrentWeight, setCCurrentWeight] = useState('');
  const [cTargetWeight, setCTargetWeight] = useState('');
  const [campWeightError, setCampWeightError] = useState('');

  // Confirms
  const [confirmDeleteCamp, setConfirmDeleteCamp] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const minDate = format(addDays(new Date(), 7), 'yyyy-MM-dd');

  function openEditCamp(camp: FightCamp) {
    setEditingCamp(camp);
    setCFightDate(camp.fightDate ?? '');
    setCOpponent(camp.opponent ?? '');
    setCRounds(String(camp.rounds));
    setCRoundDuration(String(camp.roundDuration));
    // Seed the fields in the user's display unit; saveCamp converts back.
    setCCurrentWeight(String(toDisplayWeight(camp.currentWeight, weightUnit)));
    setCTargetWeight(String(toDisplayWeight(camp.targetWeight, weightUnit)));
  }

  function saveProfile() {
    if (!currentUser || !pName.trim() || !pAge) return;
    dispatch({
      type: 'UPDATE_PROFILE',
      payload: {
        ...currentUser,
        name: pName.trim(),
        age: parseInt(pAge),
        sport: pSport,
        weightClass: pWeightClass,
        experienceLevel: pExperience,
        gym: pGym.trim() || undefined,
        record: pRecord.trim() || undefined,
      },
    });
    setProfileSaved(true);
    setTimeout(() => { setProfileSaved(false); setEditingProfile(false); }, 1200);
  }

  function saveCamp() {
    if (!editingCamp || !cFightDate) return;
    // These two weights anchor the cut projection and the unsafe-cut alert, so
    // an out-of-range value has to be rejected here — the input's min/max only
    // apply to native form submission, which this button doesn't use. Typed in
    // the display unit; stored in lbs.
    const currentWeight = parseWeightInput(cCurrentWeight, weightUnit);
    const targetWeight = parseWeightInput(cTargetWeight, weightUnit);
    if (currentWeight === null || targetWeight === null) {
      setCampWeightError(weightRangeHint(weightUnit));
      return;
    }
    setCampWeightError('');
    const campWeeks = editingCamp.campWeeks;
    const startDate = format(addDays(parseISO(cFightDate), -(campWeeks * 7)), 'yyyy-MM-dd');
    dispatch({
      type: 'UPDATE_CAMP',
      payload: {
        ...editingCamp,
        fightDate: cFightDate,
        opponent: cOpponent.trim() || undefined,
        rounds: parseInt(cRounds),
        roundDuration: parseInt(cRoundDuration),
        currentWeight,
        targetWeight,
        startDate,
      },
    });
    setEditingCamp(null);
  }

  function handleDeleteCamp(id: string) {
    dispatch({ type: 'DELETE_CAMP', payload: id });
    setConfirmDeleteCamp(null);
  }

  function handleReset() {
    dispatch({ type: 'RESET' });
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError('');
    const { error } = await deleteAccount();
    setDeleting(false);
    if (error) {
      setDeleteError(error);
      return;
    }
    // Account is gone server-side and the session is cleared — wipe all local
    // data and return to onboarding.
    setConfirmDelete(false);
    dispatch({ type: 'RESET' });
  }

  const campStats = (camp: FightCamp) => {
    const workouts = state.workoutLogs.filter(l => l.campId === camp.id).length;
    const sparring = state.sparringLogs.filter(l => l.campId === camp.id).reduce((s, l) => s + l.rounds, 0);
    return { workouts, sparring };
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Profile Section */}
      <div className="mx-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Profile</p>
          <button
            onClick={() => {
              setEditingProfile(true);
              setPName(currentUser?.name ?? '');
              setPAge(String(currentUser?.age ?? ''));
              setPSport(currentUser?.sport ?? 'Boxing');
              setPWeightClass(currentUser?.weightClass ?? 'Lightweight');
              setPExperience(currentUser?.experienceLevel ?? 'Amateur');
              setPGym(currentUser?.gym ?? '');
              setPRecord(currentUser?.record ?? '');
            }}
            className="flex items-center gap-1.5 text-brand-500 text-xs font-semibold hover:text-brand-400 transition-colors"
          >
            <Edit3 size={13} /> Edit
          </button>
        </div>

        <div className="card flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-brand-700 to-brand-900 rounded-2xl flex items-center justify-center flex-shrink-0 text-white text-2xl font-black">
            {currentUser?.name?.charAt(0) ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-base truncate">{currentUser?.name}</p>
            {currentUser?.gym && <p className="text-xs text-gray-400 truncate">{currentUser.gym}</p>}
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className="badge bg-dark-500 text-gray-400 text-xs">{currentUser?.sport}</span>
              <span className="badge bg-dark-500 text-gray-400 text-xs">{currentUser?.weightClass}</span>
              <span className="badge bg-dark-500 text-gray-400 text-xs">{currentUser?.experienceLevel}</span>
              {currentUser?.record && (
                <span className="badge bg-brand-900/40 text-brand-400 text-xs">{currentUser.record}</span>
              )}
            </div>
          </div>
          <div className={`badge ${currentUser?.role === 'coach' ? 'bg-accent-violet/20 text-accent-violet' : 'bg-accent-flame/20 text-accent-flame'}`}>
            {currentUser?.role}
          </div>
        </div>
      </div>

      {/* Fight Camps Section */}
      {currentUser?.role === 'fighter' && (
        <div className="mx-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Fight Camps ({camps.length})</p>
            <button
              onClick={onNewCamp}
              className="flex items-center gap-1.5 text-brand-500 text-xs font-semibold hover:text-brand-400 transition-colors"
            >
              <Plus size={13} /> New Camp
            </button>
          </div>

          {camps.length === 0 ? (
            <div className="card text-center py-8">
              <Flame size={28} className="text-gray-450 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No fight camps yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...camps].reverse().map(camp => {
                const isActive = activeCamp?.id === camp.id;
                const stats = campStats(camp);
                const daysOut = camp.fightDate
                  ? Math.ceil((new Date(camp.fightDate).getTime() - Date.now()) / 86400000)
                  : 0;
                const isPast = camp.fightDate ? daysOut < 0 : false;

                return (
                  <div
                    key={camp.id}
                    className={`card border-2 transition-all ${isActive ? 'border-brand-600' : 'border-dark-500'}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-white text-sm">
                            {camp.isOffSeason
                              ? 'Off Season Training'
                              : (camp.fightDate ? format(parseISO(camp.fightDate), 'MMM d, yyyy') : '—')}
                          </p>
                          {isActive && (
                            <span className="badge bg-brand-900/60 text-brand-400 text-xs">Active</span>
                          )}
                          {isPast && (
                            <span className="badge bg-gray-800 text-gray-400 text-xs">Past</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {camp.weightClass} · {camp.rounds}R · {camp.campWeeks}wk camp
                          {camp.opponent && <span> · vs {camp.opponent}</span>}
                        </p>
                        {!isPast && (
                          <p className={`text-xs font-medium mt-0.5 ${daysOut < 14 ? 'text-red-400' : daysOut < 28 ? 'text-yellow-400' : 'text-brand-400'}`}>
                            {daysOut > 0 ? `${daysOut} days out` : 'Fight day!'}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditCamp(camp)}
                          aria-label={`Edit camp: ${camp.weightClass}${camp.opponent ? ` vs ${camp.opponent}` : ''}`}
                          className="p-2 text-gray-400 hover:text-white transition-colors"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteCamp(camp.id)}
                          aria-label={`Delete camp: ${camp.weightClass}${camp.opponent ? ` vs ${camp.opponent}` : ''}`}
                          className="p-2 text-gray-450 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 pt-2 border-t border-dark-500">
                      <div className="text-center">
                        <p className="text-sm font-bold text-white">{stats.workouts}</p>
                        <p className="text-xs text-gray-450">sessions</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-white">{stats.sparring}</p>
                        <p className="text-xs text-gray-450">spar rds</p>
                      </div>
                      <div className="flex-1" />
                      {!isActive && (
                        <button
                          onClick={() => dispatch({ type: 'SET_ACTIVE_CAMP', payload: camp.id })}
                          className="text-xs text-brand-500 font-semibold hover:text-brand-400 transition-colors flex items-center gap-1"
                        >
                          Switch to this
                          <ChevronRight size={12} />
                        </button>
                      )}
                      {isActive && (
                        <span className="flex items-center gap-1 text-xs text-brand-400 font-semibold">
                          <Check size={12} /> Current
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* My Coach — fighters only */}
      {currentUser?.role === 'fighter' && (
        <div className="mx-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">My Coach</p>
            {coaches.length > 0 && currentUser.coachId && (
              <button
                onClick={() => dispatch({ type: 'LINK_COACH', payload: null })}
                className="text-xs text-gray-450 hover:text-red-400 transition-colors"
              >
                Unlink
              </button>
            )}
          </div>
          {coaches.length === 0 ? (
            <div className="card text-center py-6">
              <Users size={24} className="text-gray-450 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No coaches in the system yet</p>
              <p className="text-xs text-gray-450 mt-1">A coach needs to create a profile on this device first</p>
            </div>
          ) : (
            <div className="space-y-2">
              {coaches.map(coach => {
                const isLinked = currentUser.coachId === coach.id;
                return (
                  <button
                    key={coach.id}
                    onClick={() => dispatch({ type: 'LINK_COACH', payload: isLinked ? null : coach.id })}
                    className={`w-full card flex items-center gap-3 transition-all text-left ${isLinked ? 'border-accent-violet/60' : 'hover:border-surface-3'}`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isLinked ? 'bg-accent-violet/25' : 'bg-surface-2'}`}>
                      <span className={`font-black text-base ${isLinked ? 'text-accent-violet' : 'text-gray-400'}`}>{coach.name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm ${isLinked ? 'text-white' : 'text-gray-300'}`}>{coach.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {coach.gym && <span className="text-xs text-gray-450">{coach.gym}</span>}
                        <span className="badge bg-dark-500 text-gray-400 text-xs">{coach.sport}</span>
                      </div>
                    </div>
                    {isLinked ? (
                      <div className="flex items-center gap-1 text-accent-violet">
                        <UserCheck size={16} />
                        <span className="text-xs font-semibold">Linked</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-450">Link</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Subscription */}
      <div className="mx-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Subscription</p>
        {userIsPro ? (
          <div className="card">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${userIsCoachPro ? 'bg-accent-violet/20' : 'bg-accent-flame/20'}`}>
                {userIsCoachPro ? <Trophy size={18} className="text-accent-violet" /> : <Zap size={18} className="text-accent-flame" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-white">
                  {userIsCoachPro ? 'Coach Pro' : 'Fighter Pro'}
                </p>
                <p className="text-xs text-gray-400">
                  {sub.expiresAt
                    ? `Renews ${new Date(sub.expiresAt).toLocaleDateString()}`
                    : 'Active'}
                </p>
              </div>
              {Capacitor.isNativePlatform() && (
                <button
                  // Rejects when the purchase SDK never configured; without a
                  // catch that surfaces as an unhandled rejection and the tap
                  // appears to do nothing at all.
                  onClick={() => { void RevenueCat.presentCustomerCenter().catch(() => setShowDiagnostics(true)); }}
                  className="text-xs text-brand-500 font-semibold hover:text-brand-400 transition-colors"
                >
                  Manage
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="card bg-gradient-to-br from-brand-900/20 to-dark-700">
            <div className="flex items-center gap-3 mb-3">
              <Zap size={18} className="text-brand-400" />
              <span className="text-sm font-bold text-white">Upgrade to Pro</span>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Unlock AI insights, nutrition tracking, game plans, unlimited camps, Gym Display and more.
            </p>
            <button onClick={() => setShowUpgrade(true)} className="btn-primary w-full text-sm py-2.5">
              View Plans
            </button>
          </div>
        )}
      </div>

      {/* Bluetooth & Devices */}
      {hr.supported && (
        <div className="mx-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Bluetooth &amp; Devices</p>
          <div className="card divide-y divide-dark-500 p-0 overflow-hidden">
            {/* Connect / disconnect */}
            <div className="px-4 py-3.5 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${hr.connected ? 'bg-green-900/30' : 'bg-dark-600'}`}>
                {hr.connected
                  ? <Bluetooth size={15} className="text-green-400" />
                  : <BluetoothOff size={15} className="text-gray-400" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">
                  {hr.connected ? hr.deviceName ?? 'HR Device' : 'Heart Rate Device'}
                </p>
                <p className="text-xs text-gray-400">
                  {hr.connected && hr.hr !== null
                    ? <span style={{ color: ZONE_COLORS[hr.zone] }}>
                        {hr.hr} bpm · {ZONE_LABELS[hr.zone]}
                      </span>
                    : hr.connected
                    ? 'Connected — waiting for data'
                    : 'MyZone, Polar, Garmin, or any BLE HR belt'
                  }
                </p>
              </div>
              <button
                onClick={hr.connected ? hr.disconnect : hr.connect}
                disabled={hr.connecting}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                  hr.connected
                    ? 'bg-dark-600 text-gray-400 hover:text-white'
                    : 'bg-brand-600 hover:bg-brand-500 text-white'
                }`}
              >
                {hr.connecting ? '…' : hr.connected ? 'Disconnect' : 'Connect'}
              </button>
            </div>
            {hr.connectError && (
              <div className="px-4 py-2.5 bg-red-950/30 border-t border-red-900/40">
                <p className="text-xs text-red-400">{hr.connectError}</p>
              </div>
            )}

            {/* Apple Watch — read-only status, deliberately. There is no
                connect button because there is nothing to connect: the watch
                app streams whenever it is running a session, and a control here
                would imply a pairing step that does not exist. */}
            {hr.watchAvailable && (
              <div className="px-4 py-3.5 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${hr.source === 'watch' ? 'bg-green-900/30' : 'bg-dark-600'}`}>
                  <Watch size={15} className={hr.source === 'watch' ? 'text-green-400' : 'text-gray-400'} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Apple Watch</p>
                  <p className="text-xs text-gray-400">
                    {hr.source === 'watch'
                      ? `Streaming · ${hr.hr ?? '—'} bpm`
                      : hr.connected
                        // Explains why the watch is idle rather than leaving it
                        // looking broken next to a working strap.
                        ? 'Standing by — your chest strap is more accurate, so it wins'
                        : 'Start a session on your watch to stream heart rate'}
                  </p>
                </div>
              </div>
            )}

            {/* Max HR */}
            <div className="px-4 py-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Max Heart Rate</p>
                  <p className="text-xs text-gray-400">Used for zone calculation</p>
                </div>
                {editingMaxHR ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={100} max={220}
                      className="input w-20 text-center py-1.5 text-sm"
                      value={maxHRDraft}
                      onChange={e => setMaxHRDraft(e.target.value)}
                    />
                    <button onClick={saveMaxHR} className="text-xs font-semibold text-green-400 hover:text-green-300 transition-colors">Save</button>
                    <button onClick={() => setEditingMaxHR(false)} className="text-xs text-gray-400 hover:text-white transition-colors">✕</button>
                  </div>
                ) : (
                  <button onClick={() => { setMaxHRDraft(String(currentUser?.maxHR ?? maxHRDefault)); setEditingMaxHR(true); }}
                    className="text-sm font-semibold text-brand-400 hover:text-brand-300 transition-colors">
                    {currentUser?.maxHR ?? maxHRDefault} bpm
                  </button>
                )}
              </div>
            </div>

            {/* MEP Target */}
            <div className="px-4 py-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Daily MEP Target</p>
                  <p className="text-xs text-gray-400">MyZone Effort Points per session</p>
                </div>
                {editingMEP ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={10} max={300}
                      className="input w-20 text-center py-1.5 text-sm"
                      value={mepDraft}
                      onChange={e => setMepDraft(e.target.value)}
                    />
                    <button onClick={saveMEPTarget} className="text-xs font-semibold text-green-400 hover:text-green-300 transition-colors">Save</button>
                    <button onClick={() => setEditingMEP(false)} className="text-xs text-gray-400 hover:text-white transition-colors">✕</button>
                  </div>
                ) : (
                  <button onClick={() => { setMepDraft(String(currentUser?.mepTarget ?? 65)); setEditingMEP(true); }}
                    className="text-sm font-semibold text-brand-400 hover:text-brand-300 transition-colors">
                    {currentUser?.mepTarget ?? 65} MEP
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Integrations */}
      <div className="mx-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Integrations</p>
        <div className="card divide-y divide-dark-500 p-0 overflow-hidden">
          {/* Camp History */}
          <button
            onClick={() => onNavigate?.('camp-history')}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-dark-600 transition-colors text-left"
          >
            <div className="w-8 h-8 bg-brand-900/40 rounded-lg flex items-center justify-center flex-shrink-0">
              <Trophy size={15} className="text-brand-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Camp History & Fight Breakdowns</p>
              <p className="text-xs text-gray-450">Compare camps · tune next camp</p>
            </div>
            <ChevronRight size={15} className="text-gray-450" />
          </button>

          {/* Achievements & Belt */}
          <button
            onClick={() => onNavigate?.('achievements')}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-dark-600 transition-colors text-left"
          >
            <div className="w-8 h-8 bg-yellow-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <Award size={15} className="text-yellow-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Achievements & Belt</p>
              <p className="text-xs text-gray-450">Rank · streak · PRs · weekly challenges</p>
            </div>
            <ChevronRight size={15} className="text-gray-450" />
          </button>

          {/* AI Insights */}
          <button
            onClick={() => onNavigate?.('aiinsights')}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-dark-600 transition-colors text-left"
          >
            <div className="w-8 h-8 bg-accent-violet/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Brain size={15} className="text-accent-violet" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">AI Coach Insights</p>
              <p className="text-xs text-gray-450">Included with Pro — no setup needed</p>
            </div>
            <ChevronRight size={15} className="text-gray-450" />
          </button>

          {/* Custom Round Bell */}
          <div className="px-4 py-3.5 border-t border-dark-600">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-base">🔔</span>
                <p className="text-sm font-medium text-white">Custom Round Bell</p>
              </div>
              {hasBell && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-green-400 font-semibold">✓ Set</span>
                  <button
                    onClick={() => { clearCustomBell(); setHasBell(false); }}
                    className="text-xs text-gray-450 hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Plays at the start of every round instead of the built-in bell.
            </p>
            <div className="space-y-2">
              <input
                ref={bellInputRef}
                type="file"
                aria-label="Choose a custom round-start bell audio file"
                accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,audio/*"
                className="hidden"
                onChange={e => { setBellFile(e.target.files?.[0] ?? null); setBellSaved(false); }}
              />
              <button
                onClick={() => bellInputRef.current?.click()}
                className="btn-secondary px-3 py-1.5 text-xs rounded-xl"
              >
                {bellFile ? `✓ ${bellFile.name}` : 'Choose audio file…'}
              </button>
              {bellFile && (
                <button
                  onClick={handleSaveBell}
                  className={`px-4 py-1.5 text-xs rounded-xl font-semibold transition-all ${bellSaved ? 'bg-green-700 text-white' : 'btn-primary'}`}
                >
                  {bellSaved ? '✓ Saved' : 'Save Bell'}
                </button>
              )}
            </div>
          </div>

          {/* Apple Health */}
          <IconChipRow
            icon={<Heart size={15} />}
            accent="var(--accent-crimson)"
            title="Apple Health"
            subtitle="Import workouts & weight · Export data"
            onClick={() => onNavigate?.('health')}
          />
        </div>
      </div>

      {/* Account (cloud sync — optional) */}
      {(authConfigured || supabaseConfigError) && (
        <div className="mx-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Account</p>
          <div className="card">
            {/* A build whose Supabase credentials are broken has no working
                sign-in to offer, but silently dropping the whole section leaves
                the user hunting for an account screen that used to be here. */}
            {supabaseConfigError && (
              <div className="flex items-start gap-2.5">
                <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Accounts unavailable in this build</p>
                  <p className="text-xs text-gray-400 mt-0.5">{supabaseConfigError}</p>
                  <p className="text-xs text-gray-450 mt-1.5">
                    Your camps, sessions and weight history are all stored on this device and are unaffected.
                  </p>
                </div>
              </div>
            )}
            {authUser && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-900/40 rounded-xl flex items-center justify-center flex-shrink-0">
                  <UserCheck size={18} className="text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{authUser.email}</p>
                  <p className={`text-xs ${syncStatus === 'error' ? 'text-red-400' : 'text-gray-400'}`}>{syncLabel}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <button
                    onClick={() => void syncNow()}
                    disabled={syncStatus === 'syncing'}
                    className="text-xs font-semibold text-brand-400 hover:text-brand-300 disabled:opacity-50"
                  >
                    {syncStatus === 'syncing' ? '…' : 'Sync now'}
                  </button>
                  <button onClick={() => authSignOut()} className="text-xs font-semibold text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border border-dark-400">
                    Sign out
                  </button>
                </div>
              </div>
            )}
            {authUser && (
              <div className="mt-3 pt-3 border-t border-surface-2 -mx-4">
                {/* Destructive rows are crimson text and icon on the default
                    background, never a filled crimson button (§9) — a filled
                    button reads as the primary action on the screen, which
                    "Delete account" must never be. */}
                <IconChipRow
                  icon={<Trash2 size={14} />}
                  accent="var(--accent-crimson)"
                  destructive
                  title="Delete account"
                  subtitle="Permanently remove your account and all synced data"
                  onClick={() => { setDeleteError(''); setConfirmDelete(true); }}
                />
              </div>
            )}
            {!authUser && authConfigured && (
              <button onClick={() => setShowAuth(true)} className="w-full flex items-center gap-3 text-left">
                <div className="w-10 h-10 bg-dark-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <UserCheck size={18} className="text-gray-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Sign in / Create account</p>
                  <p className="text-xs text-gray-400">Sync your camps &amp; connect with your coach</p>
                </div>
                <ChevronRight size={16} className="text-gray-450" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Coach ↔ fighter linking (cloud) */}
      <CoachConnect />

      {/* App Settings */}
      <div className="mx-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">App</p>
        <div className="card divide-y divide-dark-500 p-0 overflow-hidden">
          <button
            onClick={() => setShowDiagnostics(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-dark-600 transition-colors text-left"
          >
            <div className="w-8 h-8 bg-dark-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Stethoscope size={15} className={supabaseConfigError ? 'text-red-400' : 'text-gray-400'} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Connection diagnostics</p>
              <p className="text-xs text-gray-400">Check sign-in and purchases if something isn&apos;t working</p>
            </div>
            <ChevronRight size={15} className="text-gray-450" />
          </button>
          {notificationsSupported() && (
            <button
              onClick={toggleReminders}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-dark-600 transition-colors text-left"
            >
              <div className="w-8 h-8 bg-dark-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Bell size={15} className={reminders ? 'text-brand-400' : 'text-gray-400'} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Training reminders</p>
                <p className="text-xs text-gray-450">
                  {reminders ? remindersSummary : 'Off — tap to enable'}
                </p>
              </div>
              <div className={`w-10 h-6 rounded-full p-0.5 transition-colors flex-shrink-0 ${reminders ? 'bg-brand-600' : 'bg-dark-500'}`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${reminders ? 'translate-x-4' : ''}`} />
              </div>
            </button>
          )}
          {/* Per-category switches, revealed only once reminders are on: they
              are meaningless while the master switch (which owns the OS
              permission prompt) is off, and four dead rows would just be noise
              for a user who has opted out of notifications entirely. */}
          {notificationsSupported() && reminders && (
            <div className="pl-[3.25rem] pr-4 pb-3 space-y-3">
              {REMINDER_CATEGORIES.map(cat => {
                const on = reminderCategories[cat.key];
                return (
                  <button
                    key={cat.key}
                    onClick={() => toggleReminderCategory(cat.key)}
                    role="switch"
                    aria-checked={on}
                    className="w-full flex items-center gap-3 text-left"
                  >
                    <div className="flex-1">
                      <p className="text-sm text-white">{cat.label}</p>
                      <p className="text-xs text-gray-450">{cat.description}</p>
                    </div>
                    <div className={`w-9 h-5 rounded-full p-0.5 transition-colors flex-shrink-0 ${on ? 'bg-brand-600' : 'bg-dark-500'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : ''}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {Capacitor.isNativePlatform() && (
            <button
              onClick={toggleHealthSync}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-dark-600 transition-colors text-left"
            >
              <div className="w-8 h-8 bg-dark-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <HeartPulse size={15} className={healthSync ? 'text-brand-400' : 'text-gray-400'} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Sync to Apple Health</p>
                <p className="text-xs text-gray-450">
                  {healthSync ? 'On — new workouts & weigh-ins saved to Health' : 'Off — tap to enable'}
                </p>
              </div>
              <div className={`w-10 h-6 rounded-full p-0.5 transition-colors flex-shrink-0 ${healthSync ? 'bg-brand-600' : 'bg-dark-500'}`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${healthSync ? 'translate-x-4' : ''}`} />
              </div>
            </button>
          )}
          <button
            onClick={() => dispatch({ type: 'SET_DASHBOARD_PREF', payload: { weightUnit: weightUnit === 'kg' ? 'lbs' : 'kg' } })}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-dark-600 transition-colors text-left"
          >
            <div className="w-8 h-8 bg-dark-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Scale size={15} className="text-gray-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Weight units</p>
              <p className="text-xs text-gray-450">
                {weightUnit === 'kg' ? 'Kilograms (kg) — tap for lbs' : 'Pounds (lbs) — tap for kg'}
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-brand-400 flex-shrink-0 uppercase">{weightUnit}</span>
          </button>
          <button
            onClick={() => {
              const hidden = !(state.dashboardPrefs?.progressWidgetHidden ?? false);
              dispatch({ type: 'SET_DASHBOARD_PREF', payload: { progressWidgetHidden: hidden } });
            }}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-dark-600 transition-colors text-left"
          >
            <div className="w-8 h-8 bg-dark-600 rounded-lg flex items-center justify-center flex-shrink-0">
              {state.dashboardPrefs?.progressWidgetHidden
                ? <EyeOff size={15} className="text-gray-400" />
                : <Eye size={15} className="text-gray-400" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Progress widget on dashboard</p>
              <p className="text-xs text-gray-450">
                {state.dashboardPrefs?.progressWidgetHidden ? 'Hidden — tap to show' : 'Visible — tap to hide'}
              </p>
            </div>
          </button>

          <button
            onClick={() => setConfirmReset(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-dark-600 transition-colors text-left"
          >
            <div className="w-8 h-8 bg-red-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <LogOut size={15} className="text-red-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-red-400">Reset & Log Out</p>
              <p className="text-xs text-gray-450">Delete all data and start over</p>
            </div>
          </button>
        </div>
      </div>

      {/* Legal & App Version */}
      <div className="mx-4 text-center space-y-2">
        <div className="flex items-center justify-center gap-4">
          <a
            href="https://fightcamp.netlify.app/privacy.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-450 hover:text-gray-400 underline transition-colors"
          >
            Privacy Policy
          </a>
          <span className="text-gray-700">·</span>
          <a
            href="https://fightcamp.netlify.app/terms.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-450 hover:text-gray-400 underline transition-colors"
          >
            Terms of Use (EULA)
          </a>
        </div>
        <p className="text-xs text-gray-700">Fight Camp v1.0 · Built for fighters</p>
      </div>

      {/* Edit Profile Modal */}
      {editingProfile && (
        <Modal title="Edit Profile" onClose={() => setEditingProfile(false)} footer={
          <button
            onClick={saveProfile}
            disabled={!pName.trim() || !pAge}
            className={`btn-primary w-full flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${profileSaved ? 'bg-green-700 hover:bg-green-600' : ''}`}
          >
            {profileSaved ? <><Check size={16} /> Saved!</> : 'Save Profile'}
          </button>
        }>
          <div className="space-y-4">
            <div>
              <label className="block">
                <span className="label">Full Name</span>
                <input className="input" value={pName} onChange={e => setPName(e.target.value)} placeholder="Your name" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block">
                  <span className="label">Age</span>
                  <input className="input" type="number" min={16} max={60} value={pAge} onChange={e => setPAge(e.target.value)} />
                </label>
              </div>
              <div>
                <label className="block">
                  <span className="label">Sport</span>
                  <select className="select" value={pSport} onChange={e => setPSport(e.target.value as Sport)}>
                  {SPORTS.map(s => <option key={s}>{s}</option>)}
                </select>
                </label>
              </div>
            </div>
            <div>
              <label className="block">
                <span className="label">Weight Class</span>
                <select className="select" value={pWeightClass} onChange={e => setPWeightClass(e.target.value as WeightClass)}>
                {WEIGHT_CLASSES.map(wc => <option key={wc}>{wc}</option>)}
              </select>
              </label>
            </div>
            <div>
              <label className="label">Experience Level</label>
              <div role="group" aria-label="Experience Level" className="grid grid-cols-2 gap-2">
                {EXPERIENCE_LEVELS.map(level => (
                  <button
                    key={level}
                    onClick={() => setPExperience(level)}
                    className={`py-2 rounded-xl text-sm font-medium border-2 transition-all ${pExperience === level ? 'border-brand-500 bg-brand-900/30 text-brand-400' : 'border-dark-400 bg-dark-600 text-gray-400'}`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block">
                <span className="label">Gym / Team</span>
                <input className="input" value={pGym} onChange={e => setPGym(e.target.value)} placeholder="Your gym or team" />
              </label>
            </div>
            <div>
              <label className="block">
                <span className="label">Record (e.g. 5-2-0)</span>
                <input className="input" value={pRecord} onChange={e => setPRecord(e.target.value)} placeholder="W-L-D" />
              </label>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Camp Modal */}
      {editingCamp && (
        <Modal title="Edit Fight Camp" onClose={() => { setEditingCamp(null); setCampWeightError(''); }} footer={
          <button
            onClick={saveCamp}
            disabled={!cFightDate || parseWeightInput(cCurrentWeight, weightUnit) === null || parseWeightInput(cTargetWeight, weightUnit) === null}
            className="btn-primary w-full disabled:opacity-50"
          >
            Save Changes
          </button>
        }>
          <div className="space-y-4">
            {campWeightError && (
              <div className="rounded-xl p-3 border bg-red-900/25 border-red-800">
                <p className="text-sm font-medium text-red-300">{campWeightError}</p>
              </div>
            )}
            <div>
              <label className="block">
                <span className="label">Fight Date</span>
                <input
                className="input"
                type="date"
                min={minDate}
                value={cFightDate}
                onChange={e => setCFightDate(e.target.value)}
              />
              </label>
            </div>
            <div>
              <label className="block">
                <span className="label">Opponent (Optional)</span>
                <input className="input" placeholder="Opponent's name" value={cOpponent} onChange={e => setCOpponent(e.target.value)} />
              </label>
            </div>
            {/* BKFC Format Preset */}
            <button
              type="button"
              onClick={() => { setCRounds('5'); setCRoundDuration('2'); }}
              className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left w-full ${cRounds === '5' && cRoundDuration === '2' ? 'border-red-600 bg-red-950/30' : 'border-dark-400 bg-dark-600 hover:border-red-800/60'}`}
            >
              <div className="w-9 h-9 bg-red-900/40 rounded-lg flex items-center justify-center flex-shrink-0">
                <Flame size={16} className="text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">BKFC Format</p>
                <p className="text-xs text-red-400">5 rounds · 2 min · 1 min rest — bare knuckle rules</p>
              </div>
              {cRounds === '5' && cRoundDuration === '2' && (
                <Check size={16} className="text-red-400 flex-shrink-0" />
              )}
            </button>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block">
                  <span className="label">Rounds</span>
                  <select className="select" value={cRounds} onChange={e => setCRounds(e.target.value)}>
                  {[3, 4, 5, 6, 8, 10, 12, 15].map(n => <option key={n} value={n}>{n} rounds</option>)}
                </select>
                </label>
              </div>
              <div>
                <label className="block">
                  <span className="label">Round Duration</span>
                  <select className="select" value={cRoundDuration} onChange={e => setCRoundDuration(e.target.value)}>
                  <option value="2">2 minutes</option>
                  <option value="3">3 minutes</option>
                  <option value="5">5 minutes</option>
                </select>
                </label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block">
                  <span className="label">Current Weight ({weightUnit})</span>
                  <input className="input" type="number" step="0.1" value={cCurrentWeight} onChange={e => setCCurrentWeight(e.target.value)} />
                </label>
              </div>
              <div>
                <label className="block">
                  <span className="label">Target Weight ({weightUnit})</span>
                  <input className="input" type="number" step="0.1" value={cTargetWeight} onChange={e => setCTargetWeight(e.target.value)} />
                </label>
              </div>
            </div>
            <div className="bg-dark-600 rounded-xl p-3 border border-dark-400">
              <p className="text-xs text-gray-400">
                Camp length stays at <span className="text-white font-medium">{editingCamp.campWeeks} weeks</span>. Start date will be recalculated from the fight date.
              </p>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Camp Confirm */}
      {confirmDeleteCamp && (
        <ConfirmDialog
          title="Delete Fight Camp?"
          message="This will permanently delete this camp and all associated workouts, sparring logs, conditioning tests, and weight entries. This cannot be undone."
          confirmLabel="Delete Camp"
          danger
          onConfirm={() => handleDeleteCamp(confirmDeleteCamp)}
          onCancel={() => setConfirmDeleteCamp(null)}
        />
      )}

      {/* Reset Confirm */}
      {confirmReset && (
        <ConfirmDialog
          title="Reset Everything?"
          message="This will delete your profile, all fight camps, and all training data. You will be returned to the onboarding screen. This cannot be undone."
          confirmLabel="Reset App"
          danger
          onConfirm={handleReset}
          onCancel={() => setConfirmReset(false)}
        />
      )}

      {/* Delete Account Confirm */}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Account?"
          message={
            deleteError
              ? `Couldn't delete your account: ${deleteError}. Please try again.`
              : deleting
                ? 'Deleting your account and all of your data…'
                : 'This permanently deletes your account and every camp, log, and weigh-in synced to it. This cannot be undone. If you have an active subscription, cancel it in your device Settings — deleting your account does not cancel App Store billing.'
          }
          confirmLabel={deleting ? 'Deleting…' : 'Delete Account'}
          danger
          onConfirm={() => { if (!deleting) void handleDeleteAccount(); }}
          onCancel={() => { if (!deleting) setConfirmDelete(false); }}
        />
      )}

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
      {showAuth && <AuthScreen onClose={() => setShowAuth(false)} />}

      {showDiagnostics && <ConnectionDiagnostics onClose={() => setShowDiagnostics(false)} />}
    </div>
  );
}
