// ============================================
// UNMARKED SESSION HISTORY (SERVER COMPONENT)
// ============================================
// Created: 2026-08-10
// Purpose: Give the unmarked-session history a home.
//
//   On 2026-08-10, 43,775 "Attendance not marked today" notification rows were
//   expired deliberately, on an explicit Director ruling, after he was shown and
//   accepted that the history would afterwards be readable nowhere in the product
//   except /notifications/admin. This page is the remedy — it does not restore or
//   re-create a single notification row, it reads the underlying timetables.
//
//   The number it shows comes from fn_aqs_attendance_unmarked_periods_range,
//   the date-ranged sibling of the CURRENT_DATE-only function that feeds the
//   attendance dashboard badge. Both count at TIMETABLE grain, so the two
//   surfaces agree — see supabase/migrations/20260817043700_unmarked_periods_date_range.sql
//   for the measured proof and for the one deliberate difference between them.
//
// Why this is a separate page from /academic/attendance/pending: that page lists
// individual PERIOD SLOTS inside a timetable's day (a different, finer grain,
// computed in TypeScript from timetable_data) and is a working queue for chasing
// today's gaps. This one answers the retrospective question at the same grain the
// dashboard badge and the retired notification used — one row per teaching session
// per day — which is the only grain those numbers can be reconciled against.
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
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';
import { UnmarkedHistoryClient } from './_components/unmarked-history-client';

export default async function UnmarkedAttendanceHistoryPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    // Never bounce silently — the login page renders a persistent explanation
    // for this param instead of flipping straight back (engineering rule #27).
    redirect('/auth/login?error=profile_load_failed');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, institution_id, is_super_admin')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    logger.error(
      'academic/attendance',
      'Unmarked history: profile lookup failed',
      profileError
    );
    return (
      <ContentLayout title="Unmarked Session History">
        <Alert variant="destructive" className="max-w-2xl">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>We could not load your profile</AlertTitle>
          <AlertDescription>
            <p>
              This page needs your profile to work out which institution and
              department you are allowed to see, and that lookup came back
              empty.
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

  // Institution pickers are offered ONLY to callers who can actually act on
  // more than one institution. A picker that offers a scope the viewer does not
  // hold reports an empty result as if the data were missing, when the truth is
  // that the request was clamped — the function refuses the override and
  // returns the caller's own institution regardless of what is passed.
  const isSuperAdmin =
    profile.is_super_admin === true || profile.role === 'super_admin';

  const { data: hasViewAllInstitutions } = await supabase.rpc(
    'user_has_permission',
    { permission_name: 'academic.attendance.dashboard.view_all_institutions' }
  );
  const canViewAllInstitutions = isSuperAdmin || hasViewAllInstitutions === true;

  let institutions: { id: string; name: string }[] = [];
  if (canViewAllInstitutions) {
    const { data } = await supabase
      .from('institutions')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    institutions = data ?? [];
  }

  return (
    <PermissionGuard
      module="academic.attendance.dashboard"
      action="view"
      fallback={
        // PermissionGuard defaults `fallback` to null, which renders a blank
        // page on a permission miss — a silent failure (rule #27). Say so.
        <ContentLayout title="Unmarked Session History">
          <Alert variant="destructive" className="max-w-2xl">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>
              You do not have access to Unmarked Session History
            </AlertTitle>
            <AlertDescription>
              <p>
                This page needs the Attendance Dashboard view permission, and
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
      <ContentLayout title="Unmarked Session History">
        <div className="space-y-6">
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
                <BreadcrumbPage>Unmarked History</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className="text-2xl font-bold py-1">Unmarked Session History</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Teaching sessions that were scheduled on a past date and still have
              no attendance marked against them.
            </p>
          </div>

          <UnmarkedHistoryClient
            userId={profile.id}
            institutions={institutions}
            canChooseInstitution={canViewAllInstitutions}
          />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
