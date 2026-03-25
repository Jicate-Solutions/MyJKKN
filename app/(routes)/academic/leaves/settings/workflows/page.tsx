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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Plus, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { WorkflowsDataTable } from './_components/workflows-data-table';
import { WorkflowFormDialog } from './_components/workflow-form-dialog';

export default function ApprovalWorkflowsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <PermissionGuard module='academic.leaves' action='manage'>
      <ContentLayout title='Approval Workflows'>
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
                <BreadcrumbPage>Approval Workflows</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Info Alert */}
          <Alert>
            <Info className='h-4 w-4' />
            <AlertTitle>How Approval Workflows Work</AlertTitle>
            <AlertDescription>
              Configure approval chains based on leave type and scope level. When a leave
              request is submitted, it will follow the defined approval chain. Higher-level
              approvers (e.g., Principal) can approve leaves that would normally require
              lower-level approval (e.g., HOD).
            </AlertDescription>
          </Alert>

          {/* Main Content */}
          <Card>
            <CardHeader>
              <div className='flex items-center justify-between'>
                <div>
                  <CardTitle>Approval Workflows</CardTitle>
                  <CardDescription>
                    Define who can approve leave requests based on type and scope
                  </CardDescription>
                </div>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className='h-4 w-4 mr-2' />
                  Add Workflow
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <WorkflowsDataTable />
            </CardContent>
          </Card>

          {/* Create Dialog */}
          <WorkflowFormDialog
            open={showCreateDialog}
            onOpenChange={setShowCreateDialog}
            mode='create'
          />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
