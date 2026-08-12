import { Activity } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useApp } from '../../context/AppContext';
import { SESSION_COLORS, SESSION_ICONS } from '../../utils/sessionVisuals';
import { tint } from '../../utils/designTokens';
import GlassSurface from './GlassSurface';

interface Props {
  accent: string;
  onSeeAll: () => void;
}

/**
 * The last three logged sessions.
 *
 * One component for both Homes, taking the off-season version's per-type icon
 * and colour rather than the fight-camp version's single grey Activity glyph —
 * three rows that all look identical are three rows you have to read.
 */
export default function RecentActivityCard({ accent, onSeeAll }: Props) {
  const { state } = useApp();
  const { activeCamp, workoutLogs } = state;
  if (!activeCamp) return null;

  // Sorted, not just sliced. Local state is built newest-first, but a cloud
  // restore appends rows in the server's order, so array position is not
  // recency for anyone who has synced a second device.
  const recent = workoutLogs
    .filter(l => l.campId === activeCamp.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  if (recent.length === 0) return null;

  return (
    <div className="mx-4">
      <div className="flex items-center justify-between mb-2">
        <p className="type-caption text-gray-450">Recent Activity</p>
        <button
          onClick={onSeeAll}
          className="text-xs font-semibold -m-2 p-2"
          style={{ color: accent }}
        >
          See all
        </button>
      </div>
      <div className="space-y-2">
        {recent.map(log => {
          const color = SESSION_COLORS[log.sessionType] ?? accent;
          const Icon = SESSION_ICONS[log.sessionType] ?? Activity;
          return (
            <GlassSurface key={log.id} cornerRadius="md" className="flex items-center gap-3 p-4">
              <div
                className="w-8 h-8 flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: tint(color, 0.16),
                  borderRadius: 'var(--radius-sm)',
                  color,
                }}
              >
                <Icon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{log.title}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {format(parseISO(log.date), 'MMM d')} · {log.duration}min · RPE {log.rpe}
                </p>
              </div>
            </GlassSurface>
          );
        })}
      </div>
    </div>
  );
}
