// ============================================
// STATUS PROMOTION FORM
// ============================================
// Created: 2025-01-20
// Purpose: Bulk update learner lifecycle status
// Features: Account disabling for 'exited' status
// ============================================

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useBulkUpdateStatus } from '@/hooks/use-learner-profiles';
import type { LifecycleStatus } from '@/types/learner-profile';
import toast from 'react-hot-toast';
import { Loader2, CheckCircle2, XCircle, Users, AlertTriangle } from 'lucide-react';

interface StatusPromotionFormProps {
  selectedLearnerIds: string[];
  onSuccess?: () => void;
}

const STATUS_OPTIONS: { value: LifecycleStatus; label: string; description: string }[] = [
  {
    value: 'active',
    label: 'Active',
    description: 'Currently enrolled and attending',
  },
  {
    value: 'inactive',
    label: 'Inactive',
    description: 'Temporarily inactive (leave, suspension)',
  },
  {
    value: 'exited',
    label: 'Exited',
    description: 'Left institution (dropout, transfer) - Disables user account',
  },
  {
    value: 'graduated',
    label: 'Graduated',
    description: 'Successfully completed program',
  },
];

export function StatusPromotionForm({
  selectedLearnerIds,
  onSuccess,
}: StatusPromotionFormProps) {
  const [newStatus, setNewStatus] = useState<LifecycleStatus | ''>('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [progress, setProgress] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [failedLearners, setFailedLearners] = useState<{ id: string; error: string }[]>([]);

  const updateStatusMutation = useBulkUpdateStatus();

  const handleUpdateStatus = () => {
    if (!newStatus) {
      toast.error('Please select a status');
      return;
    }
    setShowConfirmDialog(true);
  };

  const executeStatusUpdate = async () => {
    if (!newStatus) return;

    setShowConfirmDialog(false);
    setShowProgressDialog(true);
    setProgress(0);
    setSuccessCount(0);
    setFailedCount(0);
    setFailedLearners([]);

    try {
      const result = await updateStatusMutation.mutateAsync({
        learnerIds: selectedLearnerIds,
        newStatus,
        onProgress: (current, total, success, failed) => {
          setProgress((current / total) * 100);
          setSuccessCount(success.length);
          setFailedCount(failed.length);
          setFailedLearners(failed);
        },
      });

      if (result.failed.length === 0) {
        toast.success(`Successfully updated ${result.success.length} learner(s) to ${newStatus}`);
        setTimeout(() => {
          setShowProgressDialog(false);
          onSuccess?.();
        }, 2000);
      } else {
        toast.error(`Status update completed with ${result.failed.length} failure(s)`);
      }
    } catch (error) {
      toast.error('Status update failed');
      setShowProgressDialog(false);
    }
  };

  const selectedStatusOption = STATUS_OPTIONS.find((opt) => opt.value === newStatus);
  const isExitedStatus = newStatus === 'exited';

  return (
    <div className="space-y-6">
      {/* Form Fields */}
      <div className="space-y-4">
        {/* Status Selection */}
        <div className="space-y-2">
          <Label htmlFor="status">
            New Status <span className="text-destructive">*</span>
          </Label>
          <Select value={newStatus} onValueChange={(value) => setNewStatus(value as LifecycleStatus)}>
            <SelectTrigger id="status">
              <SelectValue placeholder="Select new status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div>
                    <div className="font-medium">{option.label}</div>
                    <div className="text-xs text-muted-foreground">{option.description}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status Description */}
        {selectedStatusOption && (
          <Alert>
            <AlertDescription>{selectedStatusOption.description}</AlertDescription>
          </Alert>
        )}

        {/* Exited Status Warning */}
        {isExitedStatus && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Warning: User Account Disabling</AlertTitle>
            <AlertDescription>
              Setting status to "Exited" will <strong>disable the user accounts</strong> for these
              learners. They will no longer be able to log in to the system.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Selected Learners Info */}
      <Alert>
        <Users className="h-4 w-4" />
        <AlertDescription>
          <strong>{selectedLearnerIds.length}</strong> learner(s) selected for status update
        </AlertDescription>
      </Alert>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button
          onClick={handleUpdateStatus}
          disabled={!newStatus || updateStatusMutation.isPending}
          variant={isExitedStatus ? 'destructive' : 'default'}
        >
          {updateStatusMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Update Status
        </Button>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Status Update</DialogTitle>
            <DialogDescription>
              You are about to update {selectedLearnerIds.length} learner(s) to:
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">New Status:</span>
              <Badge variant={isExitedStatus ? 'destructive' : 'default'}>
                {selectedStatusOption?.label}
              </Badge>
            </div>
            {isExitedStatus && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>Warning:</strong> User accounts will be disabled for all selected learners.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={executeStatusUpdate}
              variant={isExitedStatus ? 'destructive' : 'default'}
            >
              {isExitedStatus ? 'Disable Accounts & Update' : 'Confirm Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Progress Dialog */}
      <Dialog open={showProgressDialog} onOpenChange={setShowProgressDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Status Update in Progress</DialogTitle>
            <DialogDescription>
              Please wait while we update the selected learners...
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Progress value={progress} />
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>Success: {successCount}</span>
              </div>
              {failedCount > 0 && (
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span>Failed: {failedCount}</span>
                </div>
              )}
            </div>
            {failedLearners.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-2">
                {failedLearners.map((failed) => (
                  <div key={failed.id} className="text-xs text-destructive">
                    {failed.id}: {failed.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
