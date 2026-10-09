import { describe, expect, it } from 'vitest';
import { ROLES, type Role } from './enums';
import {
  canEditInvoice,
  canManageRole,
  hasPermission,
  isScopedToOwnData,
  PERMISSIONS,
  type Permission,
} from './permissions';

// Spec §3 table, written out independently of the implementation.
const MATRIX: Record<Permission, [superAdmin: boolean, admin: boolean, user: boolean]> = {
  'settings.manage': [true, false, false],
  'users.manageAdmins': [true, false, false],
  'users.manage': [true, true, false],
  'categories.manage': [true, true, false],
  'masters.read': [true, true, true],
  'masters.manage': [true, true, false],
  'invoice.read': [true, true, true],
  'invoice.create': [true, true, true],
  'invoice.editAny': [true, true, false],
  'invoice.editOwn': [false, false, true],
  'invoice.delete': [true, true, false],
  'payment.read': [true, true, true],
  'payment.create': [true, true, true],
  'payment.edit': [true, true, false],
  'payment.delete': [true, true, false],
  'reports.viewAll': [true, true, false],
  'reports.viewOwn': [false, false, true],
  'export.excel': [true, true, false],
  'audit.view': [true, true, false],
  'import.run': [true, false, false],
};

describe('permission matrix (spec §3)', () => {
  it('covers every permission', () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...PERMISSIONS].sort());
  });

  const cases = PERMISSIONS.flatMap((p) => ROLES.map((r, i) => [r, p, MATRIX[p][i]!] as const));
  it.each(cases)('%s / %s → %s', (role, permission, expected) => {
    expect(hasPermission(role, permission)).toBe(expected);
  });
});

describe('canManageRole', () => {
  const table: [Role, Role, boolean][] = [
    ['SUPER_ADMIN', 'SUPER_ADMIN', true],
    ['SUPER_ADMIN', 'ADMIN', true],
    ['SUPER_ADMIN', 'USER', true],
    ['ADMIN', 'SUPER_ADMIN', false],
    ['ADMIN', 'ADMIN', false],
    ['ADMIN', 'USER', true],
    ['USER', 'USER', false],
    ['USER', 'ADMIN', false],
  ];
  it.each(table)('%s → %s: %s', (actor, target, expected) => {
    expect(canManageRole(actor, target)).toBe(expected);
  });
});

describe('canEditInvoice', () => {
  const createdAt = new Date('2026-09-02T10:00:00Z');
  const invoice = { createdById: 'u1', createdAt };
  const hoursLater = (h: number) => new Date(createdAt.getTime() + h * 3_600_000);

  it('ADMIN and SUPER_ADMIN can edit any invoice at any time', () => {
    expect(canEditInvoice({ id: 'x', role: 'ADMIN' }, invoice, 24, hoursLater(1000))).toBe(true);
    expect(canEditInvoice({ id: 'x', role: 'SUPER_ADMIN' }, invoice, 24, hoursLater(1000))).toBe(
      true,
    );
  });

  it('USER can edit own invoice inside the window', () => {
    expect(canEditInvoice({ id: 'u1', role: 'USER' }, invoice, 24, hoursLater(23))).toBe(true);
    expect(canEditInvoice({ id: 'u1', role: 'USER' }, invoice, 24, hoursLater(24))).toBe(true);
  });

  it('USER cannot edit own invoice after the window', () => {
    expect(canEditInvoice({ id: 'u1', role: 'USER' }, invoice, 24, hoursLater(24.01))).toBe(false);
  });

  it("USER cannot edit someone else's invoice", () => {
    expect(canEditInvoice({ id: 'u2', role: 'USER' }, invoice, 24, hoursLater(1))).toBe(false);
  });
});

describe('isScopedToOwnData', () => {
  it('only USER is scoped', () => {
    expect(isScopedToOwnData('USER')).toBe(true);
    expect(isScopedToOwnData('ADMIN')).toBe(false);
    expect(isScopedToOwnData('SUPER_ADMIN')).toBe(false);
  });
});
