'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { UserPlus, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ProcessResult {
  total_processed: number;
  successful: number;
  failed: number;
  created_profiles: Array<{
    staff_id: string;
    email: string;
    full_name: string;
    user_id: string;
    temp_password: string;
    success: boolean;
  }>;
  errors: Array<{
    staff_id: string;
    email: string;
    full_name: string;
    error: string;
    success: boolean;
  }>;
}

export function CreateMissingProfilesButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [checkData, setCheckData] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(false);

  // Check status when dialog opens
  const handleDialogOpen = async (open: boolean) => {
    setIsOpen(open);
    if (open && !checkData) {
      await checkMissingProfiles();
    }
  };

  const checkMissingProfiles = async () => {
    try {
      setIsChecking(true);

      const response = await fetch('/api/staff/check-missing-profiles', {
        method: 'GET',
        credentials: 'include'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check profiles');
      }

      setCheckData(data);
    } catch (error) {
      console.error('Error checking profiles:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to check profiles'
      );
    } finally {
      setIsChecking(false);
    }
  };

  const handleCreateProfiles = async () => {
    try {
      setIsLoading(true);

      const response = await fetch('/api/staff/create-missing-profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create profiles');
      }

      setResult(data.results);

      if (data.results.successful > 0) {
        toast.success(
          `Successfully created ${data.results.successful} user profiles!`
        );
      }

      if (data.results.failed > 0) {
        toast.error(
          `${data.results.failed} profiles failed to create. Check console for details.`
        );
      }

      console.log('Profile creation results:', data.results);
    } catch (error) {
      console.error('Error creating profiles:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create profiles'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const resetDialog = () => {
    setResult(null);
    setCheckData(null);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpen}>
      <DialogTrigger asChild>
        <Button
          variant='outline'
          className='gap-2'
          onClick={() => setIsOpen(true)}
        >
          <UserPlus className='h-4 w-4' />
          Create Missing Profiles
        </Button>
      </DialogTrigger>

      <DialogContent className='max-w-2xl max-h-[80vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Create Missing User Profiles</DialogTitle>
          <DialogDescription>
            {isChecking
              ? 'Checking current status...'
              : checkData
              ? `Found ${checkData.summary.without_profiles} staff members without profiles out of ${checkData.summary.total_staff} total.`
              : "This will create user accounts and profiles for staff members who don't have them yet."}
            {!result &&
              !isChecking &&
              checkData &&
              checkData.summary.without_profiles > 0 &&
              ' Each staff member will receive a temporary password.'}
          </DialogDescription>
        </DialogHeader>

        {isChecking ? (
          <div className='flex items-center justify-center p-8'>
            <Loader2 className='h-8 w-8 animate-spin' />
            <span className='ml-2'>Checking profiles...</span>
          </div>
        ) : !result && checkData ? (
          <>
            {checkData.summary.without_profiles === 0 ? (
              <Alert className='border-green-200 bg-green-50'>
                <CheckCircle className='h-4 w-4' />
                <AlertTitle>All Set!</AlertTitle>
                <AlertDescription>
                  All {checkData.summary.total_staff} staff members already have
                  user profiles. No action needed.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <Alert>
                  <AlertCircle className='h-4 w-4' />
                  <AlertTitle>Profile Status Summary</AlertTitle>
                  <AlertDescription>
                    <div className='space-y-2 mt-2'>
                      <div>
                        Total Staff:{' '}
                        <strong>{checkData.summary.total_staff}</strong>
                      </div>
                      <div className='text-green-600'>
                        With Profiles:{' '}
                        <strong>{checkData.summary.with_profiles}</strong>
                      </div>
                      <div className='text-orange-600'>
                        Missing Profiles:{' '}
                        <strong>{checkData.summary.without_profiles}</strong>
                      </div>
                      {checkData.summary.with_auth_but_no_profile > 0 && (
                        <div className='text-blue-600'>
                          Have Auth but Missing Profile:{' '}
                          <strong>
                            {checkData.summary.with_auth_but_no_profile}
                          </strong>
                        </div>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>

                <Alert>
                  <AlertCircle className='h-4 w-4' />
                  <AlertTitle>This process will:</AlertTitle>
                  <AlertDescription>
                    <ul className='list-disc list-inside mt-2 space-y-1'>
                      <li>
                        Create authentication accounts for staff without them
                      </li>
                      <li>
                        Create profiles for all{' '}
                        {checkData.summary.without_profiles} missing staff
                      </li>
                      <li>Generate temporary passwords for new accounts</li>
                      <li>
                        Set all new accounts with &apos;faculty&apos; role
                      </li>
                      <li>Link accounts to their respective institutions</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </>
            )}

            <DialogFooter>
              <Button
                variant='outline'
                onClick={resetDialog}
                disabled={isLoading}
              >
                Cancel
              </Button>
              {checkData.summary.without_profiles > 0 && (
                <Button
                  onClick={handleCreateProfiles}
                  disabled={isLoading}
                  className='gap-2'
                >
                  {isLoading ? (
                    <>
                      <Loader2 className='h-4 w-4 animate-spin' />
                      Creating Profiles...
                    </>
                  ) : (
                    <>
                      <UserPlus className='h-4 w-4' />
                      Create {checkData.summary.without_profiles} Profiles
                    </>
                  )}
                </Button>
              )}
            </DialogFooter>
          </>
        ) : !result ? (
          <>
            <Alert>
              <AlertCircle className='h-4 w-4' />
              <AlertTitle>Important</AlertTitle>
              <AlertDescription>
                This process will:
                <ul className='list-disc list-inside mt-2 space-y-1'>
                  <li>
                    Create authentication accounts for staff without profiles
                  </li>
                  <li>Generate temporary passwords for new accounts</li>
                  <li>Set all new accounts with &apos;faculty&apos; role</li>
                  <li>Link accounts to their respective institutions</li>
                </ul>
              </AlertDescription>
            </Alert>

            <DialogFooter>
              <Button
                variant='outline'
                onClick={resetDialog}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateProfiles}
                disabled={isLoading}
                className='gap-2'
              >
                {isLoading ? (
                  <>
                    <Loader2 className='h-4 w-4 animate-spin' />
                    Creating Profiles...
                  </>
                ) : (
                  <>
                    <UserPlus className='h-4 w-4' />
                    Create Profiles
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className='space-y-4'>
              <Alert
                className={
                  result.successful > 0 ? 'border-green-200 bg-green-50' : ''
                }
              >
                <CheckCircle className='h-4 w-4' />
                <AlertTitle>Process Complete</AlertTitle>
                <AlertDescription>
                  <div className='space-y-2'>
                    <div>
                      Total processed: <strong>{result.total_processed}</strong>
                    </div>
                    <div className='text-green-600'>
                      Successfully created: <strong>{result.successful}</strong>
                    </div>
                    {result.failed > 0 && (
                      <div className='text-red-600'>
                        Failed: <strong>{result.failed}</strong>
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>

              {result.created_profiles.length > 0 && (
                <div>
                  <h4 className='font-semibold mb-2'>
                    Successfully Created Profiles:
                  </h4>
                  <div className='max-h-32 overflow-y-auto border rounded p-2 text-sm'>
                    {result.created_profiles.map((profile, index) => (
                      <div key={index} className='flex justify-between py-1'>
                        <span>{profile.full_name}</span>
                        <span className='text-muted-foreground'>
                          {profile.email}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.errors.length > 0 && (
                <div>
                  <h4 className='font-semibold mb-2 text-red-600'>
                    Failed Profiles:
                  </h4>
                  <div className='max-h-32 overflow-y-auto border rounded p-2 text-sm'>
                    {result.errors.map((error, index) => (
                      <div key={index} className='py-1'>
                        <div className='font-medium'>
                          {error.full_name} ({error.email})
                        </div>
                        <div className='text-red-500 text-xs'>
                          {error.error}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={resetDialog}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
