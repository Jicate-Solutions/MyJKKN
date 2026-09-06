// app/p/event/[id]/register/page.tsx
// PUBLIC self-service registration for a GENERAL event — lecture, convocation,
// cultural programme, alumni meet. The counterpart of
// /p/tournament/[id]/register, which is locked to event_type='sports_tournament'
// and therefore could never render any other event's form. Until this page
// existed a general event's registration form could be BUILT but never filled in
// by anyone.
//
// Outside the (routes) auth group, so no login is required to view. `/p/` is
// already a PUBLIC_PATH_PREFIXES entry in proxy.ts — no proxy change needed.
//
// Loads server-side with the service-role key (same pattern as the tournament
// page): RLS on events would otherwise hide a not-yet-public event from an
// anonymous visitor holding a legitimate link.

import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient as createAnonOrService } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { CalendarClock, CalendarDays, MapPin, Ticket } from 'lucide-react';
import { effectiveFee, formRegistrationState, isFormOpen } from '@/types/tournament';
import { EventRegisterForm } from './_components/event-register-form';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Types with their own public registration surface. A tournament link must not
 * resolve here: its entries need divisions, eligibility and a roster, none of
 * which this page collects.
 */
const HAS_OWN_PUBLIC_PAGE = new Set(['sports_tournament', 'marathon']);

/**
 * School of Influence registers through /events/[id]/apply, NOT this page.
 *
 * Kept out of HAS_OWN_PUBLIC_PAGE on purpose. That set's answer is "ask the
 * organizer for the correct link", which is the right answer when this page
 * cannot know where somebody should have gone. Here it DOES know — the apply
 * door is one route away — so sending a would-be applicant off to find a human
 * would be withholding the one fact they need.
 *
 * WHY THIS GUARD EXISTS AT ALL (2026-08-17). All 17 people who signed up for
 * "JKKN School of Influencer" arrived here instead of the apply page. This page
 * accepted every one of them and wrote `source = 'event_self'`, while every
 * School of Influence screen reads `source = 'soi_apply'` — so seventeen real
 * applications sat in the table, healthy and invisible, until they were
 * restamped by migration 20260817060000. Closing this door is the durable half
 * of that repair: the backfill fixed the rows that existed, this stops the next
 * seventeen being created the same way.
 *
 * The apply route lives inside the authenticated (routes) group, which is not a
 * limitation to work around — it is the point. An application must be tied to
 * the account of the person making it (spec §7 S4), which is why the copy below
 * asks for a sign-in rather than collecting a name and an email here.
 */
const APPLIES_THROUGH_SOI_DOOR = 'school_of_influence';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Event Registration · JKKN',
    description: 'Register for this event.',
    robots: { index: false, follow: false },
  };
}

