// app/(routes)/organizations/departments/[id]/edit/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Department } from '@/types/organizations';
import { OrganizationService } from '@/lib/services/organization-service';
import { ContentLayout } from '@/components/layout/content-layout';
import { DepartmentForm } from '../../_components/department-form';
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

interface EditDepartmentPageProps {
  params: Promise<{ id: string }>;
}

export default function EditDepartmentPage({
  params
}: EditDepartmentPageProps) {
  const router = useRouter();
  const { id } = use(params);
  const [department, setDepartment] = useState<Department | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDepartment = async () => {
      if (!id) return;

      try {
        setLoading(true);
        const data = await OrganizationService.getDepartmentById(id);
        if (!data) {
          throw new Error('Department not found');
        }
        setDepartment(data);
      } catch (err) {
        console.error('Error fetching department:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load department'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchDepartment();
  }, [id]);

  if (loading) {
    return (
      <ContentLayout title='Edit Department'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !department) {
    return (
      <ContentLayout title='Edit Department'>
        <div className='flex flex-col items-center justify-center min-h-[400px]'>
          <p className='text-destructive text-lg mb-4'>
            {error || 'Department not found'}
          </p>
          <Button onClick={() => router.back()}>Go Back</Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Edit Department'>
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
              <Link href='/organizations/departments'>Departments</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit {department.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6'>
        <div>
          <h1 className='text-3xl font-bold'>Edit {department.name}</h1>
          <p className='text-muted-foreground'>Update department details</p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <DepartmentForm department={department} isEditing={true} />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
