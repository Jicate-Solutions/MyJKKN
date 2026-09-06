'use client';

// ============================================
// EDIT ENQUIRY PAGE
// ============================================
// Created: 2025-01-18
// Updated: 2026-03-16 - Fixed DRP placeholder causing "Failed to load enquiry"
// Purpose: Edit learner enquiry details
// ============================================


import { Suspense } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useLearnerProfile, learnerProfileKeys } from '@/hooks/use-learner-profiles';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EnquiryForm } from '../../_components/enquiry-form';
import { ActivitiesTab } from '../_components/activities-tab';
import { ChecklistTab } from '../_components/checklist-tab';
import { Loader2, FileText, Activity as ActivityIcon, ClipboardCheck } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useTabParam } from '@/hooks/use-tab-param';

const EDIT_ENQUIRY_TABS = ['details', 'activities', 'checklist'] as const;

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
 *
 * Uses useParams() instead of use(params) to avoid Next.js DRP placeholders
 * that appear during client-side navigation with cacheComponents enabled.
 */
function EditEnquiryPageInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: learner, isPending, error } = useLearnerProfile(id);

  // EnquiryForm saves via LearnerProfileService directly (it bypasses the
  // useUpdateLearnerProfile mutation hook), so nothing here invalidates the
  // caches. Without this, the Admission Management "Search All" list (a cached
  // server component) and the React Query detail cache keep showing the
  // pre-edit course/program after a successful save — the edit looks like it
  // "didn't work". Mirror what the row-actions do: bust RQ caches + refresh the
  // Router Cache before navigating to the detail page.
  const handleEditSuccess = (updatedLearner: { id: string }) => {
    queryClient.invalidateQueries({ queryKey: learnerProfileKeys.detail(updatedLearner.id) });
    queryClient.invalidateQueries({ queryKey: learnerProfileKeys.lists() });
    router.refresh();
    router.push(`/learners/enquiries/${updatedLearner.id}`);
  };

  // Activities tab visibility — super_admin always sees it; others need the
  // admission.enquiries.activities.view permission. Counselor roles do not
  // get this by default (only admission + admission_staff are auto-granted
  // via the role-grant migration).
  const { canAccess, isSuperAdmin } = usePermissions();
  const canSeeActivities =
    isSuperAdmin || canAccess('admission.enquiries.activities', 'view');
  const canSeeChecklist =
    isSuperAdmin || canAccess('admission.enquiries.checklist', 'view');
  const showTabs = canSeeActivities || canSeeChecklist;
  const [activeTab, setActiveTab] = useTabParam('details', EDIT_ENQUIRY_TABS);

  // Loading state — isPending covers both active fetching AND disabled query
  // (e.g., when id is a DRP placeholder like %%drp:id:xxx%%)
  if (isPending) {
    return (
      <ContentLayout title="Edit Admitted">
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
      <ContentLayout title="Edit Admitted">
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
          { label: 'Admitted', href: '/learners/enquiries' },
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

        {/* Tabs — admission officers (+ super_admin + granted custom roles)
            see both Details and Activities. Counselors / read-only viewers
            see only Details (no tab UI rendered). */}
        {showTabs ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0">
              <TabsTrigger value="details" className="gap-2">
                <FileText className="h-4 w-4" />
                Details
              </TabsTrigger>
              {canSeeActivities && (
                <TabsTrigger value="activities" className="gap-2">
                  <ActivityIcon className="h-4 w-4" />
                  Activities
                </TabsTrigger>
              )}
              {canSeeChecklist && (
                <TabsTrigger value="checklist" className="gap-2">
                  <ClipboardCheck className="h-4 w-4" />
                  Checklist
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="details" className="mt-4">
              <Card className="p-6">
                <EnquiryForm
                  learner={learner}
                  onSuccess={handleEditSuccess}
                  // One "Update" on every tab, which saves and routes through
                  // handleEditSuccess (cache bust + refresh + redirect). Before
                  // this, a middle tab like Course Selection offered only the
                  // draft "Update" and "Save & Next" — both wrote the row but
                  // neither called onSuccess, so the edit stayed invisible
                  // behind the 5-minute React Query cache and looked unsaved.
                  singleSaveButton
                />
              </Card>
            </TabsContent>

            {canSeeActivities && (
              <TabsContent value="activities" className="mt-4">
                <ActivitiesTab
                  learnerProfileId={id}
                  institutionId={learner.institution_id ?? ''}
                />
              </TabsContent>
            )}

            {canSeeChecklist && (
              <TabsContent value="checklist" className="mt-4">
                <ChecklistTab learnerProfileId={id} />
              </TabsContent>
            )}
          </Tabs>
        ) : (
          <Card className="p-6">
            <EnquiryForm
              learner={learner}
              onSuccess={handleEditSuccess}
              // Same single-Update behaviour on the no-tabs branch (counselors
              // / read-only roles), so both branches save identically.
              singleSaveButton
            />
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}

export default function EditEnquiryPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <EditEnquiryPageInner />
    </Suspense>
  );
}
