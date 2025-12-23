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
  DialogTrigger
} from '@/components/ui/dialog';
import { UserPlus, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import toast from 'react-hot-toast';

interface MissingProfilesInfo {
  success: boolean;
  summary: string;
  total_learners: number;
  with_profiles: number;
  without_profiles: number;
  details: Array<{
    learner_id: string;
    name: string;
    college_email: string;
  }>;
}

interface CreateResult {
  success: boolean;
  message: string;
  created_count: number;
  failed_count: number;
  created_profiles: Array<{
    learner_id: string;
    name: string;
    email: string;
    temp_password: string;
  }>;
  failed_profiles: Array<{
    learner_id: string;
    name: string;
    email: string;
    error: string;
  }>;
}

export function CreateMissingProfilesButton() {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [info, setInfo] = useState<MissingProfilesInfo | null>(null);
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);

  const handleCheck = async () => {
    setChecking(true);
    setCreateResult(null);
    try {
      const response = await fetch('/api/learners/check-missing-profiles');
      const data = await response.json();

      if (!data.success) {
        // Handle permission errors specially
        if (response.status === 403) {
          throw new Error('You do not have permission to sync learner profiles. Contact your administrator.');
        }
        if (response.status === 401) {
          throw new Error('Please log in to continue.');
        }
        throw new Error(data.error || 'Failed to check missing profiles');
      }

      setInfo(data);
    } catch (error) {
      console.error('Error checking missing profiles:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to check missing profiles'
      );
    } finally {
      setChecking(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const response = await fetch('/api/learners/create-missing-profiles', {
        method: 'POST'
      });
      const data = await response.json();

      if (!data.success) {
        // Handle permission errors specially
        if (response.status === 403) {
          throw new Error('You do not have permission to sync learner profiles. Contact your administrator.');
        }
        if (response.status === 401) {
          throw new Error('Please log in to continue.');
        }
        throw new Error(data.error || 'Failed to create missing profiles');
      }

      setCreateResult(data);

      if (data.created_count > 0) {
        toast.success(
          `Successfully created ${data.created_count} user profile${data.created_count === 1 ? '' : 's'}!`
        );
      }

      if (data.failed_count > 0) {
        toast.error(
          `Failed to create ${data.failed_count} profile${data.failed_count === 1 ? '' : 's'}. Check details below.`
        );
      }

      // Re-check after creation
      await handleCheck();
    } catch (error) {
      console.error('Error creating missing profiles:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create missing profiles'
      );
    } finally {
      setCreating(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      // Auto-check when dialog opens
      handleCheck();
    } else {
      // Reset state when dialog closes
      setInfo(null);
      setCreateResult(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="mr-2 h-4 w-4" />
          Sync Missing Profiles
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sync Missing User Profiles</DialogTitle>
          <DialogDescription>
            Check for active learners with complete profiles who are missing user accounts, and create them in bulk.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Loading State */}
          {checking && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Checking for missing profiles...
              </span>
            </div>
          )}

          {/* Info Display */}
          {!checking && info && (
            <>
              {/* Summary */}
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-medium">{info.summary}</p>
                    <div className="text-sm text-muted-foreground">
                      <p>Total active learners with complete profiles: {info.total_learners}</p>
                      <p>With user profiles: {info.with_profiles}</p>
                      <p>Missing user profiles: {info.without_profiles}</p>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>

              {/* Missing Profiles List */}
              {info.details.length > 0 && (
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium mb-3">
                    Learners Missing User Profiles ({info.details.length})
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {info.details.map((learner) => (
                      <div
                        key={learner.learner_id}
                        className="flex justify-between items-center p-2 bg-muted rounded text-sm"
                      >
                        <div>
                          <span className="font-medium">{learner.name}</span>
                          <span className="text-muted-foreground ml-2">
                            ({learner.college_email})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Create Result */}
          {createResult && (
            <div className="space-y-4">
              {/* Success */}
              {createResult.created_count > 0 && (
                <Alert className="border-green-500 bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-medium text-green-900">
                        Successfully created {createResult.created_count} user profile
                        {createResult.created_count === 1 ? '' : 's'}
                      </p>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {createResult.created_profiles.map((profile) => (
                          <div
                            key={profile.learner_id}
                            className="p-2 bg-white rounded text-sm"
                          >
                            <div className="font-medium text-green-900">
                              {profile.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Email: {profile.email}
                            </div>
                            <div className="text-xs font-mono bg-gray-100 p-1 mt-1 rounded">
                              Temp Password: {profile.temp_password}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        ⚠️ Save these temporary passwords and share them securely with the learners.
                      </p>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Failures */}
              {createResult.failed_count > 0 && (
                <Alert className="border-red-500 bg-red-50">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-medium text-red-900">
                        Failed to create {createResult.failed_count} profile
                        {createResult.failed_count === 1 ? '' : 's'}
                      </p>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {createResult.failed_profiles.map((profile) => (
                          <div
                            key={profile.learner_id}
                            className="p-2 bg-white rounded text-sm"
                          >
                            <div className="font-medium text-red-900">
                              {profile.name} ({profile.email})
                            </div>
                            <div className="text-xs text-red-700 mt-1">
                              Error: {profile.error}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleCheck()}
            disabled={checking || creating}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
            Re-check
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              checking ||
              creating ||
              !info ||
              info.details.length === 0
            }
          >
            {creating ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Create {info?.details.length || 0} Profile
                {info?.details.length === 1 ? '' : 's'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
