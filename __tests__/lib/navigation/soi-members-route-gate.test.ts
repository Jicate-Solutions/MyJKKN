// The client gate on the School of Influence batch roster must not be NARROWER
// than the database predicate that fronts the control living on it.
//
// The screen carries BatchStatusCard, whose authority is fn_cohort_can_set_status
// (supabase/migrations/20261115043000_cohort_status_change_control.sql). That
// function's first branch mirrors cohorts_update_permission, which admits
// 'cohort.edit' scoped to the institution. MENU_PERMISSIONS declares this route
// on 'cohort.manage' alone, so before this test a holder of 'cohort.edit'
// without 'cohort.manage' met PermissionError at the door while the database
// would have accepted their change — the card added to rescue exactly that
// person never mounted.
//
// The rule lives in BOTH filterByPermissions (sidebar / command palette) and
// isPageAccessible (RoutePermissionGuard), because a link one shows and the
// other refuses is still a reachable page. This test pins both.

import { describe, expect, it } from 'vitest';

import { filterByPermissions, isPageAccessible } from '@/lib/navigation/permission-filter';
import { MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';

const PATH = '/startup-studio/school-of-influence/admin/members';
const PAGE = { path: PATH, permission: 'cohort.manage', title: 'Batch roster' } as any;

/** Not an admin, not a super admin — the population the route rule decides. */
function accessible(permissions: Record<string, boolean>): boolean {
  return isPageAccessible(PATH, 'cohort.manage', permissions, false, 'staff');
}

function visible(permissions: Record<string, boolean>): boolean {
  return filterByPermissions([PAGE], permissions, false, 'staff').length === 1;
}

describe('the batch roster route admits everyone the write predicate admits', () => {
  it('admits cohort.manage', () => {
    expect(accessible({ 'cohort.manage': true })).toBe(true);
    expect(visible({ 'cohort.manage': true })).toBe(true);
  });

  it('admits cohort.edit — the case the database accepts and the guard refused', () => {
    expect(accessible({ 'cohort.edit': true })).toBe(true);
    expect(visible({ 'cohort.edit': true })).toBe(true);
  });

  // fn_soi_can_manage_batch admits the first; fn_cohort_can_set_status's branch 2
  // admits the second (mirroring cohorts_soi_scoped_update). Both were refused
  // here for the same reason cohort.edit was.
  it.each([
    'cohort.school_of_influence.manage',
    'cohort.school_of_influence.edit',
  ])('admits %s — the database does', (key) => {
    expect(accessible({ [key]: true })).toBe(true);
    expect(visible({ [key]: true })).toBe(true);
  });

  it('refuses someone holding none of the four', () => {
    expect(accessible({ 'cohort.view': true })).toBe(false);
    expect(visible({ 'cohort.view': true })).toBe(false);
  });

  it('refuses a key present but set to false', () => {
    const denied = {
      'cohort.manage': false,
      'cohort.edit': false,
      'cohort.school_of_influence.manage': false,
      'cohort.school_of_influence.edit': false,
    };
    expect(accessible(denied)).toBe(false);
    expect(visible(denied)).toBe(false);
  });

  // A key whose value is not literally `true` must not open the page — the
  // permission map is merged from several sources and a truthy string would
  // otherwise be enough.
  it('refuses a truthy non-boolean value', () => {
    expect(accessible({ 'cohort.edit': 'yes' as unknown as boolean })).toBe(false);
  });

  it('the sidebar and the route guard agree on every combination of the four', () => {
    const keys = [
      'cohort.manage',
      'cohort.edit',
      'cohort.school_of_influence.manage',
      'cohort.school_of_influence.edit',
    ];
    for (let mask = 0; mask < 1 << keys.length; mask += 1) {
      const perms = Object.fromEntries(
        keys.map((k, i) => [k, Boolean(mask & (1 << i))])
      );
      expect(visible(perms), JSON.stringify(perms)).toBe(accessible(perms));
    }
  });

  it('the route is still DECLARED, so it is never open to every authenticated user', () => {
    // RoutePermissionGuard treats a route with no MENU_PERMISSIONS entry as
    // visible to everyone. The union rule above only ever runs because the
    // route has an entry; deleting the entry would open the roster to learners.
    expect(MENU_PERMISSIONS[PATH]).toBe('cohort.manage');
  });
});
