'use client';

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
import { LeaveTypesDataTable } from './_components/leave-types-data-table';
import { LeaveTypeFormDialog } from './_components/leave-type-form-dialog';

export default function LeaveTypesPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <PermissionGuard module='academic.leaves' action='manage'>
      <ContentLayout title='Leave Types'>
        <div className='space-y-6'>
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/academic'>Academic</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/academic/leaves'>Leaves</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/academic/leaves/settings'>Settings</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Leave Types</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Main Content */}
          <Card>
            <CardContent className='p-6'>
              <div className='space-y-6'>
                {/* Header */}
                <div className='flex items-center justify-between'>
                  <div>
                    <h2 className='text-lg font-semibold'>Leave Types</h2>
                    <p className='text-sm text-muted-foreground'>
                      Manage leave categories for your institution
                    </p>
                  </div>
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className='h-4 w-4 mr-2' />
                    Add Leave Type
                  </Button>
                </div>

                {/* Data Table */}
                <LeaveTypesDataTable />
              </div>
            </CardContent>
          </Card>

          {/* Create Dialog */}
          <LeaveTypeFormDialog
            open={showCreateDialog}
            onOpenChange={setShowCreateDialog}
            mode='create'
          />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
