import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import Modal from '../shared/Modal';
import { useApp } from '../../context/AppContext';
import { formatPrescription, type LibraryItem } from '../../data/library';
import { resolvePrescription } from '../../utils/library';
import type { LibraryPrescriptionOverride } from '../../types';

/**
 * Which adjustable fields to show. Only fields the item's own prescription uses
 * appear — a mobility hold has no load input, a deadlift has no round timer.
 */
const FIELDS = [
  { key: 'sets',           label: 'Sets',     suffix: '',    min: 1, max: 20 },
  { key: 'reps',           label: 'Reps',     suffix: '',    min: 1, max: 100 },
  { key: 'rounds',         label: 'Rounds',   suffix: '',    min: 1, max: 30 },
  { key: 'workSeconds',    label: 'Work',     suffix: 'sec', min: 5, max: 1800 },
  { key: 'restSeconds',    label: 'Rest',     suffix: 'sec', min: 0, max: 900 },
  { key: 'distanceMeters', label: 'Distance', suffix: 'm',   min: 5, max: 5000 },
] as const;

interface Props {
  item: LibraryItem;
  onClose: () => void;
}

/**
 * Queues a library item into a day's session, with the prescription adjustable
 * before it lands. This is the "adjustable training parameters" step the old
 * free-text `setsReps` made impossible.
 *
 * Inputs are held as strings, not numbers, so a field can be cleared and
 * retyped — a numeric state would snap back to the library default the moment
 * the last digit was deleted. A field left empty means "use the library
 * default", and only values that actually differ are stored as overrides.
 */
export default function AddToSessionSheet({ item, onClose }: Props) {
  const { dispatch } = useApp();
  const base = item.prescription;

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      FIELDS.filter(f => base[f.key] !== undefined).map(f => [f.key, String(base[f.key])]),
    ),
  );
  const [load, setLoad] = useState(base.load ?? '');
  const [targetRpe, setTargetRpe] = useState(base.rpe !== undefined ? String(base.rpe) : '');
  const [notes, setNotes] = useState('');

  const shown = FIELDS.filter(f => base[f.key] !== undefined);

  const override = useMemo<LibraryPrescriptionOverride>(() => {
    const next: LibraryPrescriptionOverride = {};
    for (const f of FIELDS) {
      const raw = drafts[f.key];
      if (!raw) continue;
      const value = parseInt(raw, 10);
      if (Number.isNaN(value) || value === base[f.key]) continue;
      next[f.key] = value;
    }
    if (load.trim() && load.trim() !== base.load) next.load = load.trim();
    const rpe = parseInt(targetRpe, 10);
    if (!Number.isNaN(rpe) && rpe !== base.rpe) next.targetRpe = rpe;
    return next;
  }, [drafts, load, targetRpe, base]);

  const preview = formatPrescription(resolvePrescription(base, override));

  function add() {
    dispatch({
      type: 'QUEUE_LIBRARY_ITEM',
      payload: {
        itemId: item.id,
        date,
        override: notes.trim() ? { ...override, notes: notes.trim() } : override,
      },
    });
    onClose();
  }

  return (
    <Modal
      title={`Add — ${item.name}`}
      onClose={onClose}
      footer={<button onClick={add} className="btn-primary w-full">Add to Session</button>}
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label">Session date</span>
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>

        {shown.length > 0 && (
          <div>
            <span className="label">Prescription</span>
            <div className="grid grid-cols-2 gap-3">
              {shown.map(f => (
                <label key={f.key} className="block">
                  <span className="text-xs text-gray-400 mb-1 block">
                    {f.label}{f.suffix ? ` (${f.suffix})` : ''}
                  </span>
                  <input
                    className="input py-2 text-sm"
                    type="number"
                    inputMode="numeric"
                    min={f.min}
                    max={f.max}
                    placeholder={String(base[f.key])}
                    value={drafts[f.key] ?? ''}
                    onChange={e => setDrafts(prev => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {base.load !== undefined && (
          <label className="block">
            <span className="label">Load</span>
            <input className="input" value={load} onChange={e => setLoad(e.target.value)} />
          </label>
        )}

        <label className="block">
          <span className="label">Target RPE</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            max={10}
            placeholder="Optional"
            value={targetRpe}
            onChange={e => setTargetRpe(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="label">Note for this session</span>
          <textarea
            className="input resize-none"
            rows={2}
            placeholder="e.g. keep it at 70% — shoulder still sore"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </label>

        <div className="bg-dark-600 border border-dark-400 rounded-xl p-3">
          <p className="text-xs font-semibold text-gray-400 mb-1">Will be logged as</p>
          <p className="text-sm text-white">{preview}</p>
        </div>
      </div>
    </Modal>
  );
}
