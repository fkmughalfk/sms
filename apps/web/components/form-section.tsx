import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { type Tone, TONES } from '@/lib/tones';
import { cn } from '@/lib/utils';

/** Gradient icon chip, used beside page titles and section headings. */
export function IconChip({
  icon: Icon,
  tone = 'indigo',
  size = 'md',
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: 'md' | 'lg';
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center bg-gradient-to-br text-white shadow-sm',
        TONES[tone].gradient,
        size === 'lg' ? 'size-10 rounded-xl' : 'size-8 rounded-lg',
      )}
    >
      <Icon className={size === 'lg' ? 'size-5' : 'size-4'} />
    </span>
  );
}

/** Page title with a coloured icon chip (form pages). */
export function PageTitle({
  icon,
  tone,
  title,
  sub,
}: {
  icon: LucideIcon;
  tone?: Tone;
  title: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <IconChip icon={icon} tone={tone} size="lg" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

/** A form card: coloured top bar, icon heading, then the fields. */
export function FormSection({
  title,
  icon,
  tone = 'indigo',
  action,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  tone?: Tone;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className="relative min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
      <span
        aria-hidden
        className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', TONES[tone].gradient)}
      />
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold">
          <IconChip icon={icon} tone={tone} />
          {title}
        </h2>
        {action}
      </div>
      <div className={cn('p-4', className)}>{children}</div>
    </section>
  );
}

/**
 * Page `<h1>` with a coloured icon chip. A subtitle `<p>` right after it lines up with the
 * title text (see `[data-page-heading] + p` in globals.css).
 */
export function PageHeading({
  icon,
  tone = 'indigo',
  children,
}: {
  icon: LucideIcon;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <h1 data-page-heading className="flex items-center gap-3 text-2xl font-bold tracking-tight">
      <IconChip icon={icon} tone={tone} size="lg" />
      <span className="min-w-0 truncate">{children}</span>
    </h1>
  );
}
