/**
 * OneMark Wave 3 Lane N — the two new sidebar doors, and the one that was NOT built.
 *
 * Wave 2 Lane R (PR #3274) cost a round to a leak this file now guards against:
 * in GetRoleBasedPages a row with a non-empty `submenus` array is decided by its
 * SUBMENU ROWS ALONE, so a child keyed on a learner permission under an operator
 * parent reveals the whole accordion to every learner. Wave 3 adds two children
 * under that same parent — Results (foundation.assessments.manage) and the unit
 * list (foundation.items.manage) — and both are operator keys, so the accordion
 * stays where it was. That is asserted here rather than assumed.
 *
 * The second half of the file records the door Lane N did NOT open. The spec
 * asked for a flat learner row to the hub `/foundation/onemark`; the Academic
 * group is at 14 top-level rows and lib/sidebar-validator.ts fails at
 * `topLevelCount >= 15`, so a 15th row would break `check:sidebar` for the whole
 * platform. The count is pinned below: when somebody restructures the group the
 * test fails and the door becomes available again, deliberately rather than by
 * accident.
 *
 * These tests run the REAL GetRoleBasedPages, the REAL routeMatcher and the REAL
 * validateSidebar — nothing is re-implemented. Every fixture carries one
 * unrelated true key so the `hasAnyPermission` early return further up
 * GetRoleBasedPages cannot short-circuit the filter.
 *
 * Lives in __tests__/lib/ because lib-unit-suite.yml runs that directory;
 * __tests__/lib/sidebar-filter.test.ts is quarantined by that workflow's
 * --exclude, so a case added there would never run in CI.
 */

import { describe, it, expect } from 'vitest';
import {
  GetPages,
  GetRoleBasedPages,
  MENU_PERMISSIONS,
  type RolePermissionData,
} from '@/lib/sidebarMenuLink';
import { validateSidebar } from '@/lib/sidebar-validator';
import { routeMatcher } from '@/lib/auth/route-matcher';

const HUB = '/foundation';
const ONEMARK_HUB = '/foundation/onemark';
const PAPER = '/foundation/onemark/paper';
const REVIEW = '/foundation/onemark/review';
const PRACTICE = '/foundation/onemark/practice';
const RESULTS = '/foundation/onemark/results';
const UNITS = '/foundation/onemark/units';
const COHORT_SHEET = '/foundation/onemark/results/a7f1c3e2-0000-4000-8000-000000000001';
const LEARNER_REPORT = '/foundation/onemark/results/learner/a7f1c3e2-0000-4000-8000-000000000002';

const OPERATOR_LABEL = 'Foundation Programme';
const ACADEMIC_GROUP = 'Academic';

/** Wave-1 provisioning role: builds papers, ticks drafts, and sits the programme. */
const SCHOOL_FACULTY: RolePermissionData = {
  role_key: 'school_faculty',
  permissions: {
    'organizations.departments.view': true,
    'foundation.dashboard.view': true,
    'foundation.cohorts.view': true,
    'foundation.assessments.manage': true,
    'foundation.items.manage': true,
    'foundation.practice.take': true,
  },
};

/** Builds and reports on papers, but never ticks a draft. */
const PAPER_BUILDER_ONLY: RolePermissionData = {
  role_key: 'paper_builder',
  permissions: {
    'organizations.departments.view': true,
    'foundation.assessments.manage': true,
  },
};

/** Ticks drafts and keeps the unit list, but builds no paper. */
const APPROVER_ONLY: RolePermissionData = {
  role_key: 'subject_approver',
  permissions: {
    'organizations.departments.view': true,
    'foundation.items.manage': true,
  },
};

/** Sits the programme and holds no operator key — the Wave 2 leak shape. */
const LEARNER: RolePermissionData = {
  role_key: 'student',
  permissions: { 'learners.profile.view': true, 'foundation.practice.take': true },
};

/**
 * Ruling #1 of 2026-09-06 in a role: a principal whose read of a cohort sheet
 * comes from an active school_jkkn_owners row and NOT from a permission key.
 */
const OWNER_ROW_ONLY: RolePermissionData = {
  role_key: 'principal',
  permissions: { 'organizations.departments.view': true },
};

