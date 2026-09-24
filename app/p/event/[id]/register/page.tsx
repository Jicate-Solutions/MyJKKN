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
import {
  buildRegistrationPrefill,
  isContactBlockMode,
  type RegistrationPrefill,
} from '@/lib/services/events/registration/form-prefill';
import { Ban, CalendarClock, CalendarDays, MapPin, Ticket } from 'lucide-react';
import { effectiveFee, formRegistrationState, isFormOpen } from '@/types/tournament';
import {
  countTaken,
  findOutstandingOffer,
  isWaitlistAvailable,
} from '@/lib/services/events/waitlist-service';
import { EventRegisterForm } from './_components/event-register-form';
import {
  PUBLIC_CANCELLATION_CONTACT_EMAIL,
  PUBLIC_CANCELLATION_NOTICE,
  PUBLIC_EVENT_COLUMNS,
} from './_lib/cancellation';

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

  // PUBLIC_EVENT_COLUMNS names only columns that exist on production TODAY, and
  // this is now the page's ONLY read of `events` — the cancellation columns are
  // not read here at all. See ./_lib/cancellation.ts for why one missing column
  // would otherwise break public registration for every event.
  const { data: ev } = await svc
    .from('events')
    .select(PUBLIC_EVENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (!ev) {
    return <Empty title="Registration not available" msg="This event is not open for registration." />;
  }

  // A CANCELLED event says so, by name — in a STANDARD line, not in the
  // organiser's own words.
  //
  // Checked BEFORE every other branch: someone holding this link was told about
  // this event, and "not open for registration" — the generic answer this page
  // gave until this state existed — reads as a closed window they might have
  // missed rather than as an event that is not happening. No redirect and no
  // 404: the page exists, and the answer is just no.
  //
  // WHY NO REASON HERE (Director's ruling, 13 Sep: "Short public line, full
  // reason kept inside"). `cancellation_reason` is free text typed by an
  // organiser at the worst moment of an event's life, with no review step
  // between the textarea and every person holding the link. It is still
  // required, still stored exactly as typed, and still shown IN FULL on
  // /events/[id] to colleagues at the institution who can open the event — it
  // just stops being published. What the public needs from this page is the
  // fact and a way to ask; both are here.
  //
  // Registration is not stopped HERE, and no second mechanism is added: this
  // page and /api/events/[eventId]/public-register have always refused a
  // `cancelled` event, exactly as they refuse a closed registration window. This
  // branch only replaces a silent-shaped refusal with an explicit one.
  if (ev.status === 'cancelled') {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center">
          <Ban className="mx-auto mb-3 h-10 w-10 text-red-600 dark:text-red-400" />
          <h1 className="text-xl font-semibold">{PUBLIC_CANCELLATION_NOTICE.headline}</h1>
          <p className="mt-1 text-sm font-medium">{ev.name}</p>
          <p className="mt-4 text-sm">{PUBLIC_CANCELLATION_NOTICE.body}</p>
          <p className="mt-2 text-sm">{PUBLIC_CANCELLATION_NOTICE.alreadyRegistered}</p>
          {/* The subject line is the whole of this address's routing. It goes to
              ONE institution-wide mailbox for every cancelled event at every
              college (see PUBLIC_CANCELLATION_CONTACT_EMAIL), so a bare mailto
              arrives with nothing saying which event it is about. Stamping the
              event's name and id into the subject costs nothing, needs no
              schema, and is what makes the reply possible — the reader can look
              the event up instead of asking which one it was. */}
          <p className="mt-4 text-xs text-muted-foreground">
            {PUBLIC_CANCELLATION_NOTICE.contactPrompt}{' '}
            <a
              className="font-medium underline underline-offset-2"
              href={`mailto:${PUBLIC_CANCELLATION_CONTACT_EMAIL}?subject=${encodeURIComponent(
                `Cancelled event: ${ev.name} (${id})`
              )}`}
            >
              {PUBLIC_CANCELLATION_CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>
      </main>
    );
  }

  if (ev.status === 'draft') {
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

  // THIS visitor's account, resolved early: the two gates below need to know
  // whether a place is being held for them. A guest has no session and meets
  // every gate exactly as before.
  let viewerProfileId: string | null = null;
  let signedInName: string | null = null;
  let signedInEmail: string | null = null;
  // "Prefill from profile": what this signed-in person's record says, keyed by
  // the sources a field may name. Empty for a guest. Resolved with the service
  // client because a learner's own row is RLS-scoped and the public page is anon.
  let prefill: RegistrationPrefill = {};
  try {
    const session = await createSessionClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (user) {
      const { data: profile } = await svc
        .from('profiles')
        .select(
          'id, full_name, email, phone_number, gender, date_of_birth, institution_id, department_id, learner_id',
        )
        .eq('id', user.id)
        .maybeSingle();
      viewerProfileId = profile?.id ?? null;
      signedInName = profile?.full_name ?? user.email ?? null;
      signedInEmail = user.email ?? null;

      if (profile) {
        const [{ data: staff }, { data: learner }] = await Promise.all([
          svc
            .from('staff')
            .select(
              'staff_id, first_name, last_name, email, phone, gender, date_of_birth, designation, institution_id, department_id',
            )
            .eq('profile_id', profile.id)
            .limit(1)
            .maybeSingle(),
          profile.learner_id
            ? svc
                .from('learners_profiles')
                .select(
                  'first_name, last_name, student_email, college_email, student_mobile, gender, date_of_birth, roll_number, register_number, institution_id, department_id, degree_id, program_id',
                )
                .eq('id', profile.learner_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        const ids = (...vals: (string | null | undefined)[]) =>
          Array.from(new Set(vals.filter((v): v is string => !!v)));
        const instIds = ids(profile.institution_id, staff?.institution_id, learner?.institution_id);
        const deptIds = ids(profile.department_id, staff?.department_id, learner?.department_id);
        const degIds = ids(learner?.degree_id);
        const progIds = ids(learner?.program_id);
        const lookup = async (table: string, col: string, list: string[]) => {
          if (!list.length) return {} as Record<string, string>;
          const { data } = await svc.from(table).select(`id, ${col}`).in('id', list);
          const out: Record<string, string> = {};
          // The column name is dynamic, so the query typer cannot name the row.
          for (const row of (data ?? []) as unknown as Record<string, string>[]) {
            out[row.id] = row[col] ?? '';
          }
          return out;
        };
        const [institutions, departments, degrees, programs] = await Promise.all([
          lookup('institutions', 'name', instIds),
          lookup('departments', 'department_name', deptIds),
          lookup('degrees', 'degree_name', degIds),
          lookup('programs', 'program_name', progIds),
        ]);
        prefill = buildRegistrationPrefill({
          profile,
          staff: staff ?? null,
          learner: learner ?? null,
          names: { institutions, departments, degrees, programs },
        });
      }
    }
  } catch {
    /* no session — guest flow */
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
  /** The window has shut, but a place is being held for this very visitor. */
  let windowClosedButHoldsAPlace = false;
  if (ev.registration_close_date && now > new Date(ev.registration_close_date)) {
    // The route defers its close-date refusal for a caller holding a live
    // offer. This page is the route's only caller, so it must defer too, or
    // the held place is unreachable — the mistake #3714 made twice. Because
    // this queue is for signed-in people, the page can ask the precise
    // question about THIS visitor rather than an identity-free one.
    const held = viewerProfileId
      ? await findOutstandingOffer(svc as never, id, viewerProfileId, null).catch(() => null)
      : null;
    if (!held) {
      return <Empty title="Registration closed" msg="The registration window for this event has closed." />;
    }
    windowClosedButHoldsAPlace = true;
  }

  // WHICH form? Same resolution rules as the tournament page, deliberately —
  // one link format across the platform. ?form=<slug> picks it; no slug falls
  // back to the first OPEN form so links printed before the event had several
  // forms keep working.
  const requestedSlug = typeof sp?.form === 'string' ? sp.form : undefined;

  const formQuery = svc
    .from('event_registration_forms')
    .select('id, slug, name, description, is_enabled, starts_at, ends_at, fee_enabled, fee_amount, fee_label, contact_block')
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

  // effectiveFee applies BOTH gates (switched on AND priced) and does the
  // string→number coercion PostgREST forces on numeric. Testing either field
  // alone here is how a form with the fee switched off would still charge.
  const fee = effectiveFee(formRow);

  // ---- capacity: what a FULL event does is the event's own decision ----
  // Capacity is enforced server-side on submit too; this only decides what the
  // visitor is shown. `events.cap_behavior = 'waitlist'` keeps the form open
  // for a SIGNED-IN visitor on a FREE form — the only people the route will
  // queue — so that sending it joins the queue, or takes up a place being held
  // for them. This page is the route's only caller: a gate here that the route
  // does not have makes the queue unreachable. Everybody else sees exactly what
  // they always saw. And it only offers a queue that exists: before the
  // migration is applied this shows the refusal it has always shown.
  let full = false;
  if (ev.max_registrations) {
    let taken: number;
    try {
      // strictOffers=false: this page only picks copy; the door re-checks.
      taken = await countTaken(svc as never, id, false);
    } catch {
      return <Empty title="Registration full" msg="This event has reached its maximum number of registrations." />;
    }
    if (taken >= ev.max_registrations) {
      const queues =
        ev.cap_behavior === 'waitlist' &&
        fee <= 0 &&
        Boolean(viewerProfileId) &&
        (await isWaitlistAvailable(svc as never));
      if (!queues) {
        return <Empty title="Registration full" msg="This event has reached its maximum number of registrations." />;
      }
      full = true;
    }
  }
  if (windowClosedButHoldsAPlace) full = true;

  const when = ev.event_date ?? ev.start_date;
  const where = ev.venue || ev.venue_text;

  // This page is what the public sees when a link is forwarded, so it is
  // deliberately colourful (2026-09-24): a tinted backdrop, a gradient title
  // band and coloured meta chips — and wider than the old one-column card.
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-sky-50/60 to-white dark:from-emerald-950/40 dark:via-sky-950/20 dark:to-background">
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <header className="mb-6 overflow-hidden rounded-2xl border border-emerald-200/70 bg-card shadow-md dark:border-emerald-900">
        {/* The event's banner (Registration forms → Banner, or events.hero_image_url). */}
        {ev.hero_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ev.hero_image_url}
            alt=""
            className="block w-full object-cover"
          />
        )}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 px-5 py-5 text-white sm:px-7">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white/20 p-2.5 ring-1 ring-white/40">
              <Ticket className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/80">Event registration</p>
              <h1 className="mt-0.5 text-2xl font-bold leading-tight sm:text-3xl">{ev.name}</h1>
              {formRow.description && (
                <p className="mt-1.5 text-sm text-white/90">{formRow.description}</p>
              )}
            </div>
          </div>
        </div>
        {(when || where || ev.registration_close_date) && (
          <div className="flex flex-wrap gap-2 px-5 py-4 sm:px-7">
            {when && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-200">
                <CalendarDays className="h-3.5 w-3.5" />
                {new Date(when).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            )}
            {where && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-800 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-200">
                <MapPin className="h-3.5 w-3.5" />
                {where}
              </span>
            )}
            {ev.registration_close_date && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                <CalendarClock className="h-3.5 w-3.5" />
                Registration closes{' '}
                {new Date(ev.registration_close_date).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            )}
          </div>
        )}
      </header>

      <EventRegisterForm
        eventId={id}
        formId={formRow.id}
        formName={formRow.name}
        fee={fee}
        feeLabel={formRow.fee_label ?? null}
        signedInName={signedInName}
        signedInEmail={signedInEmail}
        prefill={prefill}
        contactBlock={isContactBlockMode(formRow.contact_block) ? formRow.contact_block : 'top'}
        full={full}
        claimOnly={windowClosedButHoldsAPlace}
        sections={sections as never}
      />

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        JKKN Institutions · Event registration
      </footer>
    </main>
    </div>
  );
}
