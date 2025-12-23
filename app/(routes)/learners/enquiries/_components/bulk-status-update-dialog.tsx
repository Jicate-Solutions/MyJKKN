// ============================================
// BULK STATUS UPDATE DIALOG COMPONENT
// ============================================
// Created: 2025-01-22
// Purpose: Dialog for bulk status updates with user creation preview
// ============================================

'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  HelpCircle,
  Users,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import type { LearnerProfile, LifecycleStatus } from '@/types/learner-profile';
import { LearnerProfileService } from '@/lib/services/learner-profile-service';
import toast from 'react-hot-toast';

interface BulkStatusUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedLearners: LearnerProfile[];
  onSuccess: () => void;
}

interface UpdateResult {
  learnerId: string;
  learnerName: string;
  status: 'success' | 'error';
  message: string;
  userCreated?: boolean;
}

const STATUS_OPTIONS = [
  {
    value: 'enquiry',
    label: 'Enquiry',
    icon: HelpCircle,
    color: 'text-gray-500',
    description: 'Mark as enquiry (initial stage)',
  },
  {
    value: 'pending',
    label: 'Pending',
    icon: Clock,
    color: 'text-yellow-500',
    description: 'Mark as pending application',
  },
  {
    value: 'approved',
    label: 'Approved',
    icon: CheckCircle,
    color: 'text-green-500',
    description: 'Approve (may auto-activate if profile complete)',
  },
  {
    value: 'rejected',
    label: 'Rejected',
    icon: XCircle,
    color: 'text-red-500',
    description: 'Reject application',
  },
  {
    value: 'waitlisted',
    label: 'Waitlisted',
    icon: AlertCircle,
    color: 'text-blue-500',
    description: 'Add to waitlist',
  },
];

/**
 * Check if a learner profile is complete for user creation
 * Requires: college_email (@jkkn.ac.in), academic_year_id, semester_id, section_id
 */
const isProfileComplete = (learner: LearnerProfile): boolean => {
  const hasRequiredFields =
    learner.college_email &&
    learner.academic_year_id &&
    learner.semester_id &&
    learner.section_id;

  const hasValidEmail =
    learner.college_email && learner.college_email.toLowerCase().endsWith('@jkkn.ac.in');

  return Boolean(hasRequiredFields && hasValidEmail);
};

