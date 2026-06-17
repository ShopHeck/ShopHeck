import { useState, useRef } from 'react';
import { Award, ChevronRight, Eye, EyeOff, Flame, Plus, Trash2, Check, AlertTriangle, Edit3, LogOut, Brain, Heart, Key, UserCheck, Users, Zap, Trophy, Bluetooth, BluetoothOff, Bell } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useBluetoothHR, ZONE_COLORS, ZONE_LABELS } from '../hooks/useBluetoothHR';
import UpgradeModal from './shared/UpgradeModal';
import { isPro, isCoachPro } from '../utils/subscription';
import { RevenueCat } from '../plugins/RevenueCat';
import { useApp } from '../context/AppContext';
import { getApiKey, setApiKey as saveApiKeyUtil, clearApiKey } from '../utils/apiKey';
import { hasCustomBell, setCustomBell, clearCustomBell, fileToDataUrl } from '../utils/customBell';
import { notificationsSupported, remindersEnabled, setRemindersEnabled, requestNotificationPermission, syncReminders, disableReminders } from '../utils/notifications';
import type { Sport, WeightClass, ExperienceLevel, FightCamp } from '../types';
import { format, addDays, parseISO } from 'date-fns';
import Modal from './shared/Modal';

const WEIGHT_CLASSES: WeightClass[] = [
  'Strawweight', 'Flyweight', 'Bantamweight', 'Featherweight',
  'Lightweight', 'Welterweight', 'Middleweight', 'Light Heavyweight',
  'Heavyweight', 'Super Heavyweight',
];
const SPORTS: Sport[] = ['Boxing', 'MMA', 'Muay Thai', 'Kickboxing', 'Wrestling', 'BJJ'];
const EXPERIENCE_LEVELS: ExperienceLevel[] = ['Beginner', 'Amateur', 'Semi-Pro', 'Professional'];

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-dark-700 rounded-2xl border border-dark-400 p-5 w-full max-w-sm">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 ${danger ? 'bg-red-900/40' : 'bg-brand-900/40'}`}>
          <AlertTriangle size={22} className={danger ? 'text-red-400' : 'text-brand-400'} />
        </div>
        <h3 className="text-base font-bold text-white text-center mb-2">{title}</h3>
        <p className="text-sm text-gray-400 text-center mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95 ${danger ? 'bg-red-700 hover:bg-red-600 text-white' : 'btn-primary'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  onNewCamp: () => void;
  onNavigate?: (view: string) => void;
}

