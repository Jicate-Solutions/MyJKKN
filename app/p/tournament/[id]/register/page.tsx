// app/p/tournament/[id]/register/page.tsx
// PUBLIC self-service tournament registration (Sports Tournament v2, decisions #1/#5/#6).
// Outside the (routes) auth group — no login required to view. Loads the tournament +
// open divisions server-side (service-role, like the MindSmile public page), checks the
// registration window, and renders a hybrid form: a logged-in JKKN user auto-links their
// student record; a guest enters contact details. Created: 2026-06-23.

import type { Metadata } from 'next';
import { createClient as createAnonOrService } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { Trophy, CalendarClock } from 'lucide-react';
import { RegisterForm } from './_components/register-form';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Tournament Registration · JKKN',
    description: 'Register your team or yourself for the tournament.',
    robots: { index: false, follow: false },
  };
}

interface DivisionLite {
  id: string;
  sport: string;
  gender: string | null;
  age_band: string | null;
  format: string;
  config: Record<string, unknown>;
  eligibility: Record<string, unknown>;
}

export default async function PublicRegisterPage({
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
      <Trophy className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{msg}</p>
    </main>
  );

  if (!UUID_RE.test(id)) return <Empty title="Registration not available" msg="This tournament does not exist." />;

  const svc = createAnonOrService(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: ev } = await svc
    .from('events')
    .select('id, name, event_type, status, start_date, venue, venue_text, registration_open_date, registration_close_date, participant_org_type')
    .eq('id', id)
    .eq('event_type', 'sports_tournament')
    .maybeSingle();

  if (!ev || ['draft', 'cancelled'].includes(ev.status)) {
    return <Empty title="Registration not available" msg="This tournament is not open for registration." />;
  }

  const now = new Date();
  const notYet = ev.registration_open_date && now < new Date(ev.registration_open_date);
  const closed = ev.registration_close_date && now > new Date(ev.registration_close_date);
  if (notYet) {
    return (
      <Empty
        title="Registration opens soon"
        msg={`Registration opens on ${new Date(ev.registration_open_date!).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}.`}
      />
    );
  }
  if (closed) return <Empty title="Registration closed" msg="The registration window for this tournament has closed." />;

  const { data: divisions } = await svc
    .from('tournament_divisions')
    .select('id, sport, gender, age_band, format, config, eligibility')
    .eq('event_id', id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (!divisions || divisions.length === 0) {
    return <Empty title="No events to register for yet" msg="The organizer hasn't published any divisions yet." />;
  }

  // WHICH form? An event holds many (one per monthly run), addressed by ?form=<slug>.
  // No slug — an old link printed before the event had more than one form — falls
  // back to the first OPEN form, so those links keep working. maybeSingle() on
  // event_id is deliberately gone: it errors the moment a second form exists.
  const requestedSlug = typeof sp?.form === 'string' ? sp.form : undefined;

  const formQuery = svc
    .from('event_registration_forms')
    .select('id, slug, name, is_enabled')
    .eq('event_id', id);

  const { data: formRows } = requestedSlug
    ? await formQuery.eq('slug', requestedSlug).limit(1)
    : await formQuery
        .eq('is_enabled', true)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(1);

  const formRow = formRows?.[0] ?? null;

  // A slug that names a real but closed form is a "closed" answer, not a
  // "collect nothing" one — otherwise last month's link would silently accept
  // this month's entries.
  if (requestedSlug && formRow && formRow.is_enabled === false) {
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

  let sections: { id: string; title: string; display_order: number; fields: any[] }[] = [];
  if (formRow && formRow.is_enabled !== false) {
    const { data: rawSections } = await svc
      .from('event_registration_form_sections')
      .select('*')
      .eq('form_id', formRow.id)
      .order('display_order', { ascending: true });
    // By form_id, NOT event_id — filtering by event here would render every
    // other month's questions on this month's form.
    const { data: rawFields } = await svc
      .from('event_registration_form_fields')
      .select('*')
      .eq('form_id', formRow.id)
      .order('display_order', { ascending: true });
    sections = (rawSections ?? []).map((s) => ({
      ...s,
      fields: (rawFields ?? []).filter((f) => f.section_id === s.id),
    }));
  }

  // hybrid identity: is a JKKN user signed in?
  let signedInName: string | null = null;
  let isLearner = false;
  try {
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (user) {
      const { data: profile } = await svc
        .from('profiles')
        .select('full_name, learner_id')
        .eq('id', user.id)
        .maybeSingle();
      signedInName = profile?.full_name ?? user.email ?? null;
      isLearner = !!profile?.learner_id;
    }
  } catch {
    /* no session — guest flow */
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <header className="mb-5 rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-emerald-50 p-2.5">
            <Trophy className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">{ev.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Register your team or yourself below.</p>
            {ev.registration_close_date && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" />
                Registration closes{' '}
                {new Date(ev.registration_close_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            )}
          </div>
        </div>
      </header>

      <RegisterForm
        eventId={id}
        formId={formRow?.id ?? null}
        divisions={divisions as DivisionLite[]}
        signedInName={signedInName}
        isLearner={isLearner}
        sections={sections}
        participantOrgType={ev.participant_org_type === 'college' ? 'college' : 'school'}
      />

      <footer className="mt-8 text-center text-xs text-muted-foreground">JKKN Institutions · Tournament registration</footer>
    </main>
  );
}
