import { useApp } from '../../context/AppContext';
import { getCurrentWeekNumber } from '../../utils/campGenerator';
import { SESSION_COLORS, SESSION_LABELS } from '../../utils/sessionVisuals';
import GlassSurface from './GlassSurface';
import type { SessionType } from '../../types';

/**
 * This week's logged work, split by session type.
 *
 * Off-season only. A fight camp's mix is prescribed by the generated phase, so
 * there is nothing in it for the fighter to read; an off-season block is theirs
 * to shape, which is the only case where "am I doing too much of one thing" is
 * a question the fighter can act on.
 */
export default function SessionMixCard() {
  const { state } = useApp();
  const { activeCamp, workoutLogs } = state;
  if (!activeCamp) return null;

  const weekNum = getCurrentWeekNumber(activeCamp);
  const weekLogs = workoutLogs.filter(l => l.campId === activeCamp.id && l.weekNumber === weekNum);

  const counts = weekLogs.reduce<Partial<Record<SessionType, number>>>((acc, l) => {
    acc[l.sessionType] = (acc[l.sessionType] ?? 0) + 1;
    return acc;
  }, {});
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const entries = Object.entries(counts) as [SessionType, number][];

  return (
    <div className="mx-4">
      <p className="type-caption text-gray-450 mb-2">Session Mix</p>
      <GlassSurface cornerRadius="md" className="p-4">
        <div
          className="h-2 overflow-hidden flex gap-px mb-3"
          style={{ borderRadius: 'var(--radius-full)' }}
          role="img"
          aria-label={entries
            .map(([type, n]) => `${SESSION_LABELS[type] ?? type}: ${n}`)
            .join(', ')}
        >
          {entries.map(([type, count]) => (
            <div
              key={type}
              className="h-full transition-all"
              style={{
                width: `${Math.round((count / total) * 100)}%`,
                backgroundColor: SESSION_COLORS[type] ?? 'var(--text-tertiary)',
              }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {entries.map(([type, count]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div
                aria-hidden="true"
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: SESSION_COLORS[type] ?? 'var(--text-tertiary)' }}
              />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {SESSION_LABELS[type] ?? type}{' '}
                <span className="text-gray-450 tabular-nums">×{count}</span>
              </span>
            </div>
          ))}
        </div>
      </GlassSurface>
    </div>
  );
}
