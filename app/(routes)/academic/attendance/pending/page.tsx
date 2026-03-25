// ============================================
// PENDING ATTENDANCE PAGE (SERVER COMPONENT)
// ============================================
// Created: 2026-03-21
// Purpose: Dedicated page for viewing pending (unmarked) attendance periods
//          across a date range, replacing the embedded tab on the dashboard.
// ============================================

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PendingAttendanceClient } from './_components/pending-attendance-client';
import { createClient } from '@/lib/supabase/server';

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function PendingAttendancePage() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login');
  }

  // ── Profile (with department join for department_name) ──────────────────────
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(
      `
      id,
      role,
      institution_id,
      department_id,
      is_super_admin,
      departments (
        id,
        department_name
      )
    `
    )
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    redirect('/auth/login');
  }

  // ── Role flags ──────────────────────────────────────────────────────────────
  const isSuperAdmin =
    profile?.is_super_admin === true || profile?.role === 'super_admin';
  const isHOD = profile?.role === 'hod';
  const isFaculty = profile?.role === 'faculty';

  // canViewAllInstitutions mirrors the client-side canAccess check:
  // super_admin users implicitly have all permissions.
  const canViewAllInstitutions = isSuperAdmin;

  const userInstitutionId = profile?.institution_id ?? undefined;
  const userDepartmentId = profile?.department_id ?? undefined;

  // Department name from joined relation (Supabase returns join as array)
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
    <PermissionGuard module="academic.attendance" action="view">
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
