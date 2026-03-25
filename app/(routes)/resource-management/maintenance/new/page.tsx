// app/(routes)/resource-management/maintenance/new/page.tsx
'use client';

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
import { Wrench } from 'lucide-react';
import { MaintenanceForm } from '../_components/maintenance-form';
import { useCreateMaintenanceLog } from '@/hooks/resource-management/use-maintenance';
import { useAuth } from '@/hooks/use-auth';
import type { CreateMaintenanceLogDto } from '@/types/maintenance';

export default function NewMaintenancePage() {
  const router = useRouter();
  const { profile: user } = useAuth();
  const createLog = useCreateMaintenanceLog();

  const handleSubmit = async (data: CreateMaintenanceLogDto) => {
    if (!user?.id) {
      throw new Error('User not authenticated');
    }

    await createLog.mutateAsync({
      dto: data,
      userId: user.id
    });

    router.push('/resource-management/maintenance');
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <ContentLayout title='New Maintenance'>
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
          <BreadcrumbPage>New</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='mb-6'>
        <h1 className='text-3xl font-bold flex items-center gap-2'>
          <Wrench className='h-8 w-8' />
          Create New Maintenance Log
        </h1>
        <p className='text-muted-foreground mt-2'>
          Schedule a new maintenance activity for a resource
        </p>
      </div>

      <div className='max-w-5xl'>
        <MaintenanceForm onSubmit={handleSubmit} onCancel={handleCancel} />
      </div>
    </ContentLayout>
  );
}
