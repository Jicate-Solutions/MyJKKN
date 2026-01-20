'use client';

import { useState } from 'react';
import { LearnerProfile } from '@/types/learner-profile';
import { usePendingChangeRequest } from '@/hooks/learner-profile/use-change-request';
import { useCreateChangeRequest } from '@/hooks/learner-profile/use-change-request-mutations';
import { PendingChangesBanner } from './pending-changes-banner';
import { ProfileComparisonView } from './profile-comparison-view';
import { ProfileView } from './profile-view';
import ProfileEditForm from './profile-edit-form';
import ChangeRequestDialog from './change-request-dialog';

interface ProfilePageContentProps {
  learner: LearnerProfile;
  userId: string;
}

export default function ProfilePageContent({ learner, userId }: ProfilePageContentProps) {
  // State management
  const [isEditing, setIsEditing] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [changedFields, setChangedFields] = useState<Record<string, { old: any; new: any }>>({});

  // Query for pending change request
  const { data: pendingRequest } = usePendingChangeRequest(learner.id);

  // Mutation for creating change request
  const { mutate: createChangeRequest, isPending: isSubmitting } = useCreateChangeRequest();

  // Determine if user can edit (no pending request)
  const canEdit = !pendingRequest;

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
        <PendingChangesBanner
          requestId={pendingRequest.id}
          status={pendingRequest.request_status}
          submittedAt={pendingRequest.created_at}
          reviewComments={pendingRequest.review_comments}
        />

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
      <>
        <ProfileEditForm
          learner={learner}
          onCancel={handleCancelEdit}
          onSubmit={handleFormSubmit}
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
      </>
    );
  }

  // Default: show profile view
  return <ProfileView learner={learner} canEdit={canEdit} onEdit={handleEdit} />;
}