/** Negative control: real permissions, none of them a foundation key. */
const OUTSIDER: RolePermissionData = {
  role_key: 'hod',
  permissions: { 'organizations.departments.view': true, 'foundation.dashboard.view': false },
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

describe('Wave 3 doors — MENU_PERMISSIONS reuses existing foundation keys', () => {
  it('maps Results and the unit list onto keys that already exist, adding none', () => {
    expect(MENU_PERMISSIONS[RESULTS]).toBe('foundation.assessments.manage');
    expect(MENU_PERMISSIONS[UNITS]).toBe('foundation.items.manage');
    // The Wave 2 nodes are untouched.
    expect(MENU_PERMISSIONS[PAPER]).toBe('foundation.assessments.manage');
    expect(MENU_PERMISSIONS[REVIEW]).toBe('foundation.items.manage');
    expect(MENU_PERMISSIONS[PRACTICE]).toBe('foundation.practice.take');
    expect(MENU_PERMISSIONS[ONEMARK_HUB]).toBe('foundation.practice.take');
  });
});

describe('Wave 3 doors — the operator accordion still belongs to operators only', () => {
  it('gives the full-key Senior Learner both new rows alongside the Wave 2 pair', () => {
    expect(subHrefs(SCHOOL_FACULTY)).toEqual(
      expect.arrayContaining([HUB, '/foundation/console', PAPER, REVIEW, RESULTS, UNITS]),
    );
  });

  it('shows Results to a paper builder and never the unit list', () => {
    const hrefs = subHrefs(PAPER_BUILDER_ONLY);
    expect(hrefs).toContain(RESULTS);
    expect(hrefs).toContain(PAPER);
    expect(hrefs).not.toContain(UNITS);
    expect(hrefs).not.toContain(REVIEW);
  });

  it('shows the unit list to an approver and never Results', () => {
    expect(subHrefs(APPROVER_ONLY)).toEqual([REVIEW, UNITS]);
  });

  it('leaks neither row — nor the accordion itself — to a learner', () => {
    expect(operatorRow(LEARNER), 'operator accordion leaked to a practice.take-only learner').toBeUndefined();
    const hrefs = flatHrefs(LEARNER);
    expect(hrefs).not.toContain(RESULTS);
    expect(hrefs).not.toContain(UNITS);
    // The learner keeps the flat rows Wave 2 gave them.
    expect(hrefs).toContain(PRACTICE);
    expect(hrefs).toContain('/foundation/practice');
  });

  it('leaks nothing to a role holding no foundation key at all', () => {
    expect(operatorRow(OUTSIDER)).toBeUndefined();
    for (const h of [RESULTS, UNITS, PAPER, REVIEW, PRACTICE]) {
      expect(flatHrefs(OUTSIDER), `${h} leaked to a role with no foundation key`).not.toContain(h);
    }
  });

  it('still gives the hub NO sidebar row of its own, flat or nested', () => {
    for (const role of [SCHOOL_FACULTY, PAPER_BUILDER_ONLY, APPROVER_ONLY, LEARNER, OUTSIDER]) {
      expect(flatHrefs(role)).not.toContain(ONEMARK_HUB);
      expect(subHrefs(role)).not.toContain(ONEMARK_HUB);
    }
  });
});

describe('Wave 3 doors — the proxy trie narrows the whole results subtree', () => {
  it('opens Results and the pages beneath it to the assessments key, and the unit list to the items key', () => {
    expect(routeMatcher.hasAccess(RESULTS, 'x', PAPER_BUILDER_ONLY.permissions)).toBe(true);
    expect(routeMatcher.hasAccess(COHORT_SHEET, 'x', PAPER_BUILDER_ONLY.permissions)).toBe(true);
    expect(routeMatcher.hasAccess(LEARNER_REPORT, 'x', PAPER_BUILDER_ONLY.permissions)).toBe(true);
    expect(routeMatcher.hasAccess(UNITS, 'x', APPROVER_ONLY.permissions)).toBe(true);
  });

  it('closes each door to the other operator key', () => {
    expect(routeMatcher.hasAccess(RESULTS, 'x', APPROVER_ONLY.permissions)).toBe(false);
    expect(routeMatcher.hasAccess(UNITS, 'x', PAPER_BUILDER_ONLY.permissions)).toBe(false);
  });

  it('keeps a learner out of the operator report screens — their own record comes from the practice screen', () => {
    expect(routeMatcher.hasAccess(RESULTS, 'x', LEARNER.permissions)).toBe(false);
    expect(routeMatcher.hasAccess(LEARNER_REPORT, 'x', LEARNER.permissions)).toBe(false);
    expect(routeMatcher.hasAccess(UNITS, 'x', LEARNER.permissions)).toBe(false);
    expect(routeMatcher.hasAccess(PRACTICE, 'x', LEARNER.permissions)).toBe(true);
  });

  it('DISCLOSED EDGE (ruling #1): an owner row with no permission key is stopped at the door', () => {
    // The RPC would admit this person — an active school_jkkn_owners row alone
    // grants the read. The proxy trie can only reason about permission keys, so
    // it never gets that far. In practice provisioning hands out the owner row
    // and school_faculty together (ruling #6), which is why this is a disclosed
    // edge and not an outage. Closing it needs a route-matcher change, which is
    // outside Lane N. This test exists so the gap is visible, not so it passes.
    expect(routeMatcher.hasAccess(RESULTS, 'x', OWNER_ROW_ONLY.permissions)).toBe(false);
    expect(routeMatcher.hasAccess(COHORT_SHEET, 'x', OWNER_ROW_ONLY.permissions)).toBe(false);
  });
});

describe('Wave 3 — the hub door Lane N did NOT open', () => {
  it('holds the Academic group at 14 top-level rows, one below the validator cap', () => {
    const academic = GetPages('/').find((g) => g.groupLabel === ACADEMIC_GROUP);
    expect(academic, 'the Academic group vanished').toBeDefined();
    // A 15th row makes validateSidebar raise a BLOCKING issue and check:sidebar
    // fails the build for every module. Lane N's two new entries are children of
    // 'Foundation Programme' for exactly this reason, and the flat learner door
    // to /foundation/onemark was reported instead of forced.
    expect(academic!.menus.length).toBe(14);
  });

  it('keeps the whole sidebar free of blocking structural issues', () => {
    const errors = validateSidebar(GetPages('/')).filter((i) => i.severity === 'error');
    expect(errors.map((e) => `${e.groupLabel}: ${e.count}`)).toEqual([]);
  });
});
