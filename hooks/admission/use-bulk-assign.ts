// hooks/admission/use-bulk-assign.ts
//
// Three TanStack Query mutations powering the Distribute Unassigned Leads
// panel. Shares one cache-invalidation function across all three modes.

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { BulkAssignService, type BulkAssignReport } from '@/lib/services/admission/bulk-assign-service';

const ADMISSION_LEADS_CHANGED_EVENT = 'admission-leads-changed';
function emitLeadsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ADMISSION_LEADS_CHANGED_EVENT));
  }
}

export function useBulkAssign() {
  const qc = useQueryClient();

  function invalidateAll(report: BulkAssignReport) {
    qc.invalidateQueries({ queryKey: ['unassigned-leads'] });
    qc.invalidateQueries({ queryKey: ['lead-distribution'] });
    qc.invalidateQueries({ queryKey: ['source-counselors-with-load'] });
    qc.invalidateQueries({ queryKey: ['counselor-source-assignments'] });
    qc.invalidateQueries({ queryKey: ['admission-leads'] });
    emitLeadsChanged();
    if (report.failureCount === 0) {
      toast.success(`Assigned ${report.successCount} of ${report.total} leads`);
    } else if (report.successCount === 0) {
      toast.error(`Failed to assign any of ${report.total} leads`);
    } else {
      toast(`Assigned ${report.successCount} of ${report.total} (${report.failureCount} failed)`);
    }
  }

  const bulkOne = useMutation({
    mutationFn: BulkAssignService.assignAllToOne,
    onSuccess: invalidateAll,
    onError: (err: Error) => toast.error(err.message ?? 'Bulk-assign failed'),
  });

  const autoRoute = useMutation({
    mutationFn: BulkAssignService.autoRoute,
    onSuccess: (report, vars) => {
      // Dry-run shouldn't toast or invalidate
      if (vars.dryRun) return;
      invalidateAll(report);
    },
    onError: (err: Error) => toast.error(err.message ?? 'Auto-route failed'),
  });

  const roundRobin = useMutation({
    mutationFn: BulkAssignService.roundRobin,
    onSuccess: (report, vars) => {
      if (vars.dryRun) return;
      invalidateAll(report);
    },
    onError: (err: Error) => toast.error(err.message ?? 'Round-robin failed'),
  });

  return { bulkOne, autoRoute, roundRobin };
}
