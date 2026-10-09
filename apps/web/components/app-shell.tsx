'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/user-menu';
import { useAuth } from '@/lib/auth';
import { NAV_ITEMS, permissionForPath } from '@/lib/nav';
import { cn } from '@/lib/utils';

const COMPANY_NAME = 'WAQAR RICE MILLS'; // From Settings once that screen exists (phase 8).

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useAuth();
  const items = NAV_ITEMS.filter((i) => !i.permission || can(i.permission));

  return (
    <nav className="grid gap-1 p-3">
      {items.map(({ href, label, icon: Icon, ready }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const content = (
          <>
            <Icon className="size-4" />
            <span className="flex-1">{label}</span>
            {!ready && <span className="text-xs text-muted-foreground">soon</span>}
          </>
        );
        const className = cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm',
          active ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground',
          ready ? 'hover:bg-accent hover:text-accent-foreground' : 'cursor-default opacity-60',
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const required = permissionForPath(pathname);

  return (
    <div className="flex min-h-screen">
      <aside className="no-print hidden w-60 shrink-0 border-r md:block">
        <div className="flex h-14 items-center border-b px-5 text-sm font-semibold">SMS</div>
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r bg-background">
            <div className="flex h-14 items-center justify-between border-b px-5 text-sm font-semibold">
              SMS
              <Button
                variant="ghost"
                size="icon"
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
        <header className="no-print flex h-14 items-center gap-3 border-b px-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu />
          </Button>
          <span className="flex-1 truncate text-sm font-semibold tracking-wide">
            {COMPANY_NAME}
          </span>
          <UserMenu />
        </header>
        <main className="flex-1 p-4 md:p-6">
          {required && !can(required) ? <Forbidden /> : children}
        </main>
      </div>
    </div>
  );
}
