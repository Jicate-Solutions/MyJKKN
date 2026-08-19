// app/my-courses/page.tsx
//
// The external participant's portal.
//
// Deliberately OUTSIDE app/(routes)/ — that group mounts the full admin shell
// (sidebar, institution switcher, the whole nav map), and a participant holds
// exactly one permission key, courses.participant.self. They would be shown a
// chrome of menus that all resolve to nothing. This is a standalone page
// instead: authenticated, but with no admin furniture around it.
//
// NOT in proxy.ts's public list, so the middleware requires a session before
// this renders. That is the intent — everything here is somebody's own money.
//
// A server component reading through the cookie-bound SSR client, so RLS is the
// gate rather than a hand-written filter. The participant policies added in
// 20260813100300 (course_events_participant_select and friends) are what make
// these reads return exactly one person's rows and nobody else's.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarDays, MapPin, ReceiptText } from 'lucide-react';

import { createClient } from '@/lib/supabase/server';
import { PayInstalmentButton } from './_components/pay-instalment-button';

export const dynamic = 'force-dynamic';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const formatDate = (value: string | null) => {
  if (!value) return null;
  const d = new Date(`${value}T00:00`);
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
  pending: 'text-amber-700 dark:text-amber-400',
  partially_paid: 'text-blue-700 dark:text-blue-400',
  paid: 'text-emerald-700 dark:text-emerald-400',
  overdue: 'text-red-700 dark:text-red-400',
  voided: 'text-muted-foreground line-through',
};

export default async function MyCoursesPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect('/auth/participant-login');

  // Embeds name their FK constraints — course_enrollments has several routes
  // into the same tables, and an unqualified embed is a PGRST201.
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select(
      `id, enrollment_number, status, total_payable, total_paid, balance, enrolled_at,
       course:course_events!course_enrollments_course_event_id_fkey(title, slug, start_date, end_date, mode, venue_text),
       package:course_packages!course_enrollments_package_id_fkey(name),
       bills:course_bills!course_bills_enrollment_id_fkey(id, bill_number, installment_no, label, total_amount, paid_amount, balance_amount, due_date, status)`,
    )
    .eq('profile_id', auth.user.id)
    .order('enrolled_at', { ascending: false });

  const list = (enrollments ?? []) as any[];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="h-1.5 w-full bg-primary" />

      <main className="mx-auto w-full max-w-3xl px-5 py-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          JKKN Institutions
        </p>
        <h1 className="mt-2 text-2xl font-bold">My courses</h1>

        {list.length === 0 ? (
          <div className="mt-8 rounded-lg border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              You are not enrolled on any course yet. If your application was
              accepted recently, contact the institution running the course.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {list.map((e) => {
              const bills = ((e.bills ?? []) as any[])
                .slice()
                .sort((a, b) => a.installment_no - b.installment_no);
              const dates = [formatDate(e.course?.start_date), formatDate(e.course?.end_date)]
                .filter(Boolean);

              return (
                <section key={e.id} className="rounded-lg border p-5">
                  <h2 className="text-lg font-semibold">{e.course?.title ?? 'Course'}</h2>

                  <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
                    {dates.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="h-4 w-4" />
                        {dates.join(' – ')}
                      </span>
                    )}
                    {e.course?.venue_text && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" />
                        {e.course.venue_text}
                      </span>
                    )}
                    {e.course?.mode && <span className="capitalize">{e.course.mode}</span>}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-4 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Package</p>
                      <p className="font-medium">{e.package?.name ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="font-medium">{inr.format(Number(e.total_payable ?? 0))}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Paid</p>
                      <p className="font-medium">{inr.format(Number(e.total_paid ?? 0))}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Balance</p>
                      <p className="font-medium">{inr.format(Number(e.balance ?? 0))}</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                      <ReceiptText className="h-4 w-4 text-muted-foreground" />
                      Instalments
                    </h3>

                    {bills.length === 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        No bills have been raised yet.
                      </p>
                    ) : (
                      <ul className="mt-2 divide-y rounded-md border text-sm">
                        {bills.map((b) => (
                          <li
                            key={b.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                          >
                            <span className="min-w-0">
                              <span className="block font-medium">
                                {b.label || `Instalment ${b.installment_no}`}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {b.bill_number} · due {formatDate(b.due_date)}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-4">
                              <span className={`text-xs ${BILL_STATUS_CLASS[b.status] ?? ''}`}>
                                {BILL_STATUS_LABEL[b.status] ?? b.status}
                              </span>
                              <span className="font-medium">
                                {inr.format(Number(b.total_amount ?? 0))}
                              </span>
                              {/* Only what is still owed is payable. A voided or
                                  settled instalment gets no button rather than a
                                  disabled one — there is nothing to explain. */}
                              {Number(b.balance_amount ?? 0) > 0 &&
                                b.status !== 'voided' && (
                                  <PayInstalmentButton
                                    billId={b.id}
                                    amountLabel={inr.format(Number(b.balance_amount ?? 0))}
                                  />
                                )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <p className="mt-3 text-xs text-muted-foreground">
                      Payments are made to the institution running this course. If
                      online payment is unavailable, contact them directly.
                    </p>
                  </div>

                  <p className="mt-4 text-xs text-muted-foreground">
                    Enrollment {e.enrollment_number} · {e.status}
                  </p>
                </section>
              );
            })}
          </div>
        )}

        <footer className="mt-10 border-t pt-5 text-xs text-muted-foreground">
          <Link href="/auth/participant-login" className="underline">
            Sign in as someone else
          </Link>
        </footer>
      </main>
    </div>
  );
}
