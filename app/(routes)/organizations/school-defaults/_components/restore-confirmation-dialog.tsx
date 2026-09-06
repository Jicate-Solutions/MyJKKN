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
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle } from 'lucide-react';

interface DeletedRecord {
  id: string;
  school_id: string;
  school_name: string;
  name: string;
  code: string;
}

interface RestoreConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: DeletedRecord[];
  resourceType: 'degree' | 'department';
  onConfirm: (recordIds: string[]) => Promise<void>;
}

export default function RestoreConfirmationDialog({
  open,
  onOpenChange,
  records,
  resourceType,
  onConfirm,
}: RestoreConfirmationDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(records.map(r => r.id)));
      setError(null);
    }
  }, [open, records]);

  const affectedSchools = Array.from(
    new Set(
      records
        .filter(r => selectedIds.has(r.id))
        .map(r => r.school_name)
    )
  );

  const handleConfirm = async () => {
    try {
      setConfirming(true);
      setError(null);
      await onConfirm(Array.from(selectedIds));
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore records');
    } finally {
      setConfirming(false);
    }
  };

  const resourceLabel = resourceType === 'degree' ? 'K-12 Programs' : 'Academic Departments';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Confirm Restoration
          </DialogTitle>
          <DialogDescription>
            Review affected schools before restoring {resourceLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && <AlertBox type="error" message={error} />}

          <div>
            <h3 className="font-semibold text-sm mb-2">Records to Restore ({selectedIds.size})</h3>
            <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
              {records.map(record => (
                <div key={record.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded text-sm">
                  <Checkbox
                    checked={selectedIds.has(record.id)}
                    onCheckedChange={(checked) => {
                      const newSet = new Set(selectedIds);
                      if (checked) {
                        newSet.add(record.id);
                      } else {
                        newSet.delete(record.id);
                      }
                      setSelectedIds(newSet);
                    }}
                    disabled={confirming}
                  />
                  <span className="flex-1">
                    {record.name} <span className="text-gray-500">({record.code})</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-sm mb-2">Affected Schools ({affectedSchools.length})</h3>
            <div className="flex flex-wrap gap-2">
              {affectedSchools.map(school => (
                <Badge key={school} variant="secondary">
                  {school}
                </Badge>
              ))}
            </div>
          </div>

          <AlertBox
            type="warning"
            message={`This will restore ${selectedIds.size} ${resourceType}(s) across ${affectedSchools.length} school(s). This action is reversible.`}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={confirming}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedIds.size === 0 || confirming}
            className="gap-2"
          >
            {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirming ? 'Restoring...' : `Restore (${selectedIds.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
