import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { usePressable } from '../../hooks/usePressable';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

/**
 * A button with the design system's press feedback (§5).
 *
 * Exists so a call site can opt into the reliable press path by changing the
 * tag rather than by wiring three touch handlers by hand — the version of that
 * which gets skipped under deadline is the version with three handlers.
 *
 * Prefer this over Tailwind's `active:scale-*` anywhere the tap matters:
 * WKWebView drops `:active` on a fast tap, so the feedback silently does not
 * happen exactly when a fighter is hitting the control quickly.
 */
export default function PressableButton({ children, className = '', ...rest }: Props) {
  const { pressProps, pressableClass } = usePressable();

  return (
    <button className={`${pressableClass} ${className}`} {...pressProps} {...rest}>
      {children}
    </button>
  );
}
