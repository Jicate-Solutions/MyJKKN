import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { StaffPlanFiltersClient } from './_components/staff-plan-filters-client';
import { StaffPlanningDataTable } from './_components/staff-planning-data-table';
import { HolidaysEventsSection } from './_components/holidays-events-section';
import { SharedTeachingLabelSection } from './_components/shared-teaching-label-section';
import { staffPlanningSearchParamsSchema } from './_components/data-table-schema';

interface StaffPlanningPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function StaffPlanningPage({ searchParams }: StaffPlanningPageProps) {
  const params = await searchParams;
  const search = staffPlanningSearchParamsSchema.parse(params);

  return (
    <PermissionGuard module='academic.staff.planning' action='view'>
      <ContentLayout title='Staff Planning'>
        <div className='space-y-6'>
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
                  <Link href='/academic'>Academic</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Staff Planning</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <HolidaysEventsSection institutionId={search.institution_id} />

          <SharedTeachingLabelSection institutionId={search.institution_id} />

          <Card>
            <CardContent className='p-6'>
              <div className='space-y-6'>
                <StaffPlanFiltersClient searchParams={search} />
                <StaffPlanningDataTable search={search} />
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
