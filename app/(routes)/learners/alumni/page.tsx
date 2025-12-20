// ============================================
// ALUMNI & GRADUATES MODULE - LIST PAGE
// ============================================
// Created: 2025-01-19
// Purpose: List and manage graduated students and alumni
// ============================================

'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlumniDataTable } from './_components/alumni-data-table';
import { AlumniFilters } from './_components/alumni-filters';
import { alumniSearchParamsSchema } from './_components/data-table-schema';
import { useSearchParams } from 'next/navigation';

/**
 * Alumni & Graduates Page
 *
 * Displays two tabs for different lifecycle statuses:
 * 1. Graduated (lifecycle_status = 'graduated')
 * 2. Alumni (lifecycle_status = 'alumni')
 *
 * Features:
 * - TanStack Table with server-side pagination
 * - Advanced filtering and sorting
 * - URL state management
 * - Role-based permission access
 */
export default function AlumniPage() {
  const searchParams = useSearchParams();

  const search = alumniSearchParamsSchema.parse(
    Object.fromEntries(searchParams.entries())
  );

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
            <AlumniFilters searchParams={search} statusFilter="graduated" />
            <AlumniDataTable search={search} statusFilter="graduated" />
          </TabsContent>

          <TabsContent value="alumni" className="space-y-4">
            <AlumniFilters searchParams={search} statusFilter="alumni" />
            <AlumniDataTable search={search} statusFilter="alumni" />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
