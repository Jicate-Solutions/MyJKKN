// ============================================
// ENQUIRY DETAIL PAGE
// ============================================
// Created: 2025-01-18
// Updated: 2025-01-19 - Comprehensive layout matching student details
// Purpose: View learner enquiry details with sidebar navigation
// ============================================

'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { LifecycleStatusBadge } from '@/components/learners/lifecycle-status-badge';
import { useLearnerProfile } from '@/hooks/use-learner-profiles';
import EnquiryDetailSkeleton from '../_components/enquiry-detail-skeleton';
import { EnquiryDetailActions } from '../_components/enquiry-detail-actions';
import { EnquiryDetail } from '../_components/enquiry-detail';
import { usePermissions } from '@/hooks/use-permissions';
import { useEffect } from 'react';

interface EnquiryDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * EnquiryDetailPage Component
 *
 * Displays complete details of a learner enquiry with comprehensive sidebar navigation
 *
 * Features:
 * - Sidebar navigation with sections (Personal, Academic, Qualifications, Contact, Accommodation, Enquiry)
 * - Comprehensive detail view for all enquiry information
 * - Edit and Delete actions with permission checks
 * - Responsive layout matching student details page
 */
export default function EnquiryDetailPage({ params }: EnquiryDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { data: enquiry, isLoading, error } = useLearnerProfile(id);
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const fullName = enquiry
    ? `${enquiry.first_name} ${enquiry.last_name || ''}`.trim()
    : '';

  // Check for permission to view enquiry details
  useEffect(() => {
    // Skip permission check while permissions are still loading
    if (permissionsLoading) {
      console.log('Permissions are still loading...');
      return;
    }

    const shouldRedirect = !isSuperAdmin && !canAccess('learners', 'view');

    if (shouldRedirect) {
      console.log('Access denied for enquiry details page');
      router.push('/unauthorized');
    }
  }, [isSuperAdmin, canAccess, router, permissionsLoading]);

  // Loading state
  if (isLoading) {
    return (
      <ContentLayout title='Enquiry Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  // Error state
  if (error) {
    return (
      <ContentLayout title='Enquiry Details'>
        <div className='flex flex-col items-center justify-center p-8 text-center'>
          <h2 className='text-xl font-semibold mb-2'>Error Loading Enquiry</h2>
          <p className='text-muted-foreground mb-4'>
            {error instanceof Error ? error.message : 'Failed to fetch enquiry details'}
          </p>
          <Button asChild>
            <Link href='/learners/enquiries'>Back to Enquiries</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // Not found state
  if (!enquiry) {
    return (
      <ContentLayout title='Enquiry Details'>
        <div className='flex flex-col items-center justify-center p-8 text-center'>
          <h2 className='text-xl font-semibold mb-2'>Enquiry Not Found</h2>
          <p className='text-muted-foreground mb-4'>
            The requested enquiry could not be found.
          </p>
          <Button asChild>
            <Link href='/learners/enquiries'>Back to Enquiries</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Enquiry: ${fullName}`}>
      <div className='space-y-6'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Learners', href: '/learners' },
            { label: 'Enquiries', href: '/learners/enquiries' },
            { label: fullName }
          ]}
        />

        <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6'>
          <div>
            <div className='flex items-center gap-3'>
              <h1 className='text-2xl font-bold tracking-tight'>{fullName}</h1>
              <LifecycleStatusBadge status={enquiry.lifecycle_status} showIcon />
            </div>
            <p className='text-muted-foreground'>
              {enquiry.application_id
                ? `Application ID: ${enquiry.application_id}`
                : 'No Application ID'}
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Button variant='outline' asChild>
              <Link href='/learners/enquiries'>
                <ArrowLeft className='mr-2 h-4 w-4' />
                Back
              </Link>
            </Button>
            <EnquiryDetailActions enquiry={enquiry} />
          </div>
        </div>

        <div className='flex flex-col lg:flex-row gap-8'>
          <EnquiryDetail enquiry={enquiry} />
        </div>
      </div>
    </ContentLayout>
  );
}
