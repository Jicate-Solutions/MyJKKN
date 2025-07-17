'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  UserCheck,
  XCircle
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';

interface MissingProfilesInfo {
  success: boolean;
  summary: {
    total_students: number;
    with_profiles: number;
    without_profiles: number;
    with_auth_but_no_profile: number;
    without_auth_or_profile: number;
  };
  details: {
    students_with_profiles: Array<{
      name: string;
      email: string;
    }>;
    students_without_profiles: Array<{
      name: string;
      email: string;
      has_auth_user: boolean;
    }>;
  };
}

interface CreateProfileResult {
  student_id: string;
  email: string;
  full_name: string;
  user_id: string;
  temp_password: string;
  auth_user_existed: boolean;
  success: boolean;
  error?: string;
}

interface CreateProfilesResponse {
  success: boolean;
  message: string;
  results: CreateProfileResult[];
  errors: CreateProfileResult[];
  summary: {
    total_processed: number;
    successful: number;
    failed: number;
    already_existed: number;
  };
}

export function CreateMissingStudentProfilesButton() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [missingProfilesInfo, setMissingProfilesInfo] =
    useState<MissingProfilesInfo | null>(null);
  const [createResults, setCreateResults] =
    useState<CreateProfilesResponse | null>(null);

  const handleCheckMissingProfiles = async () => {
    setIsChecking(true);
    setMissingProfilesInfo(null);
    setCreateResults(null);

    try {
      const response = await fetch('/api/students/check-missing-profiles');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check missing profiles');
      }

      console.log('Missing profiles API response:', data);

      // Validate the response structure
      if (!data.success || !data.summary || !data.details) {
        throw new Error('Invalid response format from API');
      }

      setMissingProfilesInfo(data);
    } catch (error) {
      console.error('Error checking missing profiles:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to check missing profiles'
      );
    } finally {
      setIsChecking(false);
    }
  };

  const handleCreateMissingProfiles = async () => {
    setIsCreating(true);
    setCreateResults(null);

    try {
      const response = await fetch('/api/students/create-missing-profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create missing profiles');
      }

      setCreateResults(data);

      // Show success message
      if (data.summary.successful > 0) {
        toast.success(
          `Successfully created ${data.summary.successful} user account(s) for completed profiles!`
        );
        // Refresh the page to update student lists
        router.refresh();
      }

      if (data.summary.failed > 0) {
        toast.error(
          `Failed to create ${data.summary.failed} user account(s). Check the results below.`
        );
      }

      if (data.summary.already_existed > 0) {
        toast(
          `${data.summary.already_existed} user account(s) already existed.`,
          { icon: 'ℹ️' }
        );
      }
    } catch (error) {
      console.error('Error creating missing profiles:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to create missing profiles'
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Auto-check when dialog opens
      handleCheckMissingProfiles();
    } else {
      // Reset state when closing
      setMissingProfilesInfo(null);
      setCreateResults(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant='outline' className='w-full sm:w-auto'>
          <UserCheck className='mr-2 h-4 w-4' />
          Create Missing Profiles
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-4xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Create Missing User Profiles</DialogTitle>
          <DialogDescription>
            Check for students who have <strong>completed profiles</strong> with
            college emails but no user accounts. Students with incomplete
            profiles are in the onboarding process and are not included.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-6'>
          {/* Check Results */}
          {isChecking && (
            <div className='flex items-center justify-center p-8'>
              <Loader2 className='h-8 w-8 animate-spin mr-3' />
              <span>Checking for missing profiles...</span>
            </div>
          )}

          {missingProfilesInfo && !createResults && (
            <div className='space-y-4'>
              <Alert>
                <AlertCircle className='h-4 w-4' />
                <AlertTitle>Completed Profile Status Summary</AlertTitle>
                <AlertDescription className='space-y-2'>
                  <p className='text-sm text-muted-foreground mb-2'>
                    Only showing students with completed profiles
                    (is_profile_complete = true)
                  </p>
                  <div className='grid grid-cols-2 gap-4 mt-3'>
                    <div>
                      <Badge variant='secondary' className='mb-1'>
                        Completed Profiles:{' '}
                        {missingProfilesInfo.summary.total_students}
                      </Badge>
                    </div>
                    <div>
                      <Badge variant='default' className='mb-1'>
                        With Profiles:{' '}
                        {missingProfilesInfo.summary.with_profiles}
                      </Badge>
                    </div>
                    <div>
                      <Badge variant='destructive' className='mb-1'>
                        Missing Profiles:{' '}
                        {missingProfilesInfo.summary.without_profiles}
                      </Badge>
                    </div>
                    <div>
                      <Badge variant='outline' className='mb-1'>
                        Auth But No Profile:{' '}
                        {missingProfilesInfo.summary.with_auth_but_no_profile}
                      </Badge>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>

              {missingProfilesInfo.details.students_without_profiles &&
                missingProfilesInfo.details.students_without_profiles.length >
                  0 && (
                  <div>
                    <h4 className='font-medium mb-3'>
                      Completed Profiles Missing User Accounts (
                      {
                        missingProfilesInfo.details.students_without_profiles
                          .length
                      }
                      ):
                    </h4>
                    <div className='max-h-64 overflow-y-auto border rounded-md'>
                      {missingProfilesInfo.details.students_without_profiles.map(
                        (student, index) => (
                          <div
                            key={index}
                            className='p-3 border-b last:border-b-0 flex justify-between items-center'
                          >
                            <div>
                              <div className='font-medium'>{student.name}</div>
                              <div className='text-sm text-muted-foreground'>
                                {student.email}
                              </div>
                            </div>
                            <Badge variant='outline'>
                              Missing User Account
                            </Badge>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

              {(!missingProfilesInfo.details.students_without_profiles ||
                missingProfilesInfo.details.students_without_profiles.length ===
                  0) && (
                <Alert>
                  <CheckCircle className='h-4 w-4' />
                  <AlertTitle>All Good!</AlertTitle>
                  <AlertDescription>
                    All students with completed profiles already have user
                    accounts. No action needed. Students with incomplete
                    profiles are handled through the onboarding process.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Create Results */}
          {createResults && (
            <div className='space-y-4'>
              <Alert>
                <CheckCircle className='h-4 w-4' />
                <AlertTitle>Profile Creation Complete</AlertTitle>
                <AlertDescription className='space-y-2'>
                  <div className='grid grid-cols-2 gap-4 mt-3'>
                    <div>
                      <Badge variant='default' className='mb-1'>
                        Successfully Created: {createResults.summary.successful}
                      </Badge>
                    </div>
                    <div>
                      <Badge variant='destructive' className='mb-1'>
                        Failed: {createResults.summary.failed}
                      </Badge>
                    </div>
                    <div>
                      <Badge variant='secondary' className='mb-1'>
                        Already Existed: {createResults.summary.already_existed}
                      </Badge>
                    </div>
                    <div>
                      <Badge variant='outline' className='mb-1'>
                        Total Processed: {createResults.summary.total_processed}
                      </Badge>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>

              {/* Detailed Results */}
              {(createResults.results.length > 0 ||
                createResults.errors.length > 0) && (
                <div className='max-h-64 overflow-y-auto border rounded-md'>
                  {createResults.results.map((result) => (
                    <div
                      key={result.student_id}
                      className='p-3 border-b last:border-b-0 flex justify-between items-center'
                    >
                      <div>
                        <div className='font-medium'>{result.full_name}</div>
                        <div className='text-sm text-muted-foreground'>
                          {result.email}
                        </div>
                        {result.temp_password &&
                          result.temp_password !==
                            'Profile already existed' && (
                            <div className='text-xs text-blue-600'>
                              Temp Password: {result.temp_password}
                            </div>
                          )}
                      </div>
                      <Badge variant='default'>
                        <CheckCircle className='h-3 w-3 mr-1' />
                        {result.auth_user_existed
                          ? 'Profile Created'
                          : 'User & Profile Created'}
                      </Badge>
                    </div>
                  ))}
                  {createResults.errors.map((error) => (
                    <div
                      key={error.student_id}
                      className='p-3 border-b last:border-b-0 flex justify-between items-center'
                    >
                      <div>
                        <div className='font-medium'>{error.full_name}</div>
                        <div className='text-sm text-muted-foreground'>
                          {error.email}
                        </div>
                        <div className='text-xs text-red-600'>
                          {error.error}
                        </div>
                      </div>
                      <Badge variant='destructive'>
                        <XCircle className='h-3 w-3 mr-1' />
                        Failed
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className='flex flex-col sm:flex-row gap-2'>
          <Button
            variant='outline'
            onClick={() => setIsOpen(false)}
            className='w-full sm:w-auto'
          >
            Close
          </Button>

          {!createResults && !isChecking && (
            <Button
              onClick={handleCheckMissingProfiles}
              disabled={isChecking}
              variant='secondary'
              className='w-full sm:w-auto'
            >
              <Loader2
                className={`mr-2 h-4 w-4 ${
                  isChecking ? 'animate-spin' : 'hidden'
                }`}
              />
              Recheck Profiles
            </Button>
          )}

          {missingProfilesInfo &&
            missingProfilesInfo.details.students_without_profiles &&
            missingProfilesInfo.details.students_without_profiles.length > 0 &&
            !createResults && (
              <Button
                onClick={handleCreateMissingProfiles}
                disabled={isCreating}
                className='w-full sm:w-auto'
              >
                {isCreating ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    Creating User Accounts...
                  </>
                ) : (
                  <>
                    <UserCheck className='mr-2 h-4 w-4' />
                    Create{' '}
                    {
                      missingProfilesInfo.details.students_without_profiles
                        .length
                    }{' '}
                    User Account(s)
                  </>
                )}
              </Button>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
