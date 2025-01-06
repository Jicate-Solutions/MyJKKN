'use client';

import { use } from 'react';
import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card } from '@/components/ui/card';
import { StaffPlanForm } from '../../_components/staff-plan-form';

interface EditStaffPlanPageProps {
  params: Promise<{ id: string }>;
}

export default function EditStaffPlanPage({ params }: EditStaffPlanPageProps) {
  const resolvedParams = use(params);

  return (
    <ContentLayout title='Edit Staff Plan'>
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
              <Link href='/academic/staff-planning'>Academic</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/academic/staff-planning'>Staff Planning</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit Staff Plan</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Edit Staff Plan</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Update staff plan details and course assignments
          </p>
        </div>

        <Card className='p-6'>
          <StaffPlanForm isEditing id={resolvedParams.id} />
        </Card>
      </div>
    </ContentLayout>
  );
}
