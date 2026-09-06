'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertBox } from '@/components/ui/alert-box';
import { Clock, Loader2 } from 'lucide-react';
import ScheduleRestoreDialog from './schedule-restore-dialog';
import BatchSizeSelector from './batch-size-selector';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { SchoolDefaultsRestoreService } from '@/lib/services/school-defaults-restore-service';

interface DeletedDegree {
  id: string;
  school_id: string;
  school_name: string;
  degree_name: string;
  degree_code: string;
}

interface BulkRestoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestoreComplete: () => void;
  deletedDegrees: DeletedDegree[];
  resourceType?: 'degree' | 'department';
}

export default function BulkRestoreDialog({
  open,
  onOpenChange,
  onRestoreComplete,
  deletedDegrees,
  resourceType = 'degree',
}: BulkRestoreDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [restoring, setRestoring] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState<{ restoreId: string; scheduledFor: Date } | null>(null);
  const [batchSize, setBatchSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const itemsPerPage = 50;
  const totalPages = Math.ceil(totalRecords / itemsPerPage);
  const [displayedRecords, setDisplayedRecords] = useState<DeletedDegree[]>([]);

  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set());
      setProgress(0);
      setProgressMessage('');
      setError(null);
      setSuccess(null);
      setCurrentPage(0);
    } else {
      // Load initial records
      loadRecordsPage(0);
    }
  }, [open]);

  async function loadRecordsPage(page: number) {
    try {
      const result = await SchoolDefaultsRestoreService.getDeletedRecordsPaginated(
        resourceType,
        page,
        itemsPerPage
      );

      const formattedRecords = result.records.map(r => ({
        id: r.id,
        school_id: r.school_id,
        school_name: r.school_name,
        degree_name: r.name,
        degree_code: r.code,
      }));

      setDisplayedRecords(formattedRecords);
      setTotalRecords(result.total);
      setCurrentPage(page);
    } catch (err) {
      console.error('Error loading records:', err);
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(displayedRecords.map(d => d.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  async function handleRestore() {
    if (selectedIds.size === 0) {
      setError('Please select at least one record to restore');
      return;
    }

    let isAborted = false;

    try {
      setRestoring(true);
      setError(null);
      setSuccess(null);
      setProgress(0);

      const supabase = createClientSupabaseClient();
      const { data: user, error: authError } = await supabase.auth.getUser();

      if (authError || !user.user?.id) {
        throw new Error('User not authenticated - please log in again');
      }

      const degreeIds = Array.from(selectedIds);

      // Restore with progress tracking and error handling
      let results;
      try {
        results = await SchoolDefaultsRestoreService.bulkRestoreDeletedRecordsBatched(
          degreeIds,
          resourceType,
          batchSize,
          (current, total) => {
            if (!isAborted) {
              const percent = Math.round((current / total) * 100);
              setProgress(percent);
              setProgressMessage(`Restoring... ${current} of ${total}`);
            }
          }
        );
      } catch (restoreError) {
        throw new Error(
          `Failed to restore records: ${restoreError instanceof Error ? restoreError.message : 'Unknown error'}`
        );
      }

      if (isAborted) return;

      // Log successful restores
      const successIds = degreeIds.filter(id => !results.errors[id]);
      if (successIds.length > 0) {
        try {
          const schoolName = displayedRecords.find(d => selectedIds.has(d.id))?.school_name || 'Unknown';
          await SchoolDefaultsRestoreService.bulkLogRestoreByType(
            successIds,
            resourceType,
            schoolName,
            user.user.id
          );
        } catch (logError) {
          console.error('Failed to log restore action:', logError);
          // Don't fail the operation if logging fails
        }
      }

      if (results.failed === 0) {
        setProgress(100);
        setSuccess(`Successfully restored ${results.success} record(s)`);
        setTimeout(() => {
          if (!isAborted) {
            onRestoreComplete();
            onOpenChange(false);
          }
        }, 2000);
      } else {
        const failureDetails = Object.entries(results.errors)
          .map(([id, msg]) => `${id}: ${msg}`)
          .join('; ');
        setError(
          `Restored ${results.success}, but ${results.failed} failed. Details: ${failureDetails}`
        );
      }
    } catch (err) {
      if (!isAborted) {
        const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred';
        setError(errorMsg);
      }
    } finally {
      setRestoring(false);
    }

    // Cleanup flag on unmount
    return () => {
      isAborted = true;
    };
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Restore Deleted {resourceType === 'degree' ? 'Degrees' : 'Departments'}
          </DialogTitle>
          <DialogDescription>
            Select the {resourceType === 'degree' ? 'degrees' : 'departments'} you want to restore from the trash
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && <AlertBox type="error" message={error} />}
          {success && <AlertBox type="success" message={success} />}
          {scheduleSuccess && (
            <AlertBox
              type="success"
              message={`Scheduled restore for ${scheduleSuccess.scheduledFor.toLocaleString()}`}
            />
          )}

          {totalRecords === 0 ? (
            <AlertBox type="info" message={`No deleted ${resourceType === 'degree' ? 'degrees' : 'departments'} to restore`} />
          ) : (
            <>
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedIds.size === displayedRecords.length && displayedRecords.length > 0}
                    indeterminate={selectedIds.size > 0 && selectedIds.size < displayedRecords.length}
                    onCheckedChange={handleSelectAll}
                    disabled={restoring}
                  />
                  <label className="text-sm font-medium cursor-pointer">
                    Select All ({selectedIds.size} of {totalRecords})
                  </label>
                </div>
                <div className="text-xs text-muted-foreground">
                  Page {currentPage + 1} of {Math.max(1, totalPages)}
                </div>
              </div>

              <div className="border rounded-lg p-3 max-h-64 overflow-y-auto space-y-2">
                {displayedRecords.map(degree => (
                  <div key={degree.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded">
                    <Checkbox
                      checked={selectedIds.has(degree.id)}
                      onCheckedChange={(checked) => handleSelectItem(degree.id, checked as boolean)}
                      disabled={restoring}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{degree.degree_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {degree.school_name} • {degree.degree_code}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <BatchSizeSelector value={batchSize} onChange={setBatchSize} disabled={restoring} />

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadRecordsPage(currentPage - 1)}
                    disabled={currentPage === 0 || restoring}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {currentPage + 1} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadRecordsPage(currentPage + 1)}
                    disabled={currentPage >= totalPages - 1 || restoring}
                  >
                    Next
                  </Button>
                </div>
              )}

              {restoring && progress > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{progressMessage || 'Restoring...'}</span>
                    <span className="font-medium">{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={restoring || deletedDegrees.length === 0}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => setScheduleDialogOpen(true)}
            disabled={selectedIds.size === 0 || restoring}
            className="gap-2"
          >
            <Clock className="h-4 w-4" />
            Schedule for Later
          </Button>
          <Button
            onClick={handleRestore}
            disabled={selectedIds.size === 0 || restoring || deletedDegrees.length === 0}
            className="gap-2"
          >
            {restoring && <Loader2 className="h-4 w-4 animate-spin" />}
            {restoring ? 'Restoring...' : `Restore (${selectedIds.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
      <ScheduleRestoreDialog
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        selectedRecords={Array.from(selectedIds)}
        resourceType={resourceType}
        onScheduled={(result) => {
          setScheduleSuccess(result);
          setScheduleDialogOpen(false);
          setTimeout(() => onRestoreComplete(), 2000);
        }}
      />
    </Dialog>
  );
}
