import type { Permission } from '@sms/shared';
import {
  BarChart3,
  Building2,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  ScrollText,
  Settings,
  Users,
  Wallet,
  Receipt,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hidden from the sidebar and blocked in the layout without this permission. */
  permission?: Permission;
  /** Build phase that delivers the screen (spec §13); shown as "soon" until then. */
  ready: boolean;
}

// Sidebar order from spec §8.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, ready: true },
  {
    label: 'Invoices',
    href: '/invoices',
    icon: FileText,
    permission: 'invoice.read',
    ready: false,
  },
  { label: 'Payments', href: '/payments', icon: Wallet, permission: 'payment.read', ready: false },
  { label: 'Recovery', href: '/recovery', icon: Receipt, permission: 'payment.read', ready: false },
  { label: 'Reports', href: '/reports', icon: BarChart3, ready: false },
  { label: 'Masters', href: '/masters', icon: Building2, permission: 'masters.read', ready: false },
  { label: 'Users', href: '/users', icon: Users, permission: 'users.manage', ready: true },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    permission: 'settings.manage',
    ready: false,
  },
  { label: 'Audit', href: '/audit', icon: ScrollText, permission: 'audit.view', ready: false },
];

/** Permission required for a path, from the longest matching nav prefix. */
export function permissionForPath(pathname: string): Permission | undefined {
  return NAV_ITEMS.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0]?.permission;
}
