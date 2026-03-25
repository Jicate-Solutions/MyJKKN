// app/(routes)/resource-management/resources/[id]/edit/page.tsx

'use client';

import { useEffect, useState } from 'react';
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
import { ResourceForm } from '../../_components/resource-form';
import { ResourceService } from '@/lib/services/resource-management/resource-service';
import type { Resource } from '@/types/resource-management';
import { usePermissions } from '@/hooks/use-permissions';
import Loading from '@/components/Loading/Loading';
import { Button } from '@/components/ui/button';

interface EditResourcePageProps {
  params: Promise<{ id: string }>;
}

export default function EditResourcePage({ params }: EditResourcePageProps) {
  const { canAccess, isSuperAdmin } = usePermissions();
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resourceId, setResourceId] = useState<string | null>(null);

  const canEditResources =
    isSuperAdmin || canAccess('resources.resources', 'edit');

  // Unwrap params
  useEffect(() => {
    params.then((resolvedParams) => {
      setResourceId(resolvedParams.id);
    });
  }, [params]);

  // Fetch resource data
  useEffect(() => {
    const fetchResource = async () => {
      if (!resourceId) return;

      try {
        setLoading(true);
        setError(null);
        const resourceData = await ResourceService.getResource(resourceId);
        setResource(resourceData);
      } catch (err) {
        console.error('Error fetching resource:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch resource'
        );
      } finally {
        setLoading(false);
      }
    };

    if (resourceId && canEditResources) {
      fetchResource();
    }
  }, [resourceId, canEditResources]);

  if (!canEditResources) {
    return <Loading title='Loading...' />;
  }

  if (loading) {
    return <Loading title='Loading resource...' />;
  }

  if (error) {
    return (
      <ContentLayout title='Edit Resource'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => window.location.reload()}
            className='mt-4'
          >
            Try Again
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!resource) {
    return (
      <ContentLayout title='Edit Resource'>
        <div className='text-center py-8'>
          <p className='text-muted-foreground'>Resource not found</p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/resource-management/resources'>Back to Resources</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Resource'>
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
            <BreadcrumbLink asChild>
              <Link href={`/resource-management/resources/${resource.id}`}>
                {resource.name}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Edit Resource</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Update the details for {resource.name}
          </p>
        </div>

        <ResourceForm resource={resource} mode='edit' />
      </div>
    </ContentLayout>
  );
}
