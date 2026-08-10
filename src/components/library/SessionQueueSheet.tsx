import { Trash2, ClipboardCheck, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import Modal from '../shared/Modal';
import { useApp } from '../../context/AppContext';
import { getLibraryItem, type LibraryItem } from '../../data/library';
import { entryPrescriptionText, isAdjusted, queueMinutes, queueToPrefill } from '../../utils/library';
import { todayISO } from '../../utils/dates';
import type { LibrarySessionEntry } from '../../types';
import type { LogPrefill } from '../../App';

interface Props {
  date: string;
  /** Every date with queued entries, ascending — the days this sheet can step between. */
  dates: string[];
  entries: LibrarySessionEntry[];
  onDateChange: (date: string) => void;
  onClose: () => void;
  /** Hands the whole session to the workout logger. Absent = no logger available. */
  onLogSession?: (prefill: LogPrefill) => void;
  /**
   * Opens the per-item result sheet (the parent owns it, so sheets don't stack).
   * `prefillWork` carries the entry's ADJUSTED prescription, so logging from a
   * queued session doesn't hand back the unadjusted library default.
   */
  onLogItem: (item: LibraryItem, prefillWork: string) => void;
}

/**
 * The day's planned session, built from library items.
 *
 * "Log as workout" hands off to the existing workout logger rather than writing
 * its own log, so library sessions keep feeding streaks, belts, PRs and Health
 * exactly like a manually logged one. The queue is deliberately left in place
 * afterwards — it's the plan to compare completed work against.
 */
export default function SessionQueueSheet({
  date, dates, entries, onDateChange, onClose, onLogSession, onLogItem,
}: Props) {
  const { state, dispatch } = useApp();
  const minutes = queueMinutes(entries);
  const hasCamp = !!state.activeCamp;

  // A session can be queued for any day, so the sheet has to be able to reach
  // every day that has one — otherwise a future entry is invisible until it
  // arrives and a past one can never be cleared.
  const index = dates.indexOf(date);
  const prevDate = index > 0 ? dates[index - 1] : null;
  const nextDate = index >= 0 && index < dates.length - 1 ? dates[index + 1] : null;
  const isPast = date < todayISO();

  function logSession() {
    const prefill = queueToPrefill(entries);
    if (!prefill || !onLogSession) return;
    onLogSession(prefill);
    onClose();
  }

  return (
    <Modal
      title={`Session — ${format(parseISO(date), 'EEE d MMM')}`}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <button
            onClick={logSession}
            disabled={entries.length === 0 || !onLogSession || !hasCamp}
            className="btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <ClipboardCheck size={17} /> Log as Workout
          </button>
          {!hasCamp && (
            <p className="text-xs text-gray-500 text-center">
              Set up a camp or off-season block to log this session.
            </p>
          )}
        </div>
      }
    >
      {dates.length > 1 && (
        <div className="flex items-center justify-between mb-3 bg-dark-600 rounded-xl px-1 py-1">
          <button
            onClick={() => prevDate && onDateChange(prevDate)}
            disabled={!prevDate}
            aria-label="Previous queued day"
            className="p-2 text-gray-400 disabled:opacity-30 hover:text-white transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-semibold text-white">
            Day {index + 1} of {dates.length}
          </span>
          <button
            onClick={() => nextDate && onDateChange(nextDate)}
            disabled={!nextDate}
            aria-label="Next queued day"
            className="p-2 text-gray-400 disabled:opacity-30 hover:text-white transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {isPast && entries.length > 0 && (
        <p className="text-xs text-amber-300 mb-3">
          Planned for a day that has passed — log it or clear it.
        </p>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          Nothing queued for this day yet.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {entries.length} item{entries.length !== 1 ? 's' : ''} · ~{minutes} min
            </p>
            <button
              onClick={() => dispatch({ type: 'CLEAR_LIBRARY_QUEUE', payload: date })}
              className="text-xs text-gray-400 hover:text-red-400 font-semibold transition-colors"
            >
              Clear all
            </button>
          </div>

          {entries.map(entry => {
            const item = getLibraryItem(entry.itemId);
            if (!item) return null;
            return (
              <div key={entry.id} className="bg-dark-600 border border-dark-400 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{item.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {entryPrescriptionText(entry)}
                      {isAdjusted(entry.override) && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-brand-400">
                          <Pencil size={9} /> adjusted
                        </span>
                      )}
                    </p>
                    {entry.override.notes && (
                      <p className="text-xs text-gray-500 mt-1 italic">{entry.override.notes}</p>
                    )}
                  </div>
                  <button
                    onClick={() => dispatch({ type: 'REMOVE_QUEUE_ENTRY', payload: entry.id })}
                    aria-label={`Remove ${item.name} from the session`}
                    className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0 -m-2 p-2"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <button
                  onClick={() => { onLogItem(item, entryPrescriptionText(entry)); onClose(); }}
                  className="mt-2 text-xs font-semibold text-brand-400 hover:text-brand-300 transition-colors"
                >
                  Log result for this item
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
