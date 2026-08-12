import { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { triggerHaptic, HAPTIC } from '../../hooks/useHaptics';

interface Props<T> {
  items: T[];
  keyOf: (item: T) => string;
  /** Announced when the item moves. Keep it short — it is read aloud. */
  labelOf: (item: T) => string;
  onReorder: (from: number, to: number) => void;
  children: (item: T, index: number) => React.ReactNode;
}

interface DragState {
  from: number;
  /** Live drop index, recomputed as the finger moves. */
  to: number;
  /** Pixels the handle has travelled since pointerdown. */
  dy: number;
  /** Row pitch — height plus gap — measured once at pick-up. */
  step: number;
}

/**
 * A vertical list reordered by dragging an explicit grab handle.
 *
 * The handle is the whole reason this is tractable on touch. Dragging the row
 * *body* scrolls the page as it always did, and only the handle initiates a
 * reorder, so the two gestures never have to be told apart by timing — which
 * is what makes long-press-to-drag both hard to implement and invisible to
 * anyone who was not told it exists. It is also what iOS's own reorderable
 * lists do, so the affordance needs no explaining.
 *
 * Rows are assumed to be a uniform height: every row here is the same
 * component with the same padding, so the drop index is `from + round(dy /
 * pitch)` rather than a hit-test against measured neighbours. The pitch is
 * measured from the live DOM at pick-up rather than hardcoded, so it stays
 * correct if the row's padding or the list's gap ever changes.
 *
 * The handle is a real button: ArrowUp/ArrowDown move the item without any
 * pointer at all, which is the path VoiceOver and keyboard users take. Both
 * paths announce through the same live region.
 */
export default function ReorderableList<T>({
  items, keyOf, labelOf, onReorder, children,
}: Props<T>) {
  const listRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const announce = useCallback((item: T, to: number) => {
    setAnnouncement(`${labelOf(item)} moved to position ${to + 1} of ${items.length}`);
  }, [items.length, labelOf]);

  /** Row pitch from the two first rows; falls back to one row's height. */
  function measureStep(): number {
    const rows = listRef.current?.children;
    if (!rows || rows.length === 0) return 0;
    const first = rows[0].getBoundingClientRect();
    if (rows.length > 1) return rows[1].getBoundingClientRect().top - first.top;
    return first.height;
  }

  function onHandleDown(index: number) {
    return (e: React.PointerEvent<HTMLButtonElement>) => {
      // Left button / primary touch only, and never while another drag is live.
      if (e.button !== 0 || drag) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      triggerHaptic(HAPTIC.tick);
      setDrag({ from: index, to: index, dy: 0, step: measureStep() });
    };
  }

  function onHandleMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const dy = e.movementY + drag.dy;
    const to = drag.step > 0
      ? Math.max(0, Math.min(items.length - 1, drag.from + Math.round(dy / drag.step)))
      : drag.from;
    if (to !== drag.to) triggerHaptic(HAPTIC.tick);
    setDrag({ ...drag, dy, to });
  }

  function endDrag(commit: boolean) {
    if (!drag) return;
    const { from, to } = drag;
    setDrag(null);
    if (commit && from !== to) {
      triggerHaptic(HAPTIC.tick);
      announce(items[from], to);
      onReorder(from, to);
    }
  }

  function onHandleKeyDown(index: number) {
    return (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const delta = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      if (delta === 0) return;
      const to = index + delta;
      if (to < 0 || to >= items.length) return;
      e.preventDefault();
      announce(items[index], to);
      onReorder(index, to);
      // The row moved out from under the pointer-less focus; follow it, so a
      // second Arrow press continues moving the same item rather than its
      // replacement. The handle is keyed by item id, so it survives the move.
      const id = keyOf(items[index]);
      requestAnimationFrame(() => {
        listRef.current
          ?.querySelector<HTMLButtonElement>(`[data-handle="${CSS.escape(id)}"]`)
          ?.focus();
      });
    };
  }

  // A pointer lost mid-drag (call, app backgrounded, gesture cancelled by the
  // WebView) must not leave the list stuck in a dragging state with a row
  // floating and the page unable to scroll.
  useEffect(() => {
    if (!drag) return;
    const cancel = () => endDrag(false);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
    };
  });

  /** How far a row shifts to open a gap for the one being dragged. */
  function offsetFor(index: number): number {
    if (!drag || index === drag.from) return 0;
    const { from, to, step } = drag;
    if (from < to && index > from && index <= to) return -step;
    if (from > to && index < from && index >= to) return step;
    return 0;
  }

  return (
    <>
      <ul ref={listRef} className="space-y-2 list-none m-0 p-0">
        {items.map((item, index) => {
          const dragging = drag?.from === index;
          const id = keyOf(item);
          return (
            <li
              key={id}
              className="relative flex items-stretch gap-2"
              style={{
                transform: `translateY(${dragging ? drag.dy : offsetFor(index)}px)`,
                // Only the settling rows animate. Transitioning the dragged row
                // would make it lag the finger by the duration of the ease.
                transition: dragging ? 'none' : 'transform 160ms ease-out',
                zIndex: dragging ? 10 : undefined,
                touchAction: dragging ? 'none' : undefined,
              }}
            >
              <div className="flex-1 min-w-0">{children(item, index)}</div>
              <button
                data-handle={id}
                onPointerDown={onHandleDown(index)}
                onPointerMove={onHandleMove}
                onPointerUp={() => endDrag(true)}
                onKeyDown={onHandleKeyDown(index)}
                aria-label={`Reorder ${labelOf(item)}. Position ${index + 1} of ${items.length}. Use the up and down arrow keys to move it.`}
                className="flex items-center justify-center w-11 flex-shrink-0 rounded-xl transition-colors"
                style={{
                  color: dragging ? 'var(--accent-teal)' : 'var(--text-tertiary)',
                  background: dragging ? 'var(--surface-2)' : 'transparent',
                  // The handle must not scroll the page under the finger — that
                  // is the whole gesture separation this component relies on.
                  touchAction: 'none',
                  cursor: 'grab',
                }}
              >
                <GripVertical size={18} />
              </button>
            </li>
          );
        })}
      </ul>
      <div aria-live="polite" className="sr-only">{announcement}</div>
    </>
  );
}
