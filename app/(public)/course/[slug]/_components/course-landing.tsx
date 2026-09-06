// Public course landing body.
//
// A server component — nothing here is interactive, so shipping it as client JS
// would buy nothing. The only navigation is a plain <Link> to the apply page.
//
// Everything rendered comes from PublicCourseSummary, which by construction
// carries no institution_id and no internal id.

import Link from 'next/link';
import { CalendarDays, IndianRupee, MapPin, Users } from 'lucide-react';
import type { PublicCourseSummary } from '@/types/courses';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrExact = new Intl.NumberFormat('en-IN', {
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

const formatRange = (from: string | null, to: string | null) => {
  const a = formatDate(from);
  const b = formatDate(to);
  if (a && b) return a === b ? a : `${a} – ${b}`;
  return a ?? b ?? null;
};

export function CourseLanding({
  course,
  preselectedForm,
}: {
  course: PublicCourseSummary;
  preselectedForm: string | null;
}) {
  const dates = formatRange(course.start_date, course.end_date);

  // Where Apply goes. A named form in the URL is carried through; otherwise the
  // apply page resolves the single enabled form, or asks.
  const formSlug = preselectedForm ?? (course.forms.length === 1 ? course.forms[0].slug : null);
  const applyHref = `/course/${course.slug}/apply${formSlug ? `?form=${formSlug}` : ''}`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="h-1.5 w-full bg-primary" />

      <main className="mx-auto w-full max-w-3xl px-5 py-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          JKKN Institutions
        </p>
        <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">{course.title}</h1>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {dates && (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              {dates}
            </span>
          )}
          {course.venue_text && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {course.venue_text}
            </span>
          )}
          <span className="capitalize">{course.mode}</span>
        </div>

        {course.description && (
          <p className="mt-6 whitespace-pre-line text-base leading-relaxed">
            {course.description}
          </p>
        )}

        {/* ── packages ─────────────────────────────────────────────────────── */}
        {/* Fees exist but nothing is on sale. Rendering nothing here reads as
            "this course is free", which is the opposite of true. */}
        {course.packagesExist && course.packages.length === 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">Fees</h2>
            <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Fees for this course are not on sale at the moment. Please check back
              later, or contact the institution for the current rates.
            </p>
          </section>
        )}

        {course.packages.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">Fees</h2>
            <div className="mt-3 space-y-3">
              {course.packages.map((p) => (
                <div key={p.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold">{p.name}</h3>
                    <span className="text-xl font-bold">{inr.format(p.total_amount)}</span>
                  </div>

                  {p.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {p.seat_cap != null && (
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        {p.seat_cap} seats
                      </span>
                    )}
                    {p.installments.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        <IndianRupee className="h-3.5 w-3.5" />
                        Payable in {p.installments.length} instalment
                        {p.installments.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>

                  {p.installments.length > 0 && (
                    <ul className="mt-3 divide-y rounded-md border text-sm">
                      {p.installments.map((i, idx) => (
                        <li
                          key={`${p.id}-${idx}`}
                          className="flex items-center justify-between gap-3 px-3 py-1.5"
                        >
                          <span className="min-w-0 truncate text-muted-foreground">
                            {i.label || `Instalment ${idx + 1}`}
                          </span>
                          <span className="flex shrink-0 items-center gap-4">
                            <span className="text-muted-foreground">
                              by {formatDate(i.due_date)}
                            </span>
                            <span className="font-medium">{inrExact.format(i.amount)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── apply ────────────────────────────────────────────────────────── */}
        <section className="mt-10 rounded-lg border p-5">
          {course.applicationsOpen ? (
            <>
              <h2 className="text-lg font-semibold">Apply for this course</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                You do not need a JKKN account. If your application is accepted you will be
                sent a JKKN ID and a login so you can pay and follow your course.
              </p>
              <Link
                href={applyHref}
                className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Start an application
              </Link>

              {course.forms.length > 1 && (
                <p className="mt-3 text-sm text-muted-foreground">
                  There are {course.forms.length} application forms for this course — you
                  will be asked which one applies to you.
                </p>
              )}
            </>
          ) : (
            // Never a dead Apply button. Say which of the two reasons it is,
            // because "come back later" and "you have missed it" call for
            // different things from the reader.
            <>
              <h2 className="text-lg font-semibold">Applications are closed</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {course.application_opens_at &&
                new Date(course.application_opens_at) > new Date()
                  ? `Applications open on ${formatDate(course.application_opens_at.slice(0, 10))}.`
                  : 'This course is not accepting applications at the moment.'}
              </p>
            </>
          )}
        </section>

        <footer className="mt-10 border-t pt-5 text-xs text-muted-foreground">
          JKKN Institutions · This page is public. Do not enter payment details here — you
          will only ever be asked to pay after signing in with a JKKN ID.
        </footer>
      </main>
    </div>
  );
}
