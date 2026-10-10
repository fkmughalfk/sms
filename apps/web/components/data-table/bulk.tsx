'use client';

import {
  BULK_MAX,
  type BulkAction,
  type BulkResult,
  bulkResultSchema,
  formatQty,
} from '@sms/shared';
import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Power, PowerOff, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { TableCell, TableHead } from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';
import type { Selection } from '@/lib/use-selection';

/** Native checkbox in the app's primary colour, with the "some selected" dash. */
function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="size-4 cursor-pointer align-middle accent-indigo-600 dark:accent-indigo-400"
    />
  );
}

/** Header cell: select / unselect every row on this page. */
export function SelectAllHead({ selection }: { selection: Selection }) {
  return (
    <TableHead className="w-10">
      <Checkbox
        checked={selection.allOnPage}
        indeterminate={selection.someOnPage}
        onChange={selection.togglePage}
        label="Select all rows on this page"
      />
    </TableHead>
  );
}

/** Row cell; clicks don't open the row. */
export function SelectCell({
  selection,
  id,
  label,
}: {
  selection: Selection;
  id: string;
  label: string;
}) {
  return (
    <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
      <Checkbox
        checked={selection.has(id)}
        onChange={() => selection.toggle(id)}
        label={`Select ${label}`}
      />
    </TableCell>
  );
}

const ACTIONS: Record<
  BulkAction,
  { label: string; past: string; icon: typeof Trash2; destructive?: boolean }
> = {
  activate: { label: 'Activate', past: 'activated', icon: Power },
  deactivate: { label: 'Deactivate', past: 'deactivated', icon: PowerOff, destructive: true },
  delete: { label: 'Delete', past: 'deleted', icon: Trash2, destructive: true },
};

/** "5 deleted." plus why any were skipped. */
function report(result: BulkResult, past: string) {
  const { done, skipped } = result;
  if (skipped.length === 0) {
    toast.success(`${formatQty(done)} ${past}.`);
    return;
  }
  const reasons = skipped.slice(0, 3).map((s) => `• ${s.reason}`);
  if (skipped.length > 3) reasons.push(`…and ${skipped.length - 3} more.`);
  (done > 0 ? toast.warning : toast.error)(
    `${formatQty(done)} ${past}, ${formatQty(skipped.length)} skipped.`,
    {
      description: <div className="grid gap-1 whitespace-pre-line">{reasons.join('\n')}</div>,
      duration: 10_000,
    },
  );
}

/**
 * The bar above a list while rows are selected: count, "select all N", the bulk actions
 * and clear. Each action is confirmed, then sent in one request; the server skips (and
 * explains) records it won't change, e.g. masters still in use.
 */
export function BulkBar({
  selection,
  total,
  noun,
  actions,
  endpoint,
  invalidate,
  onSelectAll,
  describe,
}: {
  selection: Selection;
  /** Records matching the current filters (all pages). */
  total: number;
  /** Plural noun, e.g. "cities". */
  noun: string;
  actions: BulkAction[];
  /** `POST` target: `/cities/bulk` (takes `action`) or `/invoices/bulk-delete`. */
  endpoint: string;
  invalidate: QueryKey[];
  /** Loads every id matching the filters. */
  onSelectAll: () => Promise<string[]>;
  /** Extra confirm text per action (what delete means for this list). */
  describe?: Partial<Record<BulkAction, string>>;
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<BulkAction | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const withAction = endpoint.endsWith('/bulk');

  const run = useMutation({
    mutationFn: (action: BulkAction) =>
      api.post(endpoint, bulkResultSchema, {
        ids: [...selection.selected],
        ...(withAction ? { action } : {}),
      }),
    onSuccess: (result, action) => {
      report(result, ACTIONS[action].past);
      for (const queryKey of invalidate) void queryClient.invalidateQueries({ queryKey });
      selection.clear();
      setPending(null);
    },
    onError: (e) => {
      toast.error(e instanceof ApiError ? e.message : 'Something went wrong.');
      setPending(null);
    },
  });

  if (selection.count === 0) return null;

  const selectAll = async () => {
    setLoadingAll(true);
    try {
      selection.selectIds(await onSelectAll());
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not load the full list.');
    } finally {
      setLoadingAll(false);
    }
  };

  const n = formatQty(selection.count);
  const canSelectMore = selection.allOnPage && total > selection.count;

  return (
    <div className="no-print sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-2 pl-4 shadow-sm dark:border-indigo-500/30 dark:from-indigo-500/15 dark:to-violet-500/15">
      <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
        {n} selected
      </span>
      {canSelectMore && (
        <Button
          variant="link"
          size="sm"
          className="h-auto px-1"
          onClick={selectAll}
          disabled={loadingAll}
        >
          <CheckCheck />
          {loadingAll ? 'Selecting…' : `Select all ${formatQty(Math.min(total, BULK_MAX))} ${noun}`}
        </Button>
      )}
      <div className="ml-auto flex flex-wrap gap-2">
        {actions.map((a) => {
          const { label, icon: Icon, destructive } = ACTIONS[a];
          return (
            <Button
              key={a}
              size="sm"
              variant={destructive ? (a === 'delete' ? 'destructive' : 'outline') : 'outline'}
              className={a === 'delete' ? undefined : 'bg-card'}
              onClick={() => setPending(a)}
            >
              <Icon /> {label}
            </Button>
          );
        })}
        <Button size="sm" variant="ghost" onClick={selection.clear}>
          <X /> Clear
        </Button>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending ? `${ACTIONS[pending].label} ${n} ${noun}?` : ''}
        description={pending ? describe?.[pending] : undefined}
        confirmLabel={pending ? `${ACTIONS[pending].label} ${n}` : 'Confirm'}
        destructive={pending ? ACTIONS[pending].destructive : false}
        busy={run.isPending}
        onConfirm={() => pending && run.mutate(pending)}
      />
    </div>
  );
}
