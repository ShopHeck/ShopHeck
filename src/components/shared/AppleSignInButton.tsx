/**
 * "Continue with Apple" button per Apple's Human Interface Guidelines for
 * Sign in with Apple (App Store Guideline 4).
 *
 * - The logo is Apple's official Sign in with Apple glyph geometry (Apple
 *   Design Resources) — NOT a third-party icon. Do not swap it for an icon
 *   from an icon library; App Review rejects non-official artwork.
 * - Title is one of Apple's approved strings, rendered in the system (SF)
 *   font — deliberately not the app's Inter font.
 * - White style (black logo/text on white) for contrast against the app's
 *   dark background; 44pt-high tap target; logo scaled to the title.
 */

interface Props {
  onClick: () => void;
  disabled?: boolean;
  /** Approved button titles only — anything else violates the HIG. */
  label?: 'Continue with Apple' | 'Sign in with Apple' | 'Sign up with Apple';
}

/** Official Apple logo glyph (Apple Design Resources artwork geometry). */
function AppleLogo() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

export default function AppleSignInButton({ onClick, disabled, label = 'Continue with Apple' }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full h-11 flex items-center justify-center gap-2 bg-white text-black rounded-xl disabled:opacity-50 active:scale-95 transition-transform"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}
    >
      <AppleLogo />
      <span className="text-[17px] font-medium leading-none">{label}</span>
    </button>
  );
}
