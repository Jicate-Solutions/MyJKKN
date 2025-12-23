// ============================================
// LEARNERS PROFILES MODULE - LIST PAGE
// ============================================
// Created: 2025-01-19
// Purpose: List and manage active learner profiles
// ============================================

'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Plus, Upload } from 'lucide-react';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfilesDataTable } from './_components/profiles-data-table';
import { ProfilesFilters } from './_components/profiles-filters';
import { profilesSearchParamsSchema } from './_components/data-table-schema';
import { useSearchParams } from 'next/navigation';
import { CanView } from '@/components/auth/permission-guard';
import { CreateMissingProfilesButton } from './_components/create-missing-profiles-button';
import { BulkUploadProfilesDialog } from './_components/bulk-upload-profiles-dialog';
import { BulkEditActiveDialog } from './_components/bulk-edit-exited-dialog';
import { usePermissions } from '@/hooks/use-permissions';

/**
 * Learners Management Page
 *
 * Displays three tabs for different lifecycle statuses:
 * 1. Active (lifecycle_status = 'active')
 * 2. Inactive (lifecycle_status = 'inactive')
 * 3. Exited (lifecycle_status = 'exited')
 *
 * Features:
 * - TanStack Table with server-side pagination
 * - Advanced filtering and sorting
 * - Bulk operations (promotion, bulk edit)
 * - URL state management
 * - Role-based permission access
 */
export default function ProfilesPage() {
  const searchParams = useSearchParams();
  const { isSuperAdmin, can } = usePermissions();

  const search = profilesSearchParamsSchema.parse(
    Object.fromEntries(searchParams.entries())
  );

  // Permission checks
  const canSyncProfiles = isSuperAdmin || can('learners.profiles.sync');
  const canBulkUpload = isSuperAdmin || can('learners.profiles.bulk_upload');
  const canBulkEditActive = isSuperAdmin || can('learners.profiles.bulk_edit') || can('learners.edit');

  return (
    <ContentLayout title="Learners Management">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners' },
          { label: 'Learners Management' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold py-1">Learners Management</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage currently enrolled and active student profiles
            </p>
          </div>

          <div className="flex gap-2">
            {canSyncProfiles && <CreateMissingProfilesButton />}
            {canBulkUpload && <BulkUploadProfilesDialog />}
            {canBulkEditActive && <BulkEditActiveDialog />}

            <CanView module="learners.promotion.view">
              <Button variant="outline" asChild>
                <Link href="/learners/profiles/promotion">
                  <Upload className="mr-2 h-4 w-4" />
                  Student Promotion
                </Link>
              </Button>
            </CanView>
          </div>
        </div>

        {/* Tabs with DataTables */}
        <Tabs defaultValue="active" className="w-full">
          <TabsList>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="inactive">Inactive</TabsTrigger>
            <TabsTrigger value="exited">Exited</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            <ProfilesFilters searchParams={search} statusFilter="active" />
            <ProfilesDataTable search={search} statusFilter="active" />
          </TabsContent>

          <TabsContent value="inactive" className="space-y-4">
            <ProfilesFilters searchParams={search} statusFilter="inactive" />
            <ProfilesDataTable search={search} statusFilter="inactive" />
          </TabsContent>

          <TabsContent value="exited" className="space-y-4">
            <ProfilesFilters searchParams={search} statusFilter="exited" />
            <ProfilesDataTable search={search} statusFilter="exited" />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
