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
import { Loader2 } from 'lucide-react';
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
}

export default function BulkRestoreDialog({
  open,
  onOpenChange,
  onRestoreComplete,
  deletedDegrees,
}: BulkRestoreDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [restoring, setRestoring] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set());
      setProgress(0);
      setError(null);
      setSuccess(null);
    }
  }, [open]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(deletedDegrees.map(d => d.id)));
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

    try {
      setRestoring(true);
      setError(null);
      setSuccess(null);

      const supabase = createClientSupabaseClient();
      const { data: user } = await supabase.auth.getUser();

      if (!user.user?.id) {
        throw new Error('User not authenticated');
      }

      const degreeIds = Array.from(selectedIds);
      const results = await SchoolDefaultsRestoreService.bulkRestoreDeletedDegrees(
        degreeIds,
        (current, total) => {
          setProgress(Math.round((current / total) * 100));
        }
      );

      // Log all restores
      if (results.success > 0) {
        const schoolName = deletedDegrees.find(d => selectedIds.has(d.id))?.school_name || 'Unknown';
        await SchoolDefaultsRestoreService.bulkLogRestore(
          degreeIds.filter(id => !results.errors[id]),
          schoolName,
          user.user.id
        );
      }

      if (results.failed === 0) {
        setSuccess(`Successfully restored ${results.success} record(s)`);
        setTimeout(() => {
          onRestoreComplete();
          onOpenChange(false);
        }, 2000);
      } else {
        setError(
          `Restored ${results.success}, but ${results.failed} failed. Errors: ${JSON.stringify(results.errors)}`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore records');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Restore Deleted Degrees</DialogTitle>
          <DialogDescription>
            Select the degrees you want to restore from the trash
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && <AlertBox type="error" message={error} />}
          {success && <AlertBox type="success" message={success} />}

          {deletedDegrees.length === 0 ? (
            <AlertBox type="info" message="No deleted degrees to restore" />
          ) : (
            <>
              <div className="flex items-center gap-2 py-2">
                <Checkbox
                  checked={selectedIds.size === deletedDegrees.length && deletedDegrees.length > 0}
                  indeterminate={selectedIds.size > 0 && selectedIds.size < deletedDegrees.length}
                  onCheckedChange={handleSelectAll}
                  disabled={restoring}
                />
                <label className="text-sm font-medium cursor-pointer">
                  Select All ({selectedIds.size} of {deletedDegrees.length})
                </label>
              </div>

              <div className="border rounded-lg p-3 max-h-64 overflow-y-auto space-y-2">
                {deletedDegrees.map(degree => (
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

              {restoring && progress > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Restoring...</span>
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
            onClick={handleRestore}
            disabled={selectedIds.size === 0 || restoring || deletedDegrees.length === 0}
            className="gap-2"
          >
            {restoring && <Loader2 className="h-4 w-4 animate-spin" />}
            {restoring ? 'Restoring...' : `Restore (${selectedIds.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
