// ============================================
// LEARNERS PROFILES MODULE - LIST PAGE (SERVER COMPONENT)
// ============================================
// Created: 2025-01-19
// Updated: 2025-12-25 - Converted to server component with Cache Components
// Purpose: List and manage active learner profiles
// ============================================

import { Suspense } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Plus, Upload } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfilesTableServer } from './_components/profiles-table-server';
import { ProfilesFilters } from './_components/profiles-filters';
import { profilesSearchParamsSchema } from './_components/data-table-schema';
import { CreateMissingProfilesButton } from './_components/create-missing-profiles-button';
import { BulkUploadProfilesDialogEnhanced } from './_components/bulk-upload-profiles-dialog-enhanced';
import { BulkEditActiveDialog } from './_components/bulk-edit-exited-dialog';
import { getLearnerProfiles } from './_data/get-learner-profiles';
import { TableSkeleton } from '@/components/Loading';
import { createClient } from '@/lib/supabase/server';
import type { LifecycleStatus } from '@/types/learner-profile';

interface ProfilesPageProps {
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}

/**
 * Async component that fetches and displays profiles data
 * This demonstrates the server component pattern with caching
 */
async function ProfilesContent({
  searchParams,
  statusFilter
}: {
  searchParams: {
    [key: string]: string | string[] | undefined;
  };
  statusFilter: LifecycleStatus;
}) {
  // Get current user and check if student
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  let isStudent = false;
  let learnerIdFilter: string | undefined = undefined;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, learner_id')
      .eq('id', user.id)
      .single();

    isStudent = profile?.role === 'student';

    // If student, only show their own profile
    if (isStudent && profile?.learner_id) {
      learnerIdFilter = profile.learner_id;
    }
  }

  // Parse search parameters
  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.pageSize) || Number(searchParams.limit) || 10; // Support both pageSize (DataTable) and limit (legacy)
  const search = (searchParams.search as string) || undefined;
  const institution_id = (searchParams.institution_id as string) || undefined;
  const degree_id = (searchParams.degree_id as string) || undefined;
  const department_id = (searchParams.department_id as string) || undefined;
  const program_id = (searchParams.program_id as string) || undefined;
  const semester_id = (searchParams.semester_id as string) || undefined;
  const section_id = (searchParams.section_id as string) || undefined;
  const academic_year_id = (searchParams.academic_year_id as string) || undefined;
  const gender = (searchParams.gender as string) || undefined;
  const is_profile_complete = searchParams.is_profile_complete
    ? searchParams.is_profile_complete === 'true'
    : undefined;
  const sortBy = (searchParams.sort_by as string) || 'created_at';
  const sortOrder = (searchParams.sort_order as 'asc' | 'desc') || 'desc';

  // Fetch data on server with caching
  const { data: profiles, metadata } = await getLearnerProfiles({
    page,
    limit,
    search,
    lifecycle_status: statusFilter,
    institution_id,
    degree_id,
    department_id,
    program_id,
    semester_id,
    section_id,
    academic_year_id,
    gender,
    is_profile_complete,
    sortBy,
    sortOrder,
    learner_id: learnerIdFilter // Student filter - only see own profile
  });

  const parsedParams = profilesSearchParamsSchema.parse(searchParams);

  return (
    <>
      {/* Filters (Client Component) - Hidden for students */}
      {!isStudent && (
        <ProfilesFilters searchParams={parsedParams} statusFilter={statusFilter as any} />
      )}

      {/* Table */}
      <ProfilesTableServer
        initialData={profiles}
        metadata={metadata}
        statusFilter={statusFilter as any}
      />
    </>
  );
}

/**
 * Learners Management Page - Server Component
 *
 * Performance improvements:
 * - Data fetched on server (faster TTI)
 * - Cached with 5 minute TTL (warm cache for student data)
 * - Streaming with Suspense (progressive loading)
 * - Client components only for interactive filters and row selection
 *
 * Features:
 * - Three tabs for different lifecycle statuses (active, inactive, exited)
 * - Advanced filtering and sorting
 * - Bulk operations (promotion, bulk edit)
 * - URL state management
 * - Role-based permission access
 */
export default async function ProfilesPage({ searchParams }: ProfilesPageProps) {
  // Await searchParams as per Next.js 16 async API
  const params = await searchParams;

  // Get current user and check if student
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  let isStudent = false;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    isStudent = profile?.role === 'student';
  }

  // Conditional title and breadcrumb based on role
  const pageTitle = isStudent ? 'My Profile' : 'Learners Management';
  const breadcrumbLabel = isStudent ? 'My Profile' : 'Learners Management';
  const headerDescription = isStudent
    ? 'View and manage your student profile information'
    : 'Manage currently enrolled and active student profiles';

  return (
    <ContentLayout title={pageTitle}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners' },
          { label: breadcrumbLabel }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold py-1">{pageTitle}</h1>
            <p className="text-sm sm:text-base text-muted-foreground">{headerDescription}</p>
          </div>

          {/* Bulk actions - Hidden for students */}
          {!isStudent && (
            <div className="flex gap-2">
              <CreateMissingProfilesButton />
              <BulkUploadProfilesDialogEnhanced />
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

        {/* Conditional rendering: Tabs for admins, direct content for students */}
        {isStudent ? (
          // Students see only their active profile (no tabs)
          <div className="space-y-4">
            <Suspense
              key={`active-${JSON.stringify(params)}`}
              fallback={<TableSkeleton rows={1} columns={10} />}
            >
              <ProfilesContent searchParams={params} statusFilter="active" />
            </Suspense>
          </div>
        ) : (
          // Admins see tabs for different statuses
          <Tabs defaultValue="active" className="w-full">
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="inactive">Inactive</TabsTrigger>
              <TabsTrigger value="exited">Exited</TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="space-y-4">
              <Suspense
                key={`active-${JSON.stringify(params)}`}
                fallback={<TableSkeleton rows={10} columns={10} />}
              >
                <ProfilesContent searchParams={params} statusFilter="active" />
              </Suspense>
            </TabsContent>

          <TabsContent value="inactive" className="space-y-4">
            <Suspense
              key={`inactive-${JSON.stringify(params)}`}
              fallback={<TableSkeleton rows={10} columns={10} />}
            >
              <ProfilesContent searchParams={params} statusFilter="inactive" />
            </Suspense>
          </TabsContent>

          <TabsContent value="exited" className="space-y-4">
            <Suspense
              key={`exited-${JSON.stringify(params)}`}
              fallback={<TableSkeleton rows={10} columns={10} />}
            >
              <ProfilesContent searchParams={params} statusFilter="exited" />
            </Suspense>
          </TabsContent>
        </Tabs>
        )}
      </div>
    </ContentLayout>
  );
}
