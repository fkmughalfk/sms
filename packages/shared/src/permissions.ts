import type { Role } from './enums';

/**
 * Role → permission matrix (spec §3). The API guard enforces it; the UI mirrors it.
 * Record-level rules (own invoice, edit window, data scope) live in the helpers below.
 */
export const PERMISSIONS = [
  'settings.manage',
  'users.manageAdmins',
  'users.manage',
  'categories.manage',
  'masters.read',
  'masters.manage',
  'invoice.read',
  'invoice.create',
  'invoice.editAny',
  'invoice.editOwn',
  'invoice.delete',
  'payment.read',
  'payment.create',
  'payment.edit',
  'payment.delete',
  'reports.viewAll',
  'reports.viewOwn',
  'export.excel',
  'audit.view',
  'import.run',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ADMIN_PERMISSIONS: readonly Permission[] = [
  'users.manage',
  'categories.manage',
  'masters.read',
  'masters.manage',
  'invoice.read',
  'invoice.create',
  'invoice.editAny',
  'invoice.delete',
  'payment.read',
  'payment.create',
  'payment.edit',
  'payment.delete',
  'reports.viewAll',
  'export.excel',
  'audit.view',
];

export const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  SUPER_ADMIN: new Set<Permission>([
    ...ADMIN_PERMISSIONS,
    'settings.manage',
    'users.manageAdmins',
    'import.run',
  ]),
  ADMIN: new Set<Permission>(ADMIN_PERMISSIONS),
  USER: new Set<Permission>([
    'masters.read',
    'invoice.read',
    'invoice.create',
    'invoice.editOwn',
    'payment.read',
    'payment.create',
    'reports.viewOwn',
  ]),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/**
 * Can `actorRole` create/edit/deactivate a user whose role is `targetRole`,
 * or assign `targetRole` to someone? SUPER_ADMIN: any role. ADMIN: only USER.
 * (The "keep at least one active SUPER_ADMIN" rule needs a DB count — enforced in the users service.)
 */
export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  if (targetRole === 'USER') return hasPermission(actorRole, 'users.manage');
  return hasPermission(actorRole, 'users.manageAdmins');
}

export interface Actor {
  id: string;
  role: Role;
}

export interface OwnedRecord {
  createdById: string;
  createdAt: Date;
}

/**
 * Invoice edit rule: ADMIN+ any invoice; USER only their own, within
 * `Setting.userEditWindowHours` (default 24) of creation.
 */
export function canEditInvoice(
  actor: Actor,
  invoice: OwnedRecord,
  editWindowHours: number,
  now: Date = new Date(),
): boolean {
  if (hasPermission(actor.role, 'invoice.editAny')) return true;
  if (!hasPermission(actor.role, 'invoice.editOwn')) return false;
  if (invoice.createdById !== actor.id) return false;
  const ageMs = now.getTime() - invoice.createdAt.getTime();
  return ageMs >= 0 && ageMs <= editWindowHours * 60 * 60 * 1000;
}

/** True when reports/lists must be limited to the actor's own scope (spec §3 note **). */
export function isScopedToOwnData(role: Role): boolean {
  return !hasPermission(role, 'reports.viewAll');
}
