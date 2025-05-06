'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { Card, CardContent } from '@/components/ui/card';
import { AdmissionForm } from '../_components/admission-form';
import { usePermissions } from '@/hooks/use-permissions';
import { BeatLoader } from 'react-spinners';

export default function NewAdmissionPage() {
  const router = useRouter();
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  // Get permissions with waitForLoad option to ensure they're fully loaded
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });

  // Define access permissions
  const canCreateAdmissions = isSuperAdmin || canAccess('admissions', 'create');

  // Track when permissions are loaded
  useEffect(() => {
    if (!permissionsLoading) {
      console.log('New Admission permissions debug:', {
        isSuperAdmin,
        canCreateAdmissions: canAccess('admissions', 'create')
      });
      setPermissionsLoaded(true);
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

  // Redirect if user doesn't have permission to create admissions
  useEffect(() => {
    if (permissionsLoaded && !canCreateAdmissions) {
      console.log('User does not have permission to create admissions');
      router.push('/unauthorized');
    }
  }, [permissionsLoaded, canCreateAdmissions, router]);

  // Show loading state while permissions are loading
  if (permissionsLoading || !permissionsLoaded) {
    return (
      <ContentLayout title='Add New Admission'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
          <span className='ml-2'>Loading permissions...</span>
        </div>
      </ContentLayout>
    );
  }

  // This is redundant due to the redirect above, but added for safety
  if (!canCreateAdmissions) {
    return (
      <ContentLayout title='Add New Admission'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to create admission applications
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/admissions'>Back to Admissions</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Add New Admission'>
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
              <Link href='/admissions'>Admissions</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Admission</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>New Admission Application</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Create a new student admission application
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <AdmissionForm />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
