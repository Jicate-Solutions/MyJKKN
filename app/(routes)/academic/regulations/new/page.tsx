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
import { useRegulations } from '@/hooks/academic/use-regulations';
import toast, { toast as hotToast } from 'react-hot-toast';
import { RegulationForm } from '../_components/regulation-form';
import { usePermissions } from '@/hooks/use-permissions';
import Loading from '@/components/Loading/Loading';
import { CreateRegulationDto } from '@/types/academics';
import { logger } from '@/lib/utils/enhanced-logger';


export default function NewRegulationPage() {
  const router = useRouter();
 
  const { createRegulation } = useRegulations();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(true);
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading,
    userProfile
  } = usePermissions();

  const canCreateRegulations =
    isSuperAdmin || canAccess('academic.regulations', 'create');

  useEffect(() => {
    if (!permissionsLoading) {
      if (!canCreateRegulations) {
        toast.error('You do not have permission to create regulations.');
        router.push('/academic/regulations');
      }
      setIsCheckingPermissions(false);
    }
  }, [
    permissionsLoading,
    canCreateRegulations,
    router,
    isSuperAdmin,
    canAccess
  ]);

  if (permissionsLoading || isCheckingPermissions) {
    return <Loading title='Loading...' />;
  }

  if (!canCreateRegulations) {
    return <Loading title='Redirecting...' />;
  }

  const handleSubmit = async (
    data: Omit<CreateRegulationDto, 'institution_id'> & { institution_id?: string }
  ) => {
    setIsSubmitting(true);
    try {
      if (!isSuperAdmin && !userProfile?.institution_id) {
        toast.error(
          'Your profile is missing an institution. Please contact an administrator.'
        );
        return;
      }

      const payload: CreateRegulationDto = {
        ...data,
        institution_id: isSuperAdmin
          ? data.institution_id!
          : userProfile!.institution_id!
      };

      await createRegulation(payload);

      router.push('/academic/regulations');
      toast.success('Regulation created successfully!');

    } catch (error: any) {
      logger.error('academic/regulations', 'Error creating regulation', error);

      if (error?.code === '23505' || error?.message?.includes('duplicate')) {
        hotToast.error(
          'A regulation with this code already exists for this institution.'
        );
      } else {
        hotToast.error(
          error instanceof Error
            ? error.message
            : 'Failed to create regulation. Please try again.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ContentLayout title='Create Regulation'>
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
              <Link href='/academic/regulations'>Regulations</Link>
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
            <Link href='/academic/regulations'>
              <ArrowLeft className='h-4 w-4' />
            </Link>
          </Button>
          <h1 className='text-2xl font-bold'>Create New Regulation</h1>
        </div>

        <div className='max-w-5xl'>
          <RegulationForm isSubmitting={isSubmitting} onSubmit={handleSubmit} />
        </div>
      </div>
    </ContentLayout>
  );
}
