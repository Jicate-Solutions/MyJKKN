/**
 * Academic Year Details Page - Server Component with Cache Components
 *
 * POC: Demonstrates server-side rendering with caching for detail pages
 */

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { getAcademicYear } from './_data/get-academic-year';
import { AcademicYearHeader } from './_components/academic-year-header';
import { AcademicYearDetails } from './_components/academic-year-details';

interface AcademicYearDetailsPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Main Academic Year Details Page - Server Component
 *
 * Performance improvements:
 * - Data fetched on server (faster TTI)
 * - Cached with 1 day TTL (instant subsequent loads)
 * - Static data perfect for long caching
 */
export default async function AcademicYearDetailsPage({
  params
}: AcademicYearDetailsPageProps) {
  // Await params as per Next.js 16 async API
  const { id } = await params;

  // Fetch data on server with caching
  const academicYear = await getAcademicYear(id);

  return (
    <ContentLayout title="Academic Year Details">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/academic">Academic</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/academic/years">Academic Years</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Academic Year Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        {/* Header with edit button (Client Component for permissions) */}
        <AcademicYearHeader academicYear={academicYear} />

        {/* Details card (Server Component) */}
        <AcademicYearDetails academicYear={academicYear} />
      </div>
    </ContentLayout>
  );
}
