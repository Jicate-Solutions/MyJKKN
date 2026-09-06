/**
 * Regression guard: an oversight reader can actually REACH the Improvement Board.
 *
 * The RLS half of this change (the improvement.ideas.view_scoped branch on
 * improvement_ideas_select) hands a HOD / principal the rows. That alone is
 * not access. lib/sidebarMenuLink.ts maps '/improvement-board' to the single
 * key 'improvement.ideas.view' — MENU_PERMISSIONS is typed one key per route —
 * so a reader holding only the scoped key got the rows and NO sidebar entry,
 * and could open the board only by typing the URL. Rows without a door.
 *
 * These tests exercise the REAL GetRoleBasedPages and the REAL routeMatcher.
 * Nothing here re-implements the filter: a test that models the code it is
 * checking proves only that the model agrees with itself.
 *
 * Permission fixtures are read by VALUE, not by key existence. Production
 * stores hod's 'improvement.ideas.view' as an explicit `false` and omits the
 * key entirely for principal; an existence test misreads the first as "has it".
 *
 * The negative control is a role that holds a true permission elsewhere but
 * none of the improvement keys. A role holding NOTHING would be short-circuited
 * by the `hasAnyPermission` early return further up GetRoleBasedPages and would
 * pass this file without the filter ever running — proving nothing.
 */

import { describe, it, expect } from 'vitest';
import { GetRoleBasedPages, type RolePermissionData } from '@/lib/sidebarMenuLink';
import { routeMatcher } from '@/lib/auth/route-matcher';

const BOARD = '/improvement-board';

/** Cohort-management surfaces that must STAY shut to an oversight reader. */
const COHORT_SURFACES = [
  '/improvement-board/dashboard',
  '/improvement-board/leaderboard',
  '/improvement-board/analytics',
  '/improvement-board/rotation',
  '/improvement-board/postings',
  '/improvement-board/data-gaps',
  '/improvement-board/manage-boards',
];

/**
 * Live production permission shapes.
 *   hod       — 89 active holders; 'improvement.ideas.view' stored false.
 *   principal — 10 active holders; the key is absent entirely.
 * Both gain 'improvement.ideas.view_scoped' from this PR's migration. The
 * unrelated true key is what real roles carry and what keeps the negative
 * control past the all-false early return.
 */
const HOD: RolePermissionData = {
  role_key: 'hod',
  permissions: {
    'staff.view': true,
    'improvement.ideas.view': false,
    'improvement.ideas.view_scoped': true,
  },
};

const PRINCIPAL: RolePermissionData = {
  role_key: 'principal',
  permissions: {
    'staff.view': true,
    'improvement.ideas.view_scoped': true,
  },
};

/** 45 active holders — the cohort half that already worked. Must not regress. */
const ASSOCIATE: RolePermissionData = {
  role_key: 'mba_associate',
  permissions: { 'improvement.ideas.view': true },
};

/** Negative control: real permissions, none of them an improvement key. */
const OUTSIDER: RolePermissionData = {
  role_key: 'faculty',
  permissions: {
    'staff.view': true,
    'improvement.ideas.view': false,
  },
};

/** The Improvement Board parent row as the sidebar would render it, or undefined. */
function boardMenu(role: RolePermissionData) {
  return GetRoleBasedPages(BOARD, role)
    .flatMap((group) => group.menus)
    .find((menu) => menu.href === BOARD);
}

function submenuHrefs(role: RolePermissionData): string[] {
  return (boardMenu(role)?.submenus ?? []).map((s) => s.href);
}

describe('oversight reader reaches the Improvement Board', () => {
  it('HOD: the sidebar renders the Improvement Board entry', () => {
    expect(boardMenu(HOD), 'Improvement Board parent hidden from a HOD').toBeDefined();
    expect(submenuHrefs(HOD)).toContain(BOARD);
  });

  it('PRINCIPAL: the sidebar renders the Improvement Board entry', () => {
    expect(boardMenu(PRINCIPAL), 'Improvement Board parent hidden from a principal').toBeDefined();
    expect(submenuHrefs(PRINCIPAL)).toContain(BOARD);
  });

  it('HOD: the route gate admits — the board is openable, not just listed', () => {
    // hod / principal are built-in roles, so proxy.ts never fetches custom-role
    // permissions for them and routeMatcher falls through to allow. The board
    // page itself declares no permission gate (no layout.tsx under
    // /improvement-board, no RoutePermissionGuard, no can() view check in
    // improvement-board-client) — it renders whatever RLS returns. A sidebar
    // entry that led to a no-access panel would be a worse bug than no entry.
    expect(routeMatcher.hasAccess(BOARD, 'hod', undefined)).toBe(true);
    expect(routeMatcher.hasAccess(BOARD, 'principal', undefined)).toBe(true);
  });

  it('a role holding NONE of the improvement keys still gets no entry', () => {
    // This is the assertion that must be able to fail. It holds a true
    // permission, so the filter genuinely runs and genuinely denies.
    expect(boardMenu(OUTSIDER), 'Improvement Board leaked to a role with no improvement key').toBeUndefined();
  });

  it('the cohort half does not regress — an associate keeps the full board', () => {
    expect(boardMenu(ASSOCIATE)).toBeDefined();
    const hrefs = submenuHrefs(ASSOCIATE);
    expect(hrefs).toContain(BOARD);
    expect(hrefs).toContain('/improvement-board/dashboard');
    expect(hrefs).toContain('/improvement-board/analytics');
  });

  it('an oversight reader gets the board ONLY — cohort surfaces stay shut', () => {
    // Deliberate scope, not an oversight. The rota chart, the associate's own
    // contribution dashboard and the analyst views are cohort-management
    // surfaces; widening them would hand a HOD the associate-management
    // surface nobody asked for. Their page-level can() gates still read
    // improvement.ideas.view and would show a no-access panel anyway.
    for (const role of [HOD, PRINCIPAL]) {
      const hrefs = submenuHrefs(role);
      for (const shut of COHORT_SURFACES) {
        expect(hrefs, `${role.role_key} was given ${shut}`).not.toContain(shut);
      }
    }
  });
});
