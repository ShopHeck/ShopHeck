import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Currently-open dialogs, outermost first.
 *
 * Dialogs stack — the paywall opens the sign-in sheet over itself. Every
 * instance listens on `document`, and `stopPropagation()` does not stop other
 * listeners bound to the same target, so without this one Escape would run
 * every dialog's close callback and collapse the whole stack instead of just
 * the top sheet. Tab has the same problem: two focus traps would fight over
 * the same keypress.
 */
const openDialogs: symbol[] = [];

interface Options {
  /** Called on Escape and used as the dismiss action. */
  onClose: () => void;
  /**
   * Where focus lands on open. 'panel' (default) focuses the dialog itself and
   * reads its label; 'first' focuses the first control, which is what a
   * destructive confirm wants so the safe action is already selected.
   */
  initialFocus?: 'panel' | 'first';
  /** Lock body scroll while open. Off for overlays that own the whole screen. */
  lockScroll?: boolean;
}

/**
 * Keyboard and screen-reader behaviour for a modal surface: take focus on
 * open, hold Tab inside, close on Escape, and hand focus back to whatever
 * opened it.
 *
 * This was duplicated in Modal and ConfirmDialog and simply missing from every
 * hand-rolled overlay in the app, including the paywall — so a keyboard or
 * VoiceOver user could tab straight out of a dialog into the page behind it
 * and lose their place. One implementation means the next overlay someone adds
 * inherits the behaviour instead of re-deriving it.
 *
 * Attach the returned ref to the dialog panel, and give the panel
 * `role="dialog"` (or `alertdialog`), `aria-modal="true"`, `tabIndex={-1}` and
 * a label.
 */
export function useDialog({ onClose, initialFocus = 'panel', lockScroll = true }: Options) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Latest onClose without re-running the mount effect, which owns the scroll
  // lock and focus restore and must run exactly once per open.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const id = Symbol('dialog');
    openDialogs.push(id);
    const isTopmost = () => openDialogs[openDialogs.length - 1] === id;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';

    const focusables = () =>
      Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
        .filter(el => el.offsetParent !== null);

    if (initialFocus === 'first') focusables()[0]?.focus();
    else panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      // A dialog underneath this one must ignore the key entirely.
      if (!isTopmost()) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      const i = openDialogs.indexOf(id);
      if (i !== -1) openDialogs.splice(i, 1);
      // prevOverflow is whatever an enclosing dialog had already set, so a
      // nested sheet closing does not unlock scroll behind the one still open.
      if (lockScroll) document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown, true);
      opener?.focus();
    };
    // Mount-only on purpose: see onCloseRef above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return panelRef;
}
