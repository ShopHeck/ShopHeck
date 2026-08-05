import { useCallback, useMemo, useState } from 'react';

/**
 * Press feedback for glass surfaces (§5).
 *
 * The spec's transform and easing are in CSS (`.pressable` / `.pressed` in
 * index.css); this hook only owns *when* the class is on.
 *
 * WHY NOT `:active`: WKWebView drops `:active` entirely on a fast tap — the
 * touch starts and ends inside one frame and the style never commits. That is
 * precisely the tap a fighter makes with gloves on, mid-round, which is the
 * moment press feedback is load-bearing rather than decorative. Explicit touch
 * handlers commit the state synchronously and cannot be skipped that way.
 *
 * Pointer events would be one handler instead of three, but WKWebView fires
 * them inconsistently alongside touch for elements inside a scroll container,
 * so touch + mouse is deliberate rather than legacy.
 */
export function usePressable() {
  const [pressed, setPressed] = useState(false);

  const press = useCallback(() => setPressed(true), []);
  const release = useCallback(() => setPressed(false), []);

  return useMemo(
    () => ({
      pressed,
      /** Spread onto the element; combine `className` with `pressableClass`. */
      pressProps: {
        onTouchStart: press,
        onTouchEnd: release,
        // A touch that turns into a scroll never fires touchend on the element,
        // so without this the card stays visibly squashed after the list moves.
        onTouchCancel: release,
        onMouseDown: press,
        onMouseUp: release,
        onMouseLeave: release,
      },
      pressableClass: pressed ? 'pressable pressed' : 'pressable',
    }),
    [pressed, press, release],
  );
}
