// ============================================
// ENQUIRY DETAIL PAGE (SERVER COMPONENT)
// ============================================
// Created: 2025-01-18
// Updated: 2025-12-25 - Converted to server component with Cache Components
// Purpose: Display comprehensive enquiry details
// ============================================

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { getEnquiry } from '../_data/get-enquiry';
import { EnquiryDetail } from '../_components/enquiry-detail';
import { EnquiryDetailActions } from '../_components/enquiry-detail-actions';

interface EnquiryDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Enquiry Detail Page - Server Component
 *
 * Performance improvements:
 * - Data fetched on server (faster TTI)
 * - Cached with 5 minute TTL (warm cache)
 * - No client-side loading states
 */
export default async function EnquiryDetailPage({ params }: EnquiryDetailPageProps) {
  // Await params as per Next.js 16 async API
  const { id } = await params;

  // UUID validation
  const isValidUUID = (str: string) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };

  if (!isValidUUID(id)) {
    return (
      <ContentLayout title="Enquiry Details">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Page Not Found</h2>
          <p className="text-muted-foreground mb-4">
            Invalid enquiry ID format. The page "{id}" does not exist.
          </p>
          <Button asChild>
            <Link href="/learners/enquiries">Back to Enquiries</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // Fetch data on server with caching
  let enquiry;
  try {
    enquiry = await getEnquiry(id);
  } catch (error) {
    console.error('[learners/enquiries/[id]] Error fetching enquiry:', error);
    return (
      <ContentLayout title="Enquiry Details">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Error Loading Enquiry</h2>
          <p className="text-muted-foreground mb-4">
            {error instanceof Error ? error.message : 'Failed to fetch enquiry details'}
          </p>
          <Button asChild>
            <Link href="/learners/enquiries">Back to Enquiries</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!enquiry) {
    return (
      <ContentLayout title="Enquiry Details">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Enquiry Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The requested enquiry could not be found.
          </p>
          <Button asChild>
            <Link href="/learners/enquiries">Back to Enquiries</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout
      title={`Enquiry: ${enquiry.first_name} ${enquiry.last_name || ''}`.trim()}
    >
      <div className="space-y-6">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Enquiries', href: '/learners/enquiries' },
            {
              label: `${enquiry.first_name} ${enquiry.last_name || ''}`.trim(),
            },
          ]}
        />

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {`${enquiry.first_name} ${enquiry.last_name || ''}`.trim()}
            </h1>
            <p className="text-muted-foreground">
              {enquiry.application_id || 'No Application ID'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/learners/enquiries">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <EnquiryDetailActions enquiry={enquiry} />
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <EnquiryDetail enquiry={enquiry} />
        </div>
      </div>
    </ContentLayout>
  );
}
