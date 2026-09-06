'use client';

// app/(routes)/organizations/degrees/[id]/page.tsx


import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PenSquare } from 'lucide-react';
import { DegreeService } from '@/lib/services/organization/degree-service';
import type { Degree } from '@/types/organizations';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/use-permissions';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';

interface DegreeDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function DegreeDetailsPage({ params }: DegreeDetailsPageProps) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [degree, setDegree] = useState<Degree | null>(null);

  // Get permissions
  const { canAccess, isSuperAdmin } = usePermissions();
  const adapt = useAdaptiveLabels();
  const canEditDegree =
    isSuperAdmin || canAccess('organizations.degrees', 'edit');

  useEffect(() => {
    async function fetchDegree() {
      try {
        setLoading(true);
        setError(null);
        const data = await DegreeService.getDegree(id);
        setDegree(data);
      } catch (err) {
        console.error('Error fetching degree:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch degree');
      } finally {
        setLoading(false);
      }
    }

    fetchDegree();
  }, [id]);

  const pageTitle = adapt('Degree Details');

  if (loading) {
    return (
      <ContentLayout title={pageTitle}>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !degree) {
    return (
      <ContentLayout title={pageTitle}>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>{error || `${adapt('Degree')} not found`}</p>
          <Button variant='outline' asChild>
            <Link href='/organizations/degrees'>Back to {adapt('Degrees')}</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={pageTitle}>
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
              <Link href='/organizations/degrees'>{adapt('Degrees')}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='text-2xl font-bold py-1'>{degree.degree_name}</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              {pageTitle}
            </p>
          </div>
          {canEditDegree ? (
            <Button asChild>
              <Link href={`/organizations/degrees/${id}/edit`}>
                <PenSquare className='mr-2 h-4 w-4' />
                {adapt('Edit Degree')}
              </Link>
            </Button>
          ) : (
            <Button disabled variant='outline'>
              <PenSquare className='mr-2 h-4 w-4' />
              {adapt('Edit Degree')}
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-6'>
            <div className='grid gap-4 md:grid-cols-2'>
              <div>
                <p className='font-medium'>{adapt('Degree ID')}</p>
                <p className='text-base text-muted-foreground'>
                  {degree.degree_id}
                </p>
              </div>
              <div>
                <p className='font-medium'>{adapt('Degree Name')}</p>
                <p className='text-base text-muted-foreground'>
                  {degree.degree_name}
                </p>
              </div>
              <div>
                <p className='font-medium'>Display Name</p>
                <p className='text-base text-muted-foreground'>
                  {degree.display_name || '-'}
                </p>
              </div>
              <div>
                <p className='font-medium'>Display Order</p>
                <p className='text-base text-muted-foreground'>
                  {degree.degree_order}
                </p>
              </div>
              <div>
                <p className='font-medium'>Type</p>
                <Badge variant='secondary'>
                  {degree.degree_type.toUpperCase()}
                </Badge>
              </div>
              <div>
                <p className='font-medium'>Status</p>
                <Badge variant={degree.is_active ? 'default' : 'secondary'}>
                  {degree.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className='md:col-span-2'>
                <p className='font-medium'>Institution</p>
                <p className='text-base text-muted-foreground'>
                  {degree.institution?.name} (
                  {degree.institution?.counselling_code})
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
