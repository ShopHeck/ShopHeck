import { useState } from 'react';
import {
  ChevronDown, ChevronUp, Star, Plus, ClipboardList, PlayCircle, Trash2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import ConfirmDialog from '../shared/ConfirmDialog';
import { useApp } from '../../context/AppContext';
import {
  ADAPTATION_LABELS, CAMP_PHASE_LABELS, ENERGY_SYSTEM_LABELS, EXERCISE_CATEGORY_LABELS,
  FORMAT_LABELS, GRIP_LABELS, INTENT_LABELS, METRIC_LABELS, MOVEMENT_PATTERN_LABELS,
  RANGE_LABELS, RULESET_LABELS, SESSION_ROLE_LABELS, SPACE_LABELS, STANCE_LABELS,
  formatPrescription, formatSeconds, getLibraryItem, isTechnique,
  type ExerciseCategory, type LibraryItem, type Prescription,
} from '../../data/library';
import { EMPTY_LIBRARY, reviewInfo, resultsFor, type ReviewInfo } from '../../utils/library';
import { DIFFICULTY_COLORS, tint } from '../../utils/designTokens';

/**
 * Difficulty reuses the pace-status palette (§2.6) rather than introducing a
 * fourth green/amber/red — same ordinal meaning, same three tokens.
 */
const difficultyStyle = (d: LibraryItem['difficulty']) => ({
  backgroundColor: tint(DIFFICULTY_COLORS[d], 0.16),
  color: DIFFICULTY_COLORS[d],
});

const CATEGORY_COLORS: Record<ExerciseCategory, string> = {
  strength:     'bg-yellow-900/30 text-yellow-400',
  conditioning: 'bg-orange-900/30 text-orange-400',
  mobility:     'bg-teal-900/30 text-teal-400',
};

const DISCOMFORT_LABELS = ['No pain', 'Mild', 'Moderate', 'Sharp'];

function Section({ title, items, tone = 'default' }: { title: string; items: string[]; tone?: 'default' | 'warn' }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={`text-xs font-semibold mb-1 ${tone === 'warn' ? 'text-red-400' : 'text-gray-400'}`}>{title}</p>
      <ul className="space-y-1">
        {items.map((line, i) => (
          <li key={i} className="text-xs text-gray-300 leading-relaxed flex gap-1.5">
            <span className={tone === 'warn' ? 'text-red-500' : 'text-brand-500'} aria-hidden="true">•</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="text-xs text-gray-400">
      <span className="font-semibold">{label}: </span>{value}
    </div>
  );
}

/** The structured prescription, broken out field by field. */
function PrescriptionGrid({ p }: { p: Prescription }) {
  const cells: [string, string][] = [];
  const push = (label: string, value: string | undefined) => { if (value) cells.push([label, value]); };
  const span = (lo?: number, hi?: number) => lo === undefined ? undefined : (hi !== undefined && hi !== lo ? `${lo}–${hi}` : `${lo}`);

  push('Sets', span(p.sets, p.setsMax));
  push('Reps', span(p.reps, p.repsMax) && `${span(p.reps, p.repsMax)}${p.perSide ? ' per side' : ''}`);
  push('Rounds', p.rounds !== undefined ? String(p.rounds) : undefined);
  push('Work', p.workSeconds !== undefined ? formatSeconds(p.workSeconds) : undefined);
  push('Rest', p.restSeconds !== undefined ? formatSeconds(p.restSeconds) : undefined);
  push('Distance', span(p.distanceMeters, p.distanceMetersMax) && `${span(p.distanceMeters, p.distanceMetersMax)} m`);
  push('Tempo', p.tempo);
  push('Load', p.load);
  push('RPE', span(p.rpe, p.rpeMax));
  push('RIR', p.rir !== undefined ? String(p.rir) : undefined);

  if (cells.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2">
      {cells.map(([label, value]) => (
        <div key={label} className="bg-dark-600 rounded-lg px-2 py-1.5">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
          <p className="text-xs font-semibold text-white">{value}</p>
        </div>
      ))}
    </div>
  );
}

function ReviewPill({ info }: { info: ReviewInfo }) {
  if (info.status !== 'due' && info.status !== 'overdue') return null;
  const overdue = info.status === 'overdue';
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
      overdue ? 'bg-red-900/40 text-red-300' : 'bg-amber-900/40 text-amber-300'
    }`}>
      {overdue ? 'Overdue' : 'Due'} · {info.daysSince}d
    </span>
  );
}

interface Props {
  item: LibraryItem;
  expanded: boolean;
  onToggle: () => void;
  onAddToSession: () => void;
  onLogResult: () => void;
}

export default function LibraryCard({ item, expanded, onToggle, onAddToSession, onLogResult }: Props) {
  const { state, dispatch } = useApp();
  const [deleteResultId, setDeleteResultId] = useState<string | null>(null);

  const { favorites, results } = state.library ?? EMPTY_LIBRARY;
  const favorite = favorites.includes(item.id);
  const info = reviewInfo(item, results);
  const history = resultsFor(item.id, results);

  const technique = isTechnique(item);
  const live = technique && item.formats.includes('live-resistance');

  const kindBadge = technique
    ? { label: RANGE_LABELS[item.range], color: 'bg-brand-900/30 text-brand-400' }
    : { label: EXERCISE_CATEGORY_LABELS[item.category], color: CATEGORY_COLORS[item.category] };

  const subtitle = technique
    ? item.disciplines.join(' · ')
    : `${ADAPTATION_LABELS[item.adaptation]} · ${ENERGY_SYSTEM_LABELS[item.energySystem]}`;

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-start">
        <button
          className="flex-1 min-w-0 p-4 pr-2 text-left"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${kindBadge.color}`}>
              {kindBadge.label}
            </span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={difficultyStyle(item.difficulty)}
            >
              {item.difficulty}
            </span>
            {live && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-900/30 text-red-400">
                Live
              </span>
            )}
            <ReviewPill info={info} />
          </div>
          <p className="text-sm font-semibold text-white">{item.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{formatPrescription(item.prescription)}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>
        </button>

        <div className="flex items-center gap-1 pt-4 pr-3 flex-shrink-0">
          <button
            onClick={() => dispatch({ type: 'TOGGLE_LIBRARY_FAVORITE', payload: item.id })}
            aria-label={favorite ? `Remove ${item.name} from favourites` : `Add ${item.name} to favourites`}
            aria-pressed={favorite}
            className={`p-2 transition-colors ${favorite ? 'text-amber-400' : 'text-gray-500 hover:text-amber-400'}`}
          >
            <Star size={16} fill={favorite ? 'currentColor' : 'none'} />
          </button>
          <button onClick={onToggle} aria-label={expanded ? 'Collapse' : 'Expand'} className="p-2 text-gray-400">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-dark-600 pt-3">
          {item.media?.videoUrl && (
            <a
              href={item.media.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 bg-dark-600 border border-dark-400 rounded-xl p-3 text-sm text-brand-400 font-semibold"
            >
              <PlayCircle size={18} />
              Watch demonstration
              {item.media.angles && item.media.angles.length > 0 && (
                <span className="text-xs text-gray-400 font-normal">({item.media.angles.join(', ')})</span>
              )}
            </a>
          )}

          <p className="text-sm text-gray-300 leading-relaxed">{item.instructions}</p>

          <PrescriptionGrid p={item.prescription} />

          <Section title="Coaching cues" items={item.cues} />
          <Section title="Common mistakes" items={item.commonMistakes} tone="warn" />

          {technique && (
            <>
              <Section title="Drill constraints" items={item.drillConstraints} />
              <Section title="Success criteria" items={item.successCriteria} />
              {item.commonReactions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 mb-1">Common reactions</p>
                  <div className="space-y-1.5">
                    {item.commonReactions.map((r, i) => (
                      <div key={i} className="bg-dark-600 rounded-lg p-2">
                        <p className="text-xs text-gray-300">{r.reaction}</p>
                        <p className="text-xs text-brand-400 mt-0.5">→ {r.answer}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <Section title="Progression path" items={item.progressions} />
          <Section title="Regressions" items={item.regressions} />
          <Section title="Substitutions" items={item.substitutions} />
          <Section title="Contraindications" items={item.contraindications} tone="warn" />

          {item.tips && (
            <div className="bg-brand-900/20 border border-brand-800/40 rounded-xl p-3">
              <p className="text-xs font-semibold text-brand-400 mb-1">Pro Tip</p>
              <p className="text-xs text-gray-300 leading-relaxed">{item.tips}</p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            {technique ? (
              <>
                <Meta label="Stance" value={STANCE_LABELS[item.stance]} />
                <Meta label="Position" value={item.position ?? ''} />
                <Meta label="Intent" value={item.intents.map(i => INTENT_LABELS[i]).join(', ')} />
                <Meta label="Format" value={item.formats.map(f => FORMAT_LABELS[f]).join(', ')} />
                <Meta label="Gi / no-gi" value={item.grip === 'n/a' ? '' : GRIP_LABELS[item.grip]} />
                <Meta label="Rulesets" value={item.rulesets.map(r => RULESET_LABELS[r]).join(', ')} />
                <Meta label="Legality" value={item.legalityNotes ?? ''} />
                <Meta label="Focus" value={item.focusTags.join(', ')} />
                <Meta
                  label="Chains into"
                  value={item.linkedTechniques.map(id => getLibraryItem(id)?.name).filter(Boolean).join(', ')}
                />
              </>
            ) : (
              <>
                <Meta label="Pattern" value={item.movementPatterns.map(m => MOVEMENT_PATTERN_LABELS[m]).join(', ')} />
                <Meta label="Muscles" value={item.muscleGroups.join(', ')} />
                <Meta label="Sports" value={item.sports.length > 0 ? item.sports.join(', ') : 'All sports'} />
              </>
            )}
            <Meta label="Equipment" value={item.equipment.length > 0 ? item.equipment.join(', ') : 'Bodyweight only'} />
            <Meta label="Space" value={SPACE_LABELS[item.space]} />
            <Meta label="Session role" value={item.sessionRoles.map(r => SESSION_ROLE_LABELS[r]).join(', ')} />
            <Meta
              label="Camp phase"
              value={item.campPhases.length > 0 ? item.campPhases.map(p => CAMP_PHASE_LABELS[p]).join(', ') : 'Any phase'}
            />
            <Meta label="Prerequisites" value={item.prerequisites.join(', ')} />
            <Meta label="Warm-up" value={item.warmup ?? ''} />
            <Meta label="Tracks" value={item.metrics.map(m => METRIC_LABELS[m]).join(', ')} />
          </div>

          {/* History — planned vs completed, and how long since it was trained. */}
          <div className="border-t border-dark-600 pt-3">
            <p className="text-xs font-semibold text-gray-400 mb-1.5">
              {info.daysSince === null
                ? 'Not logged yet'
                : `Last trained ${info.daysSince === 0 ? 'today' : `${info.daysSince}d ago`}${
                    info.intervalDays !== null ? ` · review every ${info.intervalDays}d` : ''
                  }`}
            </p>
            {history.slice(0, 3).map(r => (
              <div key={r.id} className="flex items-start justify-between gap-2 py-1">
                <div className="min-w-0">
                  <p className="text-xs text-gray-300">
                    {format(parseISO(r.date), 'MMM d')} · {r.actualWork}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    RPE {r.rpe}/10 · technique {r.technicalConfidence}/5 · {DISCOMFORT_LABELS[r.discomfort]}
                    {r.notes ? ` · ${r.notes}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => setDeleteResultId(r.id)}
                  aria-label={`Delete result from ${format(parseISO(r.date), 'MMMM d')}`}
                  className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0 -m-2 p-2"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onAddToSession}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white transition-all active:scale-95"
            >
              <Plus size={14} /> Add to session
            </button>
            <button
              onClick={onLogResult}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-dark-500 hover:bg-dark-400 text-white transition-all active:scale-95"
            >
              <ClipboardList size={14} /> Log result
            </button>
          </div>

          <p className="text-[10px] text-gray-600">
            {item.source.author} · v{item.source.version} · reviewed {item.source.reviewedAt}
            {item.source.reviewedBy ? ` by ${item.source.reviewedBy}` : ''}
          </p>
        </div>
      )}

      {deleteResultId && (
        <ConfirmDialog
          title="Delete Result?"
          message="This logged result will be permanently deleted."
          confirmLabel="Delete"
          danger
          onConfirm={() => { dispatch({ type: 'DELETE_LIBRARY_RESULT', payload: deleteResultId }); setDeleteResultId(null); }}
          onCancel={() => setDeleteResultId(null)}
        />
      )}
    </div>
  );
}
