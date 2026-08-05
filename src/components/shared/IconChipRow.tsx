import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { tint } from '../../utils/designTokens';
import { usePressable } from '../../hooks/usePressable';

interface Props {
  icon: ReactNode;
  /** The row's accent, as a `var(--token)` reference. Tints the chip. */
  accent: string;
  title: string;
  subtitle?: string;
  /** Right-hand content — a value, a switch, a badge. Replaces the chevron. */
  trailing?: ReactNode;
  onClick?: () => void;
  /**
   * Destructive rows (§9): crimson text and icon on the default background,
   * never a filled crimson button. A filled destructive button reads as the
   * primary action on the screen, which "Delete account" must never be.
   */
  destructive?: boolean;
  className?: string;
}

/**
 * The Settings list row (§9).
 *
 * One primitive, built once. The icon-chip pattern — small rounded square,
 * translucent tint of the row's own accent, icon centered, left of the title —
 * was already the app's convention across Bluetooth & Devices, Integrations and
 * Subscription, but each section had rebuilt it, so chip size, radius and tint
 * opacity had drifted between them.
 */
export default function IconChipRow({
  icon,
  accent,
  title,
  subtitle,
  trailing,
  onClick,
  destructive = false,
  className = '',
}: Props) {
  const { pressProps, pressableClass } = usePressable();
  const color = destructive ? 'var(--accent-crimson)' : accent;
  const interactive = !!onClick;

  const body = (
    <>
      <div
        className="w-9 h-9 flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: tint(color, 0.16),
          borderRadius: 'var(--radius-sm)',
          color,
        }}
        aria-hidden="true"
      >
        {icon}
      </div>

      <div className="flex-1 min-w-0 text-left">
        <p
          className="text-sm font-semibold truncate"
          style={{ color: destructive ? 'var(--accent-crimson)' : 'var(--text-primary)' }}
        >
          {title}
        </p>
        {subtitle && (
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {subtitle}
          </p>
        )}
      </div>

      {trailing ?? (interactive && <ChevronRight size={18} className="text-gray-450 flex-shrink-0" />)}
    </>
  );

  // min-h-[44px] is the §5 touch-target floor, and it is on the row rather than
  // on the chip because the whole row is the target.
  const shared = `w-full flex items-center gap-3 px-4 py-3 min-h-[44px] ${className}`;

  if (!interactive) {
    return <div className={shared}>{body}</div>;
  }

  return (
    <button onClick={onClick} className={`${shared} ${pressableClass}`} {...pressProps}>
      {body}
    </button>
  );
}
