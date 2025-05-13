'use client';

import { useState, useEffect } from 'react';
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
import { StaffPlanForm } from '../_components/staff-plan-form';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';
import Loading from '@/components/Loading/Loading';
import { Button } from '@/components/ui/button';

export default function NewStaffPlanPage() {
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(true);
  const router = useRouter();
  const { toast } = useToast();
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canCreateStaffPlans =
    isSuperAdmin || canAccess('academic.staff.planning', 'create');

  useEffect(() => {
    if (!permissionsLoading) {
      console.log('Can create staff plans:', canCreateStaffPlans);
      console.log('Permissions check:', {
        isSuperAdmin,
        'academic.staff.planning.create': canAccess(
          'academic.staff.planning',
          'create'
        )
      });

      if (!canCreateStaffPlans) {
        toast({
          title: 'Access Denied',
          description: 'You do not have permission to create staff plans.',
          variant: 'destructive'
        });
        router.push('/academic/staff-planning');
      }
      setIsCheckingPermissions(false);
    }
  }, [
    permissionsLoading,
    canCreateStaffPlans,
    router,
    toast,
    isSuperAdmin,
    canAccess
  ]);

  if (permissionsLoading || isCheckingPermissions) {
    return <Loading title='Loading...' />;
  }

  if (!canCreateStaffPlans) {
    return <Loading title='Redirecting...' />;
  }

  return (
    <ContentLayout title='Create Staff Plan'>
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
            <BreadcrumbPage>Create Staff Plan</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Create Staff Plan</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Create a new staff plan with course assignments
          </p>
        </div>

        <Card className='p-6'>
          <StaffPlanForm />
        </Card>
      </div>
    </ContentLayout>
  );
}
