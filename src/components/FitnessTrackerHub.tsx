import { useState, useEffect, useCallback } from 'react';
import {
  Bluetooth, Heart, Activity, Zap, Plus, Trash2, RefreshCw,
  CheckCircle, AlertCircle, Info, ChevronRight, ExternalLink,
} from 'lucide-react';
import { format, parseISO, subDays } from 'date-fns';
import { useApp } from '../context/AppContext';
import { useBluetoothHR, ZONE_COLORS, ZONE_LABELS } from '../hooks/useBluetoothHR';
import {
  initiateFitbitConnect, handleFitbitCallback, getFitbitCallbackCode,
  getFitbitCallbackState,
  clearFitbitCallbackParams, fetchFitbitHRV, fetchFitbitRestingHR,
  refreshFitbitToken,
} from '../utils/fitbitAuth';
import type { HRVSource } from '../types';
import { parseRmssdMs } from '../utils/validation';

// ─── Recovery score ───────────────────────────────────────────────────────

function computeRecovery(rrmssdValues: number[]): {
  score: number; label: string; color: string; trend: 'up' | 'down' | 'flat';
} | null {
  if (rrmssdValues.length < 2) return null;

  const last = rrmssdValues[rrmssdValues.length - 1];
  const baseline = rrmssdValues.slice(0, -1).reduce((a, b) => a + b, 0) / (rrmssdValues.length - 1);

  const ratio = last / Math.max(1, baseline);
  const score = Math.min(100, Math.max(0, Math.round(ratio * 100)));

  const label  = score >= 105 ? 'Peak Recovery' : score >= 90 ? 'Well Recovered' : score >= 70 ? 'Moderate' : 'Low Recovery';
  const color  = score >= 90 ? '#22c55e' : score >= 70 ? '#eab308' : '#ef4444';

  const prev2avg = rrmssdValues.length >= 3
    ? (rrmssdValues[rrmssdValues.length - 2] + rrmssdValues[rrmssdValues.length - 3]) / 2
    : rrmssdValues[rrmssdValues.length - 2];
  const trend: 'up' | 'down' | 'flat' = last > prev2avg * 1.05 ? 'up' : last < prev2avg * 0.95 ? 'down' : 'flat';

  return { score, label, color, trend };
}

// ─── HRV sparkline ────────────────────────────────────────────────────────

function HRVSparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(1, max - min);
  const w = 200, h = 40;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" preserveAspectRatio="none">
      <polyline points={pts.join(' ')} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Source badge ─────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<HRVSource, string> = {
  bluetooth:   'Bluetooth',
  apple_health:'Apple Health',
  fitbit:      'Fitbit',
  garmin:      'Garmin',
  whoop:       'Whoop',
  polar_flow:  'Polar Flow',
  manual:      'Manual',
};

// ─── Main component ───────────────────────────────────────────────────────

interface Props { onNavigate: (view: string) => void; }

