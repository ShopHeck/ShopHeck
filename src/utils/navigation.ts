/**
 * View-stack transitions for the app shell.
 *
 * Extracted from AppShell so the rules are testable: which navigations reset
 * the stack, which push, and which replace is easy to get subtly wrong, and
 * getting it wrong strands the user on a screen with a Back button that lies
 * about where it goes.
 */

export interface NavigateOptions {
  /**
   * Swap the current entry instead of stacking on it. For a screen that has
   * finished its job and must not be returned to — the fight result form
   * handing off to the breakdown, for instance.
   */
  replace?: boolean;
}

/**
 * The next view stack after navigating to `next`.
 *
 * - Navigating to the view already on top is a no-op (the same array comes
 *   back, so React skips the re-render).
 * - A tab-bar destination resets to that tab's root, the way a native tab bar
 *   does. Tabs are peers, not a trail to walk back through.
 * - `replace` swaps the top entry, never emptying the stack.
 * - Anything else pushes.
 */
export function nextHistory<T extends string>(
  prev: T[],
  next: T,
  tabViewIds: readonly string[],
  opts?: NavigateOptions,
): T[] {
  if (prev[prev.length - 1] === next) return prev;
  if (tabViewIds.includes(next)) return [next];
  if (opts?.replace && prev.length > 1) return [...prev.slice(0, -1), next];
  return [...prev, next];
}

/** The stack after going back. Bottoms out rather than emptying. */
export function popHistory<T extends string>(prev: T[]): T[] {
  return prev.length > 1 ? prev.slice(0, -1) : prev;
}
