'use client';

import { useState, useEffect } from 'react';
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
import { toast as hotToast } from 'react-hot-toast';
import { PeriodForm } from '../_components/period-form';
import { usePermissions } from '@/hooks/use-permissions';
import Loading from '@/components/Loading/Loading';
import { CreatePeriodDto } from '@/types/academics';

export default function NewPeriodPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { createPeriod } = usePeriods();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(true);
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading,
    userProfile
  } = usePermissions();

  const canCreatePeriods =
    isSuperAdmin || canAccess('academic.periods', 'create');

  useEffect(() => {
    if (!permissionsLoading) {
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

  const handleSubmit = async (
    data: Omit<CreatePeriodDto, 'institution_id'> & { institution_id?: string }
  ) => {
    setIsSubmitting(true);
    try {
      if (!isSuperAdmin && !userProfile?.institution_id) {
        toast({
          title: 'Profile Incomplete',
          description:
            'Your profile is missing an institution. Please contact an administrator to set your institution before creating periods.',
          variant: 'destructive'
        });
        return;
      }

      const payload: CreatePeriodDto = {
        ...data,
        institution_id: isSuperAdmin
          ? data.institution_id!
          : userProfile!.institution_id!
      };

      await createPeriod(payload);

      router.push('/academic/periods');
    } catch (error: any) {
      console.error('Error creating period:', error);

      // Check for specific database constraint errors
      if (
        error?.code === '23514' ||
        error?.message?.includes('period_start_before_end')
      ) {
        hotToast.error(
          'End time must be after start time. Please check your time selection.'
        );
      } else if (
        error?.code === '23505' ||
        error?.message?.includes('duplicate')
      ) {
        hotToast.error(
          'A period with this name already exists for this institution.'
        );
      } else if (error?.message?.includes('violates check constraint')) {
        hotToast.error(
          'Invalid period configuration. Please check your inputs.'
        );
      } else {
        hotToast.error(
          error instanceof Error
            ? error.message
            : 'Failed to create period. Please try again.'
        );
      }
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
