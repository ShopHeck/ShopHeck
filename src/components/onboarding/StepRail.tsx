interface Props {
  /** Ordered step labels for the flow the user is actually in. */
  labels: string[];
  /** Index into `labels` of the step being shown. */
  current: number;
  /** The flow's accent, as a `var(--token)` reference. */
  accent: string;
}

/**
 * Progress through onboarding.
 *
 * Replaces a two-dot indicator that covered steps 0 and 1 of a five-step
 * fighter flow — so it switched off at the review screen and stayed off through
 * the Pro offer, which is precisely where a fighter is deciding whether this is
 * a form that ends. The rail runs the whole flow and is built from the steps
 * that will actually be shown: a coach sees two segments because a coach has
 * two screens, and an account that already has Pro sees four because the offer
 * is not in its way.
 *
 * The label is rendered as text as well as colour — "Step 2 of 5 · Camp" — so
 * the state survives both colour-blindness and a screen reader, which a row of
 * tinted bars does not. The bars themselves are `aria-hidden`; the sentence is
 * the accessible progress indicator.
 */
export default function StepRail({ labels, current, accent }: Props) {
  if (labels.length < 2) return null;

  return (
    <div className="pt-4 pb-1">
      <div className="flex gap-1.5" aria-hidden="true">
        {labels.map((label, i) => (
          <div
            key={label}
            className="h-1 flex-1"
            style={{
              borderRadius: 'var(--radius-full)',
              backgroundColor:
                i < current ? accent : i === current ? accent : 'var(--surface-3)',
              opacity: i < current ? 0.45 : 1,
              transition: 'background-color 240ms ease, opacity 240ms ease',
            }}
          />
        ))}
      </div>
      <p className="type-caption mt-2" style={{ color: 'var(--text-tertiary)' }}>
        Step {current + 1} of {labels.length}
        <span style={{ color: accent }}> · {labels[current]}</span>
      </p>
    </div>
  );
}
