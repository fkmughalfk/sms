import type { ReactNode } from 'react';
import { type Tone, TONES } from '@/lib/tones';
import { cn } from '@/lib/utils';

/**
 * The filter card above every list: white card, soft shadow and a coloured left edge in
 * the page's tone. `className` sets the inner layout (a grid of labelled fields or a row).
 */
export function FilterBar({
  tone = 'indigo',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'no-print rounded-xl border border-l-4 bg-card p-3 shadow-sm',
        TONES[tone].edge,
        className,
      )}
    >
      {children}
    </div>
  );
}
