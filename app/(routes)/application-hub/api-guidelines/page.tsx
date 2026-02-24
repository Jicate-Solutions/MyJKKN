import { Metadata } from 'next';
import ApiGuidelinesContent from './_components/api-guidelines-content';
import OrganizationApiDocs from './_components/organization-api-docs';
import LearnersApiDocs from '@/components/api-documentation/learners-api-docs';
import AcademicApiDocs from '@/components/api-documentation/academic-api-docs';
import StaffApiDocs from './_components/staff-api-docs';
import CurlDocumentationContent from './_components/curl-documentation-content';
import ChildAppIntegrationDocs from './_components/child-app-integration-docs';
import { ApiModuleLayout } from '@/components/api-docs';
import { organizationsModuleConfig } from '@/lib/data/api-endpoints/organizations';
import { learnersModuleConfig } from '@/lib/data/api-endpoints/learners';
import { campusLivingModuleConfig } from '@/lib/data/api-endpoints/campus-living';
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
          <TabsList className='w-full h-auto flex flex-wrap gap-1 p-1 lg:grid lg:grid-cols-8 lg:gap-0'>
            <TabsTrigger value='basic'>Basic Guide</TabsTrigger>
            <TabsTrigger value='child-app'>Child App Integration</TabsTrigger>
            <TabsTrigger value='organization'>Organizations API</TabsTrigger>
            <TabsTrigger value='learners'>Learners API</TabsTrigger>
            <TabsTrigger value='campus-living'>Campus Living API</TabsTrigger>
            <TabsTrigger value='academic'>Academic API</TabsTrigger>
            <TabsTrigger value='staff'>Staff API</TabsTrigger>
            <TabsTrigger value='curl'>CURL Documentation</TabsTrigger>
          </TabsList>
          <TabsContent value='basic'>
            <Card className='p-6'>
              <ApiGuidelinesContent />
            </Card>
          </TabsContent>
          <TabsContent value='child-app'>
            <Card className='p-6'>
              <ChildAppIntegrationDocs />
            </Card>
          </TabsContent>
          <TabsContent value='organization'>
            <Card className='p-6'>
              <ApiModuleLayout config={organizationsModuleConfig} />
            </Card>
          </TabsContent>
          <TabsContent value='learners'>
            <Card className='p-6'>
              <ApiModuleLayout config={learnersModuleConfig} />
            </Card>
          </TabsContent>
          <TabsContent value='academic'>
            <Card className='p-6'>
              <AcademicApiDocs />
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
