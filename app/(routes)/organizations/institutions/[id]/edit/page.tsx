'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { InstitutionForm } from '../../_components/institution-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { institutionKeys } from '@/hooks/organization/use-institutions';
import { useQuery } from '@tanstack/react-query';
import type { Institution } from '@/types/organizations';
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
  const { id } = use(params);
  const router = useRouter();
  const {
    data: institution,
    isLoading,
    error
  } = useQuery({
    queryKey: institutionKeys.detail(id),
    queryFn: () => OrganizationService.getInstitution(id)
  });

  if (isLoading) {
    return (
      <ContentLayout title='Edit Institution'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Edit Institution'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>{error.message}</p>
          <Button variant='outline' asChild>
            <Link href='/organizations/institutions'>Back to Institutions</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!institution) {
    return (
      <ContentLayout title='Edit Institution'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>Institution not found</p>
          <Button variant='outline' asChild>
            <Link href='/organizations/institutions'>Back to Institutions</Link>
          </Button>
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
            <BreadcrumbPage>Edit Institution</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Edit Institution</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Update institution details and department contacts
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <InstitutionForm institution={institution?.institution} isEditing={true} />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
