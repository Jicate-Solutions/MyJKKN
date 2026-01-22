'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Send, User } from 'lucide-react';
import { formatFieldLabel } from '@/lib/validations/profile-change-request';
import { LearnerProfile } from '@/types/learner-profile';
import Image from 'next/image';

interface ChangeRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentData: LearnerProfile;
  changedFields: Record<string, { old: any; new: any }>;
  onConfirm: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

// Fields that contain image URLs
const IMAGE_FIELDS = ['student_photo_url', 'profile_image', 'photo_url', 'image_url'];

// Fields that contain marks data
const MARKS_FIELDS = ['tenth_marks', 'twelfth_marks', '10th_marks', '12th_marks'];

export default function ChangeRequestDialog({
  open,
  onOpenChange,
  currentData,
  changedFields,
  onConfirm,
  onBack,
  isSubmitting,
}: ChangeRequestDialogProps) {
  // Check if a field is an image field
  const isImageField = (fieldName: string): boolean => {
    return IMAGE_FIELDS.includes(fieldName) || fieldName.toLowerCase().includes('photo') || fieldName.toLowerCase().includes('image');
  };

  // Check if a field is a marks field
  const isMarksField = (fieldName: string): boolean => {
    return MARKS_FIELDS.includes(fieldName) || fieldName.toLowerCase().includes('marks');
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined || value === '') {
      return 'Not provided';
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    if (typeof value === 'object') {
      try {
        // Handle Date objects or other objects that might need specific formatting
        if (value instanceof Date) return value.toLocaleDateString();
        return JSON.stringify(value, null, 2);
      } catch (e) {
        return String(value);
      }
    }
    return String(value);
  };

  // Format subject name for display
  const formatSubjectName = (name: string) => {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Render marks in a better format
  const renderMarksValue = (value: any, variant: 'old' | 'new') => {
    const bgClass = variant === 'old'
      ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900'
      : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900';
    const textClass = variant === 'old'
      ? 'text-green-900 dark:text-green-100'
      : 'text-blue-900 dark:text-blue-100';

    if (!value || typeof value !== 'object') {
      return (
        <div className={`p-3 rounded-md border ${bgClass}`}>
          <span className="text-sm text-muted-foreground italic">Not provided</span>
        </div>
      );
    }

    const { max_marks, obtained_marks, percentage, group, subjects } = value;

    // Get subjects with actual values (non-empty)
    const subjectEntries = subjects
      ? Object.entries(subjects).filter(([_, val]) => val && val !== '')
      : [];

    return (
      <div className={`p-3 rounded-md border ${bgClass} space-y-2`}>
        {/* Summary row */}
        <div className={`flex flex-wrap gap-x-4 gap-y-1 text-sm ${textClass}`}>
          {group && (
            <span>
              <span className="text-muted-foreground">Group:</span>{' '}
              <span className="font-medium">{group.toUpperCase()}</span>
            </span>
          )}
          {obtained_marks && max_marks && (
            <span>
              <span className="text-muted-foreground">Marks:</span>{' '}
              <span className="font-medium">{obtained_marks}/{max_marks}</span>
            </span>
          )}
          {percentage && (
            <span>
              <span className="text-muted-foreground">Percentage:</span>{' '}
              <span className="font-medium">{percentage}%</span>
            </span>
          )}
        </div>

        {/* Subjects grid (for 12th marks) */}
        {subjectEntries.length > 0 && (
          <div className="pt-1 border-t border-dashed">
            <p className="text-xs text-muted-foreground mb-1">Subjects:</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {subjectEntries.map(([subject, marks]) => (
                <div key={subject} className={`flex justify-between text-xs ${textClass}`}>
                  <span className="text-muted-foreground">{formatSubjectName(subject)}:</span>
                  <span className="font-medium">{String(marks)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render image preview for image fields
  const renderImageValue = (value: any, variant: 'old' | 'new') => {
    const bgClass = variant === 'old'
      ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900'
      : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900';

    if (!value || value === '') {
      return (
        <div className={`p-3 rounded-md border ${bgClass} flex items-center justify-center`}>
          <div className="flex flex-col items-center gap-2 py-4">
            <User className="h-12 w-12 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">No image</span>
          </div>
        </div>
      );
    }

    return (
      <div className={`p-3 rounded-md border ${bgClass} flex items-center justify-center`}>
        <div className="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-background shadow-sm">
          <Image
            src={value}
            alt="Profile photo"
            fill
            className="object-cover"
            sizes="96px"
          />
        </div>
      </div>
    );
  };

  const changedFieldEntries = Object.entries(changedFields);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] w-[95vw] sm:w-full flex flex-col overflow-hidden p-0 sm:p-6">
        <DialogHeader className="px-6 pt-6 sm:px-0 sm:pt-0 flex-shrink-0">
          <DialogTitle>Review Your Changes</DialogTitle>
          <DialogDescription>
            Please review your requested changes before submitting for approval.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 sm:px-0" style={{ maxHeight: 'calc(90vh - 180px)' }}>
          <div className="space-y-4 py-4 pr-2">
            {changedFieldEntries.map(([fieldName, { old: oldValue, new: newValue }]) => (
              <Card key={fieldName} className="p-4">
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm text-muted-foreground">
                    {formatFieldLabel(fieldName)}
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Current Value */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-green-700 dark:text-green-400">
                        Current Value
                      </p>
                      {isImageField(fieldName) ? (
                        renderImageValue(oldValue, 'old')
                      ) : isMarksField(fieldName) ? (
                        renderMarksValue(oldValue, 'old')
                      ) : (
                        <div className="p-3 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
                          <p className="text-sm text-green-900 dark:text-green-100 whitespace-pre-wrap break-words">
                            {formatValue(oldValue)}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* New Value */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
                        Requested Value
                      </p>
                      {isImageField(fieldName) ? (
                        renderImageValue(newValue, 'new')
                      ) : isMarksField(fieldName) ? (
                        renderMarksValue(newValue, 'new')
                      ) : (
                        <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                          <p className="text-sm text-blue-900 dark:text-blue-100 font-medium whitespace-pre-wrap break-words">
                            {formatValue(newValue)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}

            {changedFieldEntries.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No changes detected
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end px-6 pb-6 sm:px-0 sm:pb-0 flex-shrink-0 border-t pt-4 mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Edit
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting || changedFieldEntries.length === 0}
            className="w-full sm:w-auto"
          >
            {isSubmitting ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Submit Request
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
