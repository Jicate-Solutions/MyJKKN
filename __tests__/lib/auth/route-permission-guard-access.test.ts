// Access-matrix proof + regression guard for the canonical RoutePermissionGuard.
//
// Imports the REAL canonical modules the guard composes — routeMatcher
// (MENU_PERMISSIONS-backed, wildcard-aware), isPageAccessible, and the guard's
// own isExemptPath — and asserts the page-layer decision for representative
// roles across every module a RoutePermissionGuard layout now protects.
//
// Proves:
//   (a) leak CLOSED   — a student/plain-staff is denied every gated admin route,
//   (b) no OVER-gate  — super-admin allowed everywhere; declared-permission
//       holders allowed exactly their route,
//   (c) [id] routes resolve to the deepest declared permission,
//   (d) public/token EXEMPTIONS (payment callbacks, token scoring) are honored.

import { describe, it, expect } from 'vitest';
import { routeMatcher } from '@/lib/auth/route-matcher';
import { isPageAccessible } from '@/lib/navigation/permission-filter';
import { isExemptPath } from '@/lib/auth/route-exempt';

const requiredPermission = (path: string): string | undefined =>
  routeMatcher.match(path)?.permission;

const allowed = (
  path: string,
  permissions: Record<string, boolean>,
  isSuperAdmin = false,
  role = 'staff',
): boolean =>
  isPageAccessible(path, requiredPermission(path), permissions, isSuperAdmin, role);

// Gated admin routes now covered by a RoutePermissionGuard layout (concrete ids).
const GATED = [
  // /users
  '/users', '/users/8f3a/edit', '/users/permissions-audit', '/users/new', '/users/role-management',
  // /hr
  '/hr/employees', '/hr/compensation', '/hr/analytics', '/hr/recruitment/approvals', '/hr/policies',
  // /cdc/admin
  '/cdc/admin/recruiters', '/cdc/admin/drive-types',
  // /vac/admin
  '/vac/admin/courses/c1/edit', '/vac/admin/case/tracks',
  // /audit
  '/audit/cycles', '/audit/findings', '/audit/care/new',
  // /billing
  '/billing/categories/new', '/billing/refunds', '/billing/categories/b1/edit',
  // rollout clusters (2nd wave)
  '/admin/lti/analytics', '/ai-pulse/admin/cycles', '/okr/admin/compliance',
  '/startup-studio/finance', '/startup-studio/solve-for-100/admin', '/service-requests/approvals',
  '/staff/category', '/campus-living/reports', '/campus-living/mess/billing/b1',
  '/solutions/settings/types', '/solutions/pipeline/analytics',
  '/organizations/school-defaults/audit', '/admission/settings/years/new',
];

describe('canonical route-permission enforcement', () => {
  it('every gated route declares a permission (none left undeclared / wide open)', () => {
    for (const r of GATED) {
      expect(requiredPermission(r), `no MENU_PERMISSIONS for ${r}`).toBeTruthy();
    }
  });

  it('LEARNER (student) is DENIED every gated route — the leak is closed', () => {
    for (const r of GATED) {
      expect(allowed(r, {}, false, 'student'), `student must be denied ${r}`).toBe(false);
    }
  });

  it('plain staff with an unrelated perm is DENIED every gated route', () => {
    for (const r of GATED) {
      expect(allowed(r, { 'hr.leave.apply': true }, false, 'faculty'), `denied ${r}`).toBe(false);
    }
  });

  it('SUPER-ADMIN is allowed every gated route (no over-gate)', () => {
    for (const r of GATED) {
      expect(allowed(r, {}, true, 'super_admin'), `super-admin allowed ${r}`).toBe(true);
    }
  });

  it('declared-permission holders are allowed exactly their routes', () => {
    expect(allowed('/users', { 'users.view': true })).toBe(true);
    expect(allowed('/users/8f3a/edit', { 'users.view': true })).toBe(false);     // needs users.edit
    expect(allowed('/users/8f3a/edit', { 'users.edit': true })).toBe(true);
    expect(allowed('/hr/employees', { 'hr.employees.view': true })).toBe(true);
    expect(allowed('/hr/employees', { 'hr.leave.view': true })).toBe(false);
    expect(allowed('/cdc/admin/recruiters', { 'cdc.view': true })).toBe(true);
    expect(allowed('/billing/refunds', { 'billing.refunds.view': true })).toBe(true);
    expect(allowed('/audit/cycles', { 'audit.cycle.view': true })).toBe(true);
  });

  it('dynamic [id] routes resolve to the deepest declared permission', () => {
    expect(requiredPermission('/users/8f3a/edit')).toBe('users.edit');
    expect(requiredPermission('/billing/categories/b1/edit')).toBe('billing.categories.edit');
  });

  describe('public/token exemptions (must stay reachable)', () => {
    it('billing payment callbacks are exempt (paying students lack billing.payment.view)', () => {
      const ex = ['/billing/payment'];
      expect(isExemptPath('/billing/payment', ex)).toBe(true);
      expect(isExemptPath('/billing/payment/success', ex)).toBe(true);
      expect(isExemptPath('/billing/payment/failed', ex)).toBe(true);
      // a sibling admin route is NOT exempt
      expect(isExemptPath('/billing/refunds', ex)).toBe(false);
      expect(isExemptPath('/billing/categories/new', ex)).toBe(false);
    });

    it('audit token scorer is exempt, but the admin scorer-setup parent stays gated', () => {
      const ex = ['/audit/care/score/'];               // trailing slash = children only
      expect(isExemptPath('/audit/care/score/tok-abc', ex)).toBe(true);   // token participant
      expect(isExemptPath('/audit/care/score', ex)).toBe(false);          // admin setup -> gated
      expect(isExemptPath('/audit/cycles', ex)).toBe(false);
    });

    it('startup-studio leaderboard is exempt (own committee-membership layout)', () => {
      const ex = ['/startup-studio/solve-for-100/leaderboard'];
      expect(isExemptPath('/startup-studio/solve-for-100/leaderboard', ex)).toBe(true);
      expect(isExemptPath('/startup-studio/finance', ex)).toBe(false);          // admin -> gated
      expect(isExemptPath('/startup-studio/solve-for-100/admin', ex)).toBe(false);
    });
  });
});
