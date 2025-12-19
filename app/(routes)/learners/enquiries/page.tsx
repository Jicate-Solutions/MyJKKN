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
import { enquiriesSearchParamsSchema } from './_components/data-table-schema';
import { useSearchParams } from 'next/navigation';
import { CanView } from '@/components/auth/permission-guard';

/**
 * Enquiries Page
 *
 * Displays two tabs:
 * 1. Enquiries (lifecycle_status = 'enquiry')
 * 2. Pending Applications (lifecycle_status = 'pending')
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
    <ContentLayout title="Enquiries & Applications">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners' },
          { label: 'Enquiries & Applications' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold py-1">Enquiries & Applications</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage admission enquiries and pending applications
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
          </TabsList>

          <TabsContent value="enquiries" className="space-y-4">
            <EnquiriesDataTable search={search} statusFilter="enquiry" />
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            <EnquiriesDataTable search={search} statusFilter="pending" />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
