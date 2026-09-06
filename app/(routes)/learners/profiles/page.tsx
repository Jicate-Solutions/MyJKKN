// ============================================
// LEARNERS PROFILES MODULE - LIST PAGE (SERVER COMPONENT)
// ============================================
// Created: 2025-01-19
// Updated: 2025-12-25 - Converted to server component with Cache Components
// Updated: 2026-07-30 - One lifecycle tab fetched per request (was three)
// Purpose: List and manage learner profiles
// ============================================

import { Suspense } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Plus, Upload } from 'lucide-react';
import { ProfilesTableServer } from './_components/profiles-table-server';
import { LearnerFilterBar } from './_components/learner-filter-bar';
import { ProfilesSearchWrapper } from './_components/profiles-search-wrapper';
import { LifecycleTabs } from './_components/lifecycle-tabs';
import {
  resolveLifecycleTab,
  lifecycleFilterForTab,
  type LifecycleTabValue,
} from './_components/lifecycle-status';
import { profilesSearchParamsSchema } from './_components/data-table-schema';
import { CreateMissingProfilesButton } from './_components/create-missing-profiles-button';
import { BulkUploadProfilesDialogEnhanced } from './_components/bulk-upload-profiles-dialog-enhanced';
import { BulkUploadLearnerImages } from './_components/bulk-upload-learner-images';
import { BulkEditActiveDialog } from './_components/bulk-edit-exited-dialog';
import { getLearnerProfiles } from './_data/get-learner-profiles';
import { TableSkeleton } from '@/components/Loading';
import { createClient } from '@/lib/supabase/server';

type RawSearchParams = { [key: string]: string | string[] | undefined };

interface ProfilesPageProps {
  searchParams: Promise<RawSearchParams>;
}

/**
 * Fetches and renders the table for ONE lifecycle status.
 *
 * The viewer's identity is resolved once by the page and passed in — this used
 * to re-run `auth.getUser()` plus a profiles lookup per rendered instance, and
 * there were three instances.
 */
async function ProfilesContent({
  searchParams,
  statusFilter,
  learnerIdFilter,
}: {
  searchParams: RawSearchParams;
  statusFilter: LifecycleTabValue;
  learnerIdFilter?: string;
}) {
  const str = (key: string) => (searchParams[key] as string) || undefined;
  const bool = (key: string) =>
    searchParams[key] ? searchParams[key] === 'true' : undefined;

  const search_fields = str('search_fields')
    ?.split(',')
    .map((field) => field.trim())
    .filter(Boolean);

  const { data: profiles, metadata } = await getLearnerProfiles({
    page: Number(searchParams.page) || 1,
    // Support both pageSize (DataTable) and limit (legacy)
    limit: Number(searchParams.pageSize) || Number(searchParams.limit) || 10,
    search: str('search'),
    search_case_sensitive: bool('search_case_sensitive'),
    search_exact_match: bool('search_exact_match'),
    search_fields,
    // One status for a status tab; the five allowed statuses on "All Statuses".
    // Never undefined — this page never lists enquiry / graduated / rejected.
    lifecycle_status: lifecycleFilterForTab(statusFilter),
    institution_id: str('institution_id'),
    degree_id: str('degree_id'),
    department_id: str('department_id'),
    program_id: str('program_id'),
    semester_id: str('semester_id'),
    section_id: str('section_id'),
    academic_year_id: str('academic_year_id'),
    // Integer calendar year, not a uuid — see lib/utils/admission-year-filter.ts.
    // `|| undefined` is safe here (0 is not a valid admission year) and keeps a
    // junk value like ?admission_year=abc from reaching the query as NaN.
    admission_year: Number(str('admission_year')) || undefined,
    gender: str('gender'),
    is_profile_complete: bool('is_profile_complete'),
    accommodation_type_id: str('accommodation_type_id'),
    sortBy: str('sort_by') || 'first_name',
    sortOrder: (str('sort_order') as 'asc' | 'desc') || 'asc',
    learner_id: learnerIdFilter, // Student filter - only see own profile
  });

  return (
    <ProfilesTableServer
      initialData={profiles}
      metadata={metadata}
      statusFilter={statusFilter}
    />
  );
}

/**
 * Learners Management Page - Server Component
 *
 * Features:
 * - Lifecycle status tabs (active / inactive / exited) driven by `?status=`
 * - Advanced filtering and sorting via URL state
 * - Bulk operations (promotion, bulk edit)
 * - Role-based permission access
 */
export default async function ProfilesPage({ searchParams }: ProfilesPageProps) {
  // Await searchParams as per Next.js 16 async API
  const params = await searchParams;

  // Resolve the viewer ONCE for the whole page.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isStudent = false;
  let learnerIdFilter: string | undefined;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, learner_id')
      .eq('id', user.id)
      .single();

    isStudent = profile?.role === 'student';
    if (isStudent && profile?.learner_id) {
      learnerIdFilter = profile.learner_id;
    }
  }

  // Students always see their own active profile; admins pick a tab.
  const activeTab = isStudent ? 'active' : resolveLifecycleTab(params.status);

  // Re-key the boundary on the query so changing a filter or tab shows the
  // skeleton instead of silently swapping rows under the user.
  const suspenseKey = `${activeTab}:${new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) =>
      typeof v === 'string' ? [[k, v] as [string, string]] : []
    )
  ).toString()}`;

  const pageTitle = isStudent ? 'My Profile' : 'Learners Management';
  const headerDescription = isStudent
    ? 'View and manage your student profile information'
    : 'Manage enrolled learner profiles';

  return (
    <ContentLayout title={pageTitle}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners' },
          { label: pageTitle },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold py-1">{pageTitle}</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {headerDescription}
            </p>
          </div>

          {/* Action Buttons - Hidden for students */}
          {!isStudent && (
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/learners/profiles/create">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Learner
                </Link>
              </Button>
              <CreateMissingProfilesButton />
              <BulkUploadProfilesDialogEnhanced />
              <BulkUploadLearnerImages
                institutionId={params.institution_id as string | undefined}
              />
              <BulkEditActiveDialog />

              <Button variant="outline" asChild>
                <Link href="/learners/profiles/promotion">
                  <Upload className="mr-2 h-4 w-4" />
                  Student Promotion
                </Link>
              </Button>
            </div>
          )}
        </div>

        {isStudent ? (
          // Students see only their own active profile (no tabs, no filters)
          <div className="space-y-4">
            <Suspense fallback={<TableSkeleton rows={1} columns={10} />}>
              <ProfilesContent
                searchParams={params}
                statusFilter="active"
                learnerIdFilter={learnerIdFilter}
              />
            </Suspense>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Search & filters stay outside Suspense so they remain visible
                and keep their state while the table streams. */}
            <ProfilesSearchWrapper />
            <LearnerFilterBar
              searchParams={
                profilesSearchParamsSchema.safeParse(params).data ?? {
                  page: 1,
                  pageSize: 50,
                }
              }
            />

            <LifecycleTabs value={activeTab} />

            <Suspense
              key={suspenseKey}
              fallback={<TableSkeleton rows={10} columns={10} />}
            >
              <ProfilesContent searchParams={params} statusFilter={activeTab} />
            </Suspense>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
