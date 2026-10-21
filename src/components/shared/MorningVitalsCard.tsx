import { useEffect, useMemo, useState } from 'react';
import { HeartPulse } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import GlassSurface from './GlassSurface';
import { SmartSpectra, type VitalsMeasurement } from '../../plugins/SmartSpectra';
import { baselineProgress, HRV_MIN_READINGS, HRV_RECENT_DAYS } from '../../utils/hrvBaseline';
import { todayISO } from '../../utils/dates';

/**
 * Seconds of valid signal per check. Ultra-short rMSSD over about a minute is
 * the window sport-science HRV apps validate against; the native countdown
 * only advances while the SDK reports a usable face and light.
 */
const CHECK_SECONDS = 60;

/**
 * The morning vitals check: a camera measurement of resting heart rate and HRV
 * that feeds the readiness score's Recovery Vitals factor.
 *
 * Renders nothing unless the native plugin says it can run. That covers the web,
 * and any iOS build compiled without the SmartSpectra package or its key — in
 * none of those can a fighter act on the card, so it would only advertise a
 * feature this build does not contain.
 */
export default function MorningVitalsCard() {
  const { state, dispatch } = useApp();
  const [supported, setSupported] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [result, setResult] = useState<VitalsMeasurement | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    SmartSpectra.isSupported()
      .then(a => { if (active) setSupported(a.supported); })
      // A platform with no native implementation rejects rather than
      // resolving. That is "unsupported" too, not an error worth surfacing.
      .catch(() => { if (active) setSupported(false); });
    return () => { active = false; };
  }, []);

  const camp = state.activeCamp;
  const cameraEntries = useMemo(
    () => (state.hrvEntries ?? []).filter(
      e => camp !== null && e.campId === camp.id && e.source === 'camera',
    ),
    [state.hrvEntries, camp],
  );
  const progress = useMemo(
    () => baselineProgress(cameraEntries, 'camera', new Date()),
    [cameraEntries],
  );

  if (!supported || !camp) return null;

  const today = todayISO();
  const todays = cameraEntries.find(e => e.date === today) ?? null;

  async function measure() {
    if (!camp) return;
    setMeasuring(true);
    setMessage(null);
    setResult(null);
    try {
      const m = await SmartSpectra.measure({ durationSec: CHECK_SECONDS });
      // Pulse without HRV is not saved: the baseline is built on HRV, and an
      // entry carrying only a heart rate would count as a day with no data.
      if (m.hrvRmssd === null || m.hrvRmssd === undefined) {
        setMessage('Your pulse came through, but not a steady HRV reading. Sit still in even, front-facing light and try again.');
        return;
      }
      dispatch({
        type: 'UPSERT_HRV',
        payload: {
          campId: camp.id,
          // Read at save time, not render time, so a check finished just
          // after midnight is filed under the day it was taken.
          date: todayISO(),
          rmssd: Math.round(m.hrvRmssd * 10) / 10,
          restingHR: Math.round(m.pulseRate),
          source: 'camera',
        },
      });
      setResult(m);
    } catch (err) {
      // Closing the sheet is a choice, not a failure — say nothing.
      if ((err as { code?: string }).code === 'CANCELLED') return;
      setMessage(
        err instanceof Error && err.message
          ? err.message
          : 'The vitals check could not finish. Try again.',
      );
    } finally {
      setMeasuring(false);
    }
  }

  return (
    <GlassSurface cornerRadius="md" className="mx-4 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <HeartPulse size={15} style={{ color: 'var(--accent-crimson)' }} aria-hidden="true" />
        <p className="text-sm font-semibold text-white">Morning vitals</p>
        {todays && <span className="ml-auto text-xs text-gray-450">Done today</span>}
      </div>

      {result ? (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Resting HR', value: String(Math.round(result.pulseRate)), unit: 'bpm' },
            { label: 'HRV', value: result.hrvRmssd ? result.hrvRmssd.toFixed(0) : '—', unit: 'ms' },
            { label: 'Breathing', value: result.breathingRate ? result.breathingRate.toFixed(0) : '—', unit: '/min' },
          ].map(s => (
            <div key={s.label}>
              <p className="text-lg font-extrabold text-white tabular-nums">
                {s.value}<span className="text-xs font-normal text-gray-450"> {s.unit}</span>
              </p>
              <p className="text-xs text-gray-450">{s.label}</p>
            </div>
          ))}
        </div>
      ) : todays ? (
        <p className="text-xs text-gray-400">
          Today: {todays.restingHR ?? '—'} bpm resting · HRV {Math.round(todays.rmssd)} ms
        </p>
      ) : null}

      <p className="text-xs text-gray-400 leading-snug">
        {progress.ready
          ? 'Baseline set — your vitals now count toward readiness.'
          : `Building your baseline: ${progress.recent}/${HRV_MIN_READINGS} in the last ${HRV_RECENT_DAYS} days, ${progress.baseline}/${HRV_MIN_READINGS} before that. Vitals join your readiness after about a week of daily checks.`}
      </p>

      {message && (
        <p className="text-xs leading-snug" style={{ color: 'var(--pace-behind)' }} role="status">
          {message}
        </p>
      )}

      <button
        type="button"
        onClick={measure}
        disabled={measuring}
        className="btn-primary w-full text-sm flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <HeartPulse size={14} aria-hidden="true" />
        {measuring ? 'Measuring…' : todays ? 'Measure again' : `Start ${CHECK_SECONDS}-second check`}
      </button>

      <p className="text-xs text-gray-450 leading-snug">
        Seated, after waking, before training — the same time each day is what makes the baseline
        meaningful. Measured on your iPhone; the video is not saved.
      </p>
    </GlassSurface>
  );
}
