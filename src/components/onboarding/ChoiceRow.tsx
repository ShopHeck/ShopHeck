import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { usePressable } from '../../hooks/usePressable';
import { tint } from '../../utils/designTokens';

interface Props {
  selected: boolean;
  onSelect: () => void;
  /** The row's accent, as a `var(--token)` reference. */
  accent: string;
  title: string;
  description?: string;
  /** Replaces the radio dot with an icon chip, as the fight-format row does. */
  icon?: ReactNode;
  className?: string;
}

/**
 * A single-select row with room for an explanation — off-season goals, the
 * bare-knuckle format preset.
 *
 * Same selection mechanics as <ChoiceTile> (inset ring, accent tint, real
 * press feedback); the difference is that this shape can carry a sentence, and
 * a choice a fighter has to *read* should not be crammed into a chip. The two
 * share the ring recipe deliberately — a fighter should not have to work out
 * that a highlighted row and a highlighted chip mean the same thing.
 */
export default function ChoiceRow({
  selected,
  onSelect,
  accent,
  title,
  description,
  icon,
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
      className={`${pressableClass} w-full min-h-[44px] flex items-center gap-3 p-3.5 text-left ${className}`}
      style={{
        borderRadius: 'var(--radius-md)',
        backgroundColor: selected ? tint(accent, 0.12) : 'var(--surface-1)',
        boxShadow: selected ? `${ring}, 0 0 20px ${tint(accent, 0.2)}` : ring,
        transition: 'background-color 160ms ease, box-shadow 160ms ease',
      }}
      {...pressProps}
    >
      {icon ? (
        <span
          className="w-9 h-9 flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: tint(accent, 0.16),
            borderRadius: 'var(--radius-sm)',
            color: accent,
          }}
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : (
        <span
          className="w-4 h-4 rounded-full flex-shrink-0"
          style={{
            boxShadow: selected
              ? `inset 0 0 0 5px ${accent}, inset 0 0 0 1.5px ${accent}`
              : 'inset 0 0 0 1.5px var(--text-tertiary)',
            transition: 'box-shadow 160ms ease',
          }}
          aria-hidden="true"
        />
      )}

      <span className="flex-1 min-w-0">
        <span
          className="block text-sm font-bold"
          style={{ color: selected ? accent : 'var(--text-primary)' }}
        >
          {title}
        </span>
        {description && (
          <span className="block text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {description}
          </span>
        )}
      </span>

      {selected && <Check size={16} className="flex-shrink-0" style={{ color: accent }} aria-hidden="true" />}
    </button>
  );
}
