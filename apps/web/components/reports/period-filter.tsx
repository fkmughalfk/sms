'use client';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type Period, type PresetId, PRESETS } from '@/lib/reports';

const show = (d: string) => d.split('-').reverse().join('-');

/** Date range first, in one row above everything it scopes (dataviz: interaction). */
export function PeriodFilter({
  period,
  onChange,
}: {
  period: Period;
  onChange: (next: { preset: PresetId; from?: string; to?: string }) => void;
}) {
  return (
    <div className="no-print flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-xs text-muted-foreground">
        Period
        <Select value={period.preset} onValueChange={(v) => onChange({ preset: v as PresetId })}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {period.preset === 'custom' ? (
        <>
          <label className="grid gap-1 text-xs text-muted-foreground">
            From
            <Input
              type="date"
              value={period.from}
              onChange={(e) =>
                e.target.value && onChange({ preset: 'custom', from: e.target.value })
              }
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            To
            <Input
              type="date"
              value={period.to}
              onChange={(e) => e.target.value && onChange({ preset: 'custom', to: e.target.value })}
            />
          </label>
        </>
      ) : (
        <p className="pb-2 text-sm text-muted-foreground tabular-nums">
          {show(period.from)} – {show(period.to)}
        </p>
      )}
    </div>
  );
}
