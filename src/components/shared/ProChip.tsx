/**
 * Tier badge on a gated tile, so a paywall is an informed tap rather than an
 * ambush.
 *
 * Shared because both Home screens ship one: the fight-camp dashboard and the
 * off-season dashboard had separate copies that had already drifted in padding
 * and border treatment.
 */
export default function ProChip() {
  return (
    <span
      className="ml-auto flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5"
      style={{
        borderRadius: 'var(--radius-sm)',
        backgroundColor: 'rgb(var(--accent-flame-rgb) / 0.16)',
        border: '1px solid rgb(var(--accent-flame-rgb) / 0.35)',
        color: 'var(--accent-flame)',
      }}
    >
      PRO
    </span>
  );
}
