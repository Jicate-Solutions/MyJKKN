'use client';
// app/(routes)/staff/new/page.tsx


import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { StaffForm } from '../_components/staff-form';
import { usePermissions } from '@/hooks/use-permissions';
import { Loader2 } from 'lucide-react';

export default function NewStaffPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const { canAccess, isSuperAdmin } = usePermissions([], {
    waitForLoad: true
  });

  const canCreateStaff = isSuperAdmin || canAccess('staff', 'create');

  useEffect(() => {
    setLoading(false);
    if (!canCreateStaff) {
      router.replace('/unauthorized');
    }
  }, [canCreateStaff, router]);

  if (loading || !canCreateStaff) {
    return (
      <ContentLayout title='New Employee'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='New Employee'>
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
              <Link href='/staff/list'>Employee List</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Employee</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>New Employee</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Add a new employee
          </p>
        </div>

        <Card>
          <CardContent className='p-6'>
            <StaffForm />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
