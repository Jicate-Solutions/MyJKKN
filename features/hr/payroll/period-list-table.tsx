'use client';

/**
 * PeriodListTable — table view of hr_payroll_periods rows.
 *
 * Per spec specs/t4-3-pr3-payroll-ui-design-lock-2026-05-19.md Q1 + E5 + E10 + E12:
 *   Columns: Period | Institution | Status pill | Current stage | Last action | Actions
 *   - PeriodStatusPill + PeriodBackdateBadge alongside in Status column.
 *   - Current stage column: the most recent stage's actor + relative time.
 *   - Last action: stale-check (red text if >7 days since last action and not terminal).
 *   - Row click → /hr/admin/payroll/periods/{id}
 *   - Below md breakpoint, table collapses to card list.
 *   - Skeleton renders 6 rows on isLoading.
 *
 * Filters (status + institution) are owned by the parent page so they can
 * persist to URL query params (E13). This component is presentational.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { HRPayrollPeriod, PayrollPeriodStatus } from '@/types/hr-payroll';

import { PeriodStatusPill } from './period-status-pill';
import { PeriodBackdateBadge } from './period-backdate-badge';

// =====================================================================================
// Helpers
// =====================================================================================

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatPeriodLabel(period: HRPayrollPeriod): string {
  return `${MONTH_NAMES[period.period_month - 1]} ${period.period_year}`;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN');
}

interface StageInfo {
  label: string;
  actor: string | null;
  at: string | null;
}

function deriveCurrentStage(
  period: HRPayrollPeriod,
  userLookup: Record<string, string>,
): StageInfo {
  // Pick the most-recent stage timestamp + matching actor
  const stages: Array<[PayrollPeriodStatus, string | null, string | null, string]> = [
    ['locked', period.locked_at, period.locked_by, 'Locked'],
    ['distributed', period.distributed_at, period.distributed_by, 'Distributed'],
    ['chairperson_approved', period.chairperson_approved_at, period.chairperson_approved_by, 'Chairperson approved'],
    ['accounts_verified', period.accounts_verified_at, period.accounts_verified_by, 'Accounts verified'],
    ['cao_reviewed', period.cao_reviewed_at, period.cao_reviewed_by, 'CAO reviewed'],
    ['prepared', period.prepared_at, period.prepared_by, 'Prepared'],
  ];

  for (const [, at, by, label] of stages) {
    if (at) {
      return {
        label,
        actor: by ? (userLookup[by] ?? by.slice(0, 8)) : null,
        at,
      };
    }
  }

  return { label: 'Draft', actor: null, at: null };
}

function isStale(period: HRPayrollPeriod, stage: StageInfo): boolean {
  // Stale = >7 days since last action and not yet terminal
  if (period.status === 'distributed' || period.status === 'locked') return false;
  if (!stage.at) return false;
  const days = (Date.now() - new Date(stage.at).getTime()) / (1000 * 60 * 60 * 24);
  return days > 7;
}

// =====================================================================================
// Skeleton
// =====================================================================================

export function PeriodListTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="border rounded-md overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Period</TableHead>
            <TableHead>Institution</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Current stage</TableHead>
            <TableHead>Last action</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, i) => (
            <TableRow key={i}>
              {Array.from({ length: 6 }).map((__, j) => (
                <TableCell key={j}>
                  <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// =====================================================================================
// Main table
// =====================================================================================

export function PeriodListTable({
  periods,
  institutionLookup,
  userLookup,
}: {
  periods: HRPayrollPeriod[];
  institutionLookup: Record<string, string>;
  userLookup: Record<string, string>;
}) {
  if (periods.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No periods match the current filters.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Current stage</TableHead>
              <TableHead>Last action</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.map((period) => {
              const stage = deriveCurrentStage(period, userLookup);
              const stale = isStale(period, stage);
              return (
                <TableRow
                  key={period.id}
                  className="cursor-pointer hover:bg-muted/40"
                >
                  <TableCell className="font-medium">
                    <Link
                      href={`/hr/admin/payroll/periods/${period.id}`}
                      className="hover:underline"
                    >
                      {formatPeriodLabel(period)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {institutionLookup[period.institution_id] ?? period.institution_id.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <PeriodStatusPill status={period.status} />
                      <PeriodBackdateBadge
                        isBackdated={period.is_backdated}
                        reason={period.backdate_reason}
                        scrollToAudit={false}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {stage.label}
                    {stage.actor && (
                      <span className="text-muted-foreground"> · {stage.actor}</span>
                    )}
                  </TableCell>
                  <TableCell className={cn('text-sm', stale && 'text-red-700 font-medium')}>
                    {formatRelativeTime(stage.at)}
                    {stale && <span className="ml-1 text-xs">(stale)</span>}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/hr/admin/payroll/periods/${period.id}`}
                      aria-label="Open period"
                    >
                      <ArrowRight className="h-4 w-4 text-muted-foreground hover:text-primary" />
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {periods.map((period) => {
          const stage = deriveCurrentStage(period, userLookup);
          const stale = isStale(period, stage);
          return (
            <Link
              key={period.id}
              href={`/hr/admin/payroll/periods/${period.id}`}
              className="block"
            >
              <Card className="hover:border-primary/40 transition-colors">
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{formatPeriodLabel(period)}</span>
                    <PeriodStatusPill status={period.status} size="sm" />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {institutionLookup[period.institution_id] ?? period.institution_id.slice(0, 8)}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span>
                      {stage.label}
                      {stage.actor && <span className="text-muted-foreground"> · {stage.actor}</span>}
                    </span>
                    <span className={cn('text-muted-foreground', stale && 'text-red-700 font-medium')}>
                      {formatRelativeTime(stage.at)}
                    </span>
                  </div>
                  {period.is_backdated && (
                    <PeriodBackdateBadge
                      isBackdated
                      reason={period.backdate_reason}
                      scrollToAudit={false}
                    />
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
