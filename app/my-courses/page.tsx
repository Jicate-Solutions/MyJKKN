// app/my-courses/page.tsx
//
// The external participant's portal.
//
// Deliberately OUTSIDE app/(routes)/ — that group mounts the full admin shell
// (sidebar, institution switcher, the whole nav map), and a participant holds
// exactly one permission key, courses.participant.self. They would be shown a
// chrome of menus that all resolve to nothing.
//
// NOT in proxy.ts's public list, so the middleware requires a session before
// this renders. Everything here is somebody's own money.
//
// MOBILE FIRST. This is the one screen in the app whose typical reader is on a
// phone, standing somewhere, checking what they owe — not an administrator at a
// desk. So every block is a single column by default and only widens at sm/lg;
// the money summary is a 2x2 grid on a phone rather than a 4-across row that
// would shrink each figure to unreadable; and each instalment is a stacked card
// with full-width actions rather than a table row whose buttons fall off the
// right edge. Nothing here uses a horizontal scroll.
//
// A server component reading through the cookie-bound SSR client, so RLS is the
// gate rather than a hand-written filter. course_enrollments_select carries
// `profile_id = auth.uid()` and course_bills_select/course_bill_payments_select
// the matching EXISTS, so these reads return exactly one person's rows.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  CalendarDays, CheckCircle2, GraduationCap, MapPin, ReceiptText, Wallet,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/server';
import { PayInstalmentButton } from './_components/pay-instalment-button';
import { DownloadReceiptButton } from './_components/download-receipt-button';
import { ParticipantMenu } from './_components/participant-menu';
import type { CourseReceiptData } from '@/lib/utils/courses/course-receipt-pdf';

export const dynamic = 'force-dynamic';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const formatDate = (value: string | null) => {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const BILL_STATUS_LABEL: Record<string, string> = {
  pending: 'Due',
  partially_paid: 'Part paid',
  paid: 'Paid',
  overdue: 'Overdue',
  voided: 'Cancelled',
};

const BILL_STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  partially_paid: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  voided: 'bg-muted text-muted-foreground line-through',
};

/** One figure in the money summary. Stacks 2x2 on a phone. */
function Money({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`truncate text-base sm:text-lg ${strong ? 'font-bold' : 'font-medium'}`}>
        {inr.format(Number(value ?? 0))}
      </p>
    </div>
  );
}

