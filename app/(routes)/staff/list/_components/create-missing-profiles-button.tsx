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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface ProcessResult {
  total_processed: number;
  successful: number;
  failed: number;
  created_count: number; // Number of new profiles created
  updated_count: number; // Number of existing profiles updated
  created_profiles: Array<{
    staff_id: string;
    email: string;
    full_name: string;
    user_id: string;
    temp_password: string;
    action?: string; // 'created', 'updated', or 'skipped'
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
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(
    new Set()
  );
  const [showPreview, setShowPreview] = useState(false);

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

      // Auto-select all staff needing sync
      const allNeedingSyncIds = new Set<string>();
      data.details.staff_with_incomplete_profiles?.forEach((staff: any) => {
        allNeedingSyncIds.add(staff.staff_id);
      });
      data.details.staff_without_profiles?.forEach((staff: any) => {
        allNeedingSyncIds.add(staff.staff_id);
      });
      setSelectedStaffIds(allNeedingSyncIds);
    } catch (error) {
      console.error('Error checking profiles:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to check profiles'
      );
    } finally {
      setIsChecking(false);
    }
  };

  const toggleStaffSelection = (staffId: string) => {
    setSelectedStaffIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(staffId)) {
        newSet.delete(staffId);
      } else {
        newSet.add(staffId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedStaffIds.size > 0) {
      setSelectedStaffIds(new Set());
    } else {
      const allIds = new Set<string>();
      checkData?.details.staff_with_incomplete_profiles?.forEach(
        (staff: any) => {
          allIds.add(staff.staff_id);
        }
      );
      checkData?.details.staff_without_profiles?.forEach((staff: any) => {
        allIds.add(staff.staff_id);
      });
      setSelectedStaffIds(allIds);
    }
  };

  const handleCreateProfiles = async () => {
    try {
      setIsLoading(true);

      if (selectedStaffIds.size === 0) {
        toast.error('Please select at least one staff member to sync');
        setIsLoading(false);
        return;
      }

      const response = await fetch('/api/staff/create-missing-profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          staff_ids: Array.from(selectedStaffIds)
        })
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
    setShowPreview(false);
    setSelectedStaffIds(new Set());
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
              ? checkData.summary.total_needing_sync > 0
                ? `Found ${checkData.summary.total_needing_sync} staff members needing profile sync (${checkData.summary.with_incomplete_profiles} incomplete, ${checkData.summary.without_profiles} missing) out of ${checkData.summary.total_staff} total.`
                : `All ${checkData.summary.total_staff} staff members have complete profiles.`
              : "This will sync profiles for staff members, creating missing ones and updating incomplete ones."}
          </DialogDescription>
        </DialogHeader>

        {isChecking ? (
          <div className='flex items-center justify-center p-8'>
            <Loader2 className='h-8 w-8 animate-spin' />
            <span className='ml-2'>Checking profiles...</span>
          </div>
        ) : !result && checkData ? (
          <>
            {checkData.summary.total_needing_sync === 0 ? (
              <Alert className='border-green-200 bg-green-50'>
                <CheckCircle className='h-4 w-4' />
                <AlertTitle>All Set!</AlertTitle>
                <AlertDescription>
                  All {checkData.summary.total_staff} staff members have
                  complete and correct user profiles. No action needed.
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
                        Complete Profiles:{' '}
                        <strong>
                          {checkData.summary.with_complete_profiles}
                        </strong>
                      </div>
                      {checkData.summary.with_incomplete_profiles > 0 && (
                        <div className='text-orange-600'>
                          Incomplete Profiles (need update):{' '}
                          <strong>
                            {checkData.summary.with_incomplete_profiles}
                          </strong>
                        </div>
                      )}
                      {checkData.summary.without_profiles > 0 && (
                        <div className='text-red-600'>
                          Missing Profiles (need creation):{' '}
                          <strong>{checkData.summary.without_profiles}</strong>
                        </div>
                      )}
                      <div className='text-blue-600 font-semibold pt-1 border-t'>
                        Total Needing Sync:{' '}
                        <strong>{checkData.summary.total_needing_sync}</strong>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>

                <Alert>
                  <AlertCircle className='h-4 w-4' />
                  <AlertTitle>This process will:</AlertTitle>
                  <AlertDescription>
                    <ul className='list-disc list-inside mt-2 space-y-1'>
                      {checkData.summary.with_incomplete_profiles > 0 && (
                        <>
                          <li className='text-orange-600 font-medium'>
                            Update {checkData.summary.with_incomplete_profiles}{' '}
                            existing profiles with correct role, institution,
                            and department
                          </li>
                        </>
                      )}
                      {checkData.summary.without_profiles > 0 && (
                        <>
                          <li>
                            Create {checkData.summary.without_profiles} new
                            profiles for staff without them
                          </li>
                          <li>
                            Set all new profiles with &apos;faculty&apos; role
                          </li>
                        </>
                      )}
                      <li>
                        Link all profiles to their respective institutions and
                        departments
                      </li>
                      <li>Enable OAuth login for all staff members</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </>
            )}

            {!showPreview && checkData.summary.total_needing_sync > 0 && (
              <Button
                onClick={() => setShowPreview(true)}
                className='w-full gap-2'
              >
                <AlertCircle className='h-4 w-4' />
                Preview Changes Before Sync
              </Button>
            )}

            {showPreview && checkData.summary.total_needing_sync > 0 && (
              <>
                {/* Preview Section */}
                <div className='border rounded-lg p-4 space-y-4 bg-slate-50'>
                  <div className='flex items-center justify-between'>
                    <h4 className='font-semibold text-sm'>
                      Review Changes ({selectedStaffIds.size} selected)
                    </h4>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={toggleSelectAll}
                    >
                      {selectedStaffIds.size > 0
                        ? 'Deselect All'
                        : 'Select All'}
                    </Button>
                  </div>

                  <div className='max-h-96 overflow-y-auto border rounded bg-white'>
                    {/* Incomplete Profiles Section */}
                    {checkData.details.staff_with_incomplete_profiles?.length >
                      0 && (
                      <div className='p-3 border-b bg-orange-50'>
                        <h5 className='font-medium text-sm text-orange-800 mb-2'>
                          Profiles Needing Updates (
                          {
                            checkData.details.staff_with_incomplete_profiles
                              .length
                          }
                          )
                        </h5>
                        {checkData.details.staff_with_incomplete_profiles.map(
                          (staff: any) => (
                            <div
                              key={staff.staff_id}
                              className='mb-3 last:mb-0 bg-white rounded p-3 shadow-sm'
                            >
                              <div className='flex items-start gap-2 mb-2'>
                                <Checkbox
                                  checked={selectedStaffIds.has(
                                    staff.staff_id
                                  )}
                                  onCheckedChange={() =>
                                    toggleStaffSelection(staff.staff_id)
                                  }
                                  className='mt-1'
                                />
                                <div className='flex-1'>
                                  <div className='font-medium text-sm'>
                                    {staff.name}
                                  </div>
                                  <div className='text-xs text-muted-foreground'>
                                    {staff.email}
                                  </div>
                                </div>
                              </div>

                              {/* Field Changes */}
                              <div className='ml-6 space-y-1 text-xs'>
                                {Object.entries(staff.changes).map(
                                  ([field, change]: [string, any]) =>
                                    change.changed && (
                                      <div
                                        key={field}
                                        className='flex items-center gap-2 py-1'
                                      >
                                        <Badge
                                          variant='outline'
                                          className='text-xs font-mono min-w-28'
                                        >
                                          {field}
                                        </Badge>
                                        <span className='text-red-600 line-through'>
                                          {change.current || '(empty)'}
                                        </span>
                                        <span>→</span>
                                        <span className='text-green-600 font-medium'>
                                          {change.new}
                                        </span>
                                      </div>
                                    )
                                )}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    )}

                    {/* Missing Profiles Section */}
                    {checkData.details.staff_without_profiles?.length > 0 && (
                      <div className='p-3 bg-red-50'>
                        <h5 className='font-medium text-sm text-red-800 mb-2'>
                          New Profiles to Create (
                          {checkData.details.staff_without_profiles.length})
                        </h5>
                        {checkData.details.staff_without_profiles.map(
                          (staff: any) => (
                            <div
                              key={staff.staff_id}
                              className='mb-2 last:mb-0 bg-white rounded p-3 shadow-sm'
                            >
                              <div className='flex items-center gap-2'>
                                <Checkbox
                                  checked={selectedStaffIds.has(
                                    staff.staff_id
                                  )}
                                  onCheckedChange={() =>
                                    toggleStaffSelection(staff.staff_id)
                                  }
                                />
                                <div className='flex-1'>
                                  <div className='font-medium text-sm'>
                                    {staff.name}
                                  </div>
                                  <div className='text-xs text-muted-foreground'>
                                    {staff.email}
                                  </div>
                                  <Badge
                                    variant='secondary'
                                    className='mt-1 text-xs'
                                  >
                                    New Profile
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
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
              {showPreview && selectedStaffIds.size > 0 && (
                <Button
                  onClick={handleCreateProfiles}
                  disabled={isLoading}
                  className='gap-2'
                >
                  {isLoading ? (
                    <>
                      <Loader2 className='h-4 w-4 animate-spin' />
                      Syncing {selectedStaffIds.size} Profiles...
                    </>
                  ) : (
                    <>
                      <UserPlus className='h-4 w-4' />
                      Sync {selectedStaffIds.size} Selected Profiles
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
                    {result.created_count > 0 && (
                      <div className='text-green-600'>
                        Created: <strong>{result.created_count}</strong>
                      </div>
                    )}
                    {result.updated_count > 0 && (
                      <div className='text-blue-600'>
                        Updated: <strong>{result.updated_count}</strong>
                      </div>
                    )}
                    <div className='text-green-600'>
                      Total successful: <strong>{result.successful}</strong>
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
                    Successfully Processed Profiles:
                  </h4>
                  <div className='max-h-32 overflow-y-auto border rounded p-2 text-sm'>
                    {result.created_profiles.map((profile, index) => (
                      <div key={index} className='flex justify-between py-1'>
                        <span>
                          {profile.full_name}{' '}
                          {profile.action && (
                            <span
                              className={`text-xs ${
                                profile.action === 'created'
                                  ? 'text-green-600'
                                  : profile.action === 'updated'
                                  ? 'text-blue-600'
                                  : 'text-gray-500'
                              }`}
                            >
                              ({profile.action})
                            </span>
                          )}
                        </span>
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
