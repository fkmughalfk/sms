'use client';

import { formatPKR2, type RateListLine } from '@sms/shared';
import { Badge } from '@/components/ui/badge';
import {
  BASIS_LABEL,
  formatRate,
  groupByCategory,
  rateChange,
  shortCropYear,
} from '@/lib/rate-lists';
import { cn } from '@/lib/utils';

const CHANGE_CLASS = {
  up: 'text-rose-600 dark:text-rose-400',
  down: 'text-emerald-600 dark:text-emerald-400',
  same: 'text-muted-foreground',
  new: 'text-sky-600 dark:text-sky-400',
} as const;

/** Pack as sold: "25 kg bag", "6 × 1 kg carton", "5.5 kg pack". */
export function packLabel(line: Pick<RateListLine, 'product' | 'basis'>): string {
  const { packWeightKg, packPcs } = line.product;
  if (packPcs > 1) {
    const unit = Number(packWeightKg) / packPcs;
    return `${packPcs} × ${unit} kg`;
  }
  return `${packWeightKg} kg`;
}

/**
 * A rate list, grouped by category like the printed list. On a phone each line is a
 * compact card; on wider screens the same rows line up as a table.
 */
export function RateListLines({
  lines,
  showChange,
}: {
  lines: RateListLine[];
  showChange: boolean;
}) {
  return (
    <div className="grid gap-5">
      {groupByCategory(lines).map(([category, rows]) => (
        <section key={category} className="overflow-hidden rounded-xl border bg-card">
          <h2 className="border-b bg-muted/50 px-4 py-2 text-sm font-semibold">{category}</h2>
          <div className="hidden grid-cols-[minmax(0,1fr)_5rem_7rem_8rem_6rem] gap-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
            <span>Product</span>
            <span>Crop</span>
            <span className="text-right">Rate</span>
            <span className="text-right">Pack price</span>
            <span className="text-right">{showChange ? 'Change' : ''}</span>
          </div>
          <ul className="divide-y">
            {rows.map((l) => {
              const change = showChange
                ? rateChange(l.isAvailable ? l.rate : null, l.previousRate)
                : null;
              return (
                <li
                  key={`${l.productId}|${l.cropYear ?? ''}`}
                  className={cn(
                    'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm md:grid-cols-[minmax(0,1fr)_5rem_7rem_8rem_6rem] md:items-center',
                    !l.isAvailable && 'text-muted-foreground',
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.product.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {packLabel(l)}
                      {l.cropYear && (
                        <span className="md:hidden"> · crop {shortCropYear(l.cropYear)}</span>
                      )}
                      {l.note && <> · {l.note}</>}
                    </p>
                  </div>
                  <span className="hidden md:block">{shortCropYear(l.cropYear) || '—'}</span>
                  <div className="row-span-2 text-right md:row-span-1">
                    {l.isAvailable && l.rate ? (
                      <>
                        <p className="font-semibold tabular-nums">{formatRate(l.rate)}</p>
                        <p className="text-xs text-muted-foreground">{BASIS_LABEL[l.basis]}</p>
                      </>
                    ) : (
                      <Badge variant="secondary">N/A</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums md:text-right md:text-sm md:text-foreground">
                    {l.isAvailable && l.packRate && (
                      <>
                        <span className="md:hidden">Pack </span>
                        {formatPKR2(l.packRate)}
                      </>
                    )}
                  </span>
                  <span
                    className={cn(
                      'hidden text-right tabular-nums md:block',
                      change && CHANGE_CLASS[change.direction],
                    )}
                  >
                    {change?.text}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
