// app/(routes)/applications/[id]/edit/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { ApplicationForm } from '../../_components/application-form';
import { ApplicationService } from '@/lib/services/application/application-service';
import { Application } from '@/types/applications';
import { BeatLoader } from 'react-spinners';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';

interface EditApplicationPageProps {
  params: Promise<{ id: string }>;
}

export default function EditApplicationPage({
  params
}: EditApplicationPageProps) {
  const router = useRouter();
  const { id } = use(params);
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchApplication = async () => {
      try {
        const data = await ApplicationService.getApplicationById(id);
        setApplication(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load application'
        );
        console.error('Error fetching application:', err);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchApplication();
    }
  }, [id]);

  if (loading) {
    return (
      <ContentLayout title='Edit Application'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Edit Application'>
        <div className='text-center text-destructive min-h-[400px] flex flex-col justify-center'>
          <p className='text-lg'>{error}</p>
          <button
            onClick={() => router.push('/applications')}
            className='text-sm text-muted-foreground hover:text-primary mt-4'
          >
            Return to Applications
          </button>
        </div>
      </ContentLayout>
    );
  }

  if (!application) {
    return (
      <ContentLayout title='Edit Application'>
        <div className='text-center min-h-[400px] flex flex-col justify-center'>
          <p className='text-lg'>Application not found</p>
          <button
            onClick={() => router.push('/applications')}
            className='text-sm text-muted-foreground hover:text-primary mt-4'
          >
            Return to Applications
          </button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Application'>
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
              <Link href='/applications'>Applications</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit {application.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6'>
        <div>
          <h1 className='text-3xl font-bold'>Edit {application.name}</h1>
          <p className='text-sm text-muted-foreground'>
            Update application details and settings
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <ApplicationForm initialData={application} isEditing={true} />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
