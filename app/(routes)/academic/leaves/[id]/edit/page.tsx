'use client';

import { useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { LeaveForm } from '../../_components/leave-form';
import { useLeave } from '@/hooks/academic/use-leaves';

export default function EditLeavePage() {
  const params = useParams();
  const leaveId = params.id as string;
  const { leave, loading, error } = useLeave(leaveId);

  if (loading) {
    return (
      <ContentLayout title='Edit Leave'>
        <div className='space-y-6'>
          <Skeleton className='h-8 w-64' />
          <Card>
            <CardContent className='p-6 space-y-4'>
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-20 w-full' />
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  if (error || !leave) {
    return (
      <ContentLayout title='Edit Leave'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error || 'Leave not found'}</p>
        </div>
      </ContentLayout>
    );
  }

  if (leave.status !== 'pending') {
    return (
      <ContentLayout title='Edit Leave'>
        <div className='text-center py-8'>
          <p className='text-muted-foreground'>
            Only pending leaves can be edited
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <PermissionGuard module='academic.leaves' action='edit'>
      <ContentLayout title='Edit Leave'>
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
                <BreadcrumbLink href={`/academic/leaves/${leave.id}`}>
                  {leave.leave_name}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Edit</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Form Card */}
          <Card>
            <CardHeader>
              <CardTitle>Edit Leave</CardTitle>
            </CardHeader>
            <CardContent>
              <LeaveForm leave={leave} mode='edit' />
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
