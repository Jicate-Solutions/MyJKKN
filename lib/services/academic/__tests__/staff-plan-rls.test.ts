// lib/services/academic/__tests__/staff-plan-rls.test.ts
import { describe, it, expect } from 'vitest';

describe('staff_plans RLS — HOD permission (BUG-002585)', () => {
  it('academic.staff.planning.edit permission key should exist in permissions constants', async () => {
    const { PERMISSION_CATEGORIES } = await import('../../../constants/permissions');

    const allPermissions = Object.values(PERMISSION_CATEGORIES).flatMap(
      (cat) => Object.values(cat.permissions ?? {}).map((p: any) => p.key ?? p)
    );

    // Permission key must exist so it can be granted to roles
    const hasPermission = allPermissions.some(
      (key) => key === 'academic.staff.planning.edit' ||
               String(key).includes('staff.planning')
    );

    expect(hasPermission).toBe(true);
  });
});
