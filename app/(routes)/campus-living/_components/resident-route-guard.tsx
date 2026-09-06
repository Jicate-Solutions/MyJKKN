'use client';

/**
 * CampusLivingResidentGuard — confines student-role users to the My Hostel area.
 *
 * Campus Living is a shared module: wardens, hostel office, chief wardens and a
 * few non-staff participants (gate_security, mess_caterer, parent, vendors) all
 * use different slices of it. A *student* (profiles.role = 'student'), however,
 * should only ever reach /campus-living/my-hostel/*. The sidebar + hosteler-aware
 * AutoTabNav already hide everything else, but unguarded operational pages
 * (mess, attendance, maintenance, …) would still render an empty shell on a
 * manually-typed URL. This is the single choke point that closes that gap.
 *
 * Scoping rationale: we key on `profile.role === 'student'` (the same
 * discriminator the `students_view_own_learner_profile` RLS policy uses), NOT on
 * "lacks dashboard.view" — other non-staff roles legitimately lack dashboard.view
 * yet need their own campus-living pages. The extra `!can(dashboard.view)` clause
 * is a safety valve so a student who also holds a staff role isn't trapped.
 *
 * Uses React-Query-cached useAuth()/usePermissions() — no extra
 * getEnhancedUserProfile() call, so it does not reintroduce the Turbopack
 * double-fetch the layout comment warns about.
 */

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';

export function CampusLivingResidentGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useAuth();
  const { isSuperAdmin, can, isLoading: permsLoading } = usePermissions();

  const isCampusLiving = !!pathname && pathname.startsWith('/campus-living');
  const isStudent = profile?.role === 'student';

  // Paths a student/resident is allowed to reach within campus-living: the
  // My Hostel hub, the two self-service request forms (CTAs from the Requests
  // tab — gated by leave.request / gate_passes.create), and the vacate-requests
  // area (their own request detail is page-guarded for view_own). Everything
  // else under /campus-living is admin/operational → redirect to My Hostel.
  const RESIDENT_PATHS = [
    '/campus-living/my-hostel',
    '/campus-living/leave/new',
    '/campus-living/gate-passes/new',
    '/campus-living/vacate-requests',
  ];
  const onResidentPath =
    !!pathname && RESIDENT_PATHS.some((p) => pathname.startsWith(p));

  // A student with no campus-living staff access is confined to the resident
  // paths above.
  const confineToMyHostel =
    isCampusLiving &&
    !onResidentPath &&
    isStudent &&
    !isSuperAdmin &&
    !can('campus_living.dashboard.view') &&
    !permsLoading;

  useEffect(() => {
    if (confineToMyHostel) {
      router.replace('/campus-living/my-hostel');
    }
  }, [confineToMyHostel, router]);

  // Don't flash the (RLS-empty) admin shell while the redirect is in flight.
  if (confineToMyHostel) return null;

  return <>{children}</>;
}
