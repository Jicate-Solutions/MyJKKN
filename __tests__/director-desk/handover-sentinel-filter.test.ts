/**
 * THE CLIENT HALF OF DEFECT B1.
 *
 * `lib/navigation/permission-filter.ts` ended in `return !!permissions[permission]`.
 * MENU_PERMISSIONS maps FOURTEEN routes to the literal value `'super_admin'` —
 * which is not a permission key anybody can hold, it is the words "super admin"
 * used as a route marker. Director's Desk resolves a handover's keys from
 * MENU_PERMISSIONS and ORs them into that same map (hooks/use-permissions.ts),
 * so handing over /admin/id-cards/policy stored the key `super_admin` and opened
 * every one of the fourteen: AI provider selection and spend caps
 * (/admin/ai-models), the Loop Control Tower, the learner-notes approval queue,
 * page metadata, record corrections, the AI query tools registry and seven
 * internship policy pages.
 *
 * The SQL now walls the sentinel, so no such handover can be created. This test
 * covers the OTHER layer: the filter must refuse the sentinel by itself, because
 * the wall and the filter deploy independently — in this repo merging does not
 * apply migrations — and a value that means "bypass" must be refused by the code
 * that would act on it, not only by the code that hands it out.
 *
 * Note what is NOT asserted: nothing here re-implements the wall rules. The keys
 * come from the real MENU_PERMISSIONS map and the answers from the real filter.
 */
import { describe, it, expect } from 'vitest';
import { MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';
import {
  filterByPermissions,
  isPageAccessible,
  isSentinelPermission
} from '@/lib/navigation/permission-filter';
import type { PageEntry } from '@/lib/navigation/types';

/** Every route MENU_PERMISSIONS gates on the literal `super_admin` sentinel. */
const SUPER_ADMIN_ROUTES = Object.entries(MENU_PERMISSIONS as Record<string, string>)
  .filter(([, v]) => v === 'super_admin')
  .map(([route]) => route)
  .sort();

function page(path: string, permission: string): PageEntry {
  return {
    path,
    title: path,
    keywords: [],
    description: '',
    module: 'test',
    // The filter never touches icon/iconName; a cast keeps the fixture honest
    // about that rather than importing a real Lucide component for nothing.
    icon: undefined as unknown as PageEntry['icon'],
    iconName: 'Shield',
    permission
  } as PageEntry;
}

describe('Director handover — the super_admin sentinel is not a delegable permission', () => {
  it('MENU_PERMISSIONS really does gate multiple routes on the bare sentinel', () => {
    // If this ever drops to zero the defect is gone and this file should go with
    // it — but until then, a zero here would make every assertion below vacuous.
    expect(SUPER_ADMIN_ROUTES.length).toBeGreaterThan(5);
    expect(SUPER_ADMIN_ROUTES).toContain('/admin/ai-models');
    expect(SUPER_ADMIN_ROUTES).toContain('/admin/id-cards/policy');
  });

  it('is recognised as a sentinel rather than a key', () => {
    expect(isSentinelPermission('super_admin')).toBe(true);
    expect(isSentinelPermission('view_dashboard')).toBe(true);
    expect(isSentinelPermission('view_profile')).toBe(true);
    // A real key must NOT be swallowed by the sentinel wall.
    expect(isSentinelPermission('accreditation.naac.narrative.manage')).toBe(false);
    expect(isSentinelPermission('billing.analytics.view')).toBe(false);
  });

  it('THE EXPLOIT: a receiver whose merged map contains super_admin gets nothing', () => {
    // Exactly the map hooks/use-permissions.ts would produce for a receiver
    // holding a handover whose permission_keys is ['super_admin'].
    const merged = { 'academic.attendance.view': true, super_admin: true };
    const pages = SUPER_ADMIN_ROUTES.map((r) => page(r, 'super_admin'));

    const visible = filterByPermissions(pages, merged, false, 'lab_assistant');
    expect(
      visible.map((p) => p.path),
      'a handover of one printing-policy page reopened the whole super-admin surface'
    ).toEqual([]);

    for (const route of SUPER_ADMIN_ROUTES) {
      expect(
        isPageAccessible(route, 'super_admin', merged, false, 'lab_assistant'),
        `${route} is still reachable`
      ).toBe(false);
    }
  });

  it('the handover it was really about still works — nothing was over-blocked', () => {
    const merged = { 'accreditation.naac.narrative.manage': true };
    const p = page('/accreditation/naac/narratives/owners', 'accreditation.naac.narrative.manage');
    expect(filterByPermissions([p], merged, false, 'lab_assistant').map((x) => x.path)).toEqual([
      '/accreditation/naac/narratives/owners'
    ]);
    expect(
      isPageAccessible(p.path, p.permission, merged, false, 'lab_assistant')
    ).toBe(true);
  });

  it('real super admins and admins are unaffected', () => {
    const pages = SUPER_ADMIN_ROUTES.map((r) => page(r, 'super_admin'));
    expect(filterByPermissions(pages, {}, true, 'super_admin').length).toBe(pages.length);
    // is_admin() in the database also passes plain `admin`/`administrator`, and
    // the nav guard deliberately mirrors it (see ADMIN_BYPASS_ROLES).
    expect(filterByPermissions(pages, {}, false, 'administrator').length).toBe(pages.length);
    expect(isPageAccessible('/admin/ai-models', 'super_admin', {}, true, 'super_admin')).toBe(true);
  });

  it('view_dashboard and view_profile stay universally open (they are the other sentinel shape)', () => {
    expect(isPageAccessible('/', 'view_dashboard', {}, false, 'student')).toBe(true);
    expect(isPageAccessible('/profile', 'view_profile', {}, false, 'student')).toBe(true);
    expect(
      filterByPermissions([page('/', 'view_dashboard')], {}, false, 'student').length
    ).toBe(1);
  });
});
