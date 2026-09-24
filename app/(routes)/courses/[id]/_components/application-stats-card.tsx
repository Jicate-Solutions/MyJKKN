'use client';

/**
 * Statistics for the Applications tab — four tiles above the table.
 *
 * Applications by status and origin · fees payable/collected/outstanding ·
 * payment health · seat fill.
 *
 * All of it comes from ONE call to fn_course_application_stats rather than
 * counting rows in the browser. Two reasons, and the second is the important
 * one: bills and payments grow per instalment per participant and self-service
 * registration can now add them without an admin, so client-side counting would
 * mean four full scans per tab open; and every figure then passes through ONE
 * permission gate instead of four RLS predicates that could each silently
 * under-report and make the card quietly wrong rather than visibly empty.
 *
 * Modelled on app/(routes)/users/jkkn-id/_components/stats-cards.tsx.
 *
 * Amber is used only where it means ACT — overdue bills, stalled checkouts —
 * never as decoration, so a coloured figure always deserves a click.
 */

import {
  AlertTriangle, IndianRupee, ReceiptText, Users,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCourseApplicationStats } from '@/hooks/courses/use-course-applications';

/** Whole rupees. The tiles are for scanning, not reconciling — the paise live
 *  on the bills themselves. */
const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function Tile({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          {label}
        </div>
        <p className="mt-1 truncate text-2xl font-semibold tabular-nums">{value}</p>
        {children}
      </CardContent>
    </Card>
  );
}

export function ApplicationStatsCard({ courseEventId }: { courseEventId: string }) {
  const { data, isLoading, isError } = useCourseApplicationStats(courseEventId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[104px] w-full" />
        ))}
      </div>
    );
  }

  // Silence rather than a broken-looking row: the table below is the job, and a
  // failed aggregate must not imply the applications themselves are missing.
  if (isError || !data) return null;

  const { applications: a, fees, health, seats } = data;
  const seatLabel = seats.total != null ? `${seats.taken} / ${seats.total}` : String(seats.taken);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile icon={ReceiptText} label="Applications" value={a.total.toLocaleString('en-IN')}>
        <p className="mt-1 text-xs text-muted-foreground">
          {a.approved} approved · {a.pending + a.shortlisted} awaiting · {a.rejected} rejected
        </p>
        <p className="text-xs text-muted-foreground">
          {a.internal} internal · {a.external} external
        </p>
      </Tile>

      <Tile icon={IndianRupee} label="Collected" value={inr.format(fees.collected)}>
        <p className="mt-1 text-xs text-muted-foreground">
          of {inr.format(fees.payable)} · {fees.collection_pct}%
        </p>
        <p className="text-xs text-muted-foreground">
          {inr.format(fees.outstanding)} outstanding
        </p>
      </Tile>

      <Tile icon={AlertTriangle} label="Payment health" value={String(health.overdue_bills)}>
        <p className="mt-1 text-xs text-muted-foreground">
          {health.overdue_bills === 1 ? 'bill overdue' : 'bills overdue'}
          {health.overdue_bills > 0 ? ` · ${inr.format(health.overdue_amount)}` : ''}
        </p>
        {health.stalled_payments > 0 ? (
          // "Stalled" is all-time and is NOT a failure count — a row sits at
          // 'initiated' when somebody opened the gateway and did not finish, or
          // when the webhook has not landed yet. Worth chasing, not alarming.
          <p className="text-xs font-medium text-amber-600 dark:text-amber-500">
            {health.stalled_payments} unfinished checkout
            {health.stalled_payments === 1 ? '' : 's'} to chase
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">no unfinished checkouts</p>
        )}
      </Tile>

      <Tile icon={Users} label="Seats" value={seatLabel}>
        <p className="mt-1 text-xs text-muted-foreground">
          {seats.total != null ? 'enrolled of capacity' : 'enrolled · no capacity set'}
        </p>
        {seats.total != null && seats.taken >= seats.total ? (
          // The same threshold self-service uses to stop auto-approving, so the
          // card and registration always agree.
          <p className="text-xs font-medium text-amber-600 dark:text-amber-500">
            Full — new applicants wait for approval
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {fees.enrollments} enrolment{fees.enrollments === 1 ? '' : 's'}
          </p>
        )}
      </Tile>
    </div>
  );
}
