// app/(routes)/organizations/institutions/[id]/edit/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import Link from 'next/link';
import { Institution } from '@/types/organizations';
import { OrganizationService } from '@/lib/services/organization-service';
import { ContentLayout } from '@/components/layout/content-layout';
import { InstitutionForm } from '../../_components/institution-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BeatLoader } from 'react-spinners';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';

interface EditInstitutionPageProps {
  params: Promise<{ id: string }>;
}

export default function EditInstitutionPage({
  params
}: EditInstitutionPageProps) {
  const router = useRouter();
  const { id } = use(params);
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInstitution = async () => {
      if (!id) return;

      try {
        setLoading(true);
        const data = await OrganizationService.getInstitutionWithDepartments(
          id
        );
        if (!data) {
          throw new Error('Institution not found');
        }
        setInstitution(data);
      } catch (err) {
        console.error('Error fetching institution:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load institution'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchInstitution();
  }, [id]);

  if (loading) {
    return (
      <ContentLayout title='Edit Institution'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !institution) {
    return (
      <ContentLayout title='Edit Institution'>
        <div className='flex flex-col items-center justify-center min-h-[400px]'>
          <p className='text-destructive text-lg mb-4'>
            {error || 'Institution not found'}
          </p>
          <Button onClick={() => router.back()}>Go Back</Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Institution'>
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
              <Link href='/organizations/institutions'>Institutions</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit {institution.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6'>
        <div>
          <h1 className='text-3xl font-bold'>Edit {institution.name}</h1>
          <p className='text-muted-foreground'>Update institution details</p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <InstitutionForm institution={institution} isEditing={true} />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
