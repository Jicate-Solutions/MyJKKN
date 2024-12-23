import { Metadata } from 'next';
import EndpointsContent from './_components/endpoints-content';
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
import Link from 'next/link';
import { ApiNav } from '../_components/api-nav';

export const metadata: Metadata = {
  title: 'API Endpoints | Organization Management',
  description: 'Available API endpoints for accessing organization data'
};

export default function EndpointsPage() {
  return (
    <ContentLayout title='Application Hub'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>API Guidelines</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-2'>
        <div>
          <h1 className='text-2xl font-bold py-1'>API Guidelines</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            API guidelines for accessing organization data
          </p>
        </div>
        <ApiNav />
        <Card className='p-6'>
          <EndpointsContent />
        </Card>
      </div>
    </ContentLayout>
  );
}
