import type { ReactNode } from 'react';
import { usePressable } from '../../hooks/usePressable';
import { tint } from '../../utils/designTokens';

export type ChoiceSize = 'chip' | 'tile';

interface Props {
  selected: boolean;
  onSelect: () => void;
  /** The choice's accent, as a `var(--token)` reference. */
  accent: string;
  label: string;
  sublabel?: string;
  icon?: ReactNode;
  /** `chip` is a single line; `tile` stacks the icon above the label. */
  size?: ChoiceSize;
  className?: string;
}

/**
 * A single-select control — role, mode, experience level, camp length.
 *
 * Onboarding had six of these written by hand, and they had drifted: three
 * border widths, two radii, two ways of tinting the selected state, and the
 * mode toggle looked different in the first-run flow than in the "New Camp"
 * modal even though it is the same question. This is that control, once.
 *
 * SELECTION IS AN INSET RING, NOT A BORDER. A `border-2` that only exists when
 * selected moves the label by 2px on every tap, and swapping border *colour*
 * while keeping the width means an unselected tile still spends 2px of its
 * width on a border nobody can see. An inset box-shadow paints inside the box,
 * so selecting a tile changes only colour — the grid never reflows.
 */
export default function ChoiceTile({
  selected,
  onSelect,
  accent,
  label,
  sublabel,
  icon,
  size = 'chip',
  className = '',
}: Props) {
  const { pressProps, pressableClass } = usePressable();

  const ring = selected
    ? `inset 0 0 0 1.5px ${accent}`
    : 'inset 0 0 0 1px var(--glass-hairline)';

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`${pressableClass} min-h-[44px] flex items-center justify-center gap-2 ${
        size === 'tile' ? 'flex-col py-4 px-3' : 'py-2.5 px-3'
      } ${className}`}
      style={{
        borderRadius: size === 'tile' ? 'var(--radius-md)' : 'var(--radius-sm)',
        // The selected fill is a tint of the accent itself, so a teal choice
        // and a flame choice are the same design rather than two palettes.
        backgroundColor: selected ? tint(accent, 0.14) : 'var(--surface-1)',
        boxShadow: selected ? `${ring}, 0 0 20px ${tint(accent, 0.22)}` : ring,
        color: selected ? accent : 'var(--text-secondary)',
        transition: 'background-color 160ms ease, box-shadow 160ms ease, color 160ms ease',
      }}
      {...pressProps}
    >
      {icon}
      <span className={`font-semibold ${size === 'tile' ? 'text-base' : 'text-sm'}`}>{label}</span>
      {sublabel && (
        <span className="text-xs font-normal" style={{ color: 'var(--text-tertiary)' }}>
          {sublabel}
        </span>
      )}
    </button>
  );
}