export default function FitnessTrackerHub({ onNavigate }: Props) {
  const { state, dispatch } = useApp();
  const { activeCamp, currentUser, fitbitConfig, hrvEntries = [] } = state;

  const maxHR = currentUser?.maxHR ?? (currentUser ? 220 - currentUser.age : 185);
  const hr    = useBluetoothHR(maxHR);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  // ── Manual / BLE HRV log form ──────────────────────────────────────────
  const [showLogForm, setShowLogForm]     = useState(false);
  const [manualRmssd, setManualRmssd]     = useState('');
  const [manualHR, setManualHR]           = useState('');
  const [manualDate, setManualDate]       = useState(format(new Date(), 'yyyy-MM-dd'));
  const [manualSource, setManualSource]   = useState<HRVSource>('manual');
  const [manualNotes, setManualNotes]     = useState('');

  // ── Fitbit state ──────────────────────────────────────────────────────
  const [fitbitClientId, setFitbitClientId] = useState(fitbitConfig?.clientId ?? '');
  const [fitbitSyncing, setFitbitSyncing]   = useState(false);
  const [fitbitError, setFitbitError]       = useState<string | null>(null);

  // Handle OAuth callback on mount
  useEffect(() => {
    const code = getFitbitCallbackCode();
    if (!code) return;
    // Read the state param before we strip it from the URL, so the callback
    // handler can verify it against the value we stored at connect time.
    const returnedState = getFitbitCallbackState();
    clearFitbitCallbackParams();

    (async () => {
      const tokens = await handleFitbitCallback(code, returnedState);
      if (!tokens) { setFitbitError('Token exchange failed — please try again.'); return; }

      const clientId = sessionStorage.getItem('fitbit_pkce_client_id_backup') ?? fitbitConfig?.clientId ?? '';
      dispatch({
        type: 'SET_FITBIT_CONFIG',
        payload: {
          clientId,
          accessToken:  tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt:    tokens.expiresAt,
          userId:       tokens.userId,
        },
      });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Log HRV from BLE ─────────────────────────────────────────────────
  const logBLEHrv = useCallback(() => {
    if (!hr.hrv || !activeCamp) return;
    dispatch({
      type: 'LOG_HRV',
      payload: {
        campId:     activeCamp.id,
        date:       format(new Date(), 'yyyy-MM-dd'),
        rmssd:      hr.hrv,
        restingHR:  hr.hr ?? undefined,
        source:     'bluetooth',
      },
    });
  }, [hr.hrv, hr.hr, activeCamp, dispatch]);

  // ── Log HRV manually ─────────────────────────────────────────────────
  const logManualHrv = () => {
    // Out-of-range readings would skew the recovery baseline the readiness
    // score reads from; the input's min/max don't apply to a click handler.
    const rmssd = parseRmssdMs(manualRmssd);
    if (rmssd === null || !activeCamp) return;
    dispatch({
      type: 'LOG_HRV',
      payload: {
        campId:    activeCamp.id,
        date:      manualDate,
        rmssd:     Math.round(rmssd),
        restingHR: manualHR ? parseInt(manualHR) : undefined,
        source:    manualSource,
        notes:     manualNotes || undefined,
      },
    });
    setManualRmssd('');
    setManualHR('');
    setManualNotes('');
    setShowLogForm(false);
  };

  // ── Fitbit sync ───────────────────────────────────────────────────────
  const syncFitbit = useCallback(async () => {
    if (!fitbitConfig?.accessToken || !activeCamp) return;
    setFitbitSyncing(true);
    setFitbitError(null);

    let accessToken = fitbitConfig.accessToken;

    // Refresh token if expired
    if (fitbitConfig.expiresAt && new Date(fitbitConfig.expiresAt) < new Date()) {
      const refreshed = await refreshFitbitToken(fitbitConfig.refreshToken ?? '', fitbitConfig.clientId);
      if (!refreshed) { setFitbitError('Session expired — please reconnect.'); setFitbitSyncing(false); return; }
      accessToken = refreshed.accessToken;
      dispatch({
        type: 'SET_FITBIT_CONFIG',
        payload: { ...fitbitConfig, accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken, expiresAt: refreshed.expiresAt },
      });
    }

    try {
      const [hrv, activity] = await Promise.all([
        fetchFitbitHRV(accessToken),
        fetchFitbitRestingHR(accessToken),
      ]);

      if (hrv) {
        // Avoid duplicate entries for the same date
        const already = hrvEntries.some(e => e.campId === activeCamp.id && e.date === hrv.date && e.source === 'fitbit');
        if (!already) {
          dispatch({
            type: 'LOG_HRV',
            payload: {
              campId:    activeCamp.id,
              date:      hrv.date,
              rmssd:     hrv.dailyRmssd,
              restingHR: activity?.restingHR ?? undefined,
              source:    'fitbit',
            },
          });
        }
        dispatch({ type: 'SET_FITBIT_CONFIG', payload: { ...fitbitConfig, accessToken, lastSync: new Date().toISOString() } });
      } else {
        setFitbitError('No HRV data for today. Make sure your Fitbit device synced.');
      }
    } catch {
      setFitbitError('Sync failed. Check your connection and try again.');
    }
    setFitbitSyncing(false);
  }, [fitbitConfig, activeCamp, hrvEntries, dispatch]);

  // ── Derived data ──────────────────────────────────────────────────────
  const campEntries = hrvEntries
    .filter(e => e.campId === activeCamp?.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  const last7 = campEntries.filter(e => parseISO(e.date) >= subDays(new Date(), 7));
  const rmssdValues = last7.map(e => e.rmssd);
  const recovery = computeRecovery(rmssdValues);
  const latestEntry = campEntries[campEntries.length - 1];

  const isFitbitConnected = Boolean(fitbitConfig?.accessToken);
  const fitbitConnected   = isFitbitConnected;

  return (
    <div className="space-y-4 pb-6 pt-4">

      {/* ── Recovery Score ── */}
      {recovery && (
        <div className="mx-4 card">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">HRV Recovery</p>
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 flex-shrink-0">
              <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90">
                <circle cx="20" cy="20" r="16" fill="none" stroke="#1e293b" strokeWidth="4" />
                <circle cx="20" cy="20" r="16" fill="none" strokeWidth="4" strokeLinecap="round"
                  stroke={recovery.color}
                  strokeDasharray={`${2 * Math.PI * 16 * (Math.min(recovery.score, 100) / 100)} ${2 * Math.PI * 16}`} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-black text-white">{Math.min(recovery.score, 100)}%</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base leading-tight" style={{ color: recovery.color }}>{recovery.label}</p>
              {latestEntry && (
                <p className="text-sm text-gray-400 mt-0.5">
                  RMSSD {latestEntry.rmssd}ms
                  {latestEntry.restingHR && ` · ${latestEntry.restingHR} bpm`}
                  {' · '}{format(parseISO(latestEntry.date), 'MMM d')}
                </p>
              )}
              <div className="mt-2">
                <HRVSparkline values={rmssdValues} />
              </div>
              <p className="text-xs text-gray-600 mt-0.5">7-day RMSSD trend</p>
            </div>
          </div>
        </div>
      )}

      {!recovery && campEntries.length === 0 && (
        <div className="mx-4 card flex items-center gap-3">
          <Info size={16} className="text-gray-500 flex-shrink-0" />
          <p className="text-sm text-gray-400">Connect a device or log your morning HRV to track recovery.</p>
        </div>
      )}

      {/* ── Bluetooth HRM ── */}
      <div className="mx-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Bluetooth HRM</p>
        <div className="card space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${hr.connected ? 'bg-green-900/30' : 'bg-dark-600'}`}>
                <Bluetooth size={18} className={hr.connected ? 'text-green-400' : 'text-gray-500'} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  {hr.connected ? hr.deviceName : 'Not connected'}
                </p>
                <p className="text-xs text-gray-500">
                  {isIOS ? 'Not available on iOS — see note below' : 'Polar H10 · MyZone · Garmin · any BLE HRM'}
                </p>
              </div>
            </div>
            {!hr.connected && hr.supported && (
              <button onClick={hr.connect} disabled={hr.connecting}
                className="btn-primary text-xs px-3 py-1.5 flex-shrink-0">
                {hr.connecting ? 'Connecting…' : 'Connect'}
              </button>
            )}
            {hr.connected && (
              <button onClick={hr.disconnect} className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0">
                Disconnect
              </button>
            )}
          </div>

          {!hr.supported && (
            isIOS ? (
              <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-3 space-y-1.5">
                <p className="text-xs text-amber-400 font-semibold">Live Bluetooth HR isn't available on iPhone</p>
                <p className="text-xs text-amber-500/80">
                  iOS blocks Web Bluetooth in all browsers. Use{' '}
                  <button
                    onClick={() => onNavigate('health')}
                    className="underline font-semibold text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    Apple Health Import
                  </button>
                  {' '}below — MyZone syncs to Apple Health automatically via the MyZone app.
                </p>
              </div>
            ) : (
              <p className="text-xs text-amber-500">Web Bluetooth requires Chrome or Edge on desktop or Android.</p>
            )
          )}

          {hr.connected && (
            <>
              {/* Live metrics */}
              <div className="grid grid-cols-3 gap-3 pt-1">
                <div className="bg-dark-600 rounded-xl p-3 text-center">
                  <div className="text-2xl font-black" style={{ color: hr.hr ? ZONE_COLORS[hr.zone] : '#6b7280' }}>
                    {hr.hr ?? '—'}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">bpm</div>
                </div>
                <div className="bg-dark-600 rounded-xl p-3 text-center">
                  <div className="text-2xl font-black text-white">
                    {hr.hrv ?? '—'}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">RMSSD ms</div>
                </div>
                <div className="bg-dark-600 rounded-xl p-3 text-center">
                  <div className="text-base font-bold" style={{ color: ZONE_COLORS[hr.zone] }}>
                    {ZONE_LABELS[hr.zone]}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">HR Zone</div>
                </div>
              </div>

              {hr.hrv && activeCamp && (
                <button onClick={logBLEHrv}
                  className="w-full btn-primary text-sm py-2 flex items-center justify-center gap-2">
                  <Plus size={15} />
                  Log HRV reading ({hr.hrv}ms)
                </button>
              )}
              {!hr.hrv && (
                <p className="text-xs text-gray-500 text-center">
                  Waiting for RR interval data… (Polar H10 and most chest straps broadcast this automatically)
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Apple Watch ── */}
      <div className="mx-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Apple Watch</p>
        <button
          onClick={() => onNavigate('health')}
          className="card w-full text-left flex items-center gap-3 hover:border-dark-300 transition-colors group"
        >
          <div className="w-10 h-10 rounded-xl bg-red-950/40 flex items-center justify-center flex-shrink-0">
            <Heart size={18} className="text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Apple Health Import</p>
            <p className="text-xs text-gray-500">Import workouts, weight + HRV from Health export</p>
          </div>
          <ChevronRight size={16} className="text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0" />
        </button>
      </div>

      {/* ── Fitbit ── */}
      <div className="mx-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Fitbit</p>
        <div className="card space-y-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${fitbitConnected ? 'bg-teal-900/30' : 'bg-dark-600'}`}>
              <Activity size={18} className={fitbitConnected ? 'text-teal-400' : 'text-gray-500'} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">
                {fitbitConnected ? `Fitbit — Connected` : 'Fitbit — Not connected'}
              </p>
              <p className="text-xs text-gray-500">
                {fitbitConnected && fitbitConfig?.lastSync
                  ? `Last sync: ${format(parseISO(fitbitConfig.lastSync), 'MMM d, h:mm a')}`
                  : 'Charge 5 · Sense · Versa 3+ · Luxe · Inspire 3'}
              </p>
            </div>
            {fitbitConnected && (
              <button onClick={syncFitbit} disabled={fitbitSyncing}
                className="text-teal-400 hover:text-teal-300 transition-colors flex-shrink-0 disabled:opacity-50">
                <RefreshCw size={16} className={fitbitSyncing ? 'animate-spin' : ''} />
              </button>
            )}
          </div>

          {fitbitError && (
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle size={14} className="flex-shrink-0" />
              <p className="text-xs">{fitbitError}</p>
            </div>
          )}

          {!fitbitConnected && (
            <div className="space-y-2.5">
              <div>
                <label className="text-xs text-gray-500 mb-1 block" htmlFor="fitbit-client-id">Fitbit App Client ID</label>
                <input
                  id="fitbit-client-id"
                  type="text"
                  value={fitbitClientId}
                  onChange={e => setFitbitClientId(e.target.value)}
                  placeholder="e.g. 23ABCD"
                  className="input text-sm w-full"
                />
              </div>
              <button
                onClick={() => {
                  if (!fitbitClientId.trim()) return;
                  sessionStorage.setItem('fitbit_pkce_client_id_backup', fitbitClientId.trim());
                  dispatch({ type: 'SET_FITBIT_CONFIG', payload: { clientId: fitbitClientId.trim() } });
                  initiateFitbitConnect(fitbitClientId.trim());
                }}
                disabled={!fitbitClientId.trim()}
                className="w-full btn-primary text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <ExternalLink size={14} />
                Connect Fitbit Account
              </button>
              <div className="bg-dark-600 rounded-xl p-3 space-y-1">
                <p className="text-xs font-semibold text-gray-400">Setup (one-time)</p>
                <ol className="text-xs text-gray-500 space-y-0.5 list-decimal list-inside">
                  <li>Go to <span className="text-brand-400">dev.fitbit.com/apps/new</span></li>
                  <li>Create a "Personal" app, OAuth 2.0 type: Personal</li>
                  <li>Set Redirect URI to this page's URL</li>
                  <li>Paste your Client ID above</li>
                </ol>
              </div>
            </div>
          )}

          {fitbitConnected && (
            <div className="flex gap-2">
              <button onClick={syncFitbit} disabled={fitbitSyncing}
                className="flex-1 btn-primary text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-50">
                <RefreshCw size={14} className={fitbitSyncing ? 'animate-spin' : ''} />
                {fitbitSyncing ? 'Syncing…' : 'Sync Today'}
              </button>
              <button
                onClick={() => dispatch({ type: 'SET_FITBIT_CONFIG', payload: null })}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors px-3"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Polar / Garmin / Whoop note ── */}
      <div className="mx-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Other Devices</p>
        <div className="card space-y-2">
          {[
            { name: 'Polar H10 / OH1',     tip: 'Connect via Bluetooth above — broadcasts RMSSD automatically.' },
            { name: 'Garmin Connect',       tip: 'Export HRV from Garmin app, then use Log Manually below.' },
            { name: 'Whoop',               tip: 'Check your daily HRV in Whoop app, log it manually below.' },
            { name: 'Polar Flow / Vantage', tip: 'View Nightly Recharge HRV in Polar Flow, log manually below.' },
          ].map(d => (
            <div key={d.name} className="flex items-start gap-2.5">
              <CheckCircle size={13} className="text-gray-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-semibold text-gray-300">{d.name}</span>
                <span className="text-xs text-gray-500"> — {d.tip}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Manual log ── */}
      <div className="mx-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Log HRV Manually</p>
          <button onClick={() => setShowLogForm(v => !v)} className="text-xs text-brand-500 font-semibold hover:text-brand-400 transition-colors">
            {showLogForm ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {showLogForm && (
          <div className="card space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Date</label>
                <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} className="input text-sm w-full" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">RMSSD (ms)</label>
                <input type="number" value={manualRmssd} onChange={e => setManualRmssd(e.target.value)}
                  placeholder="e.g. 55" className="input text-sm w-full" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Resting HR (bpm)</label>
                <input type="number" value={manualHR} onChange={e => setManualHR(e.target.value)}
                  placeholder="optional" className="input text-sm w-full" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Source</label>
                <select value={manualSource} onChange={e => setManualSource(e.target.value as HRVSource)}
                  className="input text-sm w-full">
                  <option value="garmin">Garmin</option>
                  <option value="polar_flow">Polar Flow</option>
                  <option value="whoop">Whoop</option>
                  <option value="apple_health">Apple Health</option>
                  <option value="fitbit">Fitbit</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
            </div>
            <input type="text" value={manualNotes} onChange={e => setManualNotes(e.target.value)}
              placeholder="Notes (optional)" className="input text-sm w-full" />
            <button onClick={logManualHrv} disabled={parseRmssdMs(manualRmssd) === null || !activeCamp}
              className="w-full btn-primary text-sm py-2 disabled:opacity-50">
              Save HRV Entry
            </button>
          </div>
        )}
      </div>

      {/* ── HRV History ── */}
      {campEntries.length > 0 && (
        <div className="mx-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">HRV History</p>
          <div className="space-y-2">
            {[...campEntries].reverse().slice(0, 10).map(entry => (
              <div key={entry.id} className="card flex items-center gap-3">
                <div className="w-8 h-8 bg-dark-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Zap size={14} className="text-brand-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-white">{entry.rmssd}ms</span>
                    {entry.restingHR && <span className="text-xs text-gray-500">{entry.restingHR} bpm</span>}
                  </div>
                  <p className="text-xs text-gray-500">
                    {format(parseISO(entry.date), 'MMM d')} · {SOURCE_LABELS[entry.source]}
                    {entry.notes && ` · ${entry.notes}`}
                  </p>
                </div>
                <button
                  onClick={() => dispatch({ type: 'DELETE_HRV', payload: entry.id })}
                  className="text-gray-700 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
