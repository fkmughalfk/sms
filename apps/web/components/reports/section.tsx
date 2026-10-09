import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A dashboard card. While refetching it keeps the previous render at reduced opacity. */
export function Section({
  title,
  action,
  children,
  busy,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  busy?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'grid min-w-0 grid-cols-1 content-start gap-3 rounded-lg border bg-card p-4',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {/* Refetch keeps the frame: previous render at reduced opacity, no skeleton flash. */}
      <div className={cn('transition-opacity', busy && 'opacity-60')}>{children}</div>
    </section>
  );
}
