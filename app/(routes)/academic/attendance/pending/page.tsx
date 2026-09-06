// ============================================
// PENDING ATTENDANCE PAGE (SERVER COMPONENT)
// ============================================
// Created: 2026-03-21
// Purpose: Dedicated page for viewing pending (unmarked) attendance periods
//          across a date range, replacing the embedded tab on the dashboard.
// ============================================

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PendingAttendanceClient } from './_components/pending-attendance-client';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function PendingAttendancePage() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    // The login page renders a persistent explanation for this param instead of
    // bouncing straight back (app/auth/login/page.tsx). Without it the jump is
    // instant and invisible, which is what made this page undiagnosable.
    redirect('/auth/login?error=profile_load_failed');
  }

  // ── Profile (with department join for department_name) ──────────────────────
  // The departments embed MUST name its constraint. Two foreign keys join these
  // two tables in opposite directions — fk_profiles_department_id
  // (profiles.department_id -> departments.id) and
  // departments_head_of_department_id_fkey (departments.head_of_department_id ->
  // profiles.id) — so a bare `departments (...)` embed returns PostgREST
  // PGRST201 "more than one relationship was found" on EVERY load for EVERY
  // user, before any permission code runs. That made profileError always truthy
  // and bounced the whole page to the dashboard, since the initial commit.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(
      `
      id,
      role,
      institution_id,
      department_id,
      is_super_admin,
      departments!fk_profiles_department_id (
        id,
        department_name
      )
    `
    )
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    // Never redirect silently on a load failure — surface it (engineering rule
    // #27). A silent bounce here is exactly the bug this page shipped with.
    logger.error(
      'academic/attendance',
      'Pending Attendance: profile lookup failed',
      profileError
    );

    return (
      <ContentLayout title="Pending Attendance">
        <Alert variant="destructive" className="max-w-2xl">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>We could not load your profile</AlertTitle>
          <AlertDescription>
            <p>
              Pending Attendance needs your profile to work out which
              institution and department you are allowed to see, and that
              lookup came back empty.
            </p>
            <p className="mt-2">
              Please reload the page. If it keeps happening, contact your system
              administrator and mention the time you saw this message.
            </p>
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  // ── Role flags ──────────────────────────────────────────────────────────────
  const isSuperAdmin =
    profile?.is_super_admin === true || profile?.role === 'super_admin';
  const isHOD = profile?.role === 'hod';
  const isFaculty = profile?.role === 'faculty';

  // canViewAllInstitutions mirrors the client-side canAccess check
  // (canAccess('academic.attendance.dashboard', 'view_all_institutions')).
  // Gating on isSuperAdmin ALONE silently restricted any non-super-admin
  // scope='all' role (e.g. executive_admin_officer / "eao", which holds the
  // view_all_institutions permission) to its own institution — the same
  // institution-scope bug class fixed for the embedded dashboard tab in #1618,
  // which never touched this standalone page. user_has_permission() already
  // bypasses super_admin and OR-merges multi-role permissions; we keep the
  // explicit isSuperAdmin OR as a defensive fallback.
  const { data: hasViewAllInstitutions } = await supabase.rpc(
    'user_has_permission',
    { permission_name: 'academic.attendance.dashboard.view_all_institutions' }
  );
  const canViewAllInstitutions =
    isSuperAdmin || hasViewAllInstitutions === true;

  const userInstitutionId = profile?.institution_id ?? undefined;
  const userDepartmentId = profile?.department_id ?? undefined;

  // Department name from the joined relation. The constraint-named many-to-one
  // embed above returns a single object (verified against production
  // PostgREST), not an array — read it directly.
  const deptRelation = (profile?.departments as unknown) as
    | { id: string; department_name: string }
    | null
    | undefined;
  const userDepartmentName = deptRelation?.department_name ?? undefined;

  // ── Staff ID (required for faculty-scoped data queries) ─────────────────────
  let staffId: string | undefined;

  if (isFaculty && profile?.id && userInstitutionId) {
    const { data: staffRow } = await supabase
      .from('staff')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('institution_id', userInstitutionId)
      .maybeSingle();

    staffId = staffRow?.id ?? undefined;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <PermissionGuard
      module="academic.attendance"
      action="view"
      fallback={
        // PermissionGuard defaults `fallback` to null, which renders a blank
        // page on a permission miss — another silent failure (rule #27).
        <ContentLayout title="Pending Attendance">
          <Alert variant="destructive" className="max-w-2xl">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>You do not have access to Pending Attendance</AlertTitle>
            <AlertDescription>
              <p>
                This page needs the Academic Attendance view permission, and
                none of your roles currently include it.
              </p>
              <p className="mt-2">
                Ask your system administrator to grant it under Users, then Role
                Management.
              </p>
            </AlertDescription>
          </Alert>
        </ContentLayout>
      }
    >
      <ContentLayout title="Pending Attendance">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/academic">Academic</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/academic/attendance">Attendance</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Pending Attendance</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Page header */}
          <div>
            <h1 className="text-2xl font-bold py-1">Pending Attendance</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Unmarked periods across selected date range
            </p>
          </div>

          {/* Client component — receives all role/scope props from server */}
          <PendingAttendanceClient
            isSuperAdmin={isSuperAdmin}
            isHOD={isHOD}
            isFaculty={isFaculty}
            canViewAllInstitutions={canViewAllInstitutions}
            userInstitutionId={userInstitutionId}
            userDepartmentId={userDepartmentId}
            userDepartmentName={userDepartmentName}
            staffId={staffId}
          />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
