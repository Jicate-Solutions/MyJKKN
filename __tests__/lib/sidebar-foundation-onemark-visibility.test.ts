/**
 * Regression guard for the highest-blast-radius half of PR #3274 (OneMark Lane R).
 *
 * "Foundation Programme" gained explicit submenu rows. In GetRoleBasedPages a row
 * with a non-empty `submenus` array is decided by its SUBMENU ROWS ONLY — the
 * `menu.submenus.length > 0` branch never reads MENU_PERMISSIONS['/foundation'].
 * Round 1 of that PR shipped without the hub as a submenu row and a holder of ONLY
 * foundation.dashboard.view lost the row that main rendered for them; the
 * '/foundation' Overview submenu row is the sole thing restoring it. Nothing asserted
 * that until this file. check-sidebar-health's Menu-Visibility Contract probes
 * only __visibility_probe__ / faculty / staff / hod and is silent on this shape.
 *
 * These tests run the REAL GetRoleBasedPages and the REAL routeMatcher — no
 * re-implementation of the filter. Permission fixtures are read by VALUE and
 * every role carries one unrelated true key so the `hasAnyPermission` early
 * return further up GetRoleBasedPages cannot short-circuit the filter.
 *
 * Lives in __tests__/lib/ (enforced by lib-unit-suite.yml) rather than in
 * __tests__/lib/sidebar-filter.test.ts, which that workflow QUARANTINES via
 * --exclude — a case added there would never run in CI.
 */

import { describe, it, expect } from 'vitest';
import { GetRoleBasedPages, MENU_PERMISSIONS, type RolePermissionData } from '@/lib/sidebarMenuLink';
import { routeMatcher } from '@/lib/auth/route-matcher';

const HUB = '/foundation';
const CONSOLE = '/foundation/console';
const PAPER = '/foundation/onemark/paper';
const REVIEW = '/foundation/onemark/review';
const PRACTICE = '/foundation/onemark/practice';
const OPERATOR_LABEL = 'Foundation Programme';

/** Holds the hub key and nothing else in the module — the round-1 regression shape. */
const DASH_ONLY: RolePermissionData = {
  role_key: 'foundation_viewer',
  permissions: { 'staff.view': true, 'foundation.dashboard.view': true },
};

/** Wave-1 school_faculty: the Senior Learner who builds papers and ticks drafts. */
const SCHOOL_FACULTY: RolePermissionData = {
  role_key: 'school_faculty',
  permissions: {
    'staff.view': true,
    'foundation.dashboard.view': true,
    'foundation.cohorts.view': true,
    'foundation.assessments.manage': true,
    'foundation.items.manage': true,
    'foundation.practice.take': true,
  },
};

/** A learner on the programme: the practice key only, no operator key. */
const LEARNER: RolePermissionData = {
  role_key: 'student',
  permissions: { 'learners.profile.view': true, 'foundation.practice.take': true },
};

const APPROVER_ONLY: RolePermissionData = {
  role_key: 'subject_approver',
  permissions: { 'staff.view': true, 'foundation.items.manage': true },
};

/** Negative control: real permissions, none of them a foundation key. */
const OUTSIDER: RolePermissionData = {
  role_key: 'faculty',
  permissions: { 'staff.view': true, 'foundation.dashboard.view': false },
};

function menus(role: RolePermissionData) {
  return GetRoleBasedPages('/', role).flatMap((g) => g.menus);
}
function operatorRow(role: RolePermissionData) {
  return menus(role).find((m) => m.href === HUB && m.label === OPERATOR_LABEL);
}
function subHrefs(role: RolePermissionData): string[] {
  return (operatorRow(role)?.submenus ?? []).map((s) => s.href);
}
function flatHrefs(role: RolePermissionData): string[] {
  return menus(role).map((m) => m.href);
}

