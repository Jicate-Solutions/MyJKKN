'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { usePeriods } from '@/hooks/academic/use-periods';
import { useToast } from '@/hooks/use-toast';
import { PeriodForm } from '../_components/period-form';
import { usePermissions } from '@/hooks/use-permissions';
import { useEffect, useState as useStateImport } from 'react';
import Loading from '@/components/Loading/Loading';

export default function NewPeriodPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { createPeriod } = usePeriods();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(true);
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canCreatePeriods =
    isSuperAdmin || canAccess('academic.periods', 'create');

  useEffect(() => {
    // Only proceed with permission check when permissions have loaded
    if (!permissionsLoading) {
      // Debug to console to verify permissions
      console.log('Can create periods:', canCreatePeriods);
      console.log('Permissions check:', {
        isSuperAdmin,
        'academic.periods.create': canAccess('academic.periods', 'create')
      });

      if (!canCreatePeriods) {
        toast({
          title: 'Access Denied',
          description: 'You do not have permission to create periods.',
          variant: 'destructive'
        });
        router.push('/academic/periods');
      }
      setIsCheckingPermissions(false);
    }
  }, [
    permissionsLoading,
    canCreatePeriods,
    router,
    toast,
    isSuperAdmin,
    canAccess
  ]);

  if (permissionsLoading || isCheckingPermissions) {
    return <Loading title='Loading...' />;
  }

  if (!canCreatePeriods) {
    return <Loading title='Redirecting...' />;
  }

  const handleSubmit = async (data: {
    period_name: string;
    start_time: string;
    end_time: string;
    is_break: boolean;
  }) => {
    setIsSubmitting(true);
    try {
      const success = await createPeriod(data);
      if (success) {
        toast({
          title: 'Period created',
          description: 'The period has been created successfully.'
        });
        router.push('/academic/periods');
      }
    } catch (error) {
      console.error('Error creating period:', error);
      toast({
        title: 'Error',
        description: 'Failed to create period. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ContentLayout title='Create Period'>
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
              <Link href='/academic/periods'>Periods</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Create</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex items-center'>
          <Button variant='ghost' size='icon' className='mr-2' asChild>
            <Link href='/academic/periods'>
              <ArrowLeft className='h-4 w-4' />
            </Link>
          </Button>
          <h1 className='text-2xl font-bold'>Create New Period</h1>
        </div>

        <div className='max-w-5xl'>
          <PeriodForm isSubmitting={isSubmitting} onSubmit={handleSubmit} />
        </div>
      </div>
    </ContentLayout>
  );
}
