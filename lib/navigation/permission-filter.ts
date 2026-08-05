import type { PageEntry } from './types';

/**
 * Roles the database `is_admin()` treats as admin:
 *   is_super_admin = true  OR  role IN ('admin','super_admin','administrator').
 * The nav/route guard must NOT be stricter than the data layer — these roles pass
 * `is_admin()` on every RPC, so blocking them at the route guard (which previously
 * bypassed only `isSuperAdmin`) produced a confusing "can't open my own admin
 * console" lockout for non-super-admin `administrator` users. This mirrors
 * `is_admin()` exactly, so it grants nothing the DB doesn't already grant; a plain
 * student/faculty (not in this set) is unaffected and cannot be over-opened.
 */
const ADMIN_BYPASS_ROLES = ['admin', 'super_admin', 'administrator'];
function hasAdminBypass(userRole: string, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || ADMIN_BYPASS_ROLES.includes(userRole);
}

/**
 * Filters page entries based on user's merged permissions.
 * Uses the same permission keys from MENU_PERMISSIONS that the sidebar uses.
 *
 * - Pages with no permission field are visible to all authenticated users
 * - Super admins see everything except student portal pages
 * - Student portal pages (my-*) only visible to students
 */
export function filterByPermissions(
  pages: PageEntry[],
  permissions: Record<string, boolean>,
  isSuperAdmin: boolean,
  userRole: string
): PageEntry[] {
  return pages.filter(page => {
    // No permission required — visible to all
    if (!page.permission) return true;

    // Universal permissions — always accessible
    if (['view_dashboard', 'view_profile'].includes(page.permission)) return true;

    // Admin roles (mirrors DB is_admin()) see everything except student-only pages
    if (hasAdminBypass(userRole, isSuperAdmin)) {
      return !page.path.includes('/learners/my-') &&
             page.path !== '/learners/leave-onduty/my-applications';
    }

    // Student portal pages — only for students
    if (page.path.includes('/learners/my-') ||
        page.path === '/learners/leave-onduty/my-applications') {
      if (!['student', 'graduated_student'].includes(userRole)) return false;
    }

    // Marathon ops & committees pages — accessible to all authenticated users
    // Page-level guards (useCommitteeMembership) handle actual access control
    if (page.permission === 'events.marathon.live_ops.manage' ||
        page.permission === 'events.marathon.committees.manage') {
      return true;
    }

    // MBA Analyst dashboard — associates reach it via improvement.ideas.view;
    // board managers / MBA Faculty (improvement.board.manage) also get the link
    // so they can view ANY department's analytics via the on-page picker. The
    // page-level `can()` gate enforces the actual capability.
    if (page.path === '/improvement-board/analytics') {
      return !!(permissions['improvement.ideas.view'] ||
                permissions['improvement.board.manage']);
    }

    // MBA case studies — associates WRITE them (improvement.ideas.view) and
    // board managers / officers GRADE them. The two populations are reached by
    // different keys, so a single-key gate hides the link from one of them;
    // which role_key holds which key is a live value in custom_roles, not
    // something this file records. Compared by value, never key existence: a
    // key present and set to false is a denial. This decides the LINK only —
    // the page's own gate decides the capability.
    if (page.path === '/improvement-board/case-studies') {
      return !!(permissions['improvement.ideas.view'] ||
                permissions['improvement.board.manage'] ||
                permissions['improvement.area_role.assign']);
    }

    // Check specific permission from merged role permissions
    if (permissions[page.permission]) return true;

    return false;
  });
}

/**
 * Check if a specific page is accessible to the user.
 */
export function isPageAccessible(
  pagePath: string,
  permission: string | undefined,
  permissions: Record<string, boolean>,
  isSuperAdmin: boolean,
  userRole: string
): boolean {
  if (!permission) return true;
  if (['view_dashboard', 'view_profile'].includes(permission)) return true;
  if (hasAdminBypass(userRole, isSuperAdmin)) return true;
  // Marathon ops & committees — page-level guards handle committee membership
  if (permission === 'events.marathon.live_ops.manage' ||
      permission === 'events.marathon.committees.manage') return true;
  // MBA Analyst dashboard — associates (improvement.ideas.view) OR board
  // managers / MBA Faculty (improvement.board.manage). Page-level `can()` gate
  // enforces the actual capability.
  if (pagePath === '/improvement-board/analytics') {
    return !!(permissions['improvement.ideas.view'] ||
              permissions['improvement.board.manage']);
  }
  // MBA case studies — same union as filterByPermissions above. Kept in both
  // functions because they are called from different surfaces (sidebar vs
  // Command Palette) and a divergence would show the link in one and not
  // the other.
  if (pagePath === '/improvement-board/case-studies') {
    return !!(permissions['improvement.ideas.view'] ||
              permissions['improvement.board.manage'] ||
              permissions['improvement.area_role.assign']);
  }
  return !!permissions[permission];
}
