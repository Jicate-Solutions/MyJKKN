// ============================================
// EDIT ENQUIRY PAGE
// ============================================
// Created: 2025-01-18
// Purpose: Edit learner enquiry details
// ============================================

'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLearnerProfile } from '@/hooks/use-learner-profiles';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EnquiryForm } from '../../_components/enquiry-form';
import { Loader2 } from 'lucide-react';

interface EditEnquiryPageProps {
  params: Promise<{ id: string }>;
}

/**
 * EditEnquiryPage Component
 *
 * Page for editing existing learner enquiries
 *
 * Features:
 * - Loads existing enquiry data
 * - Pre-populates form with current values
 * - Updates enquiry on save
 * - Redirects to detail page on success
 */
export default function EditEnquiryPage({ params }: EditEnquiryPageProps) {
  const { id } = use(params);
  const router = useRouter();

  const { data: learner, isLoading, error } = useLearnerProfile(id);

  // Loading state
  if (isLoading) {
    return (
      <ContentLayout title="Edit Enquiry">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading enquiry...</p>
          </div>
        </div>
      </ContentLayout>
    );
  }

  // Error state
  if (error || !learner) {
    return (
      <ContentLayout title="Edit Enquiry">
        <div className="text-center py-8">
          <p className="text-destructive">Failed to load enquiry</p>
          <Button variant="outline" asChild className="mt-4">
            <Link href="/learners/enquiries">Back to Enquiries</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const fullName = `${learner.first_name} ${learner.last_name || ''}`.trim();

  return (
    <ContentLayout title={`Edit: ${fullName}`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners', href: '/learners' },
          { label: 'Enquiries', href: '/learners/enquiries' },
          { label: fullName, href: `/learners/enquiries/${id}` },
          { label: 'Edit' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold py-1">Edit Enquiry</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Update enquiry details for {fullName}
          </p>
        </div>

        {/* Enquiry Form */}
        <Card className="p-6">
          <EnquiryForm
            learner={learner}
            onSuccess={(updatedLearner) => {
              router.push(`/learners/enquiries/${updatedLearner.id}`);
            }}
          />
        </Card>
      </div>
    </ContentLayout>
  );
}
