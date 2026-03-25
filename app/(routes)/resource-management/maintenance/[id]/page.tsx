// app/(routes)/resource-management/maintenance/[id]/page.tsx
'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Edit,
  Trash2,
  Wrench,
  Calendar,
  User,
  IndianRupee,
  FileText,
  AlertCircle
} from 'lucide-react';
import {
  useMaintenanceLog,
  useDeleteMaintenanceLog,
  useCompleteMaintenanceLog,
  useCancelMaintenanceLog
} from '@/hooks/resource-management/use-maintenance';
import {
  MaintenanceType,
  MaintenanceStatus,
  MaintenancePriority
} from '@/types/maintenance';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';

interface MaintenanceDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function MaintenanceDetailPage({
  params
}: MaintenanceDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();

  const { data: log, isLoading, error } = useMaintenanceLog(id);
  const deleteLog = useDeleteMaintenanceLog();
  const completeLog = useCompleteMaintenanceLog();
  const cancelLog = useCancelMaintenanceLog();

  // Debug logging
  console.log('[MaintenanceDetailPage] ID:', id);
  console.log('[MaintenanceDetailPage] isLoading:', isLoading);
  console.log('[MaintenanceDetailPage] log:', log);
  console.log('[MaintenanceDetailPage] error:', error);

  const handleEdit = () => {
    router.push(`/resource-management/maintenance/${id}/edit`);
  };

  const handleDelete = async () => {
    await deleteLog.mutateAsync(id);
    router.push('/resource-management/maintenance');
  };

  const handleComplete = async () => {
    const today = new Date().toISOString().split('T')[0];
    await completeLog.mutateAsync({
      id,
      data: {
        completed_date: today,
        notes: 'Completed from details page'
      }
    });
  };

  const handleCancel = async () => {
    await cancelLog.mutateAsync({
      id,
      reason: 'Cancelled from details page'
    });
  };

  const getStatusBadge = (status: MaintenanceStatus) => {
    const variants: Record<MaintenanceStatus, any> = {
      [MaintenanceStatus.SCHEDULED]: 'outline',
      [MaintenanceStatus.IN_PROGRESS]: 'default',
      [MaintenanceStatus.COMPLETED]: 'default',
      [MaintenanceStatus.CANCELLED]: 'secondary',
      [MaintenanceStatus.OVERDUE]: 'destructive'
    };

    return (
      <Badge variant={variants[status]}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const getTypeBadge = (type: MaintenanceType) => {
    const colors: Record<MaintenanceType, string> = {
      [MaintenanceType.PREVENTIVE]: 'bg-blue-100 text-blue-800',
      [MaintenanceType.CORRECTIVE]: 'bg-orange-100 text-orange-800',
      [MaintenanceType.PREDICTIVE]: 'bg-purple-100 text-purple-800',
      [MaintenanceType.EMERGENCY]: 'bg-red-100 text-red-800'
    };

    return <Badge className={colors[type]}>{type.toUpperCase()}</Badge>;
  };

  const getPriorityLabel = (priority: MaintenancePriority) => {
    const labels: Record<MaintenancePriority, string> = {
      [MaintenancePriority.LOW]: 'Low',
      [MaintenancePriority.NORMAL]: 'Normal',
      [MaintenancePriority.HIGH]: 'High',
      [MaintenancePriority.CRITICAL]: 'Critical'
    };
    return labels[priority];
  };

  if (isLoading) {
    return (
      <ContentLayout title='Loading...'>
        <div className='space-y-4'>
          <Skeleton className='h-12 w-full' />
          <Skeleton className='h-64 w-full' />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Error'>
        <Card>
          <CardContent className='pt-6'>
            <div className='text-center py-12'>
              <AlertCircle className='mx-auto h-12 w-12 text-destructive mb-4' />
              <h3 className='text-lg font-semibold mb-2'>Error Loading Maintenance Log</h3>
              <p className='text-muted-foreground mb-4'>
                {error instanceof Error ? error.message : 'An error occurred while loading the maintenance log'}
              </p>
              <p className='text-xs text-muted-foreground mb-4'>ID: {id}</p>
              <Button onClick={() => router.push('/resource-management/maintenance')}>
                Back to Maintenance
              </Button>
            </div>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  if (!log) {
    return (
      <ContentLayout title='Not Found'>
        <Card>
          <CardContent className='pt-6'>
            <div className='text-center py-12'>
              <AlertCircle className='mx-auto h-12 w-12 text-muted-foreground mb-4' />
              <h3 className='text-lg font-semibold mb-2'>
                Maintenance Log Not Found
              </h3>
              <p className='text-muted-foreground mb-4'>
                The maintenance log you&apos;re looking for doesn&apos;t exist.
              </p>
              <p className='text-xs text-muted-foreground mb-4'>ID: {id}</p>
              <Button
                onClick={() => router.push('/resource-management/maintenance')}
              >
                Back to Maintenance
              </Button>
            </div>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Maintenance Details'>
      <Breadcrumb className='mb-6'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href='/resource-management'>
              Resource Management
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href='/resource-management/maintenance'>
              Maintenance
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Details</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-3xl font-bold flex items-center gap-2'>
            <Wrench className='h-8 w-8' />
            {log.title}
          </h1>
          <div className='flex items-center gap-2 mt-2'>
            {getStatusBadge(log.status)}
            {getTypeBadge(log.maintenance_type)}
            <Badge variant='outline'>
              Priority: {getPriorityLabel(log.priority)}
            </Badge>
          </div>
        </div>

        <div className='flex items-center gap-2'>
          {log.status === MaintenanceStatus.SCHEDULED && (
            <Button onClick={handleComplete} variant='default'>
              Mark Complete
            </Button>
          )}
          {log.status !== MaintenanceStatus.CANCELLED &&
            log.status !== MaintenanceStatus.COMPLETED && (
              <Button onClick={handleCancel} variant='outline'>
                Cancel
              </Button>
            )}
          <Button onClick={handleEdit} variant='outline'>
            <Edit className='mr-2 h-4 w-4' />
            Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant='destructive'>
                <Trash2 className='mr-2 h-4 w-4' />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the
                  maintenance log.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className='grid gap-6 md:grid-cols-2'>
        {/* Main Details */}
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div>
              <div className='flex items-center gap-2 text-sm text-muted-foreground mb-1'>
                <FileText className='h-4 w-4' />
                Description
              </div>
              <p className='text-sm'>{log.description}</p>
            </div>

            <Separator />

            <div>
              <div className='flex items-center gap-2 text-sm text-muted-foreground mb-1'>
                <Calendar className='h-4 w-4' />
                Scheduled Date
              </div>
              <p className='text-sm font-medium'>
                {format(new Date(log.scheduled_date), 'PPP')}
              </p>
            </div>

            {log.completed_date && (
              <>
                <Separator />
                <div>
                  <div className='flex items-center gap-2 text-sm text-muted-foreground mb-1'>
                    <Calendar className='h-4 w-4' />
                    Completed Date
                  </div>
                  <p className='text-sm font-medium'>
                    {format(new Date(log.completed_date), 'PPP')}
                  </p>
                </div>
              </>
            )}

            {log.cost && (
              <>
                <Separator />
                <div>
                  <div className='flex items-center gap-2 text-sm text-muted-foreground mb-1'>
                    <IndianRupee className='h-4 w-4' />
                    Cost
                  </div>
                  <p className='text-sm font-medium'>
                    ₹{log.cost.toLocaleString()}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Resource & User Info */}
        <Card>
          <CardHeader>
            <CardTitle>Resource & Assignment</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div>
              <div className='text-sm text-muted-foreground mb-1'>Resource</div>
              <p className='text-sm font-medium'>
                {log.resource?.name || 'N/A'}
              </p>
              {log.resource?.resource_code && (
                <p className='text-xs text-muted-foreground'>
                  Code: {log.resource.resource_code}
                </p>
              )}
            </div>

            <Separator />

            {log.assigned_to && (
              <>
                <div>
                  <div className='flex items-center gap-2 text-sm text-muted-foreground mb-1'>
                    <User className='h-4 w-4' />
                    Assigned To
                  </div>
                  <p className='text-sm font-medium'>
                    {log.assigned_to.full_name}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {log.assigned_to.email}
                  </p>
                </div>
                <Separator />
              </>
            )}

            <div>
              <div className='flex items-center gap-2 text-sm text-muted-foreground mb-1'>
                <User className='h-4 w-4' />
                Created By
              </div>
              <p className='text-sm font-medium'>
                {log.created_by_user?.full_name || 'Unknown'}
              </p>
              {log.created_by_user?.email && (
                <p className='text-xs text-muted-foreground'>
                  {log.created_by_user.email}
                </p>
              )}
            </div>

            <Separator />

            <div>
              <div className='text-sm text-muted-foreground mb-1'>
                Created At
              </div>
              <p className='text-sm'>
                {format(new Date(log.created_at), 'PPP')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        {log.notes && (
          <Card className='md:col-span-2'>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className='text-sm whitespace-pre-wrap'>{log.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
