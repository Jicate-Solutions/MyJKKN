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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useLeave } from '@/hooks/academic/use-leaves';
import { format } from 'date-fns';
import { Pencil, Calendar, Users, Clock } from 'lucide-react';
import Link from 'next/link';

export default function LeaveDetailPage() {
  const params = useParams();
  const leaveId = params.id as string;
  const { leave, loading, error } = useLeave(leaveId);

  if (loading) {
    return (
      <ContentLayout title='Leave Details'>
        <div className='space-y-6'>
          <Skeleton className='h-8 w-64' />
          <Card>
            <CardContent className='p-6 space-y-4'>
              <Skeleton className='h-6 w-48' />
              <Skeleton className='h-20 w-full' />
              <Skeleton className='h-6 w-64' />
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  if (error || !leave) {
    return (
      <ContentLayout title='Leave Details'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error || 'Leave not found'}</p>
        </div>
      </ContentLayout>
    );
  }

  const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    approved: 'default',
    pending: 'secondary',
    rejected: 'destructive',
    cancelled: 'outline'
  };

  return (
    <PermissionGuard module='academic.leaves' action='view'>
      <ContentLayout title='Leave Details'>
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
                <BreadcrumbPage>{leave.leave_name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
          <div className='flex items-start justify-between'>
            <div className='space-y-1'>
              <div className='flex items-center gap-3'>
                <span
                  className='w-4 h-4 rounded-full'
                  style={{
                    backgroundColor: leave.leave_type?.color_code || '#6B7280'
                  }}
                />
                <h1 className='text-2xl font-bold'>{leave.leave_name}</h1>
                <Badge
                  variant={statusVariant[leave.status]}
                  className='capitalize'
                >
                  {leave.status}
                </Badge>
              </div>
              {leave.leave_type && (
                <p className='text-muted-foreground'>
                  {leave.leave_type.leave_type_name}
                </p>
              )}
            </div>
            {leave.status === 'pending' && (
              <Button asChild>
                <Link href={`/academic/leaves/${leave.id}/edit`}>
                  <Pencil className='h-4 w-4 mr-2' />
                  Edit
                </Link>
              </Button>
            )}
          </div>

          <div className='grid gap-6 lg:grid-cols-3'>
            {/* Main Details */}
            <Card className='lg:col-span-2'>
              <CardHeader>
                <CardTitle>Leave Details</CardTitle>
              </CardHeader>
              <CardContent className='space-y-6'>
                {/* Description */}
                {leave.description && (
                  <div>
                    <h4 className='text-sm font-medium text-muted-foreground mb-2'>
                      Description
                    </h4>
                    <p>{leave.description}</p>
                  </div>
                )}

                {/* Date Range */}
                <div className='flex items-start gap-3'>
                  <Calendar className='h-5 w-5 text-muted-foreground mt-0.5' />
                  <div>
                    <h4 className='font-medium'>Date Range</h4>
                    <p className='text-muted-foreground'>
                      {format(new Date(leave.start_date), 'PPP')}
                      {leave.start_date !== leave.end_date && (
                        <> - {format(new Date(leave.end_date), 'PPP')}</>
                      )}
                    </p>
                  </div>
                </div>

                {/* Scope */}
                <div className='flex items-start gap-3'>
                  <Users className='h-5 w-5 text-muted-foreground mt-0.5' />
                  <div>
                    <h4 className='font-medium'>Scope</h4>
                    <Badge variant='secondary' className='capitalize mt-1'>
                      {leave.scope_level}
                    </Badge>
                    {leave.scope_level !== 'institution' && (
                      <div className='mt-2 text-sm text-muted-foreground'>
                        {leave.scope_level === 'department' &&
                          leave.department_ids &&
                          `${leave.department_ids.length} department(s) selected`}
                        {leave.scope_level === 'semester' &&
                          leave.semester_ids &&
                          `${leave.semester_ids.length} semester(s) selected`}
                        {leave.scope_level === 'section' &&
                          leave.section_ids &&
                          `${leave.section_ids.length} section(s) selected`}
                      </div>
                    )}
                  </div>
                </div>

                {/* Rejection Reason */}
                {leave.status === 'rejected' && leave.rejection_reason && (
                  <div className='p-4 bg-destructive/10 rounded-lg'>
                    <h4 className='font-medium text-destructive'>
                      Rejection Reason
                    </h4>
                    <p className='text-sm mt-1'>{leave.rejection_reason}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sidebar */}
            <div className='space-y-6'>
              {/* Request Info */}
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>Request Info</CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <div>
                    <p className='text-sm text-muted-foreground'>Requested By</p>
                    <p className='font-medium'>
                      {leave.requested_by_profile?.full_name || '-'}
                    </p>
                  </div>
                  <div>
                    <p className='text-sm text-muted-foreground'>Created</p>
                    <p className='font-medium'>
                      {format(new Date(leave.created_at), 'PPP p')}
                    </p>
                  </div>
                  {leave.approved_by_profile && (
                    <div>
                      <p className='text-sm text-muted-foreground'>Approved By</p>
                      <p className='font-medium'>
                        {leave.approved_by_profile.full_name}
                      </p>
                    </div>
                  )}
                  {leave.approved_at && (
                    <div>
                      <p className='text-sm text-muted-foreground'>Approved At</p>
                      <p className='font-medium'>
                        {format(new Date(leave.approved_at), 'PPP p')}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Approval History */}
              {leave.approvals && leave.approvals.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className='text-base'>Approval History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='space-y-3'>
                      {leave.approvals.map((approval, index) => (
                        <div
                          key={index}
                          className='flex items-start gap-3 text-sm'
                        >
                          <Clock className='h-4 w-4 text-muted-foreground mt-0.5' />
                          <div>
                            <p className='font-medium'>
                              {approval.approver?.full_name || 'Unknown'}
                            </p>
                            <p className='text-muted-foreground capitalize'>
                              {approval.action}
                              {approval.acted_at &&
                                ` on ${format(
                                  new Date(approval.acted_at),
                                  'MMM d, yyyy'
                                )}`}
                            </p>
                            {approval.comments && (
                              <p className='text-muted-foreground mt-1'>
                                "{approval.comments}"
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
