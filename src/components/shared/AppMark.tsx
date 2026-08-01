/**
 * The Fight Camp brand mark — the FC shield cut from the same artwork as the
 * app icon (see scripts/generate-icons.mjs).
 *
 * Every in-app logo used to be a generic orange `Flame` glyph on a brand-600
 * tile, which matched nothing the user sees on their home screen or in the App
 * Store. This is the single place the mark is rendered so the header, the
 * onboarding hero and anything added later stay in sync with the icon.
 *
 * The artwork sits on its own black field, so the tile is black rather than
 * transparent; on the app's near-black surfaces it reads as the shield alone.
 */
interface Props {
  /** Rendered size in px. The source is 192px, so anything up to that is crisp. */
  size?: number;
  /** Tailwind rounding for the tile. Defaults to the header's rounded-lg. */
  rounded?: string;
  className?: string;
}

export default function AppMark({ size = 28, rounded = 'rounded-lg', className = '' }: Props) {
  return (
    <img
      src="/fc-mark-192.png"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
      className={`${rounded} object-contain flex-shrink-0 bg-black ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
