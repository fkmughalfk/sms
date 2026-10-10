'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconChip } from '@/components/form-section';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Tone } from '@/lib/tones';
import { cn } from '@/lib/utils';

export interface Detail {
  label: string;
  value: ReactNode;
  /** Spans both columns (remarks, addresses). */
  wide?: boolean;
}

/** Read-only "View" for a list row: icon header, label/value grid, optional actions. */
export function DetailsDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  tone,
  items,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  items: Detail[];
  /** Buttons beside Close (e.g. Edit). */
  actions?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <IconChip icon={icon} tone={tone} size="lg" />
            <div className="min-w-0 text-left">
              <DialogTitle className="truncate">{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>
        <dl className="grid gap-x-4 gap-y-3 rounded-lg border bg-muted/40 p-4 text-sm sm:grid-cols-2">
          {items.map((d) => (
            <div key={d.label} className={cn('grid min-w-0 gap-0.5', d.wide && 'sm:col-span-2')}>
              <dt className="text-xs font-medium text-muted-foreground">{d.label}</dt>
              <dd className="font-medium break-words tabular-nums">
                {d.value === null || d.value === undefined || d.value === '' ? '—' : d.value}
              </dd>
            </div>
          ))}
        </dl>
        <DialogFooter>
          {actions}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
