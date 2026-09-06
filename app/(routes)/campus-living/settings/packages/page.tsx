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
import { PackagesDataTable } from './_components/packages-data-table';
import { PackageFormDialog } from './_components/package-form-dialog';

export default function AdmissionPackagesPage() {
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
        <ContentLayout title='Admission Packages'>
          <PermissionError
            message='Campus Living settings are restricted to hostel administrators.'
            requiredPermission='campus_living.settings.view'
          />
        </ContentLayout>
      }
    >
      <ContentLayout title='Admission Packages'>
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
              <BreadcrumbPage>Admission Packages</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card>
          <CardContent className='p-6'>
            <div className='space-y-6'>
              <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                <div>
                  <h2 className='text-lg font-semibold'>Admission Packages</h2>
                  <p className='text-sm text-muted-foreground'>
                    Define eligibility dimensions (institution, degree, programme, quota, community, gender)
                    and the bundled room + mess category for each package.
                  </p>
                </div>
                <Button onClick={() => setShowCreateDialog(true)} className='shrink-0'>
                  <Plus className='h-4 w-4 mr-2' />
                  Add Package
                </Button>
              </div>

              <PackagesDataTable />
            </div>
          </CardContent>
        </Card>

        <PackageFormDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          mode='create'
        />
      </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
