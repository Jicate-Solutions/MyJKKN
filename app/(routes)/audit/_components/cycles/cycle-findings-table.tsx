'use client';

// Cycle-scoped findings table — redesigned to the shared "instrument of record"
// visual language (see _components/redesign/kit.tsx and the auditor mockup).
// A finding reads as a ticket: the plain-language gap first, then its parameter
// code, severity, owner ROLE, due date and workflow status. Row click →
// /service-requests/[id]. Data hooks are unchanged; this is presentation only.

import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusPill, OwnerChip } from '../redesign/kit';
import type { ParamStatus } from '../redesign/param-status';
import type { AuditFindingView, FindingSeverity } from '@/lib/types/audit';

// Director rule: severity maps onto the shared status vocabulary —
// red = High (p1), yellow = Medium (p2), green = Observation.
const SEV_STATUS: Record<FindingSeverity, ParamStatus> = {
  red: 'p1',
  yellow: 'p2',
  green: 'observation',
};
const SEV_LABEL: Record<FindingSeverity, string> = {
  red: 'High',
  yellow: 'Medium',
  green: 'Observation',
};

// Best-effort SLA window from severity (the cycle projection omits
// requester_context). Mirrors the finding-detail default: red 7 / yellow 30 / green 60.
const SLA_DAYS: Record<FindingSeverity, number> = { red: 7, yellow: 30, green: 60 };

const CLOSED_STATUSES = new Set(['closed', 'rejected', 'cancelled']);

function dueDate(submittedAt: string | null, severity: FindingSeverity): Date | null {
  if (!submittedAt) return null;
  const t = new Date(submittedAt).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + SLA_DAYS[severity] * 86_400_000);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function humanizeStatus(status: string): string {
  return (status ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export interface CycleFindingsTableProps {
  findings: AuditFindingView[];
  loading?: boolean;
  /** parameter_code → { name, ownerRole } read-enriched from the catalog. */
  paramMeta?: Map<string, { name: string; ownerRole: string }>;
}

export function CycleFindingsTable({
  findings,
  loading,
  paramMeta,
}: CycleFindingsTableProps) {
  const router = useRouter();

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading findings…</p>
      </div>
    );
  }

  if (findings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300">
          <Inbox className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium">No findings match these filters</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            When a parameter&rsquo;s evidence falls short, log a finding to open a
            tracked ticket.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-[260px]">Finding</TableHead>
            <TableHead className="w-[128px]">Parameter</TableHead>
            <TableHead className="w-[132px]">Severity</TableHead>
            <TableHead className="w-[172px]">Owner</TableHead>
            <TableHead className="w-[92px]">Due</TableHead>
            <TableHead className="w-[124px]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {findings.map((f) => (
            <CycleFindingRow
              key={f.finding_id}
              finding={f}
              meta={paramMeta?.get(f.parameter_code)}
              onClick={() => router.push(`/service-requests/${f.finding_id}`)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CycleFindingRow({
  finding,
  meta,
  onClick,
}: {
  finding: AuditFindingView;
  meta?: { name: string; ownerRole: string };
  onClick: () => void;
}) {
  const text =
    finding.form_data?.notes?.trim() ||
    meta?.name ||
    `Finding on ${finding.parameter_code}`;
  const ownerRole = meta?.ownerRole || null;
  const due = dueDate(finding.submitted_at, finding.severity);
  const isOpen =
    !finding.closed_at &&
    !CLOSED_STATUSES.has((finding.status ?? '').toLowerCase());
  const overdue = isOpen && due !== null && due.getTime() < Date.now();

  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50"
      onClick={onClick}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <TableCell className="max-w-[440px] align-top">
        <span className="line-clamp-2 font-medium text-foreground">{text}</span>
        {finding.request_number ? (
          <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
            {finding.request_number}
          </span>
        ) : null}
      </TableCell>
      <TableCell className="align-top">
        <span className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          {finding.parameter_code}
        </span>
      </TableCell>
      <TableCell className="align-top">
        <StatusPill
          status={SEV_STATUS[finding.severity]}
          label={SEV_LABEL[finding.severity]}
        />
      </TableCell>
      <TableCell className="align-top">
        <OwnerChip role={ownerRole} />
      </TableCell>
      <TableCell
        className={cn(
          'whitespace-nowrap align-top font-mono text-xs tabular-nums',
          overdue ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
        )}
        title={overdue ? 'Past its SLA due date' : undefined}
      >
        {due ? fmtDate(due) : '—'}
      </TableCell>
      <TableCell className="align-top">
        <FindingStatusChip status={finding.status} />
      </TableCell>
    </TableRow>
  );
}

/**
 * Neutral workflow-status chip. Uses the kit's certified-green tokens for
 * resolved states (closed / approved) and the muted "todo" tokens otherwise —
 * no colours invented outside the shared palette.
 */
function FindingStatusChip({ status }: { status: string }) {
  const s = (status ?? '').toLowerCase();
  const resolved = s === 'closed' || s === 'approved';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium',
        resolved
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
          : 'border-border bg-muted/40 text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          resolved ? 'bg-emerald-500' : 'bg-muted-foreground/50',
        )}
      />
      {humanizeStatus(status)}
    </span>
  );
}
