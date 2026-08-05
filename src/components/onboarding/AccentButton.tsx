import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { usePressable } from '../../hooks/usePressable';
import { tint } from '../../utils/designTokens';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Fill colour, as a `var(--token)` reference. */
  accent: string;
  /** Text/icon colour on that fill. See `ctaColors` in ./config. */
  foreground: string;
  children: ReactNode;
}

/**
 * The primary call to action, in the accent of the mode the user is in.
 *
 * The off-season CTA used to be `.btn-secondary` with four `!important`
 * overrides bolted on, which made the "Generate Off Season Plan" button render
 * as a de-emphasised secondary — the one action on the screen, styled as if it
 * were the alternative. Same weight as the fight-camp button now; only the
 * colour changes.
 *
 * Foreground is a required prop rather than always-white because the two
 * accents need different answers: white on flame is the app's existing
 * convention, and white on teal would land near 1.9:1. `ctaColors` in
 * ./config supplies the two pairs the app actually ships.
 */
export default function AccentButton({
  accent,
  foreground,
  children,
  className = '',
  disabled,
  style,
  ...rest
}: Props) {
  const { pressProps, pressableClass } = usePressable();

  return (
    <button
      disabled={disabled}
      className={`${pressableClass} w-full min-h-[48px] flex items-center justify-center gap-2 font-semibold px-6 py-3.5 disabled:cursor-not-allowed ${className}`}
      style={{
        borderRadius: 'var(--radius-sm)',
        backgroundColor: accent,
        color: foreground,
        // Level 3 elevation (§2.4) — reserved for active CTAs, which this is.
        boxShadow: disabled ? 'none' : `var(--shadow-1), 0 0 20px ${tint(accent, 0.4)}`,
        opacity: disabled ? 0.45 : 1,
        transition: 'opacity 160ms ease, box-shadow 160ms ease',
        ...style,
      }}
      {...pressProps}
      {...rest}
    >
      {children}
    </button>
  );
}
