'use client';

// ============================================
// LEARNER EDIT PAGE
// ============================================
// Created: 2025-01-19
// Updated: 2025-01-20 - Replaced with EnquiryForm for consistency
// Purpose: Edit learner profile with comprehensive form
// ============================================


import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useLearnerProfile, learnerProfileKeys } from '@/hooks/use-learner-profiles';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EnquiryForm } from '../../../enquiries/_components/enquiry-form';
import { Loader2 } from 'lucide-react';

interface LearnerEditPageProps {
  params: Promise<{ id: string }>;
}

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
 */
export default function LearnerEditPage({ params }: LearnerEditPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: learner, isLoading, error } = useLearnerProfile(id);

  // EnquiryForm saves via LearnerProfileService directly (it bypasses the
  // useUpdateLearnerProfile mutation hook), so nothing here invalidates the
  // caches. Without this, the cached server-rendered profiles list and the
  // React Query detail cache keep showing the pre-edit course/program after a
  // successful save. Bust RQ caches + refresh the Router Cache before
  // navigating to the detail page (mirrors the row-actions refresh pattern).
  const handleEditSuccess = (updatedLearner: { id: string }) => {
    queryClient.invalidateQueries({ queryKey: learnerProfileKeys.detail(updatedLearner.id) });
    queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
    router.refresh();
    router.push(`/learners/profiles/${updatedLearner.id}`);
  };

  // Loading state
  if (isLoading) {
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
            onSuccess={handleEditSuccess}
            // Finance Details is admission-capture only (fee structure chosen
            // when a lead is admitted); fees for an existing learner live in
            // Billing. Same five tabs the Profiles create form shows. Safe to
            // drop: every finance field is nullable+optional in the schema, so
            // nothing required is stranded on an unreachable tab.
            visibleTabs={[
              'basic-details',
              'contact-details',
              'course-selection',
              'academic-information',
              'accommodation-preferences',
            ]}
            // Existing learners: any department stays selectable and the stored
            // semester is left alone. The first-year => Science & Humanities
            // rule belongs to admission capture, and applying it here hid real
            // departments and overwrote real semesters (it also forced the
            // Freshers holding pen, removed entirely on 2026-08-05).
            enforceAdmissionRules={false}
            // Tamil-script name inputs on Basic Details. Scoped to the Learner
            // Profiles screens — the enquiry and student self-fill flows that
            // share this form stay as they were.
            showTamilNames
            // ABC ID / EMIS / UMIS — same Profiles-only scoping.
            showLearnerIdentifiers
            // Two explicit choices on every step, nothing else:
            //   "Save & Next"      — commit this step, advance to the next tab
            //   "Update & Finish"  — validate every tab, commit, redirect to
            //                        the detail page via handleEditSuccess
            // hideDraft removes the third "Update" button, which saved without
            // validating and without redirecting — indistinguishable from the
            // other two at a glance and the reason edits felt half-applied.
            allowSubmitFromAnyTab
            hideDraft
            submitLabel="Update & Finish"
          />
        </Card>
      </div>
    </ContentLayout>
  );
}
