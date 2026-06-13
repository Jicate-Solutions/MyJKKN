'use client';

/**
 * Status Report Dialog — create a weekly/manual project status report.
 *
 * Fields: report_period_start, report_period_end (date inputs), summary
 * (textarea), rag_status (green/amber/red), generated_type (fixed to 'manual'),
 * content (optional free-form key-value pairs stored as JSONB).
 *
 * NOTE: Actor field (created_by) is null — no auth helper at this layer.
 * Wired by orchestrator integration PR.
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F8.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import {
  useCreateStatusReport,
  useUpdateStatusReport,
} from '@/hooks/projects/use-stakeholders';
import { RAG_STATUS_OPTIONS } from '@/components/projects/stakeholders/types';
import type { ProjectStatusReport } from '@/types/projects';
import type { RagStatus } from '@/types/projects';

const NONE = '__none__';

interface StatusReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Provided → edit mode; omitted → create mode. */
  report?: ProjectStatusReport | null;
}

export function StatusReportDialog({
  open,
  onOpenChange,
  projectId,
  report,
}: StatusReportDialogProps) {
  const isEdit = !!report;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit status report' : 'New status report'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this weekly status report.'
              : 'Create a weekly status report for this project.'}
          </DialogDescription>
        </DialogHeader>

        <StatusReportFormBody
          key={`${open ? 'open' : 'closed'}-${report?.id ?? 'new'}`}
          projectId={projectId}
          report={report ?? null}
          onSuccess={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

// ─── Form body ────────────────────────────────────────────────────────────────────

interface FormBodyProps {
  projectId: string;
  report: ProjectStatusReport | null;
  onSuccess: () => void;
  onCancel: () => void;
}

function StatusReportFormBody({
  projectId,
  report,
  onSuccess,
  onCancel,
}: FormBodyProps) {
  const isEdit = !!report;
  const createMutation = useCreateStatusReport(projectId);
  const updateMutation = useUpdateStatusReport(projectId);

  const [periodStart, setPeriodStart] = useState(
    report?.report_period_start ?? ''
  );
  const [periodEnd, setPeriodEnd] = useState(
    report?.report_period_end ?? ''
  );
  const [summary, setSummary] = useState(report?.summary ?? '');
  const [ragStatus, setRagStatus] = useState<RagStatus | string>(
    report?.rag_status ?? NONE
  );

  const isPending = createMutation.isPending || updateMutation.isPending;

  function handleSubmit() {
    if (!summary.trim()) {
      toast.error('Please enter a summary.');
      return;
    }

    const payload = {
      report_period_start: periodStart || null,
      report_period_end: periodEnd || null,
      summary: summary.trim(),
      rag_status: ragStatus === NONE ? null : ragStatus,
      generated_type: 'manual',
      content: {},
    };

    if (isEdit) {
      updateMutation.mutate(
        { id: report!.id, input: payload },
        {
          onSuccess: () => {
            toast.success('Status report updated.');
            onSuccess();
          },
          onError: (err) => {
            toast.error(`Failed to update: ${(err as Error).message}`);
          },
        }
      );
    } else {
      createMutation.mutate(
        { project_id: projectId, ...payload },
        {
          onSuccess: () => {
            toast.success('Status report created.');
            onSuccess();
          },
          onError: (err) => {
            toast.error(`Failed to create: ${(err as Error).message}`);
          },
        }
      );
    }
  }

  return (
    <>
      <div className="grid gap-4 py-2">
        {/* Period dates */}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="period-start">Period start</Label>
            <Input
              id="period-start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="period-end">Period end</Label>
            <Input
              id="period-end"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>
        </div>

        {/* RAG status */}
        <div className="grid gap-1.5">
          <Label htmlFor="rag-status">Overall RAG status</Label>
          <Select value={ragStatus} onValueChange={setRagStatus}>
            <SelectTrigger id="rag-status">
              <SelectValue placeholder="Select RAG status…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— Not set —</SelectItem>
              {RAG_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className={opt.color}>{opt.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary */}
        <div className="grid gap-1.5">
          <Label htmlFor="summary">Summary</Label>
          <Textarea
            id="summary"
            rows={5}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Describe progress, blockers, and key decisions this week…"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : isEdit ? (
            'Save changes'
          ) : (
            'Create report'
          )}
        </Button>
      </DialogFooter>
    </>
  );
}
