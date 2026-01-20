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
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Send } from 'lucide-react';
import { formatFieldLabel } from '@/lib/validations/profile-change-request';
import { LearnerProfile } from '@/types/learner-profile';

interface ChangeRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentData: LearnerProfile;
  changedFields: Record<string, { old: any; new: any }>;
  onConfirm: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

export default function ChangeRequestDialog({
  open,
  onOpenChange,
  currentData,
  changedFields,
  onConfirm,
  onBack,
  isSubmitting,
}: ChangeRequestDialogProps) {
  const formatValue = (value: any): string => {
    if (value === null || value === undefined || value === '') {
      return 'Not provided';
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    return String(value);
  };

  const changedFieldEntries = Object.entries(changedFields);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Review Your Changes</DialogTitle>
          <DialogDescription>
            Please review your requested changes before submitting for approval.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 py-4">
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
                      <div className="p-3 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
                        <p className="text-sm text-green-900 dark:text-green-100">
                          {formatValue(oldValue)}
                        </p>
                      </div>
                    </div>

                    {/* New Value */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
                        Requested Value
                      </p>
                      <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                        <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">
                          {formatValue(newValue)}
                        </p>
                      </div>
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
        </ScrollArea>

        <DialogFooter className="flex-row gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            disabled={isSubmitting}
            className="flex-1 sm:flex-initial"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Edit
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting || changedFieldEntries.length === 0}
            className="flex-1 sm:flex-initial"
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
