'use client';

import { useMemo } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { BulkAssignReport } from '@/lib/services/admission/bulk-assign-service';

interface DistributeDryRunProps {
  report: BulkAssignReport;
  isCommitting: boolean;
  override: boolean;
  onCommit: () => void;
  onCancel: () => void;
}

export function DistributeDryRun({
  report,
  isCommitting,
  override,
  onCommit,
  onCancel,
}: DistributeDryRunProps) {
  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    report.results.forEach((r) => {
      if (r.status === 'assigned' && r.counselor_id) {
        counts.set(r.counselor_id, (counts.get(r.counselor_id) ?? 0) + 1);
      }
    });
    return Array.from(counts.entries());
  }, [report]);

  const noCandidate = report.results.filter((r) => r.status === 'no-candidate').length;

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <h4 className="text-sm font-semibold">Preview — what will happen on confirm</h4>
      </div>

      <div className="space-y-1.5 text-sm">
        {summary.length === 0 && (
          <div className="rounded border bg-orange-50 p-2 text-xs text-orange-800">
            <AlertCircle className="mr-1 inline h-3 w-3" />
            No leads can be assigned with current settings.
          </div>
        )}
        {summary.map(([counselorId, count]) => (
          <div key={counselorId} className="flex items-center justify-between rounded bg-background px-2 py-1">
            <span className="text-xs text-muted-foreground">
              counselor <code className="font-mono text-[11px]">{counselorId.slice(0, 8)}…</code>
            </span>
            <Badge>{count} leads</Badge>
          </div>
        ))}
        {noCandidate > 0 && (
          <div className="rounded border-l-2 border-orange-400 bg-orange-50 px-2 py-1 text-xs">
            <AlertCircle className="mr-1 inline h-3 w-3 text-orange-600" />
            {noCandidate} {noCandidate === 1 ? 'lead has' : 'leads have'} no eligible counselor and will be skipped.
          </div>
        )}
      </div>

      {override && (
        <div className="rounded border border-orange-300 bg-orange-50 p-2 text-xs text-orange-900">
          <strong>Override active:</strong> assignments will bypass pause and daily-cap guards.
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isCommitting}>
          Back
        </Button>
        <Button size="sm" onClick={onCommit} disabled={isCommitting || summary.length === 0}>
          {isCommitting ? 'Assigning…' : 'Confirm distribution'}
        </Button>
      </div>
    </div>
  );
}
