// ============================================
// TIMETABLES MODULE - LIST PAGE (SERVER COMPONENT)
// ============================================
// Created: 2024
// Updated: 2025-12-25 - Converted to server component with Cache Components
// Purpose: List and manage academic timetables
// ============================================

import { Suspense } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { TimetablesTableServer } from './_components/timetables-table-server';
import { TimetableFiltersClient } from './_components/timetable-filters-client';
import { SuperAdminControlsClient } from './_components/super-admin-controls-client';
import { timetablesSearchParamsSchema } from './_components/data-table-schema';
import { getTimetables } from './_data/get-timetables';
import { TableSkeleton } from '@/components/Loading';
import { createClient } from '@/lib/supabase/server';

interface TimetablesPageProps {
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}

/**
 * Timetables Page - Server Component
 *
 * Performance improvements:
 * - Data fetched on server (faster TTI)
 * - Cached with 1 hour TTL (cold cache for timetables)
 * - No client-side loading states
 * - Automatic revalidation on data changes
 */
export default async function TimetablesPage({
  searchParams
}: TimetablesPageProps) {
  // Await params as per Next.js 16 async API
  const params = await searchParams;

  // Parse search parameters
  const search = timetablesSearchParamsSchema.parse(params);

  // Get current user for permission-based filtering
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // Get user profile for institution/department filtering
  const { data: userProfile } = user
    ? await supabase
        .from('user_profiles')
        .select('id, role, institution_id, department_id')
        .eq('user_id', user.id)
        .single()
    : { data: null };

  // Check if super admin
  const isSuperAdmin = userProfile?.role === 'super_admin';

  // Build filters for server-side data fetching
  const filters = {
    page: Number(search.page) || 1,
    pageSize: Number(search.pageSize) || 10,
    institutionId:
      search.institution_id ||
      (!isSuperAdmin && userProfile?.institution_id
        ? userProfile.institution_id
        : undefined),
    academicYearId: search.academic_year_id || undefined,
    degreeId: search.degree_id || undefined,
    programId: search.program_id || undefined,
    departmentId:
      search.department_id ||
      ((userProfile?.role === 'hod' || userProfile?.role === 'faculty') &&
      userProfile?.department_id &&
      !isSuperAdmin
        ? userProfile.department_id
        : undefined),
    semesterId: search.semester || undefined,
    sectionId: search.section || undefined,
    isActive:
      search.is_active === 'true'
        ? true
        : search.is_active === 'false'
        ? false
        : undefined,
    timetableFormat: search.timetable_type as 'section' | 'semester' | undefined
  };

  // Fetch data server-side with caching
  const { data: timetables, total, page, pageSize } = await getTimetables(filters);

  return (
    <PermissionGuard module="academic.timetables" action="view">
      <ContentLayout title="Academic Timetables">
        <div className="space-y-6">
          {/* Super Admin Controls */}
          {isSuperAdmin && (
            <SuperAdminControlsClient />
          )}

          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/">Dashboard</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/academic">Academic</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Timetables</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Main Content */}
          <Card>
            <CardContent className="p-6">
              <div className="space-y-6">
                {/* Filters (Client Component) */}
                <TimetableFiltersClient searchParams={search} />

                {/* Data Table (Server Component with Suspense) */}
                <Suspense fallback={<TableSkeleton rows={10} columns={7} />}>
                  <TimetablesTableServer
                    timetables={timetables}
                    metadata={{ total, page, pageSize }}
                  />
                </Suspense>
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
