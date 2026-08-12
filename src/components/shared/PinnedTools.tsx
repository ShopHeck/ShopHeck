import { useApp } from '../../context/AppContext';
import { isPro } from '../../utils/subscription';
import { effectiveIds, resolvePinned, type HomeMode } from '../../utils/homeLayout';
import ToolTile from './ToolTile';
import type { View } from '../../types';

interface Props {
  mode: HomeMode;
  accent: string;
  onNavigate: (view: View) => void;
}

/**
 * The tool grid at the bottom of Home — whatever the fighter pinned.
 *
 * Both Homes used to hard-code their own list here, which is how they came to
 * offer different tools for no reason anyone could state (the off-season grid
 * carried "Log Session" and no Camp History; the camp grid the reverse). The
 * grid is now the pinned slice of one registry, so the difference between the
 * two Homes is only what each mode actually supports.
 *
 * Renders nothing at all when the fighter has unpinned everything — an empty
 * "Tools" heading over blank space reads as a loading failure. The More tab is
 * still one tap away in the bar.
 */
export default function PinnedTools({ mode, accent, onNavigate }: Props) {
  const { state } = useApp();
  const pro = isPro(state.subscription);
  const tools = resolvePinned(effectiveIds(state.dashboardPrefs, 'tool', mode), 'tool', mode);

  if (tools.length === 0) return null;

  return (
    <div className="mx-4">
      <div className="flex items-center justify-between mb-2">
        <p className="type-caption text-gray-450">Tools</p>
        <button
          onClick={() => onNavigate('more')}
          className="text-xs font-semibold -m-2 p-2"
          style={{ color: accent }}
        >
          Edit
        </button>
      </div>
      <div className="grid grid-cols-2" style={{ gap: 'var(--space-3)' }}>
        {tools.map(tool => {
          const Icon = tool.icon;
          return (
            <ToolTile
              key={tool.id}
              icon={<Icon size={18} />}
              accent={tool.accent}
              title={tool.title}
              subtitle={tool.subtitle}
              onClick={() => tool.view && onNavigate(tool.view)}
              gated={!!tool.pro && !pro}
            />
          );
        })}
      </div>
    </div>
  );
}
