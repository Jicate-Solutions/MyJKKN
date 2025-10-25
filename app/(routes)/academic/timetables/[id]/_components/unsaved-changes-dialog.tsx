import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, Save, Loader2 } from 'lucide-react';

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  timetableFormat: 'regular' | 'batch';
  savingPeriods: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSaveAndContinue: () => void;
}

/**
 * Unsaved Changes Warning Dialog
 * Prompts user when navigating away with unsaved timetable configuration changes
 */
export function UnsavedChangesDialog({
  isOpen,
  timetableFormat,
  savingPeriods,
  onCancel,
  onDiscard,
  onSaveAndContinue
}: UnsavedChangesDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="h-5 w-5" />
            Unsaved Changes
          </DialogTitle>
          <DialogDescription asChild>
            <div>
              <p className="text-sm text-muted-foreground">
                You have unsaved changes to your timetable configuration
                including:
              </p>
              {timetableFormat === 'batch' ? (
                <ul className="mt-2 list-disc list-inside text-sm space-y-1 text-muted-foreground">
                  <li>Date ranges configuration</li>
                  <li>Period selections</li>
                  <li>Timetable format settings</li>
                </ul>
              ) : (
                <ul className="mt-2 list-disc list-inside text-sm space-y-1 text-muted-foreground">
                  <li>Day selections</li>
                  <li>Period selections</li>
                  <li>Timetable format settings</li>
                </ul>
              )}
              <p className="mt-3 text-amber-700 font-medium">
                Do you want to save these changes before leaving?
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onDiscard}
            className="w-full sm:w-auto"
          >
            Discard Changes
          </Button>
          <Button
            onClick={onSaveAndContinue}
            disabled={savingPeriods}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
          >
            {savingPeriods ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save & Continue
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