describe('Foundation Programme row — explicit submenu rows (OneMark Lane R)', () => {
  it('maps the three OneMark routes to their own EXISTING keys, no new permission keys', () => {
    expect(MENU_PERMISSIONS[PAPER]).toBe('foundation.assessments.manage');
    expect(MENU_PERMISSIONS[REVIEW]).toBe('foundation.items.manage');
    expect(MENU_PERMISSIONS[PRACTICE]).toBe('foundation.practice.take');
    expect(MENU_PERMISSIONS[HUB]).toBe('foundation.dashboard.view');
  });

  it('still renders the row for a holder of ONLY foundation.dashboard.view, with the hub as its door', () => {
    expect(operatorRow(DASH_ONLY), 'round-1 regression: dashboard.view-only holder lost the row').toBeDefined();
    const hrefs = subHrefs(DASH_ONLY);
    expect(hrefs).toContain(HUB);
    expect(hrefs).not.toContain(PAPER);
    expect(hrefs).not.toContain(REVIEW);
    expect(hrefs).not.toContain(CONSOLE);
  });

  it('gives school_faculty the console and both OneMark operator screens, plus the flat learner row', () => {
    const hrefs = subHrefs(SCHOOL_FACULTY);
    expect(hrefs).toEqual(expect.arrayContaining([HUB, CONSOLE, PAPER, REVIEW]));
    expect(flatHrefs(SCHOOL_FACULTY)).toContain(PRACTICE);
  });

  it('shows a learner the flat OneMark Practice row and never the operator parent', () => {
    expect(flatHrefs(LEARNER)).toContain(PRACTICE);
    expect(flatHrefs(LEARNER)).toContain('/foundation/practice');
    expect(operatorRow(LEARNER), 'operator accordion leaked to a practice.take-only learner').toBeUndefined();
  });

  it('reveals the parent to an approver-only holder with the review screen as its only submenu row', () => {
    expect(subHrefs(APPROVER_ONLY)).toEqual([REVIEW]);
    expect(flatHrefs(APPROVER_ONLY)).not.toContain(PRACTICE);
  });

  it('renders no Foundation row at all for a role with no foundation key', () => {
    expect(operatorRow(OUTSIDER)).toBeUndefined();
    const hrefs = flatHrefs(OUTSIDER);
    for (const h of [HUB, CONSOLE, PAPER, REVIEW, PRACTICE, '/foundation/practice']) {
      expect(hrefs, `${h} leaked to a role with no foundation key`).not.toContain(h);
    }
  });
});

describe('proxy trie — /foundation/onemark/* is NARROWED to each screen’s own key', () => {
  // Before this PR the longest-prefix trie matched '/foundation' for these
  // paths, so any foundation.dashboard.view holder passed the proxy. Now each
  // path has its own node and the hub key no longer opens it.
  it('no longer lets the hub key through to the OneMark screens', () => {
    expect(routeMatcher.hasAccess(PAPER, 'x', DASH_ONLY.permissions)).toBe(false);
    expect(routeMatcher.hasAccess(REVIEW, 'x', DASH_ONLY.permissions)).toBe(false);
    expect(routeMatcher.hasAccess(PRACTICE, 'x', DASH_ONLY.permissions)).toBe(false);
    expect(routeMatcher.hasAccess(HUB, 'x', DASH_ONLY.permissions)).toBe(true);
  });

  it('lets each screen’s own key through, and only that key', () => {
    expect(routeMatcher.hasAccess(PAPER, 'x', SCHOOL_FACULTY.permissions)).toBe(true);
    expect(routeMatcher.hasAccess(REVIEW, 'x', APPROVER_ONLY.permissions)).toBe(true);
    expect(routeMatcher.hasAccess(PAPER, 'x', APPROVER_ONLY.permissions)).toBe(false);
    expect(routeMatcher.hasAccess(PRACTICE, 'x', LEARNER.permissions)).toBe(true);
    expect(routeMatcher.hasAccess(PAPER, 'x', LEARNER.permissions)).toBe(false);
  });
});
