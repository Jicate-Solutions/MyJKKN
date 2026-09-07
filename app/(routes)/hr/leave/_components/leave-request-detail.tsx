'use client';

/**
 * One rendering of an applicant's own leave request — details, documents,
 * approval chain and the Withdraw / Cancel controls.
 *
 * Shared on purpose. The sheet on /hr/leave/requests and the standalone
 * /hr/leave/[id] page both render THIS, for the same reason
 * ApprovalDetailSheet reuses ApprovalChainTimeline: the applicant should read
 * one request, not two renderings of it that drift apart.
 *
 * NO DISCUSSION. The comment thread lived here and was removed 2026-09-07 —
 * nothing in the applicant's flow answered a comment, so it read as a reply box
 * that nobody was listening to. Approvers still have theirs on
 * ApprovalDetailSheet, where a decision actually follows.
 *
 * NAMES, NOT IDS. `employee_id` points at `staff` and `applied_by` at
 * `profiles`; neither is resolvable in the browser, and both printed as raw
 * uuids until the detail route started returning `applicant` and folding
 * `applied_by` into `chain_names.people`.
 */

import { AlertCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useApplication, useWithdrawApplication, useCancelApplication } from '@/hooks/hr/use-leave';
import { LEAVE_DURATION_LABELS } from '@/types/hr';

import { ApprovalChainTimeline } from './approval-chain-timeline';
import { LeaveDocumentList } from './leave-document-list';
import { StatusBadge } from './request-table';
import { formatDays } from './format';

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB') : '—';
const fmtStamp = (s: string | null) => (s ? new Date(s).toLocaleString('en-IN') : '—');

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{children}</dd>
    </div>
  );
}

export function LeaveRequestDetail({
  applicationId,
  /** Shown in the header before the fetch lands, from the row already on screen. */
  leaveTypeName,
  onDone,
}: {
  applicationId: string | undefined;
  leaveTypeName?: string | null;
  onDone?: () => void;
}) {
  const { data: app, isLoading } = useApplication(applicationId);
  const withdraw = useWithdrawApplication();
  const cancel = useCancelApplication();

  if (isLoading || !app) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    );
  }

  // Falls back to the raw id when the server lookup failed — an id is ugly but
  // it is still an answer, and it is what a support ticket needs.
  const applicantName = app.applicant?.name ?? app.employee_id;
  const appliedByName = app.applied_by
    ? (app.chain_names?.people?.[app.applied_by] ?? app.applied_by)
    : '—';
  // Almost always the same person. Saying it twice is noise; saying it when it
  // differs is the whole point of the field.
  const filedBySomeoneElse = appliedByName !== applicantName;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{leaveTypeName ?? 'Leave request'}</span>
        <StatusBadge status={app.status} />
        {app.is_emergency && <Badge variant="outline">Emergency</Badge>}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="From">{fmtDate(app.start_date)}</Field>
        <Field label="To">{fmtDate(app.end_date)}</Field>
        <Field label="Total days">{formatDays(app.total_days)}</Field>
        <Field label="Duration">
          {LEAVE_DURATION_LABELS[app.duration_type] ?? app.duration_type}
        </Field>
        <Field label="Employee">
          {applicantName}
          {app.applicant?.staff_code && (
            <span className="ml-1 font-normal text-muted-foreground">
              ({app.applicant.staff_code})
            </span>
          )}
        </Field>
        {filedBySomeoneElse && <Field label="Applied by">{appliedByName}</Field>}
        <Field label="Applied on">{fmtStamp(app.created_at)}</Field>
        {app.final_decided_at && <Field label="Decided">{fmtStamp(app.final_decided_at)}</Field>}
      </dl>

      <div>
        <p className="mb-1 text-xs text-muted-foreground">Reason</p>
        <p className="whitespace-pre-wrap text-sm">{app.reason || '—'}</p>
      </div>

      <LeaveDocumentList
        documents={app.documents}
        outstanding={(app.documents?.length ?? 0) === 0 && !!app.is_emergency}
      />

      {app.rejection_reason && (
        <div className="rounded-md border border-red-600/30 bg-red-600/5 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
            <AlertCircle className="h-3.5 w-3.5" />
            Rejection reason
          </p>
          <p className="whitespace-pre-wrap text-sm">{app.rejection_reason}</p>
        </div>
      )}

      <Separator />

      <div>
        <p className="mb-2 text-xs text-muted-foreground">
          Approval chain — frozen when the request was filed
        </p>
        <ApprovalChainTimeline app={app} />
      </div>

      {(app.status === 'pending' || (app.status === 'approved' && !app.superseded_by)) && (
        <>
          <Separator />
          <div className="flex flex-wrap gap-2">
            {app.status === 'pending' && (
              <Button
                variant="outline"
                size="sm"
                disabled={withdraw.isPending}
                onClick={async () => {
                  await withdraw.mutateAsync(app.id);
                  onDone?.();
                }}
              >
                Withdraw
              </Button>
            )}
            {app.status === 'approved' && !app.superseded_by && (
              <Button
                variant="outline"
                size="sm"
                disabled={cancel.isPending}
                onClick={async () => {
                  await cancel.mutateAsync(app.id);
                  onDone?.();
                }}
              >
                Cancel (restores the balance)
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
