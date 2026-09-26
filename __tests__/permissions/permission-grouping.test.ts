import { describe, expect, it } from 'vitest';
import { PERMISSION_CATEGORIES } from '@/lib/constants/permissions';
import { buildPermissionModuleGroups } from '@/lib/constants/permission-grouping';

const HR_MEMBERS = ['hr', 'staff', 'hr_counseling', 'hr_promotion', 'sams', 'hr_phase_0_config'];

describe('buildPermissionModuleGroups', () => {
  const groups = buildPermissionModuleGroups();

  it('shows every catalog key somewhere', () => {
    const shown = new Set(groups.flatMap((g) => g.permissions.map((p) => p.key)));
    const missing = PERMISSION_CATEGORIES.flatMap((c) => c.permissions.map((p) => p.key)).filter(
      (k) => !shown.has(k)
    );
    expect(missing).toEqual([]);
  });

  it('sub-groups partition each module exactly', () => {
    groups.forEach((g) => {
      const subKeys = g.subGroups.flatMap((s) => s.permissions.map((p) => p.key));
      expect(subKeys.sort()).toEqual(g.permissions.map((p) => p.key).sort());
      expect(new Set(subKeys).size).toBe(subKeys.length);
      g.subGroups.forEach((s) => expect(s.permissions.length).toBeGreaterThan(0));
    });
  });

  it('merges the whole people domain into HR Management', () => {
    const hr = groups.find((g) => g.key === 'hr')!;
    const expected = new Set(
      PERMISSION_CATEGORIES.filter((c) => HR_MEMBERS.includes(c.key)).flatMap((c) =>
        c.permissions.map((p) => p.key)
      )
    );
    expect(new Set(hr.permissions.map((p) => p.key))).toEqual(expected);
    HR_MEMBERS.filter((k) => k !== 'hr').forEach((k) =>
      expect(groups.find((g) => g.key === k)).toBeUndefined()
    );

    const sub = (key: string) => hr.subGroups.find((s) => s.permissions.some((p) => p.key === key))?.label;
    expect(sub('staff.view')).toBe('Employee');
    expect(sub('hr.leave.approve')).toBe('Leave');
    expect(sub('hr.leave.apply')).toBe('Self Service');
    expect(sub('hr.attendance.view_self')).toBe('Self Service');
    expect(sub('hr.counseling.notes.view_own')).toBe('Staff Counseling');
    expect(sub('hr.payroll.register.view')).toBe('Payroll');
    expect(sub('sams.cycle.manage')).toBe('Development & Appraisal');
    expect(sub('hr.view')).toBe('HR Setup');
  });
});
