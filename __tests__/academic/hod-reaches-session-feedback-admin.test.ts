/**
 * Regression guard: a HOD / principal can actually REACH the per-faculty
 * session-feedback roll-up (/academic/session-feedback/admin).
 *
 * BUG-004624 (MBA HoD, 11 Jul): "not able to see the faculty subject feedback
 * given by the learners". The data was never the problem — since 31 Jul every
 * fn_scf_admin_* read authorizes academic.session_feedback.leadership.view,
 * held by hod / principal / vice_principal / administrator / ceo …, and the
 * page renders the Faculty Summary for them when the URL is typed. The
 * sidebar never offered the link: the menu item carried requiresSuperAdmin,
 * and GetRoleBasedPages returns false on that flag BEFORE it reads
 * MENU_PERMISSIONS, so the 12 Jul key mapping for this route never ran.
 *
 * These tests exercise the REAL GetRoleBasedPages. The negative control holds
 * a true permission elsewhere, so the filter genuinely runs (a role holding
 * nothing is short-circuited by the hasAnyPermission early return).
 */

import { describe, it, expect } from 'vitest';
import { GetRoleBasedPages, type RolePermissionData } from '@/lib/sidebarMenuLink';
import { routeMatcher } from '@/lib/auth/route-matcher';

const ADMIN_LANE = '/academic/session-feedback/admin';

/** Live shapes (27 Sep): hod 99 active holders, principal 12. */
const HOD: RolePermissionData = {
  role_key: 'hod',
  permissions: {
    'academic.attendance.view': true,
    'academic.attendance.dashboard.view': true,
    'academic.session_feedback.leadership.view': true,
  },
};

const PRINCIPAL: RolePermissionData = {
  role_key: 'principal',
  permissions: {
    'academic.attendance.dashboard.view': true,
    'academic.session_feedback.leadership.view': true,
  },
};

/** Negative control: a teaching role with real permissions but no leadership key. */
const TEACHING_ROLE: RolePermissionData = {
  role_key: 'faculty',
  permissions: {
    'academic.attendance.view': true,
  },
};

// Since the Academic regroup (3645d38644, 29 Sep) the link is a child of the
// 'Session Feedback' accordion, not a top-level row, so search both levels.
function hasAdminLane(role: RolePermissionData): boolean {
  return GetRoleBasedPages(ADMIN_LANE, role)
    .flatMap((group) => group.menus)
    .some(
      (menu) =>
        menu.href === ADMIN_LANE ||
        menu.submenus.some((sub) => sub.href === ADMIN_LANE),
    );
}

describe('leadership reaches the per-faculty session-feedback roll-up', () => {
  it('HOD: the sidebar renders the link', () => {
    expect(hasAdminLane(HOD), 'feedback roll-up hidden from a HOD').toBe(true);
  });

  it('PRINCIPAL: the sidebar renders the link', () => {
    expect(hasAdminLane(PRINCIPAL), 'feedback roll-up hidden from a principal').toBe(true);
  });

  it('HOD / principal: the route gate admits — the link opens the page, not a no-access panel', () => {
    // Confirmed live 27 Sep: hodmba@jkkn.ac.in opens this URL and the Faculty
    // Summary renders. The page's reads are fn_scf_admin_* (leadership key).
    expect(routeMatcher.hasAccess(ADMIN_LANE, 'hod', undefined)).toBe(true);
    expect(routeMatcher.hasAccess(ADMIN_LANE, 'principal', undefined)).toBe(true);
  });

  it('a role without the leadership key still gets no link', () => {
    expect(hasAdminLane(TEACHING_ROLE), 'feedback roll-up leaked to a teaching role').toBe(false);
  });
});
