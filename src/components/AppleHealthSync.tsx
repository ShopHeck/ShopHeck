import { useState, useRef } from 'react';
import { Heart, Upload, Download, CheckCircle, AlertCircle, ChevronDown, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { addDays, format, parseISO } from 'date-fns';
import type { WeightEntry, WorkoutLog, SessionType } from '../types';

// Map Apple Health workout types to app session types
const HK_TYPE_MAP: Record<string, { type: SessionType; label: string }> = {
  HKWorkoutActivityTypeBoxing: { type: 'skill', label: 'Boxing' },
  HKWorkoutActivityTypeMartialArts: { type: 'skill', label: 'Martial Arts' },
  HKWorkoutActivityTypeWrestling: { type: 'sparring', label: 'Wrestling' },
  HKWorkoutActivityTypeHighIntensityIntervalTraining: { type: 'conditioning', label: 'HIIT' },
  HKWorkoutActivityTypeRunning: { type: 'conditioning', label: 'Running' },
  HKWorkoutActivityTypeCycling: { type: 'conditioning', label: 'Cycling' },
  HKWorkoutActivityTypeTraditionalStrengthTraining: { type: 'strength', label: 'Strength Training' },
  HKWorkoutActivityTypeFunctionalStrength: { type: 'strength', label: 'Functional Strength' },
  HKWorkoutActivityTypeCoreTraining: { type: 'strength', label: 'Core Training' },
  HKWorkoutActivityTypeMixedCardio: { type: 'conditioning', label: 'Cardio' },
  HKWorkoutActivityTypeJumpRope: { type: 'conditioning', label: 'Jump Rope' },
  HKWorkoutActivityTypeSwimming: { type: 'conditioning', label: 'Swimming' },
  HKWorkoutActivityTypeYoga: { type: 'recovery', label: 'Yoga' },
  HKWorkoutActivityTypeMindAndBody: { type: 'recovery', label: 'Recovery' },
  HKWorkoutActivityTypeCrossTraining: { type: 'conditioning', label: 'Cross Training' },
  HKWorkoutActivityTypeOther: { type: 'conditioning', label: 'Workout' },
};

interface ImportPreview {
  weights: Omit<WeightEntry, 'id' | 'createdAt'>[];
  workouts: Omit<WorkoutLog, 'id' | 'createdAt'>[];
  dateRange: { min: string; max: string };
  rawWeightCount: number;
  rawWorkoutCount: number;
}

function parseDate(appleDate: string): string {
  // Apple Health date: "2024-01-15 08:30:00 -0500"
  // We just need YYYY-MM-DD
  return appleDate.slice(0, 10);
}

function getWeekNumForDate(dateStr: string, campStart: string, campWeeks: number): number {
  const start = new Date(campStart).getTime();
  const date = new Date(dateStr).getTime();
  const diffDays = Math.floor((date - start) / (1000 * 60 * 60 * 24));
  const week = Math.ceil((diffDays + 1) / 7);
  return Math.max(1, Math.min(campWeeks, week));
}

function parseHealthXML(xmlText: string): { weights: ParsedWeight[]; workouts: ParsedWorkout[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid XML file. Please export from the Health app as described above.');
  }

  // Weight records
  const weightRecords = doc.querySelectorAll('Record[type="HKQuantityTypeIdentifierBodyMass"]');
  const weights: ParsedWeight[] = [];
  weightRecords.forEach(r => {
    const val = parseFloat(r.getAttribute('value') ?? '0');
    const unit = r.getAttribute('unit') ?? 'lb';
    const date = parseDate(r.getAttribute('startDate') ?? '');
    if (!val || !date) return;
    // Convert kg to lbs if needed
    const lbs = unit === 'kg' ? parseFloat((val * 2.20462).toFixed(1)) : parseFloat(val.toFixed(1));
    weights.push({ date, weight: lbs });
  });

  // Workouts
  const workoutRecords = doc.querySelectorAll('Workout');
  const workouts: ParsedWorkout[] = [];
  workoutRecords.forEach(w => {
    const hkType = w.getAttribute('workoutActivityType') ?? '';
    const durationMin = parseFloat(w.getAttribute('duration') ?? '0');
    const durationUnit = w.getAttribute('durationUnit') ?? 'min';
    const date = parseDate(w.getAttribute('startDate') ?? '');
    if (!date || durationMin <= 0) return;

    const durationInMin = durationUnit === 'min' ? Math.round(durationMin) : Math.round(durationMin / 60);
    const mapped = HK_TYPE_MAP[hkType] ?? { type: 'conditioning' as SessionType, label: 'Workout' };
    const source = w.getAttribute('sourceName') ?? '';

    workouts.push({
      date,
      duration: durationInMin,
      sessionType: mapped.type,
      title: `${mapped.label}${source ? ` (${source})` : ''}`,
    });
  });

  return { weights, workouts };
}

interface ParsedWeight { date: string; weight: number }
interface ParsedWorkout { date: string; duration: number; sessionType: SessionType; title: string }

type Tab = 'import' | 'export';

export default function AppleHealthSync() {
  const { state, dispatch } = useApp();
  const { activeCamp, workoutLogs, weightEntries, sparringLogs } = state;

  const [tab, setTab] = useState<Tab>('import');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setImportError('');
    setPreview(null);
    setImported(false);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const xml = e.target?.result as string;
        const { weights, workouts } = parseHealthXML(xml);

        if (!activeCamp) {
          setImportError('Set up a fight camp first before importing.');
          return;
        }

        const { id: campId, startDate, campWeeks, fightDate } = activeCamp;
        const campStart = startDate;
        // Off-season camps have no fight date — the import window runs to the
        // scheduled end of the block, not a single-day window at startDate.
        const campEnd = fightDate ?? format(addDays(parseISO(startDate), campWeeks * 7), 'yyyy-MM-dd');

        // Filter to camp date range
        const campWeights = weights
          .filter(w => w.date >= campStart && w.date <= campEnd)
          .map(w => ({
            campId,
            date: w.date,
            weight: w.weight,
            notes: 'Imported from Apple Health',
          }));

        // De-duplicate: skip dates already logged
        const existingDates = new Set(weightEntries.filter(e => e.campId === campId).map(e => e.date));
        const newWeights = campWeights.filter(w => !existingDates.has(w.date));

        const campWorkouts = workouts
          .filter(w => w.date >= campStart && w.date <= campEnd)
          .map(w => {
            const weekNumber = getWeekNumForDate(w.date, campStart, campWeeks);
            const dayLabel = format(parseISO(w.date), 'EEEE');
            return {
              campId,
              date: w.date,
              weekNumber,
              dayLabel,
              sessionType: w.sessionType,
              title: w.title,
              duration: w.duration,
              rpe: 7,
              notes: 'Imported from Apple Health',
              completed: true,
            };
          });

        const existingWorkoutDates = new Set(workoutLogs.filter(l => l.campId === campId).map(l => `${l.date}-${l.title}`));
        const newWorkouts = campWorkouts.filter(w => !existingWorkoutDates.has(`${w.date}-${w.title}`));

        const allDates = [...newWeights.map(w => w.date), ...newWorkouts.map(w => w.date)];
        const dateRange = allDates.length > 0 ? {
          min: allDates.reduce((a, b) => a < b ? a : b),
          max: allDates.reduce((a, b) => a > b ? a : b),
        } : { min: campStart, max: campEnd };

        setPreview({
          weights: newWeights,
          workouts: newWorkouts,
          dateRange,
          rawWeightCount: weights.length,
          rawWorkoutCount: workouts.length,
        });
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Failed to parse file.');
      }
    };
    reader.readAsText(file);
  }

  function doImport() {
    if (!preview) return;
    setImporting(true);

    // Batch import — dispatch each entry
    preview.weights.forEach(w => dispatch({ type: 'LOG_WEIGHT', payload: w }));
    preview.workouts.forEach(w => dispatch({ type: 'LOG_WORKOUT', payload: w }));

    setTimeout(() => {
      setImporting(false);
      setImported(true);
      setPreview(null);
    }, 300);
  }

  // Export data
  function exportJSON() {
    if (!activeCamp) return;
    const campId = activeCamp.id;
    const data = {
      exportDate: new Date().toISOString(),
      fighter: state.currentUser?.name,
      sport: activeCamp.sport,
      weightClass: activeCamp.weightClass,
      fightDate: activeCamp.fightDate,
      workouts: workoutLogs.filter(l => l.campId === campId),
      sparring: sparringLogs.filter(l => l.campId === campId),
      weights: weightEntries.filter(e => e.campId === campId),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fight-camp-${activeCamp.fightDate}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!activeCamp) {
    return (
      <div className="mx-4 mt-4 card text-center py-12">
        <Heart size={40} className="text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400 font-semibold">No active fight camp</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="mx-4 mt-4 bg-gradient-to-br from-red-900/20 to-dark-700 rounded-2xl border border-red-900/30 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-900/40 flex items-center justify-center flex-shrink-0">
            <Heart size={20} className="text-red-400" />
          </div>
          <div>
            <p className="text-white font-bold">Apple Health Sync</p>
            <p className="text-xs text-gray-500">Import workouts & weight · Export camp data</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mx-4 flex bg-dark-700 rounded-xl p-1 gap-1">
        {(['import', 'export'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setPreview(null); setImported(false); setImportError(''); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t ? 'bg-dark-500 text-white' : 'text-gray-500'}`}
          >
            {t === 'import' ? '↓ Import from Health' : '↑ Export Data'}
          </button>
        ))}
      </div>

      {/* IMPORT TAB */}
      {tab === 'import' && (
        <div className="space-y-4">
          {/* Instructions */}
          <div className="mx-4">
            <button
              onClick={() => setShowInstructions(s => !s)}
              className="w-full flex items-center justify-between text-left"
            >
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">How to Export from Apple Health</p>
              <ChevronDown size={14} className={`text-gray-500 transition-transform ${showInstructions ? 'rotate-180' : ''}`} />
            </button>
            {showInstructions && (
              <div className="mt-2 card space-y-2 text-sm text-gray-400">
                <p className="font-medium text-white">Steps on your iPhone:</p>
                <ol className="space-y-1.5 list-decimal list-inside text-xs">
                  <li>Open the <strong className="text-white">Health</strong> app</li>
                  <li>Tap your profile picture (top right)</li>
                  <li>Scroll down → tap <strong className="text-white">Export All Health Data</strong></li>
                  <li>Tap <strong className="text-white">Export</strong> and wait (may take a minute)</li>
                  <li>Share the <strong className="text-white">export.zip</strong> to Files or your computer</li>
                  <li>Unzip the file and find <strong className="text-white">export.xml</strong></li>
                  <li>Upload that file below</li>
                </ol>
                <p className="text-xs text-gray-600 pt-1">
                  Only workouts and weight data within your current camp dates will be imported.
                </p>
              </div>
            )}
          </div>

          {/* File drop zone */}
          {!imported && (
            <div className="mx-4">
              <input
                ref={fileRef}
                type="file"
                aria-label="Choose an Apple Health export.xml file"
                accept=".xml"
                className="hidden"
                onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-dark-400 hover:border-brand-600 rounded-2xl py-8 flex flex-col items-center gap-3 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-dark-700 flex items-center justify-center">
                  <Upload size={22} className="text-gray-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">Select export.xml</p>
                  <p className="text-xs text-gray-500 mt-1">Tap to browse files</p>
                </div>
              </button>
            </div>
          )}

          {/* Error */}
          {importError && (
            <div className="mx-4 flex items-start gap-3 bg-red-900/20 border border-red-900/40 rounded-xl p-3">
              <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{importError}</p>
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="mx-4 space-y-3">
              <div className="card space-y-3">
                <p className="text-sm font-bold text-white">Import Preview</p>
                <p className="text-xs text-gray-500">
                  Filtered to your camp: {format(parseISO(activeCamp.startDate), 'MMM d')} – {format(
                    activeCamp.fightDate
                      ? parseISO(activeCamp.fightDate)
                      : addDays(parseISO(activeCamp.startDate), activeCamp.campWeeks * 7),
                    'MMM d, yyyy',
                  )}
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-dark-600 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black text-blue-400">{preview.weights.length}</p>
                    <p className="text-xs text-gray-500">weight entries</p>
                    <p className="text-xs text-gray-700">{preview.rawWeightCount} total in file</p>
                  </div>
                  <div className="bg-dark-600 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black text-brand-400">{preview.workouts.length}</p>
                    <p className="text-xs text-gray-500">workouts</p>
                    <p className="text-xs text-gray-700">{preview.rawWorkoutCount} total in file</p>
                  </div>
                </div>

                {preview.weights.length === 0 && preview.workouts.length === 0 ? (
                  <p className="text-sm text-yellow-400 text-center py-2">
                    No new data found within your camp date range.
                  </p>
                ) : (
                  <>
                    {preview.weights.slice(0, 3).length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Weight samples:</p>
                        {preview.weights.slice(0, 3).map((w, i) => (
                          <p key={i} className="text-xs text-gray-300">• {format(parseISO(w.date), 'MMM d')}: {w.weight} lbs</p>
                        ))}
                        {preview.weights.length > 3 && <p className="text-xs text-gray-600">… and {preview.weights.length - 3} more</p>}
                      </div>
                    )}
                    {preview.workouts.slice(0, 3).length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Workout samples:</p>
                        {preview.workouts.slice(0, 3).map((w, i) => (
                          <p key={i} className="text-xs text-gray-300">• {format(parseISO(w.date), 'MMM d')}: {w.title} ({w.duration}min)</p>
                        ))}
                        {preview.workouts.length > 3 && <p className="text-xs text-gray-600">… and {preview.workouts.length - 3} more</p>}
                      </div>
                    )}
                    <p className="text-xs text-gray-600">Workouts imported with default RPE 7 — adjust in Training Log.</p>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={doImport}
                        disabled={importing}
                        className="btn-primary flex-1 py-2.5 text-sm"
                      >
                        {importing ? 'Importing…' : `Import ${preview.weights.length + preview.workouts.length} entries`}
                      </button>
                      <button
                        onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = ''; }}
                        className="p-2.5 rounded-xl bg-dark-600 text-gray-400 hover:text-white transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Success */}
          {imported && (
            <div className="mx-4 flex flex-col items-center gap-3 py-6">
              <CheckCircle size={44} className="text-green-400" />
              <p className="text-white font-bold">Import Complete!</p>
              <p className="text-sm text-gray-500 text-center">
                Your Apple Health data has been added to this camp.
              </p>
              <button
                onClick={() => { setImported(false); if (fileRef.current) fileRef.current.value = ''; }}
                className="btn-secondary text-sm px-6 py-2"
              >
                Import More
              </button>
            </div>
          )}
        </div>
      )}

      {/* EXPORT TAB */}
      {tab === 'export' && (
        <div className="mx-4 space-y-4">
          <div className="card space-y-3">
            <p className="text-sm font-bold text-white">Export Camp Data</p>
            <p className="text-xs text-gray-500">
              Download all your training data as JSON. Use this for backups or to import into other apps.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Workouts', value: workoutLogs.filter(l => l.campId === activeCamp.id).length, color: 'text-brand-400' },
                { label: 'Sparring', value: sparringLogs.filter(l => l.campId === activeCamp.id).length, color: 'text-red-400' },
                { label: 'Weights', value: weightEntries.filter(e => e.campId === activeCamp.id).length, color: 'text-blue-400' },
              ].map(s => (
                <div key={s.label} className="bg-dark-600 rounded-xl p-2.5 text-center">
                  <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>

            <button
              onClick={exportJSON}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-dark-600 border border-dark-400 hover:border-brand-600 text-sm font-semibold text-white transition-all"
            >
              <Download size={16} />
              Download as JSON
            </button>
          </div>

          <div className="card space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Add to Apple Health</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Apple Health doesn't support direct imports from third-party apps on iPhone. To add workouts to Health:
            </p>
            <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
              <li>Log your workouts in this app as normal</li>
              <li>Apple's <strong className="text-gray-300">Workouts</strong> app or apps like <strong className="text-gray-300">Strava</strong> can sync back to Health automatically</li>
              <li>For weight: use the Apple Health app directly to add manual entries</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
