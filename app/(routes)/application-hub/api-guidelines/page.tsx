import { Metadata } from 'next';
import ApiGuidelinesContent from './_components/api-guidelines-content';
import OrganizationApiDocs from './_components/organization-api-docs';
import StudentsApiDocs from './_components/students-api-docs';
import StaffApiDocs from './_components/staff-api-docs';
import CurlDocumentationContent from './_components/curl-documentation-content';
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
import { ApiNav } from './_components/api-nav';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const metadata: Metadata = {
  title: 'API Guidelines | Organization Management',
  description:
    'API documentation and guidelines for accessing organization data'
};

export default function ApiGuidelinesPage() {
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
            API guidelines for accessing organization and student data
          </p>
        </div>
        <ApiNav />

        <Tabs defaultValue='basic'>
          <TabsList>
            <TabsTrigger value='basic'>Basic Guide</TabsTrigger>
            <TabsTrigger value='organization'>Organizations API</TabsTrigger>
            <TabsTrigger value='students'>Students API</TabsTrigger>
            <TabsTrigger value='staff'>Staff API</TabsTrigger>
            <TabsTrigger value='curl'>CURL Documentation</TabsTrigger>
          </TabsList>
          <TabsContent value='basic'>
            <Card className='p-6'>
              <ApiGuidelinesContent />
            </Card>
          </TabsContent>
          <TabsContent value='organization'>
            <Card className='p-6'>
              <OrganizationApiDocs />
            </Card>
          </TabsContent>
          <TabsContent value='students'>
            <Card className='p-6'>
              <StudentsApiDocs />
            </Card>
          </TabsContent>
          <TabsContent value='staff'>
            <Card className='p-6'>
              <StaffApiDocs />
            </Card>
          </TabsContent>
          <TabsContent value='curl'>
            <Card className='p-6'>
              <CurlDocumentationContent />
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
