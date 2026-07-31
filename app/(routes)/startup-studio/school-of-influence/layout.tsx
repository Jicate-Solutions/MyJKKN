'use client';

// School of Influence — access gate for the whole programme subtree.
// Spec: specs/school-of-influence-batches-2026-07-30.md §7 S8, decision 6.
//
// LAYER 2 OF 2. Layer 1 is RLS (migration 20260808140000): even a caller who
// reaches a page reads only the rows fn_soi_is_batch_member /
// fn_soi_membership_visible_to_me allow. This layer is the UI half — RLS alone is
// not a UI, and a UI guard alone is not security, so both ship together.
//
// TWO WAYS IN, and they are deliberately different:
//   • STAFF pass the STATIC check. This path has no MENU_PERMISSIONS entry of its
//     own, so routeMatcher inherits the deepest ancestor match —
//     '/startup-studio' -> 'startup_studio.analytics.view'. A section that needs a
//     tighter staff key for its own admin pages should add its own
//     MENU_PERMISSIONS entry; the matcher prefers the deeper match automatically.
//   • MEMBERS pass the FALLBACK. Decision 6 gates on membership, and a
//     learner-member holds no permission key at all, so without
//     hasSchoolOfInfluenceAccess they would be denied at the door.
//
// Denial renders PermissionError (inside RoutePermissionGuard) — an explicit
// "you do not have permission to access this page", never a silent
// redirect('/dashboard'), per CLAUDE.md rule 27.
//
// 'use client' is required to pass fallbackCheck to the client guard.
// Module scope keeps the reference stable across renders (the guard requires it).

import type { ReactNode } from 'react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';
import { hasSchoolOfInfluenceAccess } from '@/lib/services/school-of-influence/access-gate';

const soiMembershipFallback = () => hasSchoolOfInfluenceAccess();

export default function SchoolOfInfluenceLayout({ children }: { children: ReactNode }) {
  return (
    <RoutePermissionGuard fallbackCheck={soiMembershipFallback}>{children}</RoutePermissionGuard>
  );
}
