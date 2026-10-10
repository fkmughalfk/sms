'use client';

import { Menu, Wheat, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/user-menu';
import { useAuth } from '@/lib/auth';
import { NAV_ITEMS, permissionForPath } from '@/lib/nav';
import { useSettings } from '@/lib/use-invoice';
import { cn } from '@/lib/utils';

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useAuth();
  const items = NAV_ITEMS.filter((i) => !i.permission || can(i.permission));

  return (
    <nav className="grid gap-1 p-3">
      <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-widest text-white/40 uppercase">
        Menu
      </p>
      {items.map(({ href, label, icon: Icon, ready }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const content = (
          <>
            <Icon className={cn('size-4', active ? 'text-white' : 'text-indigo-200/70')} />
            <span className="flex-1">{label}</span>
            {!ready && <span className="text-xs text-white/40">soon</span>}
          </>
        );
        const className = cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
          active
            ? 'bg-gradient-to-r from-indigo-500 to-violet-500 font-medium text-white shadow-md shadow-indigo-950/40'
            : 'text-indigo-100/75',
          ready ? !active && 'hover:bg-white/10 hover:text-white' : 'cursor-default opacity-60',
        );
        return ready ? (
          <Link key={href} href={href} className={className} onClick={onNavigate}>
            {content}
          </Link>
        ) : (
          <span key={href} className={className} aria-disabled>
            {content}
          </span>
        );
      })}
    </nav>
  );
}

/** Logo mark + name at the top of the sidebar. */
function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-amber-300 to-orange-500 text-indigo-950 shadow-sm">
        <Wheat className="size-4.5" />
      </span>
      <span className="grid leading-tight">
        <span className="text-sm font-semibold text-white">Waqar Rice Mills</span>
        <span className="text-[11px] text-indigo-200/70">Sales Management</span>
      </span>
    </div>
  );
}

const SIDEBAR = 'bg-gradient-to-b from-sidebar-from to-sidebar-to';

function Forbidden() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold">Not allowed</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your role does not have access to this page.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { can } = useAuth();
  const settings = useSettings();
  const [mobileOpen, setMobileOpen] = useState(false);
  const required = permissionForPath(pathname);

  return (
    <div className="flex min-h-screen">
      <aside className={cn('no-print hidden w-64 shrink-0 md:block', SIDEBAR)}>
        <div className="sticky top-0">
          <div className="flex h-16 items-center border-b border-white/10 px-5">
            <Brand />
          </div>
          <Sidebar />
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-indigo-950/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className={cn('absolute inset-y-0 left-0 w-64 shadow-2xl', SIDEBAR)}>
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
              <Brand />
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10 hover:text-white"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X />
              </Button>
            </div>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu />
          </Button>
          <span className="flex-1 truncate bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-sm font-bold tracking-wide text-transparent dark:from-indigo-300 dark:to-violet-300">
            {settings.data?.companyName ?? 'WAQAR RICE MILLS'}
          </span>
          <UserMenu />
        </header>
        <main className="mx-auto w-full max-w-[96rem] flex-1 p-4 md:p-6">
          {required && !can(required) ? <Forbidden /> : children}
        </main>
      </div>
    </div>
  );
}
