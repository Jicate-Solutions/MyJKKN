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

  it('refuses someone holding neither', () => {
    expect(accessible({ 'cohort.view': true })).toBe(false);
    expect(visible({ 'cohort.view': true })).toBe(false);
  });

  it('refuses a key present but set to false', () => {
    expect(accessible({ 'cohort.manage': false, 'cohort.edit': false })).toBe(false);
    expect(visible({ 'cohort.manage': false, 'cohort.edit': false })).toBe(false);
  });

  it('the sidebar and the route guard agree on every combination', () => {
    for (const manage of [true, false]) {
      for (const edit of [true, false]) {
        const perms = { 'cohort.manage': manage, 'cohort.edit': edit };
        expect(visible(perms), `manage=${manage} edit=${edit}`).toBe(accessible(perms));
      }
    }
  });

  it('the route is still DECLARED, so it is never open to every authenticated user', () => {
    // RoutePermissionGuard treats a route with no MENU_PERMISSIONS entry as
    // visible to everyone. The union rule above only ever runs because the
    // route has an entry; deleting the entry would open the roster to learners.
    expect(MENU_PERMISSIONS[PATH]).toBe('cohort.manage');
  });
});
