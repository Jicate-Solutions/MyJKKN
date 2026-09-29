import { describe, expect, it } from 'vitest';
import { GetPages, GetRoleBasedPages, MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';

const learnersGroup = (pathname = '/') => {
  const group = GetPages(pathname).find((g) => g.groupLabel === 'Learners');
  if (!group) throw new Error('Learners group missing from the sidebar');
  return group;
};

const ADMIN_LABELS = ['Analytics Dashboard', 'Admission', 'Learner Profiles', 'Leave / On-Duty Settings', 'Masters'];
const adminRows = (pathname = '/') =>
  learnersGroup(pathname).menus.filter((m) => ADMIN_LABELS.includes(m.label));

const EXPECTED_SUBMENUS: Record<string, string[]> = {
  Admission: ['/learners/enquiries', '/learners/enquiries/new', '/learners/onboarding'],
  'Learner Profiles': [
    '/learners/profiles',
    '/learners/profiles/promotion',
    '/learners/alumni',
    '/learners/change-requests',
    '/learners/advisor-caseload',
  ],
  Masters: ['/learners/school-master', '/learners/postal-codes'],
};

describe('Learners sidebar grouping', () => {
  it('has the five admin rows in order', () => {
    expect(adminRows().map((m) => m.label)).toEqual(ADMIN_LABELS);
  });

  it('no longer has the mixed Admission Management row', () => {
    expect(learnersGroup().menus.some((m) => m.label === 'Admission Management')).toBe(false);
  });

  it.each(Object.entries(EXPECTED_SUBMENUS))('%s carries exactly its pages', (label, hrefs) => {
    const row = adminRows().find((m) => m.label === label)!;
    expect(row.submenus.map((s) => s.href)).toEqual(hrefs);
  });

  it('repeats no student-portal link or analytics inside admin rows', () => {
    for (const row of adminRows()) {
      for (const s of row.submenus) {
        expect(s.href).not.toMatch(/\/learners\/my-/);
        expect(s.href).not.toBe('/learners/analytics');
      }
    }
  });

  it('maps every admin href in MENU_PERMISSIONS', () => {
    for (const row of adminRows()) {
      for (const href of [row.href, ...row.submenus.map((s) => s.href)]) {
        expect(MENU_PERMISSIONS[href], href).toBeTruthy();
      }
    }
  });

  it('keeps new hrefs access-neutral (route-guard prefix key)', () => {
    expect(MENU_PERMISSIONS['/learners/onboarding']).toBe(MENU_PERMISSIONS['/learners']);
    expect(MENU_PERMISSIONS['/learners/advisor-caseload']).toBe(MENU_PERMISSIONS['/learners']);
  });

  it('never highlights two admin rows at once', () => {
    const paths = [
      '/learners/analytics',
      '/learners/enquiries',
      '/learners/enquiries/new',
      '/learners/onboarding',
      '/learners/profiles',
      '/learners/profiles/promotion',
      '/learners/alumni',
      '/learners/change-requests',
      '/learners/advisor-caseload',
      '/learners/leave-onduty/settings',
      '/learners/school-master',
      '/learners/postal-codes',
    ];
    for (const p of paths) {
      const active = adminRows(p).filter((m) => m.active);
      expect(active.length, p).toBe(1);
    }
  });

  it('does not lose the pages that were in the old flyout', () => {
    const all = new Set(adminRows().flatMap((m) => [m.href, ...m.submenus.map((s) => s.href)]));
    for (const href of [
      '/learners/analytics',
      '/learners/enquiries',
      '/learners/enquiries/new',
      '/learners/profiles',
      '/learners/alumni',
      '/learners/change-requests',
      '/learners/school-master',
      '/learners/postal-codes',
      '/learners/leave-onduty/settings',
    ]) {
      expect(all.has(href), href).toBe(true);
    }
  });

  it('super admin sees admin rows but no student-portal submenus', () => {
    const groups = GetRoleBasedPages('/', { role_key: 'super_admin', permissions: {} } as never);
    const g = groups.find((x) => x.groupLabel === 'Learners')!;
    expect(g.menus.some((m) => m.label === 'Admission')).toBe(true);
    for (const m of g.menus) {
      for (const s of m.submenus) expect(s.href).not.toMatch(/\/learners\/my-/);
    }
  });

  it('every plain-link row opts out of manifest auto-discovery (noSubmenus)', () => {
    // menu.tsx lists ALL /learners/* pages under the first submenus:[] row it
    // finds; for staff that leaked the student-only My * pages under Analytics.
    for (const m of learnersGroup().menus) {
      if (m.submenus.length === 0) expect(m.noSubmenus, m.label).toBe(true);
    }
  });

  it('students do not see the staff leave settings row, and only super admin/staff see it via key', () => {
    const student = GetRoleBasedPages('/', {
      role_key: 'student',
      permissions: { 'learners.my-timetable.view': true, 'learners.leave_onduty.view': true, 'learners.leave_onduty.apply': true },
    } as never).find((g) => g.groupLabel === 'Learners')!;
    expect(student.menus.some((m) => m.label === 'Leave / On-Duty Settings')).toBe(false);
    expect(student.menus.some((m) => m.label === 'Leave/OnDuty')).toBe(true);
    const hod = GetRoleBasedPages('/', {
      role_key: 'hod',
      permissions: { 'learners.leave_types.view': true },
    } as never).find((g) => g.groupLabel === 'Learners')!;
    expect(hod.menus.some((m) => m.label === 'Leave / On-Duty Settings')).toBe(true);
  });

  it('no admin row lists a student-only page (Apply / My Applications)', () => {
    for (const row of adminRows()) {
      for (const s of row.submenus) {
        expect(s.href).not.toMatch(/leave-onduty\/(apply|my-applications)/);
      }
    }
  });

  it('super admin still sees Learning Studio Feedback, staff and other student pages stay hidden', () => {
    const sa = GetRoleBasedPages('/', { role_key: 'super_admin', permissions: {} } as never).find((g) => g.groupLabel === 'Learners')!;
    const labels = sa.menus.map((m) => m.label);
    expect(labels).toContain('Learning Studio Feedback');
    expect(labels).not.toContain('My Marks');
    expect(labels).not.toContain('My Bills');
    const hod = GetRoleBasedPages('/', { role_key: 'hod', permissions: { 'learners.profiles.view': true } } as never).find((g) => g.groupLabel === 'Learners')!;
    expect(hod.menus.map((m) => m.label)).not.toContain('Learning Studio Feedback');
  });
});
