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
        'grid min-w-0 grid-cols-1 content-start gap-3 rounded-xl border bg-card p-4 shadow-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span
            aria-hidden
            className="h-4 w-1 rounded-full bg-gradient-to-b from-indigo-500 to-violet-500"
          />
          {title}
        </h2>
        {action}
      </div>
      {/* Refetch keeps the frame: previous render at reduced opacity, no skeleton flash. */}
      <div className={cn('transition-opacity', busy && 'opacity-60')}>{children}</div>
    </section>
  );
}
