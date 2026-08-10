import { useState } from 'react';
import { format } from 'date-fns';
import Modal from '../shared/Modal';
import { useApp } from '../../context/AppContext';
import { formatPrescription, type LibraryItem } from '../../data/library';
import type { DiscomfortLevel } from '../../types';

const DISCOMFORT: { value: DiscomfortLevel; label: string; color: string }[] = [
  { value: 0, label: 'None',     color: 'bg-green-700  border-green-600' },
  { value: 1, label: 'Mild',     color: 'bg-yellow-700 border-yellow-600' },
  { value: 2, label: 'Moderate', color: 'bg-orange-700 border-orange-600' },
  { value: 3, label: 'Sharp',    color: 'bg-red-700    border-red-600' },
];

const CONFIDENCE_LABELS: Record<number, string> = {
  1: 'Falling apart',
  2: 'Shaky',
  3: 'Workable',
  4: 'Sharp',
  5: 'Dialled in',
};

interface Props {
  item: LibraryItem;
  onClose: () => void;
}

/**
 * Records what actually happened on one library item — the completed side of a
 * prescription. Separate from the workout log: this is the per-item detail that
 * makes "what keeps failing?" and spaced review answerable.
 */
export default function LogResultSheet({ item, onClose }: Props) {
  const { state, dispatch } = useApp();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [actualWork, setActualWork] = useState(formatPrescription(item.prescription));
  const [rpe, setRpe] = useState('7');
  const [discomfort, setDiscomfort] = useState<DiscomfortLevel>(0);
  const [confidence, setConfidence] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [notes, setNotes] = useState('');

  function save() {
    if (!actualWork.trim()) return;
    dispatch({
      type: 'LOG_LIBRARY_RESULT',
      payload: {
        itemId: item.id,
        date,
        campId: state.activeCamp?.id,
        actualWork: actualWork.trim(),
        rpe: parseInt(rpe, 10),
        discomfort,
        technicalConfidence: confidence,
        notes: notes.trim(),
      },
    });
    onClose();
  }

  return (
    <Modal
      title={`Log — ${item.name}`}
      onClose={onClose}
      footer={
        <button onClick={save} disabled={!actualWork.trim()} className="btn-primary w-full disabled:opacity-50">
          Save Result
        </button>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label">Date</span>
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>

        <label className="block">
          <span className="label">Work completed *</span>
          <input
            className="input"
            placeholder="e.g. 4 × 5 @ 275 lb"
            value={actualWork}
            onChange={e => setActualWork(e.target.value)}
          />
          <span className="text-xs text-gray-500 mt-1 block">
            Prefilled with the prescription — edit it to what you actually did.
          </span>
        </label>

        <div>
          <label className="label mb-0" htmlFor="library-rpe">Effort: {rpe}/10</label>
          <input
            id="library-rpe"
            type="range"
            min="1"
            max="10"
            value={rpe}
            onChange={e => setRpe(e.target.value)}
            className="w-full accent-brand-500 mt-2"
          />
        </div>

        <div>
          <span className="label">Pain or discomfort</span>
          <div role="group" aria-label="Pain or discomfort" className="grid grid-cols-4 gap-2">
            {DISCOMFORT.map(d => (
              <button
                key={d.value}
                onClick={() => setDiscomfort(d.value)}
                aria-pressed={discomfort === d.value}
                className={`py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                  discomfort === d.value ? `${d.color} text-white` : 'border-dark-400 bg-dark-600 text-gray-400'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Technical confidence</span>
          <div role="group" aria-label="Technical confidence" className="flex gap-2">
            {([1, 2, 3, 4, 5] as const).map(n => (
              <button
                key={n}
                onClick={() => setConfidence(n)}
                aria-pressed={confidence === n}
                className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                  confidence === n
                    ? 'border-transparent bg-brand-600 text-white'
                    : 'border-dark-400 bg-dark-600 text-gray-400'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-xs text-center text-gray-400 mt-1">{CONFIDENCE_LABELS[confidence]}</p>
        </div>

        <label className="block">
          <span className="label">Notes</span>
          <textarea
            className="input resize-none"
            rows={2}
            placeholder="What broke down? What felt right?"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}