export function BulkStatusUpdateDialog({
  open,
  onOpenChange,
  selectedLearners,
  onSuccess,
}: BulkStatusUpdateDialogProps) {
  const [targetStatus, setTargetStatus] = useState<LifecycleStatus | ''>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateResults, setUpdateResults] = useState<UpdateResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  // Calculate statistics
  const completeProfiles = selectedLearners.filter(isProfileComplete);
  const incompleteProfiles = selectedLearners.filter((l) => !isProfileComplete(l));

  // Estimate user creation impact (only if changing to 'approved')
  const willAutoActivate =
    targetStatus === 'approved' ? completeProfiles.length : 0;

  const handleConfirm = async () => {
    if (!targetStatus) {
      toast.error('Please select a target status');
      return;
    }

    setIsUpdating(true);
    setUpdateProgress(0);
    setUpdateResults([]);
    setShowResults(false);

    const results: UpdateResult[] = [];
    let successCount = 0;
    let errorCount = 0;
    let usersCreatedCount = 0;

    try {
      for (let i = 0; i < selectedLearners.length; i++) {
        const learner = selectedLearners[i];
        const progress = ((i + 1) / selectedLearners.length) * 100;
        setUpdateProgress(Math.round(progress));

        try {
          // Update status
          const result = await LearnerProfileService.updateLearnerProfile(learner.id, {
            lifecycle_status: targetStatus as LifecycleStatus,
          });

          // Check if user was created (from service metadata)
          // @ts-ignore - Temporary metadata from service
          const userCreation = result._userCreation;
          const userCreated = userCreation?.success || false;

          if (userCreated) {
            usersCreatedCount++;
          }

          results.push({
            learnerId: learner.id,
            learnerName: `${learner.first_name} ${learner.last_name || ''}`,
            status: 'success',
            message: userCreated
              ? `Status updated and user account created`
              : `Status updated to ${STATUS_OPTIONS.find((s) => s.value === targetStatus)?.label}`,
            userCreated,
          });
          successCount++;
        } catch (error: any) {
          console.error(
            `[bulk-status-update] Error updating learner ${learner.id}:`,
            error
          );
          results.push({
            learnerId: learner.id,
            learnerName: `${learner.first_name} ${learner.last_name || ''}`,
            status: 'error',
            message: error.message || 'Failed to update status',
          });
          errorCount++;
        }

        // Small delay to prevent overwhelming the database
        if (i < selectedLearners.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      setUpdateResults(results);
      setShowResults(true);

      // Show summary
      if (successCount > 0 && errorCount === 0) {
        toast.success(
          `Successfully updated ${successCount} record${successCount > 1 ? 's' : ''}`
        );
        if (usersCreatedCount > 0) {
          toast.success(
            `Created ${usersCreatedCount} user account${usersCreatedCount > 1 ? 's' : ''}`,
            { duration: 5000 }
          );
        }
      } else if (successCount > 0 && errorCount > 0) {
        toast.success(`Updated ${successCount} record${successCount > 1 ? 's' : ''}`);
        toast.error(`Failed to update ${errorCount} record${errorCount > 1 ? 's' : ''}`);
      } else {
        toast.error(`Failed to update ${errorCount} record${errorCount > 1 ? 's' : ''}`);
      }

      // Call success callback
      if (successCount > 0) {
        onSuccess();
      }
    } catch (error) {
      console.error('[bulk-status-update] Bulk update error:', error);
      toast.error('Bulk update failed. Please try again.');
    } finally {
      setIsUpdating(false);
      setUpdateProgress(100);
    }
  };

  const handleClose = () => {
    if (!isUpdating) {
      setTargetStatus('');
      setShowResults(false);
      setUpdateResults([]);
      setUpdateProgress(0);
      onOpenChange(false);
    }
  };

  const selectedStatusOption = STATUS_OPTIONS.find((s) => s.value === targetStatus);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b bg-muted/50 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Bulk Status Update
          </DialogTitle>
          <DialogDescription>
            Update status for {selectedLearners.length} selected record
            {selectedLearners.length > 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
          {!showResults ? (
            <>
              {/* Status Selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Target Status</label>
                <Select
                  value={targetStatus}
                  onValueChange={(value) => setTargetStatus(value as LifecycleStatus)}
                  disabled={isUpdating}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a status..." />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      return (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 ${option.color}`} />
                            <span>{option.label}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {selectedStatusOption && (
                  <p className="text-sm text-muted-foreground">
                    {selectedStatusOption.description}
                  </p>
                )}
              </div>

              {/* Impact Preview - Only show if status selected */}
              {targetStatus && (
                <div className="space-y-3">
                  {/* Auto-Activation Warning */}
                  {targetStatus === 'approved' && willAutoActivate > 0 && (
                    <Alert className="border-green-500 bg-green-50">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertTitle className="text-green-900">
                        Auto-Activation & User Creation
                      </AlertTitle>
                      <AlertDescription className="text-green-800 space-y-2">
                        <p>
                          <strong>{willAutoActivate}</strong> out of{' '}
                          {selectedLearners.length} record
                          {selectedLearners.length > 1 ? 's' : ''} will be{' '}
                          <strong>auto-activated</strong> and have{' '}
                          <strong>user accounts created</strong> because they have:
                        </p>
                        <ul className="list-disc list-inside text-sm space-y-1 pl-2">
                          <li>Valid college email (@jkkn.ac.in)</li>
                          <li>Academic year, semester, and section assigned</li>
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Incomplete Profiles Warning */}
                  {targetStatus === 'approved' && incompleteProfiles.length > 0 && (
                    <Alert className="border-yellow-500 bg-yellow-50">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      <AlertTitle className="text-yellow-900">
                        Incomplete Profiles
                      </AlertTitle>
                      <AlertDescription className="text-yellow-800">
                        <strong>{incompleteProfiles.length}</strong> record
                        {incompleteProfiles.length > 1 ? 's' : ''} will be marked as
                        approved but <strong>won't create user accounts</strong> because
                        they're missing required fields (college email, academic year,
                        semester, or section).
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="border rounded-lg p-3 bg-muted/50">
                      <p className="text-sm text-muted-foreground">Total Selected</p>
                      <p className="text-2xl font-bold">{selectedLearners.length}</p>
                    </div>
                    {targetStatus === 'approved' && (
                      <div className="border rounded-lg p-3 bg-green-50">
                        <p className="text-sm text-green-700">Will Create Users</p>
                        <p className="text-2xl font-bold text-green-600">
                          {willAutoActivate}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Progress Bar */}
              {isUpdating && (
                <div className="space-y-2">
                  <Progress value={updateProgress} className="h-3" />
                  <p className="text-sm text-center text-muted-foreground flex items-center justify-center gap-2">
                    <TrendingUp className="h-4 w-4 animate-pulse" />
                    Updating {updateProgress}%...
                  </p>
                </div>
              )}
            </>
          ) : (
            /* Results Display */
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className="bg-green-50 text-green-700 border-green-200"
                >
                  <CheckCircle className="mr-1 h-3 w-3" />
                  {updateResults.filter((r) => r.status === 'success').length} Success
                </Badge>
                <Badge
                  variant="outline"
                  className="bg-red-50 text-red-700 border-red-200"
                >
                  <AlertCircle className="mr-1 h-3 w-3" />
                  {updateResults.filter((r) => r.status === 'error').length} Errors
                </Badge>
                {updateResults.some((r) => r.userCreated) && (
                  <Badge
                    variant="outline"
                    className="bg-blue-50 text-blue-700 border-blue-200"
                  >
                    <Users className="mr-1 h-3 w-3" />
                    {updateResults.filter((r) => r.userCreated).length} Users Created
                  </Badge>
                )}
              </div>

              {/* Results List */}
              <div className="space-y-2 max-h-[400px] overflow-y-auto border rounded-lg p-3 bg-muted/20">
                {updateResults.map((result) => (
                  <div
                    key={result.learnerId}
                    className={`flex items-start gap-3 p-3 rounded-lg text-sm ${
                      result.status === 'success'
                        ? 'bg-green-50 text-green-800 border border-green-200'
                        : 'bg-red-50 text-red-800 border border-red-200'
                    }`}
                  >
                    {result.status === 'success' ? (
                      <CheckCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{result.learnerName}</p>
                      <p className="text-xs break-words">{result.message}</p>
                      {result.userCreated && (
                        <Badge
                          variant="outline"
                          className="mt-1 bg-blue-100 text-blue-800 border-blue-300"
                        >
                          <Users className="mr-1 h-3 w-3" />
                          User Account Created
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/50 flex-shrink-0">
          {!showResults ? (
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:justify-end">
              <Button variant="outline" onClick={handleClose} disabled={isUpdating} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!targetStatus || isUpdating}
                className="w-full sm:w-auto"
              >
                {isUpdating ? (
                  <>
                    <TrendingUp className="mr-2 h-4 w-4 animate-pulse" />
                    Updating...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Update {selectedLearners.length} Record
                    {selectedLearners.length > 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          ) : (
            <Button onClick={handleClose} className="w-full sm:w-auto">
              <CheckCircle className="mr-2 h-4 w-4" />
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
