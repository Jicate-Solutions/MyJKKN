// ============================================
// ENQUIRIES MODULE - LIST PAGE (SERVER COMPONENT)
// ============================================
// Created: 2025-01-18
// Updated: 2025-12-25 - Converted to server component with Cache Components
// Purpose: List and manage learner enquiries and pending applications
// ============================================

import { Suspense } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EnquiriesTableServer } from './_components/enquiries-table-server';
import { EnquiriesFilters } from './_components/enquiries-filters';
import { EnquiriesSearchWrapper } from './_components/enquiries-search-wrapper';
import { enquiriesSearchParamsSchema } from './_components/data-table-schema';
import { EnquiriesHeader } from './_components/enquiries-header';
import { getEnquiries } from './_data/get-enquiries';
import { TableSkeleton } from '@/components/Loading';
import type { LifecycleStatus } from '@/types/learner-profile';

interface EnquiriesPageProps {
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}

/**
 * Async component that fetches and displays enquiries data
 */
async function EnquiriesContent({
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
  const sortBy = (searchParams.sort_by as string) || 'created_at';
  const sortOrder = (searchParams.sort_order as 'asc' | 'desc') || 'desc';

  // Fetch data on server with caching
  const { data: enquiries, metadata } = await getEnquiries({
    page,
    limit,
    search,
    lifecycle_status: statusFilter,
    institution_id,
    degree_id,
    department_id,
    sortBy,
    sortOrder
  });

  const parsedParams = enquiriesSearchParamsSchema.parse(searchParams);

  return (
    <>
      {/* Advanced Search */}
      <div className="mb-4">
        <EnquiriesSearchWrapper statusFilter={statusFilter as any} />
      </div>

      {/* Filters (Client Component) */}
      <EnquiriesFilters searchParams={parsedParams} statusFilter={statusFilter as any} />

      {/* Table */}
      <EnquiriesTableServer
        initialData={enquiries}
        metadata={metadata}
        statusFilter={statusFilter as any}
      />
    </>
  );
}

/**
 * Admission Management Page - Server Component
 *
 * Performance improvements:
 * - Data fetched on server (faster TTI)
 * - Cached with 5 minute TTL (warm cache)
 * - Streaming with Suspense (progressive loading)
 *
 * Features:
 * - Four tabs for different lifecycle statuses (enquiry, pending, rejected, waitlisted)
 * - Advanced filtering and sorting
 * - Bulk operations
 * - URL state management
 * - Role-based permission access
 */
export default async function EnquiriesPage({ searchParams }: EnquiriesPageProps) {
  // Await searchParams as per Next.js 16 async API
  const params = await searchParams;

  return (
    <ContentLayout title="Admission Management">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners' },
          { label: 'Admission Management' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header with Import/Export functionality */}
        <EnquiriesHeader />

        {/* Tabs with DataTables */}
        <Tabs defaultValue="enquiries" className="w-full">
          <TabsList>
            <TabsTrigger value="enquiries">Enquiries</TabsTrigger>
            <TabsTrigger value="pending">Pending Applications</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="waitlisted">Waitlisted</TabsTrigger>
          </TabsList>

          <TabsContent value="enquiries" className="space-y-4">
            <Suspense
              key={`enquiry-${JSON.stringify(params)}`}
              fallback={<TableSkeleton rows={10} columns={8} />}
            >
              <EnquiriesContent searchParams={params} statusFilter="enquiry" />
            </Suspense>
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            <Suspense
              key={`pending-${JSON.stringify(params)}`}
              fallback={<TableSkeleton rows={10} columns={8} />}
            >
              <EnquiriesContent searchParams={params} statusFilter="pending" />
            </Suspense>
          </TabsContent>

          <TabsContent value="rejected" className="space-y-4">
            <Suspense
              key={`rejected-${JSON.stringify(params)}`}
              fallback={<TableSkeleton rows={10} columns={8} />}
            >
              <EnquiriesContent searchParams={params} statusFilter="rejected" />
            </Suspense>
          </TabsContent>

          <TabsContent value="waitlisted" className="space-y-4">
            <Suspense
              key={`waitlisted-${JSON.stringify(params)}`}
              fallback={<TableSkeleton rows={10} columns={8} />}
            >
              <EnquiriesContent searchParams={params} statusFilter="waitlisted" />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
