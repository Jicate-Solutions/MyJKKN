'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { SectionForm } from '../_components/section-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';

export default function NewSectionPage() {
  const { canAccess, isSuperAdmin, isLoading, userProfile } = usePermissions();

  // Check permissions
  const canCreateSections =
    isSuperAdmin || canAccess('organizations.sections', 'create');

  // Show loading state while permissions are being checked
  if (isLoading) {
    return (
      <ContentLayout title='New Section'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <div className='text-center'>
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4'></div>
            <p className='text-muted-foreground'>Loading...</p>
          </div>
        </div>
      </ContentLayout>
    );
  }

  // Show permission denied error
  if (!canCreateSections) {
    return (
      <ContentLayout title='New Section'>
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
                <Link href='/organizations'>Organizations</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/organizations/sections'>Sections</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>New Section</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='mt-8'>
          <Card>
            <CardContent className='p-8 text-center'>
              <div className='flex flex-col items-center justify-center space-y-4'>
                <div className='rounded-full bg-yellow-100 p-3'>
                  <AlertTriangle className='h-8 w-8 text-yellow-600' />
                </div>
                <div className='space-y-2'>
                  <h3 className='text-lg font-semibold'>Permission Denied</h3>
                  <p className='text-muted-foreground max-w-md'>
                    You don&apos;t have permission to create sections. Please
                    contact your administrator to request the necessary
                    permissions.
                  </p>
                  <div className='text-sm text-muted-foreground mt-4'>
                    <p>
                      <strong>Required Permission:</strong>{' '}
                      organizations.sections.create
                    </p>
                    <p>
                      <strong>Your Role:</strong>{' '}
                      {userProfile?.role || 'Unknown'}
                    </p>
                  </div>
                </div>
                <Button asChild>
                  <Link href='/organizations/sections'>
                    <ArrowLeft className='mr-2 h-4 w-4' />
                    Back to Sections
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  // Show institution error for faculty users
  if (!isSuperAdmin && !userProfile?.institution_id) {
    return (
      <ContentLayout title='New Section'>
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
                <Link href='/organizations'>Organizations</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href='/organizations/sections'>Sections</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>New Section</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='mt-8'>
          <Card>
            <CardContent className='p-8 text-center'>
              <div className='flex flex-col items-center justify-center space-y-4'>
                <div className='rounded-full bg-red-100 p-3'>
                  <AlertTriangle className='h-8 w-8 text-red-600' />
                </div>
                <div className='space-y-2'>
                  <h3 className='text-lg font-semibold'>Institution Not Set</h3>
                  <p className='text-muted-foreground max-w-md'>
                    Your profile doesn&apos;t have an institution assigned.
                    Please contact your administrator to update your profile
                    with an institution.
                  </p>
                </div>
                <Button asChild>
                  <Link href='/organizations/sections'>
                    <ArrowLeft className='mr-2 h-4 w-4' />
                    Back to Sections
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='New Section'>
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
              <Link href='/organizations'>Organizations</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/organizations/sections'>Sections</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Section</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>New Section</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Add a new section
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <SectionForm />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
