import React from 'react';
import { usePressable } from '../../hooks/usePressable';

export type GlassRadius = 'sm' | 'md' | 'lg' | 'full';

export interface GlassSurfaceProps {
  cornerRadius?: GlassRadius;
  elevated?: boolean;
  /** CSS color (use a `var(--token)` reference). Applied at 40% per §2.4. */
  accentGlow?: string;
  /**
   * 0.0–1.0, mapped to 0–20px of backdrop blur.
   *
   * Ignored unless `live` is also set — see the note on `live` below. Kept in
   * the contract because §3.3 specifies it and because a component that wants
   * a *lighter* live blur than the default should be able to ask for one
   * without hand-rolling its own recipe.
   */
  intensity?: number;
  /**
   * Opt into a real `backdrop-filter` layer.
   *
   * Off by default, and that default is the design system working rather than
   * a compromise. §3.2 forbids live blur inside a scrolling container, and this
   * app renders every screen inside one `overflow-y-auto` region, so a card
   * that blurred would be jank on exactly the surfaces a fighter scrolls
   * mid-session. The solid path uses `--surface-*` fills tuned to what the blur
   * recipe composites to, so the two read as the same material.
   *
   * Legitimate uses: the fixed header and bottom nav, which sit outside the
   * scroll container, and modal backdrops, which blur a static page. One live
   * layer per visual group — never stack them.
   */
  live?: boolean;
  /**
   * Adds the §8.3 contrast scrim behind this surface's content.
   *
   * On by default for live surfaces and off for solid ones, because the scrim
   * exists to defend against an unpredictable composited backdrop and a solid
   * fill does not have one. §9 requires the scrim be applied by this component
   * rather than opted into per-card, which is what the default encodes — a new
   * card cannot forget it.
   */
  scrim?: boolean;
  as?: 'div' | 'section' | 'article' | 'button' | 'li';
  /** Press feedback (§5). Defaults on when rendered as a button. */
  pressable?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  onClick?: () => void;
  'aria-label'?: string;
}

const RADIUS: Record<GlassRadius, string> = {
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  full: 'var(--radius-full)',
};

/**
 * The one glass surface (§3.3).
 *
 * Every dimensional surface in the app routes through here. Ad-hoc glass
 * recreated per-screen is what the shared component exists to prevent — the
 * previous arrangement had ~40 hand-rolled `bg-dark-700 border border-dark-500`
 * variants that had already drifted apart in radius, border tone and padding.
 *
 * The material itself lives in CSS (`.glass`, `.glass-elevated`, `.glass-live`
 * in index.css) so the `prefers-reduced-transparency` fallback can override it
 * from one media query rather than from React state.
 */
export default function GlassSurface({
  cornerRadius = 'lg',
  elevated = false,
  accentGlow,
  intensity,
  live = false,
  scrim,
  as = 'div',
  pressable,
  className = '',
  style,
  children,
  onClick,
  ...rest
}: GlassSurfaceProps) {
  const Tag = as as React.ElementType;
  const isButton = as === 'button';
  const wantsPress = pressable ?? isButton;
  const { pressProps, pressableClass } = usePressable();

  const withScrim = scrim ?? live;

  const classes = [
    live ? 'glass glass-live' : 'glass',
    elevated ? 'glass-elevated' : '',
    withScrim ? 'text-scrim' : '',
    wantsPress ? pressableClass : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const composed: React.CSSProperties = {
    borderRadius: RADIUS[cornerRadius],
    ...(live && intensity !== undefined
      ? {
          backdropFilter: `blur(${Math.round(Math.max(0, Math.min(1, intensity)) * 20)}px)`,
          WebkitBackdropFilter: `blur(${Math.round(Math.max(0, Math.min(1, intensity)) * 20)}px)`,
        }
      : null),
    ...(accentGlow
      ? {
          // Level 3 elevation: shadow-2 plus the accent glow. Composed here
          // rather than as a class because the accent is a runtime value.
          boxShadow: `inset 0 1px 0 0 var(--glass-border-highlight), inset 0 -1px 0 0 var(--glass-border-shadow), var(--shadow-2), 0 0 20px ${accentGlow}`,
        }
      : null),
    ...style,
  };

  return (
    <Tag
      className={classes}
      style={composed}
      onClick={onClick}
      {...(wantsPress ? pressProps : null)}
      {...rest}
    >
      {/* The scrim is a ::before on .text-scrim and sits behind content, so
          children need their own stacking context to stay above it. */}
      <div className="relative">{children}</div>
    </Tag>
  );
}
