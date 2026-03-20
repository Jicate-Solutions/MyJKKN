// ============================================
// LEARNER EDIT PAGE
// ============================================
// Created: 2025-01-19
// Updated: 2025-01-20 - Replaced with EnquiryForm for consistency
// Purpose: Edit learner profile with comprehensive form
// ============================================

'use client';

import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useLearnerProfile } from '@/hooks/use-learner-profiles';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EnquiryForm } from '../../../enquiries/_components/enquiry-form';
import { Loader2 } from 'lucide-react';

/**
 * LearnerEditPage Component
 *
 * Page for editing existing learner profiles
 * Uses the same comprehensive EnquiryForm component for consistency
 *
 * Features:
 * - Loads existing learner data
 * - Pre-populates form with current values
 * - Updates learner on save
 * - Redirects to detail page on success
 * - All 5 tabs: Basic Details, Academic Info, Course Selection, Contact, Accommodation
 *
 * Fixed: 2026-03-07 - Switched from use(params) to useParams() to guard against
 * Next.js DRP placeholders (%%drp:id:...%%) during client-side navigation with PPR.
 */
export default function LearnerEditPage() {
  // useParams() reads from router state (actual URL), not the PPR pipeline.
  // use(params) can temporarily resolve to %%drp:id:...%% placeholders during
  // client-side navigation, causing Supabase UUID parse errors.
  const routerParams = useParams();
  const id = (routerParams?.id as string) || '';
  const isDrp = !id || id.includes('%%drp:');
  const router = useRouter();

  const { data: learner, isLoading, error } = useLearnerProfile(id, {
    enabled: !isDrp && !!id,
  });

  // Loading state — also covers transient DRP placeholder phase
  if (isLoading || isDrp) {
    return (
      <ContentLayout title="Edit Learner Profile">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading learner profile...</p>
          </div>
        </div>
      </ContentLayout>
    );
  }

  // Error state
  if (error || !learner) {
    return (
      <ContentLayout title="Edit Learner Profile">
        <div className="text-center py-8">
          <p className="text-destructive">Failed to load learner profile</p>
          <Button variant="outline" asChild className="mt-4">
            <Link href="/learners/profiles">Back to Learners</Link>
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
          { label: 'Profiles', href: '/learners/profiles' },
          { label: fullName, href: `/learners/profiles/${id}` },
          { label: 'Edit' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold py-1">Edit Learner Profile</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Update profile details for {fullName}
          </p>
        </div>

        {/* Learner Form - Uses same comprehensive form as enquiries */}
        <Card className="p-6">
          <EnquiryForm
            learner={learner}
            onSuccess={(updatedLearner) => {
              router.push(`/learners/profiles/${updatedLearner.id}`);
            }}
          />
        </Card>
      </div>
    </ContentLayout>
  );
}
