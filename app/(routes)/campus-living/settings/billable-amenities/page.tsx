'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PermissionError } from '@/components/errors/permission-error';
import { BillableAmenitiesDataTable } from './_components/billable-amenities-data-table';
import { BillableAmenityFormDialog } from './_components/billable-amenity-form-dialog';

export default function BillableAmenitiesPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    // Authorization gate (added 2026-06-16): this settings sub-page previously
    // had NO in-page permission guard and relied on Supabase RLS only, so a
    // direct-URL visitor without a campus-living settings role wasn't
    // access-controlled in the page itself. Gate on `campus_living.settings.view`
    // (defined in lib/constants/permissions.ts; the same section key
    // /campus-living/settings maps to in MENU_PERMISSIONS). Fail-closed:
    // PermissionGuard renders the fallback on deny and nothing while loading;
    // super-admins bypass. Explicit denial, never a silent redirect (rule #27).
    <PermissionGuard
      module='campus_living.settings'
      action='view'
      fallback={
        <ContentLayout title='Billable Amenities'>
          <PermissionError
            message='Campus Living settings are restricted to hostel administrators.'
            requiredPermission='campus_living.settings.view'
          />
        </ContentLayout>
      }
    >
      <ContentLayout title='Billable Amenities'>
      <div className='space-y-6'>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href='/campus-living'>Campus Living</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href='/campus-living/settings'>Settings</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Billable Amenities</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card>
          <CardContent className='p-6'>
            <div className='space-y-6'>
              <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                <div>
                  <h2 className='text-lg font-semibold'>Billable Amenities</h2>
                  <p className='text-sm text-muted-foreground'>
                    Manage amenities that carry a monthly fee (AC, premium
                    services). Each has a fee calculation model and commitment
                    terms.
                  </p>
                </div>
                <Button className='shrink-0' onClick={() => setShowCreateDialog(true)}>
                  <Plus className='h-4 w-4 mr-2' />
                  Add Billable Amenity
                </Button>
              </div>

              <BillableAmenitiesDataTable />
            </div>
          </CardContent>
        </Card>

        <BillableAmenityFormDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          mode='create'
        />
      </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
