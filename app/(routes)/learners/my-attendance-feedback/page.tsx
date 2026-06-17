'use client';

// app/(routes)/learners/my-attendance-feedback/page.tsx
// L2 — Learner attendance-confirmation view + nudge.
// "These sessions are present-pending until you give feedback."
// Reads fn_scf_confirmation_status via useConfirmationStatus(from, to).
// Spec: specs/post-class-feedback-attendance-gate-2026-06-15.md
// Substrate (READ-ONLY for this lane): types/session-feedback.ts,
//   lib/services/session-feedback-service.ts, hooks/use-session-feedback.ts.

import { useMemo } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageSquarePlus,
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useConfirmationStatus } from '@/hooks/use-session-feedback';
import type { ConfirmationStatusRow } from '@/types/session-feedback';

const BRAND_GREEN = '#0b6d41';
const LOOKBACK_DAYS = 30;

/** Format a Date to a 'YYYY-MM-DD' string (local). */
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Human-friendly date label, e.g. "Mon, 09 Jun 2026". Falls back to the raw string. */
function formatDate(ymd: string): string {
  const parsed = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return ymd;
  return parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** A row's display label for the course/session. */
function sessionLabel(row: ConfirmationStatusRow): string {
  if (row.course_code && row.course_name) {
    return `${row.course_code} — ${row.course_name}`;
  }
  return row.course_name || row.course_code || 'Class session';
}

/** Stable key for a confirmation row. */
function rowKey(row: ConfirmationStatusRow): string {
  return `${row.attendance_date}|${row.timetable_id}|${row.period_id}`;
}

export default function LearnerConfirmationPage() {
  // Default range = last 30 days (inclusive of today).
  const { from, to } = useMemo(() => {
    const today = new Date();
    const start = new Date();
    start.setDate(today.getDate() - LOOKBACK_DAYS);
    return { from: toYmd(start), to: toYmd(today) };
  }, []);

  const { data, isLoading, isError, error } = useConfirmationStatus(from, to);

  const rows = data ?? [];
  const pending = rows.filter((r) => r.confirmed === false);
  const confirmed = rows.filter((r) => r.confirmed === true);
  const pendingCount = pending.length;
  // Pending first (the action items), then confirmed; both newest-date-first.
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.confirmed !== b.confirmed) return a.confirmed ? 1 : -1;
      return b.attendance_date.localeCompare(a.attendance_date);
    });
  }, [rows]);

  return (
    <ContentLayout title='My Attendance Feedback'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'My Attendance Feedback' },
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>My Attendance Feedback</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Your attendance is confirmed only after you give feedback for each
            class. Last {LOOKBACK_DAYS} days.
          </p>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className='flex flex-col items-center justify-center py-16'>
            <BeatLoader color={BRAND_GREEN} />
            <p className='mt-4 text-sm text-muted-foreground'>
              Loading your sessions…
            </p>
          </div>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <Card className='border-destructive/40'>
            <CardContent className='flex items-start gap-3 py-6'>
              <AlertCircle className='h-5 w-5 shrink-0 text-destructive' />
              <div>
                <p className='font-medium text-destructive'>
                  Could not load your attendance feedback.
                </p>
                <p className='text-sm text-muted-foreground mt-1'>
                  {error instanceof Error
                    ? error.message
                    : 'Please try again in a moment.'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loaded */}
        {!isLoading && !isError && (
          <>
            {/* Banner */}
            {pendingCount > 0 ? (
              <Card className='border-amber-300 bg-amber-50'>
                <CardContent className='flex items-start gap-3 py-6'>
                  <Clock className='h-6 w-6 shrink-0 text-amber-600' />
                  <div className='flex-1'>
                    <p className='font-semibold text-amber-900'>
                      {pendingCount}{' '}
                      {pendingCount === 1 ? 'session is' : 'sessions are'}{' '}
                      present-pending
                    </p>
                    <p className='text-sm text-amber-800 mt-1'>
                      Your attendance isn&apos;t confirmed until you give
                      feedback for these sessions.
                    </p>
                  </div>
                  <Button
                    asChild
                    className='shrink-0'
                    style={{ backgroundColor: BRAND_GREEN }}
                  >
                    <Link href='/learners/class-feedback'>
                      <MessageSquarePlus className='mr-2 h-4 w-4' />
                      Give feedback
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className='border-green-300 bg-green-50'>
                <CardContent className='flex items-start gap-3 py-6'>
                  <CheckCircle2
                    className='h-6 w-6 shrink-0'
                    style={{ color: BRAND_GREEN }}
                  />
                  <div>
                    <p className='font-semibold' style={{ color: BRAND_GREEN }}>
                      All your attended sessions are confirmed.
                    </p>
                    <p className='text-sm text-green-800 mt-1'>
                      Nothing pending in the last {LOOKBACK_DAYS} days. Nice work.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Session list */}
            <Card>
              <CardHeader>
                <CardTitle className='text-lg'>
                  Sessions{' '}
                  <span className='text-sm font-normal text-muted-foreground'>
                    ({confirmed.length} confirmed, {pendingCount} pending)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sorted.length === 0 ? (
                  <p className='py-8 text-center text-sm text-muted-foreground'>
                    No attended sessions found in the last {LOOKBACK_DAYS} days.
                  </p>
                ) : (
                  <ul className='divide-y'>
                    {sorted.map((row) => (
                      <li
                        key={rowKey(row)}
                        className='flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between'
                      >
                        <div className='min-w-0'>
                          <p className='font-medium truncate'>
                            {sessionLabel(row)}
                          </p>
                          <p className='text-sm text-muted-foreground'>
                            {formatDate(row.attendance_date)}
                          </p>
                        </div>

                        <div className='flex items-center gap-3 sm:shrink-0'>
                          {row.confirmed ? (
                            <Badge variant='success' className='gap-1'>
                              <CheckCircle2 className='h-3.5 w-3.5' />
                              Confirmed
                            </Badge>
                          ) : (
                            <>
                              <Badge className='gap-1 border-transparent bg-amber-100 text-amber-800 hover:bg-amber-200'>
                                <Clock className='h-3.5 w-3.5' />
                                Pending feedback
                              </Badge>
                              <Button
                                asChild
                                size='sm'
                                variant='outline'
                              >
                                <Link href='/learners/class-feedback'>
                                  Give feedback
                                </Link>
                              </Button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
