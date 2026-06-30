'use client';
// ============================================================================
// Admin — Hostel Curfew Policy
// ----------------------------------------------------------------------------
// Manages active curfew rules in the hostel_curfew_policies table.
// Rules span 4 dimensions: institution × gender × day_of_week × direction.
// Resolution: strictest active rule wins per direction (MIN for entry, MAX
// for exit). The "Resolution preview" panel hits fn_get_curfew live so a
// Director can sanity-check the rule for any (institution, gender, day) tuple.
//
// Spec lock: 2026-05-25 (chairperson + Director).
//
// 2026-06-30: the working editor body was extracted into a chrome-less
// <CurfewSection /> (./_components/-curfew-section) so it can be reused inside
// the unified Campus Living config sections. This page keeps its exact outer
// chrome (PermissionGuard + ContentLayout) and renders <CurfewSection /> where
// the inline body used to live — behavior-preserving, renders identically.
// ============================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PermissionError } from '@/components/errors/permission-error';
import { CurfewSection } from './_components/-curfew-section';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function HostelCurfewAdminPage() {
  return (
    // Authorization gate (added 2026-06-16): this admin curfew page previously
    // had NO in-page permission guard at all (open Add / Edit / enable-disable
    // controls) and relied on Supabase RLS only — and it manages
    // institution-wide curfew enforcement, so an ungated direct-URL visitor was
    // a real exposure. It is reachable from the Campus Living settings nav. Gate
    // on `campus_living.settings.view` (defined in lib/constants/permissions.ts;
    // the same section key /campus-living/settings maps to in MENU_PERMISSIONS).
    // Fail-closed: PermissionGuard renders the fallback on deny and nothing while
    // loading; super-admins bypass. Explicit denial, never a silent redirect
    // (CLAUDE.md rule #27).
    <PermissionGuard
      module="campus_living.settings"
      action="view"
      fallback={
        <ContentLayout title="Hostel Curfew Policy">
          <PermissionError
            message="Campus Living settings are restricted to hostel administrators."
            requiredPermission="campus_living.settings.view"
          />
        </ContentLayout>
      }
    >
    <ContentLayout title="Hostel Curfew Policy">
      <CurfewSection />
    </ContentLayout>
    </PermissionGuard>
  );
}
