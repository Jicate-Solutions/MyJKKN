'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  CheckCircle,
  RefreshCcw,
  X,
  Check,
  Lock,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import Loading from '@/components/Loading/Loading';

interface TimetableConflict {
  timetable_id: string;
  timetable_name: string;
  semester: string;
  section: string;
  course_id: string;
  course_name: string;
  timetable_staff_id: string;
  timetable_staff_name: string;
  planned_staff_id: string;
  planned_staff_name: string;
  conflict_type: 'STAFF_MISMATCH' | 'NO_STAFF_PLAN';
}

export default function TimetableConflictsPage() {
  const router = useRouter();
  const [conflicts, setConflicts] = useState<TimetableConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingTimetable, setSyncingTimetable] = useState<string | null>(null);
  const [selectedConflicts, setSelectedConflicts] = useState<Set<string>>(
    new Set()
  );
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(true);
  const [activeTab, setActiveTab] = useState('staff-mismatch');
  const [currentPage, setCurrentPage] = useState({
    'staff-mismatch': 1,
    'missing-plans': 1
  });
  const [pageSize] = useState(10);
  const supabase = createClientSupabaseClient();

  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();

  // Check super admin permissions
  useEffect(() => {
    if (!permissionsLoading) {
      if (!isSuperAdmin) {
        toast.error(
          'Access Denied: Only super administrators can access timetable conflicts.'
        );
        router.push('/academic/timetables');
      } else {
        setIsCheckingPermissions(false);
        loadConflicts();
      }
    }
  }, [permissionsLoading, isSuperAdmin, router]);

  const loadConflicts = async () => {
    try {
      setLoading(true);
      setError(null);

      // Call the database function directly
      const { data: conflictData, error: conflictError } = await supabase.rpc(
        'get_all_timetable_staff_conflicts'
      );

      if (conflictError) throw conflictError;

      setConflicts(conflictData || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conflicts');
      console.error('Error loading conflicts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncTimetable = async (
    conflict: TimetableConflict,
    showIndividualToast = true
  ) => {
    if (!conflict.planned_staff_id) {
      if (showIndividualToast) {
        toast.error('Cannot sync: No staff planned for this course.');
      }
      return { success: false, error: 'No staff planned for this course' };
    }

    try {
      if (showIndividualToast) {
        setSyncingTimetable(conflict.timetable_id);
      }

      // Debug: Log sync parameters
      console.log('Syncing timetable with parameters:', {
        timetable_id: conflict.timetable_id,
        course_id: conflict.course_id,
        old_staff_id: conflict.timetable_staff_id,
        new_staff_id: conflict.planned_staff_id,
        timetable_name: conflict.timetable_name
      });

      // Call the sync function directly
      const { data: syncResult, error: syncError } = await supabase.rpc(
        'sync_timetable_staff_assignment',
        {
          p_timetable_id: conflict.timetable_id,
          p_course_id: conflict.course_id,
          p_old_staff_id: conflict.timetable_staff_id,
          p_new_staff_id: conflict.planned_staff_id
        }
      );

      console.log('Sync result:', { syncResult, syncError });

      if (syncError) {
        console.error('Sync error details:', syncError);
        throw new Error(syncError.message || 'Database sync function failed');
      }

      if (syncResult) {
        if (showIndividualToast) {
          toast.success(`✅ ${conflict.timetable_name} synced successfully!`);
          // Refresh the conflicts list after individual sync
          setTimeout(() => {
            loadConflicts();
          }, 300);
        }
        return { success: true };
      } else {
        const errorMsg = 'Sync function returned false - check database logs';
        if (showIndividualToast) {
          toast.error('❌ ' + errorMsg);
        }
        return { success: false, error: errorMsg };
      }
    } catch (error) {
      console.error('Sync error:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to sync timetable with staff planning';
      if (showIndividualToast) {
        toast.error('❌ ' + errorMessage);
      }
      return { success: false, error: errorMessage };
    } finally {
      if (showIndividualToast) {
        setSyncingTimetable(null);
      }
    }
  };

  const getConflictBadge = (type: string) => {
    switch (type) {
      case 'STAFF_MISMATCH':
        return (
          <Badge variant='destructive' className='gap-1'>
            <AlertTriangle className='h-3 w-3' />
            Staff Mismatch
          </Badge>
        );
      case 'NO_STAFF_PLAN':
        return (
          <Badge variant='secondary' className='gap-1'>
            <AlertTriangle className='h-3 w-3' />
            No Staff Plan
          </Badge>
        );
      default:
        return (
          <Badge variant='default' className='gap-1'>
            <CheckCircle className='h-3 w-3' />
            Correct
          </Badge>
        );
    }
  };

  const conflictsByType = {
    STAFF_MISMATCH: conflicts.filter(
      (c) => c.conflict_type === 'STAFF_MISMATCH'
    ),
    NO_STAFF_PLAN: conflicts.filter((c) => c.conflict_type === 'NO_STAFF_PLAN')
  };

  // Get syncable conflicts (only STAFF_MISMATCH with planned staff)
  const syncableConflicts = conflicts.filter(
    (c) => c.conflict_type === 'STAFF_MISMATCH' && c.planned_staff_id
  );

  // Pagination logic
  const getPaginatedConflicts = (
    type: 'STAFF_MISMATCH' | 'NO_STAFF_PLAN',
    page: number
  ) => {
    const typeConflicts = conflictsByType[type];
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return typeConflicts.slice(startIndex, endIndex);
  };

  const getTotalPages = (type: 'STAFF_MISMATCH' | 'NO_STAFF_PLAN') => {
    return Math.ceil(conflictsByType[type].length / pageSize);
  };

  const getCurrentPageConflicts = (tabKey: string) => {
    if (tabKey === 'staff-mismatch') {
      return getPaginatedConflicts(
        'STAFF_MISMATCH',
        currentPage['staff-mismatch']
      );
    } else {
      return getPaginatedConflicts(
        'NO_STAFF_PLAN',
        currentPage['missing-plans']
      );
    }
  };

  const handlePageChange = (tabKey: string, page: number) => {
    setCurrentPage((prev) => ({
      ...prev,
      [tabKey]: page
    }));
  };

  const handleSelectConflict = (conflictKey: string, checked: boolean) => {
    const newSelected = new Set(selectedConflicts);
    if (checked) {
      newSelected.add(conflictKey);
    } else {
      newSelected.delete(conflictKey);
    }
    setSelectedConflicts(newSelected);
  };

  const handleSelectAll = (tabKey: string) => {
    const currentConflicts = getCurrentPageConflicts(tabKey);
    const syncableCurrentConflicts = currentConflicts.filter(
      (c) => c.conflict_type === 'STAFF_MISMATCH' && c.planned_staff_id
    );
    const currentKeys = syncableCurrentConflicts.map(
      (c, index) => `${c.timetable_id}-${c.course_id}-${index}`
    );

    const allCurrentSelected = currentKeys.every((key) =>
      selectedConflicts.has(key)
    );

    if (allCurrentSelected) {
      // Deselect all current page conflicts
      const newSelected = new Set(selectedConflicts);
      currentKeys.forEach((key) => newSelected.delete(key));
      setSelectedConflicts(newSelected);
    } else {
      // Select all current page syncable conflicts
      const newSelected = new Set(selectedConflicts);
      currentKeys.forEach((key) => newSelected.add(key));
      setSelectedConflicts(newSelected);
    }
  };

  const handleBulkSync = async () => {
    if (selectedConflicts.size === 0) {
      toast.error('Please select at least one conflict to sync.');
      return;
    }

    setBulkSyncing(true);
    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    try {
      // Find selected conflicts
      const selectedConflictsList = conflicts.filter((conflict, index) => {
        const key = `${conflict.timetable_id}-${conflict.course_id}-${index}`;
        return selectedConflicts.has(key);
      });

      toast.loading(`Syncing ${selectedConflictsList.length} conflicts...`, {
        id: 'bulk-sync'
      });

      // Process each selected conflict
      for (const conflict of selectedConflictsList) {
        const result = await handleSyncTimetable(conflict, false);
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
          errors.push(`${conflict.timetable_name}: ${result.error}`);
        }
      }

      // Show results
      toast.dismiss('bulk-sync');

      if (successCount > 0 && failureCount === 0) {
        toast.success(
          `🎉 Successfully synced ${successCount} timetable${
            successCount > 1 ? 's' : ''
          }!`
        );
      } else if (successCount > 0 && failureCount > 0) {
        toast.success(
          `✅ ${successCount} synced, ❌ ${failureCount} failed. Check console for details.`
        );
        console.error('Bulk sync errors:', errors);
      } else {
        toast.error(
          `❌ All ${failureCount} sync operations failed. Check console for details.`
        );
        console.error('Bulk sync errors:', errors);
      }

      // Clear selections and reload conflicts with delay to ensure DB changes are committed
      setSelectedConflicts(new Set());

      // Add small delay to ensure database changes are committed
      setTimeout(async () => {
        await loadConflicts();
      }, 500);
    } catch (error) {
      toast.dismiss('bulk-sync');
      console.error('Bulk sync error:', error);
      toast.error('Bulk sync operation failed.');
    } finally {
      setBulkSyncing(false);
    }
  };

  // Pagination component
  const PaginationControls = ({
    tabKey,
    totalPages
  }: {
    tabKey: string;
    totalPages: number;
  }) => {
    const currentPageNum = currentPage[tabKey as keyof typeof currentPage];

    if (totalPages <= 1) return null;

    return (
      <div className='flex items-center justify-between mt-4'>
        <div className='text-sm text-muted-foreground'>
          Page {currentPageNum} of {totalPages}
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => handlePageChange(tabKey, currentPageNum - 1)}
            disabled={currentPageNum === 1}
          >
            <ChevronLeft className='h-4 w-4' />
            Previous
          </Button>

          <div className='flex items-center gap-1'>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum =
                Math.max(1, Math.min(totalPages - 4, currentPageNum - 2)) + i;
              if (pageNum > totalPages) return null;

              return (
                <Button
                  key={pageNum}
                  variant={pageNum === currentPageNum ? 'default' : 'outline'}
                  size='sm'
                  onClick={() => handlePageChange(tabKey, pageNum)}
                  className='w-8 h-8 p-0'
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>

          <Button
            variant='outline'
            size='sm'
            onClick={() => handlePageChange(tabKey, currentPageNum + 1)}
            disabled={currentPageNum === totalPages}
          >
            Next
            <ChevronRight className='h-4 w-4' />
          </Button>
        </div>
      </div>
    );
  };

  // Show loading while checking permissions
  if (permissionsLoading || isCheckingPermissions) {
    return <Loading title='Checking permissions...' />;
  }

  // Redirect if not super admin
  if (!isSuperAdmin) {
    return <Loading title='Redirecting...' />;
  }

  if (loading) {
    return (
      <ContentLayout title='Timetable Staff Conflicts'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Timetable Staff Conflicts'>
        <Card>
          <CardContent className='pt-6'>
            <div className='text-center text-red-500'>
              <AlertTriangle className='h-8 w-8 mx-auto mb-4' />
              <p>{error}</p>
              <Button onClick={loadConflicts} className='mt-4'>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Timetable Staff Conflicts (Super Admin)'>
      {/* Super Admin Access Badge */}
      <div className='mb-4'>
        <Badge variant='destructive' className='gap-1'>
          <Lock className='h-3 w-3' />
          Super Admin Access Only
        </Badge>
      </div>

      <div className='space-y-6'>
        {/* Summary Cards */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Total Conflicts
              </CardTitle>
              <AlertTriangle className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{conflicts.length}</div>
              <p className='text-xs text-muted-foreground'>
                Assignments need attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Staff Mismatches
              </CardTitle>
              <AlertTriangle className='h-4 w-4 text-red-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-red-500'>
                {conflictsByType.STAFF_MISMATCH.length}
              </div>
              <p className='text-xs text-muted-foreground'>
                Different staff assigned vs planned
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>
                Missing Plans
              </CardTitle>
              <AlertTriangle className='h-4 w-4 text-amber-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-amber-500'>
                {conflictsByType.NO_STAFF_PLAN.length}
              </div>
              <p className='text-xs text-muted-foreground'>
                No staff planning found
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Conflicts Tabs */}
        {conflicts.length > 0 ? (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className='w-full'
          >
            <TabsList className='grid w-full grid-cols-2'>
              <TabsTrigger
                value='staff-mismatch'
                className='flex items-center gap-2'
              >
                <AlertTriangle className='h-4 w-4' />
                Staff Mismatches ({conflictsByType.STAFF_MISMATCH.length})
              </TabsTrigger>
              <TabsTrigger
                value='missing-plans'
                className='flex items-center gap-2'
              >
                <AlertTriangle className='h-4 w-4' />
                Missing Plans ({conflictsByType.NO_STAFF_PLAN.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value='staff-mismatch'>
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <AlertTriangle className='h-5 w-5 text-red-500' />
                    Staff Mismatches ({conflictsByType.STAFF_MISMATCH.length})
                  </CardTitle>
                  <p className='text-sm text-muted-foreground'>
                    Timetables where assigned staff differs from staff planning
                  </p>
                  <div className='flex gap-2 flex-wrap'>
                    <Button
                      onClick={loadConflicts}
                      variant='outline'
                      size='sm'
                      disabled={loading}
                    >
                      <RefreshCcw className='h-3 w-3 mr-1' />
                      Refresh
                    </Button>
                    {conflictsByType.STAFF_MISMATCH.some(
                      (c) => c.planned_staff_id
                    ) && (
                      <>
                        <Button
                          onClick={() => handleSelectAll('staff-mismatch')}
                          variant='outline'
                          size='sm'
                          disabled={bulkSyncing}
                        >
                          <Check className='h-3 w-3 mr-1' />
                          Select Page
                        </Button>
                        <Button
                          onClick={handleBulkSync}
                          variant='default'
                          size='sm'
                          disabled={selectedConflicts.size === 0 || bulkSyncing}
                        >
                          {bulkSyncing ? (
                            <div className='animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1'></div>
                          ) : (
                            <RefreshCcw className='h-3 w-3 mr-1' />
                          )}
                          Bulk Sync ({selectedConflicts.size})
                        </Button>
                        {selectedConflicts.size > 0 && (
                          <Button
                            onClick={() => setSelectedConflicts(new Set())}
                            variant='ghost'
                            size='sm'
                            disabled={bulkSyncing}
                          >
                            <X className='h-3 w-3 mr-1' />
                            Clear
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className='grid gap-4'>
                    {getCurrentPageConflicts('staff-mismatch').map(
                      (conflict, index) => {
                        const conflictKey = `${conflict.timetable_id}-${conflict.course_id}-${index}`;
                        const isSelected = selectedConflicts.has(conflictKey);
                        const canSync = conflict.planned_staff_id;

                        return (
                          <div
                            key={conflictKey}
                            className={`border rounded-lg p-4 ${
                              isSelected ? 'border-primary bg-primary/5' : ''
                            }`}
                          >
                            <div className='flex items-start justify-between'>
                              <div className='flex items-start gap-3'>
                                {canSync && (
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={(checked) =>
                                      handleSelectConflict(
                                        conflictKey,
                                        !!checked
                                      )
                                    }
                                    disabled={bulkSyncing}
                                    className='mt-1'
                                  />
                                )}
                                <div className='space-y-2'>
                                  <div>
                                    <div className='font-medium'>
                                      {conflict.timetable_name}
                                    </div>
                                    <div className='text-sm text-muted-foreground'>
                                      {conflict.semester} - {conflict.section}
                                    </div>
                                  </div>
                                  <div>
                                    <div className='font-medium'>
                                      {conflict.course_name}
                                    </div>
                                    <div className='text-sm text-muted-foreground'>
                                      Current:{' '}
                                      <span className='text-red-600 font-medium'>
                                        {conflict.timetable_staff_name}
                                      </span>{' '}
                                      → Planned:{' '}
                                      <span className='text-green-600 font-medium'>
                                        {conflict.planned_staff_name}
                                      </span>
                                    </div>
                                  </div>
                                  <div>
                                    {getConflictBadge(conflict.conflict_type)}
                                  </div>
                                </div>
                              </div>
                              <div>
                                {canSync && (
                                  <Button
                                    size='sm'
                                    variant='outline'
                                    onClick={() =>
                                      handleSyncTimetable(conflict)
                                    }
                                    disabled={
                                      syncingTimetable === conflict.timetable_id
                                    }
                                    className='gap-1'
                                  >
                                    {syncingTimetable ===
                                    conflict.timetable_id ? (
                                      <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-primary'></div>
                                    ) : (
                                      <RefreshCcw className='h-3 w-3' />
                                    )}
                                    Sync
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                  <PaginationControls
                    tabKey='staff-mismatch'
                    totalPages={getTotalPages('STAFF_MISMATCH')}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value='missing-plans'>
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <AlertTriangle className='h-5 w-5 text-amber-500' />
                    Missing Staff Plans ({conflictsByType.NO_STAFF_PLAN.length})
                  </CardTitle>
                  <p className='text-sm text-muted-foreground'>
                    Courses in timetables that don&apos;t have staff planning
                    configured
                  </p>
                  <div className='flex gap-2 flex-wrap'>
                    <Button
                      onClick={loadConflicts}
                      variant='outline'
                      size='sm'
                      disabled={loading}
                    >
                      <RefreshCcw className='h-3 w-3 mr-1' />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className='grid gap-4'>
                    {getCurrentPageConflicts('missing-plans').map(
                      (conflict, index) => {
                        const conflictKey = `${conflict.timetable_id}-${conflict.course_id}-${index}`;

                        return (
                          <div
                            key={conflictKey}
                            className='border rounded-lg p-4'
                          >
                            <div className='flex items-start justify-between'>
                              <div className='space-y-2'>
                                <div>
                                  <div className='font-medium'>
                                    {conflict.timetable_name}
                                  </div>
                                  <div className='text-sm text-muted-foreground'>
                                    {conflict.semester} - {conflict.section}
                                  </div>
                                </div>
                                <div>
                                  <div className='font-medium'>
                                    {conflict.course_name}
                                  </div>
                                  <div className='text-sm text-muted-foreground'>
                                    Currently assigned:{' '}
                                    {conflict.timetable_staff_name}
                                  </div>
                                  <div className='text-xs text-amber-600 mt-1'>
                                    💡 This course appears in the timetable but
                                    has no staff planning configured. Please add
                                    staff planning for this course to resolve
                                    the conflict.
                                  </div>
                                </div>
                                <div>
                                  {getConflictBadge(conflict.conflict_type)}
                                </div>
                              </div>
                              <div className='text-xs text-muted-foreground text-center'>
                                Add staff planning first
                              </div>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                  <PaginationControls
                    tabKey='missing-plans'
                    totalPages={getTotalPages('NO_STAFF_PLAN')}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : (
          <Card>
            <CardContent className='pt-6'>
              <div className='text-center'>
                <CheckCircle className='h-12 w-12 text-green-500 mx-auto mb-4' />
                <h3 className='text-lg font-semibold mb-2'>
                  No Conflicts Found
                </h3>
                <p className='text-muted-foreground'>
                  All timetable staff assignments match your staff planning! 🎉
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
