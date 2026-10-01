'use client';

import { useState, useMemo } from 'react';
import { LearnerProfile } from '@/types/learner-profile';
import { usePendingChangeRequest } from '@/hooks/learner-profile/use-change-request';
import { useCreateChangeRequest } from '@/hooks/learner-profile/use-change-request-mutations';
import { usePermissions } from '@/hooks/use-permissions';
import { PendingChangesBanner } from './pending-changes-banner';
import { ProfileComparisonView } from './profile-comparison-view';
import { ProfileView } from './profile-view';
import { Button } from '@/components/ui/button';
import { EnquiryForm } from '../../enquiries/_components/enquiry-form';
import ChangeRequestDialog from './change-request-dialog';
import { ProfileCompletionIndicator } from './profile-completion-indicator';
import { ProfileCompletionCard } from './profile-completion-card';
import { calculateProfileCompletion } from '@/lib/utils/profile-completion';
import { computeLearnerProfileChanges } from '@/lib/learners/profile-change-diff';

interface ProfilePageContentProps {
  learner: LearnerProfile;
  userId: string;
}

export default function ProfilePageContent({ learner, userId }: ProfilePageContentProps) {
  // State management
  const [isEditing, setIsEditing] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [changedFields, setChangedFields] = useState<Record<string, { old: any; new: any }>>({});
  const [showCompletionCard, setShowCompletionCard] = useState(false);

  // Query for pending change request
  const { data: pendingRequest } = usePendingChangeRequest(learner.id);

  // Mutation for creating change request
  const { mutate: createChangeRequest, isPending: isSubmitting } = useCreateChangeRequest();

  // Profile editing is permission-gated. The `student` role has
  // `learners.my-profile.edit = false`, so students are view-only and the
  // change-request flow stays disabled for them. Flip the key in Role
  // Management to re-enable self-service edits without a code change.
  // `can()` returns false while permissions load, so the button never flashes.
  const { can } = usePermissions();
  const canEdit = !pendingRequest && can('learners.my-profile.edit');

  // Calculate profile completion (memoized)
  const profileCompletion = useMemo(() => {
    return calculateProfileCompletion(learner);
  }, [learner]);

  // Toggle and scroll to completion card
  const handleViewDetails = () => {
    setShowCompletionCard(true);
    // Use setTimeout to ensure the card is rendered before scrolling
    setTimeout(() => {
      const card = document.getElementById('profile-completion-card');
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Close completion card
  const handleCloseCompletionCard = () => {
    setShowCompletionCard(false);
  };

  // Handle edit button click
  const handleEdit = () => {
    setIsEditing(true);
  };

  // Handle cancel editing
  const handleCancelEdit = () => {
    setIsEditing(false);
    setChangedFields({});
  };

  // Handle form submission - open preview dialog
  const handleFormSubmit = (changes: Record<string, { old: any; new: any }>) => {
    setChangedFields(changes);
    setShowPreviewDialog(true);
  };

  const handleEnquirySubmit = async (formData: any) => {
    // Only the fields a learner may ask to change, and only those that really
    // changed (2026-10-07: the server refuses any other field).
    handleFormSubmit(computeLearnerProfileChanges(formData, learner as unknown as Record<string, unknown>));
  };

  // Handle going back from preview dialog to edit form
  const handleBackToEdit = () => {
    setShowPreviewDialog(false);
  };

  // Handle confirming and submitting change request
  const handleConfirmSubmit = () => {
    createChangeRequest(
      {
        learner_id: learner.id,
        changed_fields: changedFields,
        fields_summary: Object.keys(changedFields),
      },
      {
        onSuccess: () => {
          // Close dialogs and exit edit mode
          setShowPreviewDialog(false);
          setIsEditing(false);
          setChangedFields({});
        },
      }
    );
  };

  // If there's a pending request, show banner and comparison view
  if (pendingRequest && pendingRequest.request_status === 'pending') {
    return (
      <div className="space-y-6">
        <ProfileCompletionIndicator
          percentage={profileCompletion.overallPercentage}
          completed={profileCompletion.completed}
          total={profileCompletion.totalRequired}
          onViewDetails={handleViewDetails}
        />

        <PendingChangesBanner
          requestId={pendingRequest.id}
          status={pendingRequest.request_status}
          submittedAt={pendingRequest.created_at}
          reviewComments={pendingRequest.review_comments}
          pendingPhotoUrl={
            (pendingRequest.changed_fields as Record<string, any> | null)?.student_photo_url
              ?.new
              ?? (pendingRequest.changed_fields as Record<string, any> | null)?.student_photo_url
              ?? null
          }
        />

        {showCompletionCard && (
          <ProfileCompletionCard
            completion={profileCompletion}
            canEdit={false}
            onEdit={handleEdit}
            onClose={handleCloseCompletionCard}
          />
        )}

        <ProfileComparisonView
          currentData={learner}
          pendingChanges={pendingRequest.changed_fields}
          canEdit={false}
        />
      </div>
    );
  }

  // If editing, show edit form
  if (isEditing) {
    return (
      <div className="space-y-6">
        <ProfileCompletionIndicator
          percentage={profileCompletion.overallPercentage}
          completed={profileCompletion.completed}
          total={profileCompletion.totalRequired}
        />

        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Edit Profile</h2>
          <Button variant="outline" onClick={handleCancelEdit} className="w-full sm:w-auto">
            Cancel Editing
          </Button>
        </div>

        <EnquiryForm
          learner={learner}
          visibleTabs={['basic-details', 'academic-information', 'contact-details', 'accommodation-preferences']}
          onSubmit={handleEnquirySubmit}
          submitLabel="Preview Changes"
          hideDraft={true}
          isStudentView={true}
        />

        <ChangeRequestDialog
          open={showPreviewDialog}
          onOpenChange={setShowPreviewDialog}
          currentData={learner}
          changedFields={changedFields}
          onConfirm={handleConfirmSubmit}
          onBack={handleBackToEdit}
          isSubmitting={isSubmitting}
        />
      </div>
    );
  }

  // Default: show profile view
  return (
    <div className="space-y-6">
      <ProfileCompletionIndicator
        percentage={profileCompletion.overallPercentage}
        completed={profileCompletion.completed}
        total={profileCompletion.totalRequired}
        onViewDetails={handleViewDetails}
      />

      {showCompletionCard && (
        <ProfileCompletionCard
          completion={profileCompletion}
          canEdit={canEdit}
          onEdit={handleEdit}
          onClose={handleCloseCompletionCard}
        />
      )}

      <ProfileView learner={learner} canEdit={canEdit} onEdit={handleEdit} />
    </div>
  );
}
