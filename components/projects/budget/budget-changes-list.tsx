'use client';

/**
 * Budget Changes List
 *
 * Shows project_budget_changes rows — change log with old→new amount, reason,
 * and approval status badge. Read-only view; used on the Budget page as the
 * "Change log" tab.
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F6.
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { ProjectBudgetChange } from '@/types/projects';

function fmtINR(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function ApprovalBadge({ status }: { status: string }) {
  switch (status) {
    case 'approved':
      return <Badge className="bg-emerald-100 text-emerald-800">Approved</Badge>;
    case 'rejected':
      return <Badge variant="destructive">Rejected</Badge>;
    default:
      return <Badge variant="secondary">Pending</Badge>;
  }
}

interface BudgetChangesListProps {
  changes: ProjectBudgetChange[];
}

export function BudgetChangesList({ changes }: BudgetChangesListProps) {
  if (changes.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-12 text-center">
        <p className="text-sm text-muted-foreground">No budget changes recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Old amount</TableHead>
            <TableHead className="text-right">New amount</TableHead>
            <TableHead className="text-right">Delta</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {changes.map((change) => {
            const delta =
              change.new_amount_inr != null && change.old_amount_inr != null
                ? change.new_amount_inr - change.old_amount_inr
                : null;
            return (
              <TableRow key={change.id}>
                <TableCell className="text-sm text-muted-foreground">
                  {fmtDate(change.created_at)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {fmtINR(change.old_amount_inr)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {fmtINR(change.new_amount_inr)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {delta !== null ? (
                    <span
                      className={
                        delta < 0
                          ? 'font-medium text-emerald-600'
                          : 'font-medium text-destructive'
                      }
                    >
                      {delta >= 0 ? '+' : ''}
                      {fmtINR(delta)}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="max-w-[16rem] truncate text-sm">
                  {change.reason ?? '—'}
                </TableCell>
                <TableCell>
                  <ApprovalBadge status={change.approval_status} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
