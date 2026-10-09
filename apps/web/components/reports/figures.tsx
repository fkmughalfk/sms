import { dec, type DecimalInput } from '@sms/shared';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Stat tile: label · value · sub-text (dataviz "Figures"). Big numbers stay proportional. */
export function StatTile({
  label,
  value,
  sub,
  title,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Full-precision value on hover when `value` is compacted. */
  title?: string;
}) {
  return (
    <div className="grid gap-1 rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold" title={title}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** 0–1 ratio → clamped width percentage for bars. */
export const widthPct = (ratio: DecimalInput) => {
  const pct = dec(ratio).times(100);
  return `${Math.max(0, Math.min(100, Number(pct.toFixed(2))))}%`;
};

/** Meter: series fill on a lighter step of the same ramp (dataviz "Meter"). */
export function Meter({ ratio, label }: { ratio: DecimalInput; label: string }) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Number(dec(ratio).times(100).toFixed(1))}
      className="h-2.5 w-full overflow-hidden rounded-full bg-series-track"
    >
      <div className="h-full rounded-full bg-series-1" style={{ width: widthPct(ratio) }} />
    </div>
  );
}

/** Inline share bar for table rows (single hue — magnitude, not identity). */
export function ShareBar({ ratio, className }: { ratio: DecimalInput; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('block h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <span className="block h-full rounded-full bg-series-1" style={{ width: widthPct(ratio) }} />
    </span>
  );
}
