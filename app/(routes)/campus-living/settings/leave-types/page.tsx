'use client';

// Campus-living leave types settings page.
// REPLACES the 88-line mock ghost page that shipped 2026-02 with PR #190.
// The old page rendered hardcoded array data with dead Add/Save/Edit buttons
// — a classic silent-failure (no useQuery, no service, no persistence).
// This version actually persists to public.hostel_leave_types (created by
// migration 20260421000005_hostel_leave_types_crudable.sql in this PR).

import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Plus } from 'lucide-react';
import { HostelLeaveTypesDataTable } from './_components/hostel-leave-types-data-table';
import { HostelLeaveTypeFormDialog } from './_components/hostel-leave-type-form-dialog';

export default function HostelLeaveTypesPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <PermissionGuard module='campus_living.leave_types' action='view'>
      <ContentLayout title='Hostel Leave Types'>
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
                <BreadcrumbPage>Leave Types</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Card>
            <CardContent className='p-6'>
              <div className='space-y-6'>
                <div className='flex items-center justify-between'>
                  <div>
                    <h2 className='text-lg font-semibold'>Leave Types</h2>
                    <p className='text-sm text-muted-foreground'>
                      Configure leave categories for hostelers — max duration, parent
                      consent, warden approval flow, attachment requirements. System
                      defaults (7 types) are seeded per institution and cannot be deleted.
                    </p>
                  </div>
                  <PermissionGuard
                    module='campus_living.leave_types'
                    action='create'
                    fallback={null}
                  >
                    <Button onClick={() => setShowCreateDialog(true)}>
                      <Plus className='h-4 w-4 mr-2' />
                      Add Leave Type
                    </Button>
                  </PermissionGuard>
                </div>

                <HostelLeaveTypesDataTable />
              </div>
            </CardContent>
          </Card>

          <HostelLeaveTypeFormDialog
            open={showCreateDialog}
            onOpenChange={setShowCreateDialog}
            mode='create'
          />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