export default function Settings({ onNewCamp, onNavigate }: Props) {
  const { state, dispatch } = useApp();
  const { currentUser, camps, activeCamp, coaches } = state;
  const [showUpgrade, setShowUpgrade] = useState(false);
  const sub = state.subscription;
  const userIsPro = isPro(sub);
  const userIsCoachPro = isCoachPro(sub);

  // Bluetooth HR
  const maxHRDefault = Math.max(160, 220 - (currentUser?.age ?? 25));
  const hr = useBluetoothHR(currentUser?.maxHR ?? maxHRDefault);
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

  // AI key
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const hasApiKey = !!getApiKey();

  function handleSaveKey() {
    saveApiKeyUtil(apiKeyDraft.trim());
    setKeySaved(true);
    setTimeout(() => { setKeySaved(false); setEditingKey(false); setApiKeyDraft(''); }, 1200);
  }

  // Custom bell
  const bellInputRef = useRef<HTMLInputElement>(null);
  const [bellFile, setBellFile] = useState<File | null>(null);
  const [bellSaved, setBellSaved] = useState(false);
  const [hasBell, setHasBell] = useState(hasCustomBell());

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
    setCCurrentWeight(String(camp.currentWeight));
    setCTargetWeight(String(camp.targetWeight));
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
    if (!editingCamp || !cFightDate || !cCurrentWeight || !cTargetWeight) return;
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
        currentWeight: parseFloat(cCurrentWeight),
        targetWeight: parseFloat(cTargetWeight),
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
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Profile</p>
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
            {currentUser?.gym && <p className="text-xs text-gray-500 truncate">{currentUser.gym}</p>}
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className="badge bg-dark-500 text-gray-400 text-xs">{currentUser?.sport}</span>
              <span className="badge bg-dark-500 text-gray-400 text-xs">{currentUser?.weightClass}</span>
              <span className="badge bg-dark-500 text-gray-400 text-xs">{currentUser?.experienceLevel}</span>
              {currentUser?.record && (
                <span className="badge bg-brand-900/40 text-brand-400 text-xs">{currentUser.record}</span>
              )}
            </div>
          </div>
          <div className={`badge ${currentUser?.role === 'coach' ? 'bg-purple-900/40 text-purple-400' : 'bg-brand-900/40 text-brand-400'}`}>
            {currentUser?.role}
          </div>
        </div>
      </div>

      {/* Fight Camps Section */}
      {currentUser?.role === 'fighter' && (
        <div className="mx-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Fight Camps ({camps.length})</p>
            <button
              onClick={onNewCamp}
              className="flex items-center gap-1.5 text-brand-500 text-xs font-semibold hover:text-brand-400 transition-colors"
            >
              <Plus size={13} /> New Camp
            </button>
          </div>

          {camps.length === 0 ? (
            <div className="card text-center py-8">
              <Flame size={28} className="text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No fight camps yet</p>
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
                            <span className="badge bg-gray-800 text-gray-500 text-xs">Past</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
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
                          className="p-2 text-gray-500 hover:text-white transition-colors"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteCamp(camp.id)}
                          className="p-2 text-gray-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 pt-2 border-t border-dark-500">
                      <div className="text-center">
                        <p className="text-sm font-bold text-white">{stats.workouts}</p>
                        <p className="text-xs text-gray-600">sessions</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-white">{stats.sparring}</p>
                        <p className="text-xs text-gray-600">spar rds</p>
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
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">My Coach</p>
            {coaches.length > 0 && currentUser.coachId && (
              <button
                onClick={() => dispatch({ type: 'LINK_COACH', payload: null })}
                className="text-xs text-gray-600 hover:text-red-400 transition-colors"
              >
                Unlink
              </button>
            )}
          </div>
          {coaches.length === 0 ? (
            <div className="card text-center py-6">
              <Users size={24} className="text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No coaches in the system yet</p>
              <p className="text-xs text-gray-600 mt-1">A coach needs to create a profile on this device first</p>
            </div>
          ) : (
            <div className="space-y-2">
              {coaches.map(coach => {
                const isLinked = currentUser.coachId === coach.id;
                return (
                  <button
                    key={coach.id}
                    onClick={() => dispatch({ type: 'LINK_COACH', payload: isLinked ? null : coach.id })}
                    className={`w-full card flex items-center gap-3 transition-all text-left ${isLinked ? 'border-purple-700' : 'hover:border-dark-300'}`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isLinked ? 'bg-purple-900/50' : 'bg-dark-600'}`}>
                      <span className={`font-black text-base ${isLinked ? 'text-purple-400' : 'text-gray-400'}`}>{coach.name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm ${isLinked ? 'text-white' : 'text-gray-300'}`}>{coach.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {coach.gym && <span className="text-xs text-gray-600">{coach.gym}</span>}
                        <span className="badge bg-dark-500 text-gray-500 text-xs">{coach.sport}</span>
                      </div>
                    </div>
                    {isLinked ? (
                      <div className="flex items-center gap-1 text-purple-400">
                        <UserCheck size={16} />
                        <span className="text-xs font-semibold">Linked</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-600">Link</span>
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
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Subscription</p>
        {userIsPro ? (
          <div className="card">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${userIsCoachPro ? 'bg-purple-900/40' : 'bg-brand-900/40'}`}>
                {userIsCoachPro ? <Trophy size={18} className="text-purple-400" /> : <Zap size={18} className="text-brand-400" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-white">
                  {userIsCoachPro ? 'Coach Pro' : 'Fighter Pro'}
                </p>
                <p className="text-xs text-gray-500">
                  {sub.expiresAt
                    ? `Renews ${new Date(sub.expiresAt).toLocaleDateString()}`
                    : 'Active'}
                </p>
              </div>
              {Capacitor.isNativePlatform() && (
                <button
                  onClick={() => RevenueCat.presentCustomerCenter()}
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
              Unlock Gym Display, custom presets, voice announcements, reaction training, session history, AI insights and more.
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
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Bluetooth &amp; Devices</p>
          <div className="card divide-y divide-dark-500 p-0 overflow-hidden">
            {/* Connect / disconnect */}
            <div className="px-4 py-3.5 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${hr.connected ? 'bg-green-900/30' : 'bg-dark-600'}`}>
                {hr.connected
                  ? <Bluetooth size={15} className="text-green-400" />
                  : <BluetoothOff size={15} className="text-gray-500" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">
                  {hr.connected ? hr.deviceName ?? 'HR Device' : 'Heart Rate Device'}
                </p>
                <p className="text-xs text-gray-500">
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

            {/* Max HR */}
            <div className="px-4 py-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Max Heart Rate</p>
                  <p className="text-xs text-gray-500">Used for zone calculation</p>
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
                    <button onClick={() => setEditingMaxHR(false)} className="text-xs text-gray-500 hover:text-white transition-colors">✕</button>
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
                  <p className="text-xs text-gray-500">MyZone Effort Points per session</p>
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
                    <button onClick={() => setEditingMEP(false)} className="text-xs text-gray-500 hover:text-white transition-colors">✕</button>
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
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Integrations</p>
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
              <p className="text-xs text-gray-600">Compare camps · tune next camp</p>
            </div>
            <ChevronRight size={15} className="text-gray-600" />
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
              <p className="text-xs text-gray-600">Rank · streak · PRs · weekly challenges</p>
            </div>
            <ChevronRight size={15} className="text-gray-600" />
          </button>

          {/* AI Insights */}
          <button
            onClick={() => onNavigate?.('aiinsights')}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-dark-600 transition-colors text-left"
          >
            <div className="w-8 h-8 bg-purple-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <Brain size={15} className="text-purple-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">AI Coach Insights</p>
              <p className="text-xs text-gray-600">Claude Opus · {hasApiKey ? 'API key set' : 'API key required'}</p>
            </div>
            <ChevronRight size={15} className="text-gray-600" />
          </button>

          {/* API Key */}
          <div className="px-4 py-3.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Key size={14} className="text-yellow-500" />
                <p className="text-sm font-medium text-white">Anthropic API Key</p>
              </div>
              {hasApiKey ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-green-400 font-semibold">✓ Set</span>
                  <button
                    onClick={() => { clearApiKey(); setEditingKey(false); }}
                    className="text-xs text-gray-600 hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <span className="text-xs text-gray-600">Not set</span>
              )}
            </div>
            {editingKey ? (
              <div className="space-y-2">
                <input
                  type="password"
                  className="input font-mono text-sm"
                  placeholder="sk-ant-..."
                  value={apiKeyDraft}
                  onChange={e => setApiKeyDraft(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveKey}
                    disabled={!apiKeyDraft.trim().startsWith('sk-')}
                    className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${keySaved ? 'bg-green-700 text-white' : 'btn-primary'}`}
                  >
                    {keySaved ? '✓ Saved' : 'Save Key'}
                  </button>
                  <button onClick={() => setEditingKey(false)} className="btn-secondary px-4 py-2 text-sm">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditingKey(true)}
                className="text-xs text-brand-500 hover:text-brand-400 transition-colors"
              >
                {hasApiKey ? 'Update key' : 'Add API key →'}
              </button>
            )}
          </div>

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
                    className="text-xs text-gray-600 hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Plays at the start of every round instead of the built-in bell.
            </p>
            <div className="space-y-2">
              <input
                ref={bellInputRef}
                type="file"
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
          <button
            onClick={() => onNavigate?.('health')}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-dark-600 transition-colors text-left"
          >
            <div className="w-8 h-8 bg-red-950/40 rounded-lg flex items-center justify-center flex-shrink-0">
              <Heart size={15} className="text-red-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Apple Health</p>
              <p className="text-xs text-gray-600">Import workouts & weight · Export data</p>
            </div>
            <ChevronRight size={15} className="text-gray-600" />
          </button>
        </div>
      </div>

      {/* App Settings */}
      <div className="mx-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">App</p>
        <div className="card divide-y divide-dark-500 p-0 overflow-hidden">
          {notificationsSupported() && (
            <button
              onClick={toggleReminders}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-dark-600 transition-colors text-left"
            >
              <div className="w-8 h-8 bg-dark-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Bell size={15} className={reminders ? 'text-brand-400' : 'text-gray-500'} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Training reminders</p>
                <p className="text-xs text-gray-600">
                  {reminders ? 'On — daily check-in & weigh-in nudges' : 'Off — tap to enable'}
                </p>
              </div>
              <div className={`w-10 h-6 rounded-full p-0.5 transition-colors flex-shrink-0 ${reminders ? 'bg-brand-600' : 'bg-dark-500'}`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${reminders ? 'translate-x-4' : ''}`} />
              </div>
            </button>
          )}
          <button
            onClick={() => {
              const hidden = !(state.dashboardPrefs?.progressWidgetHidden ?? false);
              dispatch({ type: 'SET_DASHBOARD_PREF', payload: { progressWidgetHidden: hidden } });
            }}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-dark-600 transition-colors text-left"
          >
            <div className="w-8 h-8 bg-dark-600 rounded-lg flex items-center justify-center flex-shrink-0">
              {state.dashboardPrefs?.progressWidgetHidden
                ? <EyeOff size={15} className="text-gray-500" />
                : <Eye size={15} className="text-gray-400" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Progress widget on dashboard</p>
              <p className="text-xs text-gray-600">
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
              <p className="text-xs text-gray-600">Delete all data and start over</p>
            </div>
          </button>
        </div>
      </div>

      {/* Legal & App Version */}
      <div className="mx-4 text-center space-y-2">
        <div className="flex items-center justify-center gap-4">
          <a
            href="/privacy.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-600 hover:text-gray-400 underline transition-colors"
          >
            Privacy Policy
          </a>
          <span className="text-gray-700">·</span>
          <a
            href="/terms.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-600 hover:text-gray-400 underline transition-colors"
          >
            Terms of Service
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
              <label className="label">Full Name</label>
              <input className="input" value={pName} onChange={e => setPName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Age</label>
                <input className="input" type="number" min={16} max={60} value={pAge} onChange={e => setPAge(e.target.value)} />
              </div>
              <div>
                <label className="label">Sport</label>
                <select className="select" value={pSport} onChange={e => setPSport(e.target.value as Sport)}>
                  {SPORTS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Weight Class</label>
              <select className="select" value={pWeightClass} onChange={e => setPWeightClass(e.target.value as WeightClass)}>
                {WEIGHT_CLASSES.map(wc => <option key={wc}>{wc}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Experience Level</label>
              <div className="grid grid-cols-2 gap-2">
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
              <label className="label">Gym / Team</label>
              <input className="input" value={pGym} onChange={e => setPGym(e.target.value)} placeholder="Your gym or team" />
            </div>
            <div>
              <label className="label">Record (e.g. 5-2-0)</label>
              <input className="input" value={pRecord} onChange={e => setPRecord(e.target.value)} placeholder="W-L-D" />
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Camp Modal */}
      {editingCamp && (
        <Modal title="Edit Fight Camp" onClose={() => setEditingCamp(null)} footer={
          <button
            onClick={saveCamp}
            disabled={!cFightDate || !cCurrentWeight || !cTargetWeight}
            className="btn-primary w-full disabled:opacity-50"
          >
            Save Changes
          </button>
        }>
          <div className="space-y-4">
            <div>
              <label className="label">Fight Date</label>
              <input
                className="input"
                type="date"
                min={minDate}
                value={cFightDate}
                onChange={e => setCFightDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Opponent (Optional)</label>
              <input className="input" placeholder="Opponent's name" value={cOpponent} onChange={e => setCOpponent(e.target.value)} />
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
                <label className="label">Rounds</label>
                <select className="select" value={cRounds} onChange={e => setCRounds(e.target.value)}>
                  {[3, 4, 5, 6, 8, 10, 12, 15].map(n => <option key={n} value={n}>{n} rounds</option>)}
                </select>
              </div>
              <div>
                <label className="label">Round Duration</label>
                <select className="select" value={cRoundDuration} onChange={e => setCRoundDuration(e.target.value)}>
                  <option value="2">2 minutes</option>
                  <option value="3">3 minutes</option>
                  <option value="5">5 minutes</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Current Weight (lbs)</label>
                <input className="input" type="number" step="0.1" value={cCurrentWeight} onChange={e => setCCurrentWeight(e.target.value)} />
              </div>
              <div>
                <label className="label">Target Weight (lbs)</label>
                <input className="input" type="number" step="0.1" value={cTargetWeight} onChange={e => setCTargetWeight(e.target.value)} />
              </div>
            </div>
            <div className="bg-dark-600 rounded-xl p-3 border border-dark-400">
              <p className="text-xs text-gray-500">
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

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
