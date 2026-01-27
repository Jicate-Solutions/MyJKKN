// ============================================
// ALUMNI & GRADUATES MODULE - LIST PAGE (SERVER COMPONENT)
// ============================================
// Created: 2025-01-19
// Updated: 2025-12-25 - Converted to server component with Cache Components
// Purpose: List and manage graduated students and alumni
// ============================================

import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlumniTableServer } from './_components/alumni-table-server';
import { AlumniFilters } from './_components/alumni-filters';
import { AlumniSearchWrapper } from './_components/alumni-search-wrapper';
import { alumniSearchParamsSchema } from './_components/data-table-schema';
import { getAlumni } from './_data/get-alumni';
import { TableSkeleton } from '@/components/Loading';
import type { LifecycleStatus } from '@/types/learner-profile';

interface AlumniPageProps {
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}

/**
 * Async component that fetches and displays alumni data
 */
async function AlumniContent({
  searchParams,
  statusFilter
}: {
  searchParams: {
    [key: string]: string | string[] | undefined;
  };
  statusFilter: LifecycleStatus;
}) {
  // Parse search parameters
  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.pageSize) || Number(searchParams.limit) || 10; // Support both pageSize (DataTable) and limit (legacy)
  const search = (searchParams.search as string) || undefined;
  const institution_id = (searchParams.institution_id as string) || undefined;
  const degree_id = (searchParams.degree_id as string) || undefined;
  const department_id = (searchParams.department_id as string) || undefined;
  const program_id = (searchParams.program_id as string) || undefined;
  const sortBy = (searchParams.sort_by as string) || 'created_at';
  const sortOrder = (searchParams.sort_order as 'asc' | 'desc') || 'desc';

  // Fetch data on server with caching
  const { data: alumni, metadata } = await getAlumni({
    page,
    limit,
    search,
    institution_id,
    degree_id,
    department_id,
    program_id,
    sortBy,
    sortOrder
  });

  const parsedParams = alumniSearchParamsSchema.parse(searchParams);

  return (
    <>
      {/* Advanced Search */}
      <div className="mb-4">
        <AlumniSearchWrapper statusFilter={statusFilter as any} />
      </div>

      {/* Filters (Client Component) */}
      <AlumniFilters searchParams={parsedParams} statusFilter={statusFilter as any} />

      {/* Table */}
      <AlumniTableServer
        initialData={alumni}
        metadata={metadata}
        statusFilter={statusFilter as any}
      />
    </>
  );
}

/**
 * Alumni & Graduates Page - Server Component
 *
 * Performance improvements:
 * - Data fetched on server (faster TTI)
 * - Cached with 1 hour TTL (cold cache - alumni data is relatively static)
 * - Streaming with Suspense (progressive loading)
 *
 * Features:
 * - Two tabs for different lifecycle statuses (graduated, alumni)
 * - Advanced filtering and sorting
 * - URL state management
 * - Role-based permission access
 */
export default async function AlumniPage({ searchParams }: AlumniPageProps) {
  // Await searchParams as per Next.js 16 async API
  const params = await searchParams;

  return (
    <ContentLayout title="Alumni & Graduates">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners' },
          { label: 'Alumni & Graduates' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold py-1">Alumni & Graduates</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage graduated students and alumni records
            </p>
          </div>
        </div>

        {/* Tabs with DataTables */}
        <Tabs defaultValue="graduated" className="w-full">
          <TabsList>
            <TabsTrigger value="graduated">Graduated</TabsTrigger>
            <TabsTrigger value="alumni">Alumni</TabsTrigger>
          </TabsList>

          <TabsContent value="graduated" className="space-y-4">
            <Suspense
              key={`graduated-${JSON.stringify(params)}`}
              fallback={<TableSkeleton rows={10} columns={8} />}
            >
              <AlumniContent searchParams={params} statusFilter="graduated" />
            </Suspense>
          </TabsContent>

          <TabsContent value="alumni" className="space-y-4">
            <Suspense
              key={`alumni-${JSON.stringify(params)}`}
              fallback={<TableSkeleton rows={10} columns={8} />}
            >
              <AlumniContent searchParams={params} statusFilter="alumni" />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
