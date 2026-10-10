'use client';

import type { LucideIcon } from 'lucide-react';
import { MoreHorizontal } from 'lucide-react';
import { Fragment } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface RowAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** Red item (delete, deactivate). A separator goes above the first one. */
  destructive?: boolean;
  disabled?: boolean;
  /** Leave out when the user lacks the permission. */
  show?: boolean;
}

/**
 * The "⋯" menu at the end of every list row: View first, then edits, then destructive
 * actions below a separator. Clicks don't reach clickable rows behind it.
 */
export function RowActions({ label, actions }: { label: string; actions: RowAction[] }) {
  const shown = actions.filter((a) => a.show !== false);
  if (shown.length === 0) return null;
  const firstDestructive = shown.findIndex((a) => a.destructive);
  return (
    // Menu content is portalled, but React events still bubble through this span.
    <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label={`Actions for ${label}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          {shown.map((a, i) => (
            <Fragment key={a.label}>
              {i === firstDestructive && i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onSelect={a.onSelect}
                disabled={a.disabled}
                variant={a.destructive ? 'destructive' : 'default'}
              >
                <a.icon /> {a.label}
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
