// Solution department capability register subtree.
//
// Canonical permission enforcement via RoutePermissionGuard — the same guard
// the sibling /solutions/settings subtree uses (PR #1512). It reads this
// route's declared permission from MENU_PERMISSIONS
// (solutions.departments.view) and, on denial, RENDERS an explicit
// "Access Denied" page naming the missing permission. It never redirects:
// CLAUDE.md rule 27 exists because a silent bounce to /dashboard is a loop the
// person cannot diagnose or report.
import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';

export default function SolutionsDepartmentsLayout({ children }: { children: ReactNode }) {
  return <RoutePermissionGuard>{children}</RoutePermissionGuard>;
}
