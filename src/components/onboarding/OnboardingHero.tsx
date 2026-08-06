import AppMark from '../shared/AppMark';

interface Props {
  /** `full` is the first-screen banner; `compact` is the strip above later steps. */
  variant?: 'full' | 'compact';
}

/**
 * The brand banner at the top of onboarding.
 *
 * It used to render only on the very first screen, so from the camp form
 * onwards the app was an unbranded stack of inputs — the one stretch of the
 * product where a new user has seen no content yet and the brand is all there
 * is. The compact variant keeps the mark present for the rest of the flow at a
 * size that costs a header's worth of space rather than a screen's.
 *
 * The full variant's wash is the app's own `--bg-ambient` warm point rather than
 * a private gradient, so the first thing a user sees is the same material the
 * rest of the app floats on.
 */
export default function OnboardingHero({ variant = 'full' }: Props) {
  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2.5 pt-3">
        <AppMark size={28} />
        <span className="text-sm font-black tracking-tight text-white">FIGHT CAMP</span>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden px-6 pt-16 pb-8 text-center">
      <div
        className="absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--accent-flame) 22%, transparent) 0%, transparent 70%)',
        }}
      />
      {/* Hairline under the wash, so the banner ends on an edge rather than
          fading into the form and leaving the first field looking unanchored. */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        aria-hidden="true"
        style={{ background: 'var(--glass-hairline)' }}
      />
      <div className="relative">
        <AppMark size={72} rounded="rounded-2xl" className="mx-auto mb-4 shadow-2" />
        <h1 className="type-hero text-white tracking-tight">FIGHT CAMP</h1>
        <p className="type-caption mt-1" style={{ color: 'var(--accent-flame)' }}>
          Training Platform
        </p>
        <p className="type-body mt-3 max-w-xs mx-auto" style={{ color: 'var(--text-secondary)' }}>
          Plan your camp. Track your progress. Win on fight night.
        </p>
      </div>
    </div>
  );
}
