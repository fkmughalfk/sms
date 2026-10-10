import { dec, type DecimalInput } from '@sms/shared';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { type Tone, TONES } from '@/lib/tones';
import { cn } from '@/lib/utils';

/** Stat tile: label · value · sub-text (dataviz "Figures"). Big numbers stay proportional. */
export function StatTile({
  label,
  value,
  sub,
  title,
  icon: Icon,
  tone = 'indigo',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Full-precision value on hover when `value` is compacted. */
  title?: string;
  icon?: LucideIcon;
  tone?: Tone;
}) {
  const t = TONES[tone];
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <span
        aria-hidden
        className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', t.gradient)}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-10 -right-10 size-28 rounded-full opacity-10 blur-2xl',
          t.glow,
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="truncate text-2xl font-bold tracking-tight" title={title}>
            {value}
          </p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        {Icon && (
          <span
            className={cn(
              'grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm',
              t.gradient,
            )}
          >
            <Icon className="size-5" aria-hidden />
          </span>
        )}
      </div>
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
