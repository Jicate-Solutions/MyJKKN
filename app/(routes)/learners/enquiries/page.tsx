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
  // safeParse never throws — on failure, fall back to empty object so page still renders.
  const parseResult = enquiriesSearchParamsSchema.safeParse(searchParams);
  const parsedParams = parseResult.success
    ? parseResult.data
    : enquiriesSearchParamsSchema.parse({});

  const page = parsedParams.page ?? 1;
  const limit = parsedParams.pageSize ?? Number(searchParams.limit) ?? 10;
  const search = parsedParams.search;
  const institution_id = parsedParams.institution_id;
  const degree_id = parsedParams.degree_id;
  const department_id = parsedParams.department_id;
  // Default to newest-first by created_at so freshly added enquiries surface
  // at the top of the list. Users can still click any column header to override.
  const sortBy = parsedParams.sort_by || 'created_at';
  const sortOrder = parsedParams.sort_order || 'desc';

  // getEnquiries is guaranteed not to throw — returns empty result on failure.
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
 * - Tabs mirroring the lifecycle stages (enquiry → enquiry_submitted → account →
 *   reserved → admitted → active), plus exception tabs for legacy / waitlisted / rejected
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

        {/* Tabs ordered to match the workflow stages (left-to-right). */}
        <Tabs defaultValue="enquiry" className="w-full">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="enquiry">Enquiry</TabsTrigger>
            <TabsTrigger value="enquiry_submitted">Enquiry Submitted</TabsTrigger>
            <TabsTrigger value="fees_setup_pending">Fees Setup Pending</TabsTrigger>
            <TabsTrigger value="pending">Pending Applications</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="reserved">Reserved</TabsTrigger>
            <TabsTrigger value="admitted">Admitted</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="waitlisted">Waitlisted</TabsTrigger>
          </TabsList>

          <TabsContent value="enquiry" className="space-y-4">
            <Suspense
              key={`enquiry-${JSON.stringify(params)}`}
              fallback={<TableSkeleton rows={10} columns={8} />}
            >
              <EnquiriesContent searchParams={params} statusFilter="enquiry" />
            </Suspense>
          </TabsContent>

          <TabsContent value="enquiry_submitted" className="space-y-4">
            <Suspense
              key={`enquiry_submitted-${JSON.stringify(params)}`}
              fallback={<TableSkeleton rows={10} columns={8} />}
            >
              <EnquiriesContent searchParams={params} statusFilter="enquiry_submitted" />
            </Suspense>
          </TabsContent>

          <TabsContent value="fees_setup_pending" className="space-y-4">
            <Suspense
              key={`fees-setup-${JSON.stringify(params)}`}
              fallback={<TableSkeleton rows={10} columns={10} />}
            >
              {/*
                statusFilter is a virtual value handled specially by getEnquiries:
                filter expands to lifecycle_status='enquiry' AND legacy_fee_mode=true,
                and rows are annotated with resolution_status + missing_fields from
                vw_learners_profile_fee_backfill_status so the table can show badges.
              */}
              <EnquiriesContent
                searchParams={params}
                statusFilter={'fees_setup_pending' as any}
              />
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

          <TabsContent value="account" className="space-y-4">
            <Suspense
              key={`account-${JSON.stringify(params)}`}
              fallback={<TableSkeleton rows={10} columns={8} />}
            >
              <EnquiriesContent searchParams={params} statusFilter="account" />
            </Suspense>
          </TabsContent>

          <TabsContent value="reserved" className="space-y-4">
            <Suspense
              key={`reserved-${JSON.stringify(params)}`}
              fallback={<TableSkeleton rows={10} columns={8} />}
            >
              <EnquiriesContent searchParams={params} statusFilter="reserved" />
            </Suspense>
          </TabsContent>

          <TabsContent value="admitted" className="space-y-4">
            <Suspense
              key={`admitted-${JSON.stringify(params)}`}
              fallback={<TableSkeleton rows={10} columns={8} />}
            >
              <EnquiriesContent searchParams={params} statusFilter="admitted" />
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
