'use client';

// app/(routes)/organizations/departments/[id]/edit/page.tsx


import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { DepartmentForm } from '../../_components/department-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { DepartmentService } from '@/lib/services/organization/department-service';
import type { Department } from '@/types/organizations';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';

interface EditDepartmentPageProps {
  params: Promise<{ id: string }>;
}

export default function EditDepartmentPage({
  params
}: EditDepartmentPageProps) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const adapt = useAdaptiveLabels();
  const pageTitle = adapt('Edit Department');

  useEffect(() => {
    async function fetchDepartment() {
      try {
        setLoading(true);
        setError(null);
        const data = await DepartmentService.getDepartment(id);
        setDepartment(data);
      } catch (err) {
        console.error('Error fetching department:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch department'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchDepartment();
  }, [id]);

  if (loading) {
    return (
      <ContentLayout title={pageTitle}>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !department) {
    return (
      <ContentLayout title={pageTitle}>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>
            {error || `${adapt('Department')} not found`}
          </p>
          <Button variant='outline' asChild>
            <Link href='/organizations/departments'>Back to {adapt('Departments')}</Link>
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
              <Link href='/organizations/departments'>{adapt('Departments')}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>{pageTitle}</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Update {adapt('department')} details
          </p>
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
