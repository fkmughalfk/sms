import { hasPermission, ROLES } from '@sms/shared';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, permissionForPath } from './nav';

describe('nav permissions', () => {
  it('maps routes (and sub-routes) to the permission that guards them', () => {
    expect(permissionForPath('/users')).toBe('users.manage');
    expect(permissionForPath('/users/abc')).toBe('users.manage');
    expect(permissionForPath('/settings')).toBe('settings.manage');
    expect(permissionForPath('/dashboard')).toBeUndefined();
    expect(permissionForPath('/usersx')).toBeUndefined();
  });

  it('USER sees no Users, Settings or Audit links', () => {
    const visible = NAV_ITEMS.filter(
      (i) => !i.permission || hasPermission('USER', i.permission),
    ).map((i) => i.label);
    expect(visible).not.toContain('Users');
    expect(visible).not.toContain('Settings');
    expect(visible).not.toContain('Audit');
    expect(visible).toContain('Invoices');
  });

  it('every role sees the dashboard', () => {
    for (const role of ROLES) {
      expect(
        NAV_ITEMS.some(
          (i) => i.href === '/dashboard' && (!i.permission || hasPermission(role, i.permission)),
        ),
      ).toBe(true);
    }
  });
});
