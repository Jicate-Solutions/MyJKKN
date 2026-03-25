// app/(routes)/organizations/departments/[id]/page.tsx

'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PenSquare } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/use-permissions';

interface DepartmentDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function DepartmentDetailsPage({
  params
}: DepartmentDetailsPageProps) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);

  // Get permissions
  const { canAccess, isSuperAdmin } = usePermissions();
  const canEditDepartment =
    isSuperAdmin || canAccess('organizations.departments', 'edit');

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
      <ContentLayout title='Department Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !department) {
    return (
      <ContentLayout title='Department Details'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>
            {error || 'Department not found'}
          </p>
          <Button variant='outline' asChild>
            <Link href='/organizations/departments'>Back to Departments</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Department Details'>
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
            <BreadcrumbPage>Department Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex justify-between items-center'>
          <div>
            <h1 className='text-2xl font-bold py-1'>
              {department.department_name}
            </h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Department Details
            </p>
          </div>
          {canEditDepartment ? (
            <Button asChild>
              <Link href={`/organizations/departments/${id}/edit`}>
                <PenSquare className='mr-2 h-4 w-4' />
                Edit Department
              </Link>
            </Button>
          ) : (
            <Button disabled variant='outline'>
              <PenSquare className='mr-2 h-4 w-4' />
              Edit Department
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
                <p className='font-medium'>Department Code</p>
                <p className='text-base text-muted-foreground'>
                  {department.department_code}
                </p>
              </div>
              <div>
                <p className='font-medium'>Department Name</p>
                <p className='text-base text-muted-foreground'>
                  {department.department_name}
                </p>
              </div>
              <div>
                <p className='font-medium'>Display Name</p>
                <p className='text-base text-muted-foreground'>
                  {department.display_name || '-'}
                </p>
              </div>
              <div>
                <p className='font-medium'>Display Order</p>
                <p className='text-base text-muted-foreground'>
                  {department.department_order}
                </p>
              </div>
              <div>
                <p className='font-medium'>Status</p>
                <Badge variant={department.is_active ? 'default' : 'secondary'}>
                  {department.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div>
                <p className='font-medium'>Degree</p>
                <p className='text-base text-muted-foreground'>
                  {department.degree?.degree_name}
                </p>
              </div>
              <div className='md:col-span-2'>
                <p className='font-medium'>Institution</p>
                <p className='text-base text-muted-foreground'>
                  {department.institution?.name} (
                  {department.institution?.counselling_code})
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
