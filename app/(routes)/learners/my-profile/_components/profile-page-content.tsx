'use client';

import { useState } from 'react';
import { LearnerProfile } from '@/types/learner-profile';
import { usePendingChangeRequest } from '@/hooks/learner-profile/use-change-request';
import { useCreateChangeRequest } from '@/hooks/learner-profile/use-change-request-mutations';
import { PendingChangesBanner } from './pending-changes-banner';
import { ProfileComparisonView } from './profile-comparison-view';
import { ProfileView } from './profile-view';
import { Button } from '@/components/ui/button';
import { EnquiryForm } from '../../enquiries/_components/enquiry-form';
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

  const handleEnquirySubmit = async (formData: any) => {
    const changes: Record<string, { old: any; new: any }> = {};

    /**
     * Deep comparison helper that handles:
     * - Empty string vs null/undefined equivalence
     * - Object comparison with meaningful values only
     * - Nested objects (like marks with subjects)
     */
    const deepEqual = (a: any, b: any): boolean => {
      // Treat empty string, null, undefined as equivalent
      const isEmpty = (v: any) => v === null || v === undefined || v === '';

      if (isEmpty(a) && isEmpty(b)) return true;
      if (isEmpty(a) !== isEmpty(b)) return false;

      // If types differ, not equal
      if (typeof a !== typeof b) return false;

      // Handle objects (including arrays)
      if (typeof a === 'object' && a !== null) {
        // Get all keys from both objects
        const allKeys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);

        for (const key of allKeys) {
          const aVal = a?.[key];
          const bVal = b?.[key];

          // Skip keys where both values are empty
          if (isEmpty(aVal) && isEmpty(bVal)) continue;

          // Recursively compare
          if (!deepEqual(aVal, bVal)) return false;
        }
        return true;
      }

      // Primitive comparison (convert to string for consistent comparison)
      return String(a) === String(b);
    };

    // Compare formData with learner
    for (const key in formData) {
      if (['lifecycle_status', 'is_profile_complete'].includes(key)) continue;

      const newValue = formData[key];
      const oldValue = (learner as any)[key];

      // Use deep equality check that handles empty values properly
      const isEqual = deepEqual(newValue, oldValue);

      if (!isEqual) {
        // Filter out cases where both are effectively empty
        const isEmpty = (v: any) => v === null || v === undefined || v === '';

        // Handle specific case for objects (empty object vs undefined/null)
        if (typeof newValue === 'object' && newValue !== null) {
          // Check if object has any meaningful (non-empty) values
          const hasMeaningfulValues = (obj: any): boolean => {
            if (!obj || typeof obj !== 'object') return !isEmpty(obj);
            return Object.values(obj).some(v => hasMeaningfulValues(v));
          };

          // Skip if both don't have meaningful values
          if (!hasMeaningfulValues(newValue) && !hasMeaningfulValues(oldValue)) continue;
        }

        if (isEmpty(newValue) && isEmpty(oldValue)) continue;

        changes[key] = { old: oldValue, new: newValue };
      }
    }

    handleFormSubmit(changes);
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
      <div className="space-y-6">
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
  return <ProfileView learner={learner} canEdit={canEdit} onEdit={handleEdit} />;
}
