import { formatPercent, formatPKR, type SalesRow } from '@sms/shared';
import { widthPct } from './figures';

// Fixed slot per category so a filter never repaints survivors (dataviz: colour follows
// the entity). Anything else takes slot 3 — the validated palette is three slots wide.
const SLOT: Record<string, string> = { rice: 'bg-series-1', pulses: 'bg-series-2' };
const slotFor = (name: string) => SLOT[name.toLowerCase()] ?? 'bg-series-3';

/**
 * Part-to-whole for Rice vs Pulses vs Other (spec §5.5 rows 20–25): one 100% stacked
 * bar with 2px surface gaps and a labelled legend — share reads more accurately along
 * one bar than around a donut, and the legend + table carry the values (no colour-only).
 */
export function CategoryShare({ rows }: { rows: SalesRow[] }) {
  const visible = rows.filter((r) => Number(r.pctOfSales) > 0);
  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">No sales in this period.</p>;
  }
  return (
    <div className="grid gap-3">
      <div
        className="flex h-6 w-full gap-0.5 overflow-hidden rounded-md"
        role="img"
        aria-label="Sales share by category"
      >
        {visible.map((r) => (
          <div
            key={r.id ?? r.name}
            className={`${slotFor(r.name)} h-full first:rounded-l-md last:rounded-r-md`}
            style={{ width: widthPct(r.pctOfSales) }}
            title={`${r.name}: ${formatPercent(r.pctOfSales, 1)} · PKR ${formatPKR(r.amount)}`}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {visible.map((r) => (
          <li key={r.id ?? r.name} className="flex items-center gap-2">
            <span aria-hidden className={`${slotFor(r.name)} size-2.5 rounded-sm`} />
            <span>{r.name}</span>
            <span className="font-medium">{formatPercent(r.pctOfSales, 1)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
