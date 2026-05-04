'use client';

/**
 * DrilldownRowActionCell
 *
 * Per-row action buttons in the drill-downs table: "Edit" opens the
 * editor Sheet; "Reset to default" deletes EVERY override row for the
 * given metric (returning it to the code-default state).
 *
 * Kept as a small standalone component so the table cell stays readable
 * and the reset confirmation dialog has its own owned local state.
 */

import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

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
  METRIC_LABELS,
  type DrilldownMetric,
} from './drilldown-defaults';
import {
  useResetDrilldownMetric,
  type ResolvedDrilldownRow,
} from './drilldown-policy-service';

interface DrilldownRowActionCellProps {
  row: ResolvedDrilldownRow;
  canEdit: boolean;
  onEdit: (metric: DrilldownMetric) => void;
}

export function DrilldownRowActionCell({
  row,
  canEdit,
  onEdit,
}: DrilldownRowActionCellProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const resetMutation = useResetDrilldownMetric();

  const overrideCount = row.overriddenFields.size;
  const overrideRowIds = Object.values(row.rowIdsByKey);

  async function handleReset() {
    try {
      await resetMutation.mutateAsync(overrideRowIds);
      toast.success(
        `Reset ${overrideCount} override${overrideCount === 1 ? '' : 's'} for ${METRIC_LABELS[row.metric]}.`,
      );
      setConfirmOpen(false);
    } catch (e) {
      toast.error(
        `Reset failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onEdit(row.metric)}
        disabled={!canEdit && overrideCount === 0}
        aria-label={`Edit drill-down policy for ${METRIC_LABELS[row.metric]}`}
      >
        <Pencil className="h-3.5 w-3.5 mr-1" />
        {canEdit ? 'Edit' : 'View'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        disabled={!canEdit || overrideCount === 0 || resetMutation.isPending}
        aria-label={`Reset overrides for ${METRIC_LABELS[row.metric]}`}
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => !o && setConfirmOpen(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reset {METRIC_LABELS[row.metric]} to defaults?
            </DialogTitle>
            <DialogDescription>
              This deletes {overrideCount} override row
              {overrideCount === 1 ? '' : 's'} from{' '}
              <code className="font-mono">platform_policies</code> for the{' '}
              <code className="font-mono">
                dashboard.drilldown.{row.metric}.*
              </code>{' '}
              prefix. The code defaults re-apply on the next read. You can
              re-create overrides at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={resetMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={resetMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {resetMutation.isPending ? 'Resetting…' : 'Reset to default'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
