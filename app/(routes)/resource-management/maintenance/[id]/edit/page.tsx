// app/(routes)/resource-management/maintenance/[id]/edit/page.tsx
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
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Wrench, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MaintenanceForm } from '../../_components/maintenance-form';
import {
  useMaintenanceLog,
  useUpdateMaintenanceLog
} from '@/hooks/resource-management/use-maintenance';
import type { CreateMaintenanceLogDto } from '@/types/maintenance';

interface EditMaintenancePageProps {
  params: Promise<{ id: string }>;
}

export default function EditMaintenancePage({
  params
}: EditMaintenancePageProps) {
  const { id } = use(params);
  const router = useRouter();

  const { data: log, isLoading } = useMaintenanceLog(id);
  const updateLog = useUpdateMaintenanceLog();

  const handleSubmit = async (data: CreateMaintenanceLogDto) => {
    await updateLog.mutateAsync({
      id,
      dto: data
    });

    router.push(`/resource-management/maintenance/${id}`);
  };

  const handleCancel = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <ContentLayout title='Loading...'>
        <div className='space-y-4'>
          <Skeleton className='h-12 w-full' />
          <Skeleton className='h-96 w-full' />
        </div>
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
                The maintenance log you&apos;re trying to edit doesn&apos;t
                exist.
              </p>
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

  // Transform log data to match form schema
  const initialData: CreateMaintenanceLogDto = {
    resource_id: log.resource_id,
    maintenance_type: log.maintenance_type,
    title: log.title,
    description: log.description,
    scheduled_date: log.scheduled_date,
    priority: log.priority,
    assigned_to_user_id: log.assigned_to_user_id || undefined,
    cost: log.cost || undefined,
    notes: log.notes || '',
    attachments: log.attachments || []
  };

  return (
    <ContentLayout title='Edit Maintenance'>
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
          <BreadcrumbItem>
            <BreadcrumbLink href={`/resource-management/maintenance/${id}`}>
              Details
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Edit</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='mb-6'>
        <h1 className='text-3xl font-bold flex items-center gap-2'>
          <Wrench className='h-8 w-8' />
          Edit Maintenance Log
        </h1>
        <p className='text-muted-foreground mt-2'>
          Update the maintenance activity details
        </p>
      </div>

      <div className='max-w-3xl'>
        <MaintenanceForm
          initialData={initialData}
          isEditing={true}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      </div>
    </ContentLayout>
  );
}
