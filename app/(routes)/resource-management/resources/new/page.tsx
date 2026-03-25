// app/(routes)/resource-management/resources/new/page.tsx

'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ResourceForm } from '../_components/resource-form';
import { usePermissions } from '@/hooks/use-permissions';
import Loading from '@/components/Loading/Loading';

export default function NewResourcePage() {
  const { canAccess, isSuperAdmin } = usePermissions();

  const canCreateResources =
    isSuperAdmin || canAccess('resources.resources', 'create');

  if (!canCreateResources) {
    return <Loading title='Loading...' />;
  }

  return (
    <ContentLayout title='Create Resource'>
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
              <Link href='/resource-management'>Resource Management</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resource-management/resources'>Resources</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Create New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Create Resource</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Add a new resource to your institution
          </p>
        </div>

        <ResourceForm mode='create' />
      </div>
    </ContentLayout>
  );
}
