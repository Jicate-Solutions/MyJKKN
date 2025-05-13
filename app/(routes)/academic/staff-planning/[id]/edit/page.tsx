'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card } from '@/components/ui/card';
import { StaffPlanForm } from '../../_components/staff-plan-form';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';
import Loading from '@/components/Loading/Loading';

interface EditStaffPlanPageProps {
  params: Promise<{ id: string }>;
}

export default function EditStaffPlanPage({ params }: EditStaffPlanPageProps) {
  const { id } = use(params);
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(true);
  const router = useRouter();
  const { toast } = useToast();
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canEditStaffPlans =
    isSuperAdmin || canAccess('academic.staff.planning', 'edit');

  useEffect(() => {
    if (!permissionsLoading) {
      console.log('Can edit staff plans:', canEditStaffPlans);
      console.log('Permissions check:', {
        isSuperAdmin,
        'academic.staff.planning.edit': canAccess(
          'academic.staff.planning',
          'edit'
        )
      });

      if (!canEditStaffPlans) {
        toast({
          title: 'Access Denied',
          description: 'You do not have permission to edit staff plans.',
          variant: 'destructive'
        });
        router.push('/academic/staff-planning');
      }
      setIsCheckingPermissions(false);
    }
  }, [
    permissionsLoading,
    canEditStaffPlans,
    router,
    toast,
    isSuperAdmin,
    canAccess
  ]);

  if (permissionsLoading || isCheckingPermissions) {
    return <Loading title='Loading...' />;
  }

  if (!canEditStaffPlans) {
    return <Loading title='Redirecting...' />;
  }

  return (
    <ContentLayout title='Edit Staff Plan'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/academic'>Academic</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/academic/staff-planning'>Staff Planning</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit Staff Plan</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Edit Staff Plan</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Update staff plan details and course assignments
          </p>
        </div>

        <Card className='p-6'>
          <StaffPlanForm id={id} isEditing />
        </Card>
      </div>
    </ContentLayout>
  );
}
