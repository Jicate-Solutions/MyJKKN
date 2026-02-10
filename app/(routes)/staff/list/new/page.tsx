// app/(routes)/staff/new/page.tsx

'use client';

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
  const { canAccess, isSuperAdmin, can } = usePermissions([], {
    waitForLoad: true
  });

  useEffect(() => {
    // Debug permissions

    setLoading(false);
  }, [canAccess, isSuperAdmin, can]);

  const canCreateStaff = isSuperAdmin || canAccess('staff', 'create');

  if (loading) {
    return (
      <ContentLayout title='New Staff'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='New Staff'>
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
              <Link href='/staff/list'>Staff List</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Staff</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>New Staff</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Add a new staff member
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