export default async function MyCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string }>;
}) {
  const supabase = await createClient();
  const { paid } = await searchParams;

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect('/auth/participant-login');

  // Embeds name their FK constraints — course_enrollments and course_bills each
  // have several routes into the same tables, and an unqualified embed is a
  // PGRST201.
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select(
      `id, enrollment_number, status, total_payable, total_paid, balance, enrolled_at,
       course:course_events!course_enrollments_course_event_id_fkey(title, start_date, end_date, mode, venue_text),
       package:course_packages!course_enrollments_package_id_fkey(name),
       institution:institutions!course_enrollments_institution_id_fkey(name),
       bills:course_bills!course_bills_enrollment_id_fkey(
         id, bill_number, installment_no, label, total_amount, paid_amount, balance_amount, due_date, status,
         payments:course_bill_payments!course_bill_payments_bill_id_fkey(
           id, receipt_number, amount_paid, payment_date, payment_mode, razorpay_payment_id, status, captured_at
         )
       )`,
    )
    .eq('profile_id', auth.user.id)
    .order('enrolled_at', { ascending: false });

  // The JKKN ID belongs on the receipt. Read separately because jkkn_identities
  // has no FK from course_enrollments to embed through.
  const { data: identity } = await supabase
    .from('jkkn_identities')
    .select('jkkn_id')
    .eq('profile_id', auth.user.id)
    .maybeSingle();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', auth.user.id)
    .maybeSingle();

  const jkknId = (identity as any)?.jkkn_id ?? null;
  const participantName = (profile as any)?.full_name ?? 'Participant';
  const list = (enrollments ?? []) as any[];

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <div className="h-1.5 w-full bg-primary" />

      {/* Header: stacks on a phone, sits inline from sm up. */}
      <header className="border-b bg-background">
        <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                JKKN Institutions
              </p>
              <h1 className="mt-1 flex items-center gap-2 text-xl font-bold sm:text-2xl">
                <GraduationCap className="h-5 w-5 shrink-0 text-primary" />
                My courses
              </h1>
            </div>
            {/* The name and ID live INSIDE the menu on a phone, where the
                header has no room for them beside the heading; from sm they
                also show alongside the avatar. */}
            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden min-w-0 text-right sm:block">
                <p className="truncate text-sm font-medium">{participantName}</p>
                {jkknId && (
                  <p className="font-mono text-xs text-muted-foreground">{jkknId}</p>
                )}
              </div>
              <ParticipantMenu participantName={participantName} jkknId={jkknId} />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
        {/* Confirmation after a payment. Named, so it is obvious WHICH
            instalment cleared when a course has several. */}
        {paid && (
          <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-emerald-300 bg-emerald-50 p-3.5 dark:border-emerald-900 dark:bg-emerald-950/40">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-500" />
            <div className="min-w-0 text-sm">
              <p className="font-medium text-emerald-900 dark:text-emerald-200">
                Payment received for {paid}
              </p>
              <p className="text-emerald-800 dark:text-emerald-300">
                Your balance below is up to date. You can download the receipt from
                that instalment.
              </p>
            </div>
          </div>
        )}

        {list.length === 0 ? (
          <div className="rounded-xl border bg-background p-8 text-center">
            <p className="text-sm text-muted-foreground">
              You are not enrolled on any course yet. If your application was accepted
              recently, contact the institution running the course.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {list.map((e) => {
              const bills = ((e.bills ?? []) as any[])
                .slice()
                .sort((a, b) => a.installment_no - b.installment_no);
              const dates = [formatDate(e.course?.start_date), formatDate(e.course?.end_date)]
                .filter(Boolean);

              return (
                <section key={e.id} className="overflow-hidden rounded-xl border bg-background">
                  {/* Course identity */}
                  <div className="border-b p-4 sm:p-5">
                    <h2 className="text-lg font-semibold leading-tight sm:text-xl">
                      {e.course?.title ?? 'Course'}
                    </h2>
                    {e.institution?.name && (
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {e.institution.name}
                      </p>
                    )}

                    <div className="mt-3 flex flex-col gap-1.5 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
                      {dates.length > 0 && (
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="h-4 w-4 shrink-0" />
                          {dates.join(' – ')}
                        </span>
                      )}
                      {e.course?.venue_text && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-4 w-4 shrink-0" />
                          <span className="truncate">{e.course.venue_text}</span>
                        </span>
                      )}
                      {e.course?.mode && <span className="capitalize">{e.course.mode}</span>}
                    </div>
                  </div>

                  {/* Money: 2x2 on a phone so no figure is squeezed, 4-across from sm. */}
                  <div className="grid grid-cols-2 gap-4 border-b bg-muted/40 p-4 sm:grid-cols-4 sm:p-5">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Package
                      </p>
                      <p className="truncate text-base font-medium sm:text-lg">
                        {e.package?.name ?? '—'}
                      </p>
                    </div>
                    <Money label="Total" value={e.total_payable} />
                    <Money label="Paid" value={e.total_paid} />
                    <Money label="Balance" value={e.balance} strong />
                  </div>

                  {/* Instalments */}
                  <div className="p-4 sm:p-5">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                      <ReceiptText className="h-4 w-4 text-muted-foreground" />
                      Instalments
                    </h3>

                    {bills.length === 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        No bills have been raised yet.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-3">
                        {bills.map((b) => {
                          const due = Number(b.balance_amount ?? 0);
                          const payable = due > 0 && b.status !== 'voided';
                          const receipts = ((b.payments ?? []) as any[])
                            .filter((p) => p.status === 'success' && p.receipt_number)
                            .sort((x, y) =>
                              String(y.captured_at ?? '').localeCompare(String(x.captured_at ?? '')),
                            );

                          return (
                            <li key={b.id} className="rounded-lg border p-3 sm:p-3.5">
                              {/* Row 1: what it is + status pill */}
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-medium leading-tight">
                                    {b.label || `Instalment ${b.installment_no}`}
                                  </p>
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    {b.bill_number} · due {formatDate(b.due_date)}
                                  </p>
                                </div>
                                <span
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                    BILL_STATUS_CLASS[b.status] ?? 'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {BILL_STATUS_LABEL[b.status] ?? b.status}
                                </span>
                              </div>

                              {/* Row 2: amounts */}
                              <div className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                                <span className="text-lg font-semibold">
                                  {inr.format(Number(b.total_amount ?? 0))}
                                </span>
                                {Number(b.paid_amount ?? 0) > 0 && due > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {inr.format(Number(b.paid_amount))} paid ·{' '}
                                    {inr.format(due)} left
                                  </span>
                                )}
                              </div>

                              {/* Row 3: actions — full width on a phone, inline from sm. */}
                              {(payable || receipts.length > 0) && (
                                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                                  {receipts.map((p) => (
                                    <DownloadReceiptButton
                                      key={p.id}
                                      receipt={
                                        {
                                          receiptNumber: p.receipt_number,
                                          paidOn: p.captured_at ?? p.payment_date ?? null,
                                          amountPaid: Number(p.amount_paid ?? 0),
                                          paymentMode: p.payment_mode,
                                          razorpayPaymentId: p.razorpay_payment_id ?? null,
                                          participantName,
                                          jkknId,
                                          courseTitle: e.course?.title ?? 'Course',
                                          institutionName: e.institution?.name ?? null,
                                          enrollmentNumber: e.enrollment_number ?? null,
                                          billNumber: b.bill_number,
                                          instalmentLabel:
                                            b.label || `Instalment ${b.installment_no}`,
                                          instalmentDueDate: b.due_date ?? null,
                                          billTotal: Number(b.total_amount ?? 0),
                                          totalPayable: Number(e.total_payable ?? 0),
                                          totalPaid: Number(e.total_paid ?? 0),
                                          balance: Number(e.balance ?? 0),
                                        } satisfies CourseReceiptData
                                      }
                                    />
                                  ))}

                                  {payable && (
                                    <PayInstalmentButton
                                      billId={b.id}
                                      amountLabel={inr.format(due)}
                                    />
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Payments go to {e.institution?.name ?? 'the institution running this course'}.
                      If online payment is unavailable, contact them directly.
                    </p>

                    <p className="mt-2 text-xs text-muted-foreground">
                      Enrolment {e.enrollment_number} · {e.status}
                    </p>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <footer className="mt-8 border-t pt-5 text-center text-xs text-muted-foreground">
          <Link href="/auth/participant-login" className="underline">
            Sign in as someone else
          </Link>
        </footer>
      </main>
    </div>
  );
}
