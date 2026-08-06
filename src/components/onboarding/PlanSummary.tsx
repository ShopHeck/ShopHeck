import GlassSurface from '../shared/GlassSurface';
import type { SummaryRow } from './config';

/**
 * The plan-confirmation card.
 *
 * A plain <dl> rather than a stack of flex rows: this is a set of terms and
 * their values, and marking it up as one is what makes a screen reader read
 * "Fight Date, March 14" instead of two unrelated fragments.
 *
 * The rows themselves come from `planSummaryRows` in ./config, so the three
 * screens that confirm a plan cannot describe it differently.
 */
export default function PlanSummary({ rows }: { rows: SummaryRow[] }) {
  if (rows.length === 0) return null;

  return (
    <GlassSurface cornerRadius="md" className="p-4">
      <dl className="space-y-2.5">
        {rows.map(row => (
          <div key={row.label} className="flex justify-between items-center gap-4">
            <dt className="text-sm" style={{ color: 'var(--text-secondary)' }}>{row.label}</dt>
            <dd
              className="text-sm font-bold text-right"
              style={{ color: row.accent ?? 'var(--text-primary)' }}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </GlassSurface>
  );
}
