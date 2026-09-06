'use client';

/**
 * Shared table shell for the Time Off request lists, plus the status badge.
 *
 * The reference design marks each row with a coloured rail on its left edge.
 * That rail is decorative reinforcement only — status is always ALSO given as
 * a text badge, so the meaning never depends on colour alone (a red/green rail
 * is invisible to a deuteranope, and to anyone printing the page).
 *
 * Status colours come from the semantic status palette and are never reused as
 * categorical series colours elsewhere in the module.
 */

import type { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { LeaveApplicationStatus } from '@/types/hr';

const STATUS_STYLE: Record<
  LeaveApplicationStatus,
  { label: string; badge: string; rail: string }
> = {
  pending: {
    label: 'Applied',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    rail: 'bg-amber-500',
  },
  escalated: {
    label: 'Escalated',
    badge: 'border-orange-600/30 bg-orange-600/10 text-orange-700 dark:text-orange-400',
    rail: 'bg-orange-600',
  },
  approved: {
    label: 'Approved',
    badge: 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
    rail: 'bg-emerald-600',
  },
  rejected: {
    label: 'Rejected',
    badge: 'border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-400',
    rail: 'bg-red-600',
  },
  cancelled: {
    label: 'Cancelled',
    badge: 'border-muted-foreground/30 bg-muted text-muted-foreground',
    rail: 'bg-muted-foreground/50',
  },
  withdrawn: {
    label: 'Withdrawn',
    badge: 'border-muted-foreground/30 bg-muted text-muted-foreground',
    rail: 'bg-muted-foreground/50',
  },
};

export function StatusBadge({ status }: { status: LeaveApplicationStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        s.badge
      )}
    >
      {s.label}
    </span>
  );
}

export function statusRail(status: LeaveApplicationStatus): string {
  return (STATUS_STYLE[status] ?? STATUS_STYLE.pending).rail;
}

/** Row wrapper that paints the left status rail. */
export function RequestRow({
  status,
  children,
}: {
  status: LeaveApplicationStatus;
  children: ReactNode;
}) {
  return (
    <TableRow className="relative">
      {/* aria-hidden: the StatusBadge in the row already conveys this. */}
      <td className="w-0 p-0" aria-hidden>
        <span className={cn('absolute inset-y-0 left-0 w-1', statusRail(status))} />
      </td>
      {children}
    </TableRow>
  );
}

export function RequestTable({
  columns,
  children,
  isLoading,
  isEmpty,
  emptyMessage,
}: {
  columns: Array<{ key: string; label: string; align?: 'left' | 'right' | 'center' }>;
  children: ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {/* Rail spacer — keeps header cells aligned with RequestRow. */}
            <TableHead className="w-1 p-0" aria-hidden />
            {columns.map((c) => (
              <TableHead
                key={c.key}
                className={cn(
                  c.align === 'right' && 'text-right',
                  c.align === 'center' && 'text-center'
                )}
              >
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell className="w-1 p-0" />
                {columns.map((c) => (
                  <TableCell key={c.key}><Skeleton className="h-4 w-24" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : isEmpty ? (
            <TableRow>
              <TableCell colSpan={columns.length + 1} className="h-32 text-center">
                <p className="text-sm text-muted-foreground">
                  {emptyMessage ?? 'Nothing to show for this period.'}
                </p>
              </TableCell>
            </TableRow>
          ) : (
            children
          )}
        </TableBody>
      </Table>
    </div>
  );
}