export default async function PublicEventRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // ?form=<slug> selects which of the event's registration forms this link is for.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const Empty = ({ title, msg }: { title: string; msg: string }) => (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <Ticket className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{msg}</p>
    </main>
  );

  if (!UUID_RE.test(id)) {
    return <Empty title="Registration not available" msg="This event does not exist." />;
  }

  const svc = createAnonOrService(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: ev } = await svc
    .from('events')
    .select(
      'id, name, event_type, status, event_date, start_date, venue, venue_text, registration_open_date, registration_close_date, max_registrations'
    )
    .eq('id', id)
    .maybeSingle();

  if (!ev || ['draft', 'cancelled'].includes(ev.status)) {
    return <Empty title="Registration not available" msg="This event is not open for registration." />;
  }

  if (HAS_OWN_PUBLIC_PAGE.has(ev.event_type as string)) {
    return (
      <Empty
        title="Wrong registration link"
        msg="This event registers through its own page. Ask the organizer for the correct link."
      />
    );
  }

  // Checked BEFORE the registration-window branches below, so an applicant who
  // arrives on the wrong link is sent to the right one whatever the window is
  // doing — a "registration closed" notice on a page that was never the right
  // page would send them away believing the programme had shut.
  if ((ev.event_type as string) === APPLIES_THROUGH_SOI_DOOR) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <Ticket className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Apply on the programme page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ev.name} takes applications on its own page, where a coordinator
          reviews each one and places you in a batch. Sign in with your JKKN
          account to apply — an application is recorded against you, so it
          cannot be filled in on somebody else&apos;s behalf.
        </p>
        <Link
          href={`/events/${ev.id}/apply`}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          Go to the application page
        </Link>
      </main>
    );
  }

  const now = new Date();
  if (ev.registration_open_date && now < new Date(ev.registration_open_date)) {
    return (
      <Empty
        title="Registration opens soon"
        msg={`Registration opens on ${new Date(ev.registration_open_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}.`}
      />
    );
  }
  if (ev.registration_close_date && now > new Date(ev.registration_close_date)) {
    return <Empty title="Registration closed" msg="The registration window for this event has closed." />;
  }

  // WHICH form? Same resolution rules as the tournament page, deliberately —
  // one link format across the platform. ?form=<slug> picks it; no slug falls
  // back to the first OPEN form so links printed before the event had several
  // forms keep working.
  const requestedSlug = typeof sp?.form === 'string' ? sp.form : undefined;

  const formQuery = svc
    .from('event_registration_forms')
    .select('id, slug, name, description, is_enabled, starts_at, ends_at, fee_enabled, fee_amount, fee_label')
    .eq('event_id', id);

  const { data: formRows } = requestedSlug
    ? await formQuery.eq('slug', requestedSlug).limit(1)
    : await formQuery
        .eq('is_enabled', true)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });

  // With no slug, pick the first form that is actually OPEN right now — an
  // enabled form can still be Scheduled or Expired, and PostgREST cannot express
  // "now between two nullable columns" without a view.
  const formRow = requestedSlug
    ? (formRows?.[0] ?? null)
    : ((formRows ?? []).find((f) => isFormOpen(f)) ?? null);

  // A slug naming a real but CLOSED form is a "closed" answer, not an empty
  // form — otherwise last month's link silently collects this month's entries.
  if (requestedSlug && formRow && !isFormOpen(formRow)) {
    const state = formRegistrationState(formRow);
    if (state === 'scheduled') {
      const opensAt = formRow.starts_at ? new Date(formRow.starts_at) : null;
      return (
        <Empty
          title="Registration opens soon"
          msg={
            opensAt
              ? `"${formRow.name}" opens on ${opensAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}.`
              : `"${formRow.name}" is not open yet.`
          }
        />
      );
    }
    return (
      <Empty
        title="Registration closed"
        msg={`"${formRow.name}" is no longer accepting entries. Ask the organizer for the current registration link.`}
      />
    );
  }
  if (requestedSlug && !formRow) {
    return <Empty title="Registration form not found" msg="This registration link is not valid for this event." />;
  }
  if (!formRow) {
    return (
      <Empty
        title="Registration not open"
        msg="The organizer has not opened a registration form for this event yet."
      />
    );
  }

  // Fields by form_id, NEVER event_id — filtering by event renders every other
  // month's questions on this month's form.
  const [{ data: rawSections }, { data: rawFields }] = await Promise.all([
    svc
      .from('event_registration_form_sections')
      .select('*')
      .eq('form_id', formRow.id)
      .order('display_order', { ascending: true }),
    svc
      .from('event_registration_form_fields')
      .select('*')
      .eq('form_id', formRow.id)
      .order('display_order', { ascending: true }),
  ]);

  const sections = (rawSections ?? []).map((s) => ({
    ...s,
    fields: (rawFields ?? []).filter((f) => f.section_id === s.id),
  }));

  // Capacity is enforced server-side on submit too; this only avoids showing a
  // form that cannot be submitted.
  if (ev.max_registrations) {
    const { count } = await svc
      .from('events_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', id)
      .neq('status', 'cancelled');
    if ((count ?? 0) >= ev.max_registrations) {
      return <Empty title="Registration full" msg="This event has reached its maximum number of registrations." />;
    }
  }

  // Hybrid identity: a signed-in JKKN user is linked to their record; a guest
  // supplies contact details.
  let signedInName: string | null = null;
  let signedInEmail: string | null = null;
  try {
    const session = await createSessionClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (user) {
      const { data: profile } = await svc
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      signedInName = profile?.full_name ?? user.email ?? null;
      signedInEmail = user.email ?? null;
    }
  } catch {
    /* no session — guest flow */
  }

  // effectiveFee applies BOTH gates (switched on AND priced) and does the
  // string→number coercion PostgREST forces on numeric. Testing either field
  // alone here is how a form with the fee switched off would still charge.
  const fee = effectiveFee(formRow);
  const when = ev.event_date ?? ev.start_date;
  const where = ev.venue || ev.venue_text;

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <header className="mb-5 rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5">
            <Ticket className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight">{ev.name}</h1>
            {formRow.description && (
              <p className="mt-1 text-sm text-muted-foreground">{formRow.description}</p>
            )}
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {when && (
                <p className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {new Date(when).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              )}
              {where && (
                <p className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {where}
                </p>
              )}
              {ev.registration_close_date && (
                <p className="flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Registration closes{' '}
                  {new Date(ev.registration_close_date).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      <EventRegisterForm
        eventId={id}
        formId={formRow.id}
        formName={formRow.name}
        fee={fee}
        feeLabel={formRow.fee_label ?? null}
        signedInName={signedInName}
        signedInEmail={signedInEmail}
        sections={sections as never}
      />

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        JKKN Institutions · Event registration
      </footer>
    </main>
  );
}
