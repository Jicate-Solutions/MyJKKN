import { describe, it, expect } from 'vitest';
import { GetRoleBasedPages, MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';

// ---------------------------------------------------------------------------
// `/system` is not a page — app/(routes)/system/route.ts answers with a 307 to
// /system/api-management. It gained a MENU_PERMISSIONS entry so the redirect is
// gated like its destination instead of being an unmatched (and therefore
// unprotected) path in RouteMatcher's trie.
//
// The obvious worry about that change is "does gating the parent hide the rows
// underneath it from people who hold only a child's permission?" It does not:
// a menu with submenus is filtered by `menu.submenus.some(...)` and its own key
// is never read on that branch. These tests pin that, because the reasoning is
// control-flow and a future refactor could quietly invert it.
// ---------------------------------------------------------------------------

function systemGroupFor(permissions: Record<string, boolean>) {
  const groups = GetRoleBasedPages('/dashboard', { role_key: 'hod', permissions });
  return groups
    .flatMap((g) => g.menus)
    .find((m) => m.href === '/system');
}

describe('/system menu entry', () => {
  it('declares a permission, so the route trie can match it', () => {
    expect(MENU_PERMISSIONS['/system']).toBe('system.api.view');
  });

  it('takes the key of the page it redirects to', () => {
    // The landing must not be gated more loosely than its destination.
    expect(MENU_PERMISSIONS['/system']).toBe(MENU_PERMISSIONS['/system/api-management']);
  });

  it('still shows the System group to someone who holds ONLY a child permission', () => {
    // A learner with bug-report access and nothing else must keep My Bug
    // Reports — the parent's own key is irrelevant on the submenu branch.
    const menu = systemGroupFor({ 'learners.bug_reports.view': true });

    expect(menu).toBeDefined();
    expect(menu?.submenus.map((s) => s.href)).toContain('/my-bug-reports');
  });

  it('does not show the System group to someone holding none of its children', () => {
    const menu = systemGroupFor({ 'academic.attendance.view': true });

    expect(menu).toBeUndefined();
  });

  it('shows it to someone holding the API Management permission', () => {
    const menu = systemGroupFor({ 'system.api.view': true });

    expect(menu).toBeDefined();
    expect(menu?.submenus.map((s) => s.href)).toContain('/system/api-management');
  });
});
