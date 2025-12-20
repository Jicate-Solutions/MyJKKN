// ============================================
// ENQUIRIES MODULE - LIST PAGE
// ============================================
// Created: 2025-01-18
// Purpose: List and manage learner enquiries and pending applications
// ============================================

'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EnquiriesDataTable } from './_components/enquiries-data-table';
import { EnquiriesFilters } from './_components/enquiries-filters';
import { enquiriesSearchParamsSchema } from './_components/data-table-schema';
import { useSearchParams } from 'next/navigation';
import { CanView } from '@/components/auth/permission-guard';

/**
 * Admission Management Page
 *
 * Displays four tabs for different lifecycle statuses:
 * 1. Enquiries (lifecycle_status = 'enquiry')
 * 2. Pending Applications (lifecycle_status = 'pending')
 * 3. Rejected (lifecycle_status = 'rejected')
 * 4. Waitlisted (lifecycle_status = 'waitlisted')
 *
 * Features:
 * - TanStack Table with server-side pagination
 * - Advanced filtering and sorting
 * - Bulk operations
 * - URL state management
 * - Role-based permission access
 */
export default function EnquiriesPage() {
  const searchParams = useSearchParams();

  const search = enquiriesSearchParamsSchema.parse(
    Object.fromEntries(searchParams.entries())
  );

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
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold py-1">Admission Management</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage admission lifecycle: enquiries, pending applications, rejections, and waitlist
            </p>
          </div>

          <CanView module="learners.create">
            <Button asChild>
              <Link href="/learners/enquiries/new">
                <Plus className="mr-2 h-4 w-4" />
                New Enquiry
              </Link>
            </Button>
          </CanView>
        </div>

        {/* Tabs with DataTables */}
        <Tabs defaultValue="enquiries" className="w-full">
          <TabsList>
            <TabsTrigger value="enquiries">Enquiries</TabsTrigger>
            <TabsTrigger value="pending">Pending Applications</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="waitlisted">Waitlisted</TabsTrigger>
          </TabsList>

          <TabsContent value="enquiries" className="space-y-4">
            <EnquiriesFilters searchParams={search} statusFilter="enquiry" />
            <EnquiriesDataTable search={search} statusFilter="enquiry" />
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            <EnquiriesFilters searchParams={search} statusFilter="pending" />
            <EnquiriesDataTable search={search} statusFilter="pending" />
          </TabsContent>

          <TabsContent value="rejected" className="space-y-4">
            <EnquiriesFilters searchParams={search} statusFilter="rejected" />
            <EnquiriesDataTable search={search} statusFilter="rejected" />
          </TabsContent>

          <TabsContent value="waitlisted" className="space-y-4">
            <EnquiriesFilters searchParams={search} statusFilter="waitlisted" />
            <EnquiriesDataTable search={search} statusFilter="waitlisted" />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
