import type { ReactNode } from 'react';
import GlassSurface from './GlassSurface';
import ProChip from './ProChip';
import { tint } from '../../utils/designTokens';

interface Props {
  icon: ReactNode;
  /** `var(--token)` reference. Tints the chip and colours the icon. */
  accent: string;
  title: string;
  subtitle: string;
  onClick: () => void;
  /** Shows the PRO badge when the feature is gated and the user is not Pro. */
  gated?: boolean;
}

/**
 * A tile in a Home screen's "Tools" grid.
 *
 * Both Home screens ship one of these grids, and both had six hand-written
 * copies of the same button — twelve instances of one pattern, already drifted
 * on hover treatment and chip size. The accent is a prop rather than baked in
 * because the tile's colour identifies the destination, which is the one thing
 * that legitimately varies between them.
 */
export default function ToolTile({ icon, accent, title, subtitle, onClick, gated }: Props) {
  return (
    <GlassSurface
      as="button"
      cornerRadius="md"
      onClick={onClick}
      className="flex items-center gap-3 text-left p-4 w-full"
    >
      <div
        className="w-10 h-10 flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: tint(accent, 0.16),
          borderRadius: 'var(--radius-sm)',
          color: accent,
        }}
      >
        {icon}
      </div>
      {/* Wraps rather than truncates. A 2-up tile leaves ~140px for text after
          the icon, which is not enough for "Exercise Library" on one line —
          and a tool tile that says "Exercise Li…" has lost the only thing it
          was there to say. Grid rows equalise height, so a two-line title
          costs nothing but a slightly taller row. */}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white leading-tight">{title}</p>
        <p className="text-xs leading-tight mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {subtitle}
        </p>
      </div>
      {gated && <ProChip />}
    </GlassSurface>
  );
}
