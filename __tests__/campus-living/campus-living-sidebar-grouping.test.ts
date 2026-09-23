import { describe, expect, it } from 'vitest';
import { GetPages, GetRoleBasedPages, MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';

const campusLivingGroup = (pathname: string) => {
  const group = GetPages(pathname).find((g) => g.groupLabel === 'Campus Living');
  if (!group) throw new Error('Campus Living group missing from the sidebar');
  return group;
};

/**
 * Every depth-2 page the single auto-discovered "Campus Living" row listed
 * before the 2026-09-22 regrouping (Navbar/menu.tsx read them from the route
 * manifest). The regrouping spreads them across sub-module rows; it must not
 * drop one.
 */
const PRE_GROUPING_DEPTH2_ROUTES = [
  '/campus-living/activity',
  '/campus-living/allocations',
  '/campus-living/analytics',
  '/campus-living/attendance',
  '/campus-living/blocks',
  '/campus-living/calendar',
  '/campus-living/community',
  '/campus-living/dashboard',
  '/campus-living/gate-passes',
  '/campus-living/health',
  '/campus-living/housekeeping',
  '/campus-living/laundry',
  '/campus-living/leave',
  '/campus-living/maintenance',
  '/campus-living/mess',
  '/campus-living/reports',
  '/campus-living/residents',
  '/campus-living/safety',
  '/campus-living/settings',
  '/campus-living/settle-preview',
  '/campus-living/vacate-requests',
  '/campus-living/visitors',
  '/campus-living/wardens',
  '/campus-living/wellness',
];

const allHrefs = (menus: ReturnType<typeof campusLivingGroup>['menus']) =>
  new Set(menus.flatMap((m) => [m.href, ...m.submenus.map((s) => s.href)]));

describe('Campus Living sidebar sub-module rows', () => {
  it('exposes one row per sub-module, in workflow order', () => {
    expect(campusLivingGroup('/campus-living').menus.map((m) => m.label)).toEqual([
      'Overview',
      'Residents & Rooms',
      'Allocations',
      'Attendance & Leave',
      'Gate & Visitors',
      'Mess',
      'Laundry & Housekeeping',
      'Maintenance',
      'Safety & Wellness',
      'Community',
      'Analytics & Reports',
      'Billing Audit',
      'Settings',
      'Premium Rooms',
    ]);
  });

  it('stays under the sidebar validator hard cap of 15 rows', () => {
    expect(campusLivingGroup('/campus-living').menus.length).toBeLessThan(15);
  });

  it('keeps the /campus-living row first, so the student My Hostel rewrite still finds it', () => {
    expect(campusLivingGroup('/campus-living').menus[0].href).toBe('/campus-living');
  });

  it('drops none of the depth-2 pages the auto-discovered row used to list', () => {
    const hrefs = allHrefs(campusLivingGroup('/campus-living').menus);
    const missing = PRE_GROUPING_DEPTH2_ROUTES.filter((r) => !hrefs.has(r));
    expect(missing).toEqual([]);
  });

  it('maps every row and submenu href in MENU_PERMISSIONS (default-deny would hide it otherwise)', () => {
    const unmapped = [...allHrefs(campusLivingGroup('/campus-living').menus)].filter(
      (href) => !MENU_PERMISSIONS[href]
    );
    expect(unmapped).toEqual([]);
  });

  it('lists no href twice across the section', () => {
    const seen = new Map<string, number>();
    for (const m of campusLivingGroup('/campus-living').menus) {
      for (const href of m.submenus.map((s) => s.href)) {
        seen.set(href, (seen.get(href) ?? 0) + 1);
      }
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([h]) => h);
    expect(dupes).toEqual([]);
  });

  it('flags the Premium Rooms row super-admin-only and maps its pages to the sentinel', () => {
    const premium = campusLivingGroup('/campus-living').menus.find((m) => m.label === 'Premium Rooms');
    expect(premium).toBeDefined();
    expect((premium as { requiresSuperAdmin?: boolean }).requiresSuperAdmin).toBe(true);
    for (const s of premium!.submenus) {
      expect(MENU_PERMISSIONS[s.href]).toBe('super_admin');
    }
  });
});

describe('Campus Living sidebar per role', () => {
  const clGroupFor = (role_key: string, permissions: Record<string, boolean>) =>
    GetRoleBasedPages('/campus-living', { role_key, permissions }).find(
      (g) => g.groupLabel === 'Campus Living'
    );

  it('student: exactly one plain "My Hostel" link, no admin rows', () => {
    const group = clGroupFor('student', {
      'campus_living.my_hostel.view': true,
      'campus_living.premium.view_dashboard': true,
      'campus_living.gate_passes.create': true,
      'campus_living.leave.request': true,
      'campus_living.leave_types.view': true,
    });
    expect(group?.menus.map((m) => [m.label, m.href, m.submenus.length])).toEqual([
      ['My Hostel', '/campus-living/my-hostel', 0],
    ]);
  });

  it('super admin: sees every row including Premium Rooms', () => {
    const group = clGroupFor('super_admin', {});
    expect(group?.menus.map((m) => m.label)).toContain('Premium Rooms');
    expect(group?.menus).toHaveLength(14);
  });

  it('billing audit: visible to a billing_audit.view holder, hidden from a warden', () => {
    const office = clGroupFor('hostel_office', {
      'campus_living.dashboard.view': true,
      'campus_living.billing_audit.view': true,
    });
    const audit = office?.menus.find((m) => m.label === 'Billing Audit');
    expect(audit?.submenus.map((s) => s.href)).toEqual([
      '/campus-living/billing-audit',
      '/campus-living/billing-audit/learners',
    ]);

    const warden = clGroupFor('warden', {
      'campus_living.dashboard.view': true,
      'campus_living.fees.view': true,
    });
    expect(warden?.menus.map((m) => m.label)).not.toContain('Billing Audit');
  });

  it('warden: no Premium Rooms row, no Settings row; Residents row keeps only allowed pages', () => {
    const group = clGroupFor('warden', {
      'campus_living.dashboard.view': true,
      'campus_living.residents.view': true,
      'campus_living.blocks.view': true,
      'campus_living.attendance.view': true,
      'campus_living.mess.view': true,
      'campus_living.premium.view_dashboard': true,
    });
    const labels = group?.menus.map((m) => m.label) ?? [];
    expect(labels).not.toContain('Premium Rooms');
    expect(labels).not.toContain('Settings');
    const residents = group?.menus.find((m) => m.label === 'Residents & Rooms');
    // wardens.view is not held, but /campus-living/wardens inherits the row
    // gate (dashboard.view) exactly as the route guard's prefix walk does.
    expect(residents?.submenus.map((s) => s.href)).toEqual([
      '/campus-living/residents',
      '/campus-living/blocks',
      '/campus-living/wardens',
    ]);
  });

  it('mess_caterer (no dashboard.view): gets the Mess row and nothing else', () => {
    const group = clGroupFor('mess_caterer', { 'campus_living.mess.view': true });
    expect(group?.menus.map((m) => m.label)).toEqual(['Mess']);
  });
});
