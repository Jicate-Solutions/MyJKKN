// app/(routes)/organizations/degrees/[id]/edit/page.tsx

'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { DegreeForm } from '../../_components/degree-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
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

interface EditDegreePageProps {
  params: Promise<{ id: string }>;
}

export default function EditDegreePage({ params }: EditDegreePageProps) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [degree, setDegree] = useState<Degree | null>(null);

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

  if (loading) {
    return (
      <ContentLayout title='Edit Degree'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !degree) {
    return (
      <ContentLayout title='Edit Degree'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>{error || 'Degree not found'}</p>
          <Button variant='outline' asChild>
            <Link href='/organizations/degrees'>Back to Degrees</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Degree'>
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
              <Link href='/organizations/degrees'>Degrees</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit Degree</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Edit Degree</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Update degree details
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <DegreeForm degree={degree} isEditing={true} />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
