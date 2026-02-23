import { Metadata } from 'next';
import B2AApiDocs from './_components/b2a-api-docs';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import Link from 'next/link';
import { ApiNav } from '../_components/api-nav';

export const metadata: Metadata = {
  title: 'B2A API Documentation | Application Hub',
  description:
    'Complete documentation for the Business-to-Agent (B2A) API Gateway — authentication, endpoints, code examples, and use cases.'
};

export default function B2AApiPage() {
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
            <BreadcrumbLink asChild>
              <Link href='/application-hub/api-guidelines'>API Guidelines</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>B2A API</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-2'>
        <div>
          <h1 className='text-2xl font-bold py-1'>B2A API Documentation</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Business-to-Agent API Gateway — securely expose institution data to AI agents, automation pipelines, and third-party integrations.
          </p>
        </div>
        <ApiNav />
        <B2AApiDocs />
      </div>
    </ContentLayout>
  );
}
