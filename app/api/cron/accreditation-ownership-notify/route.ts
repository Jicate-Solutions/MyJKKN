// =====================================================================
// Accreditation ownership changes — the cron that actually tells people
// =====================================================================
// Assignment IS ownership (Director, 2026-09-08). There is no Accept step.
// When ownership of a metric or a body moves, four people have a reason to
// know: the new owner, the previous owner, the body owner above that metric,
// and the IQAC officer for that college. Who exactly gets a message, and what
// it says, is decided in lib/services/accreditation/ownership-notify.ts — a
// pure function with no database in it. This route only reads, calls it, and
// sends. It holds no rules of its own, deliberately: rules that live in a
// route are rules nobody can test.
//
// THE TRAIL TABLE MAY NOT EXIST YET
// public.accreditation_ownership_events is built by a sibling lane. Until that
// migration is applied, PostgREST answers 42P01 / PGRST205. This route treats
// that as "no events yet" and says so in its response, rather than throwing a
// 500 every night into cron-failure-alerts. A route that fails loudly for a
// reason nobody can act on trains people to ignore it.
//
// WHICH EVENTS: everything created since `?since=` (ISO) if given, otherwise
// the last LOOKBACK_DAYS. There is no cursor table and no last_run_at column —
// see idempotency below. A generous window costs nothing and a narrow one can
// silently skip telling somebody, which is the exact failure this route exists
// to end.
//
// DOUBLE-SEND PROTECTION is the idempotency key, not a timestamp column. The
// key is (event id + recipient), so re-running over an overlapping window
// re-derives the same keys and fanoutNotification skips every one of them.
// `skipped: 'idempotent'` is the healthy steady state, not a failure.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` (Vercel cron sends it
// automatically) OR `?secret=` for manual runs — identical to its siblings
// accreditation-owner-invitations and accreditation-owner-digest.
// `?dry=1` computes and returns the exact messages and recipients WITHOUT
// sending, so the wording can be read before it reaches a person.
// Does not call Claude.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import {
  planOwnershipNotifications,
  type NotifyContext,
  type OwnerRow,
  type OwnershipEvent,
} from '@/lib/services/accreditation/ownership-notify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * PostgREST caps an unbounded select at 1000 rows and says nothing about it.
 * Every multi-row read here is paged — the same discipline as the sibling
 * crons, for the same reason: a truncated read would silently leave somebody
 * untold about a change that affects their work.
 */
const PAGE = 1000;
const MAX_PAGES = 100;

/** How far back to look when `?since=` is not supplied. */
const LOOKBACK_DAYS = 14;

type Queryable = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string; code?: string } | null }>;
};

/** PostgREST's answers when a relation does not exist in the schema cache. */
function isMissingRelation(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const m = (error.message ?? '').toLowerCase();
  return m.includes('does not exist') || m.includes('could not find the table');
}

async function fetchAllPages<T>(build: () => Queryable, label: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
  throw new Error(`${label}: exceeded ${MAX_PAGES} pages; refusing to act on a partial list`);
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface InstitutionRow {
  id: string;
  name: string | null;
}

interface CommitteeRow {
  id: string;
  institution_id: string | null;
  created_at: string | null;
}

interface CommitteeMemberRow {
  committee_id: string;
  user_id: string | null;
  role: string | null;
  joined_at: string | null;
}

/**
 * The IQAC officer for a college is the active `coordinator` on that college's
 * active main NAAC committee — the same resolution
 * fn_get_college_leadership uses for the "IQAC Coordinator" post on
 * /organizations/leadership, so the person told here is the person that screen
 * names. Reading the tables directly rather than the RPC keeps this callable
 * with the service-role client and independent of a migration that is still
 * file-only.
 *
 * A college with no recorded coordinator resolves to nobody. That is reported
 * in the response as `institutions_without_iqac_officer` — silence about a
 * missing recipient is how the original problem happened.
 */
async function loadIqacOfficers(
  supabase: ReturnType<typeof createServiceRoleClient>,
  institutionIds: string[],
): Promise<Record<string, string>> {
  if (institutionIds.length === 0) return {};

  const committees = await fetchAllPages<CommitteeRow>(
    () =>
      (supabase as any)
        .from('accreditation_committees')
        .select('id, institution_id, created_at')
        .in('institution_id', institutionIds)
        .eq('body_code', 'NAAC')
        .eq('committee_type', 'main')
        .eq('is_active', true)
        .order('created_at', { ascending: true }),
    'iqac committees read',
  );
  if (committees.length === 0) return {};

  // Earliest active main committee per college, matching the RPC's
  // ORDER BY created_at LIMIT 1.
  const committeeByInstitution = new Map<string, string>();
  for (const c of committees) {
    if (!c.institution_id) continue;
    if (!committeeByInstitution.has(c.institution_id)) {
      committeeByInstitution.set(c.institution_id, c.id);
    }
  }

  const members = await fetchAllPages<CommitteeMemberRow>(
    () =>
      (supabase as any)
        .from('accreditation_committee_members')
        .select('committee_id, user_id, role, joined_at')
        .in('committee_id', [...committeeByInstitution.values()])
        .eq('role', 'coordinator')
        .eq('is_active', true)
        .order('joined_at', { ascending: false, nullsFirst: false }),
    'iqac coordinators read',
  );

  const coordinatorByCommittee = new Map<string, string>();
  for (const m of members) {
    if (!m.user_id) continue;
    if (!coordinatorByCommittee.has(m.committee_id)) {
      coordinatorByCommittee.set(m.committee_id, m.user_id);
    }
  }

  const out: Record<string, string> = {};
  for (const [institutionId, committeeId] of committeeByInstitution) {
    const coordinator = coordinatorByCommittee.get(committeeId);
    if (coordinator) out[institutionId] = coordinator;
  }
  return out;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get('dry') === '1';
  const sinceParam = request.nextUrl.searchParams.get('since');
  const parsedSince = sinceParam ? new Date(sinceParam) : null;
  if (parsedSince && Number.isNaN(parsedSince.getTime())) {
    return NextResponse.json(
      { ok: false, error: '`since` must be an ISO date-time, e.g. 2026-09-01T00:00:00Z' },
      { status: 400 },
    );
  }
  const since =
    parsedSince ?? new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const supabase = createServiceRoleClient();

  try {
    // ---- Events -----------------------------------------------------------
    // Probed with a bounded read first so a missing table is distinguishable
    // from a broken one before any paging begins.
    const probe = await (supabase as any)
      .from('accreditation_ownership_events')
      .select('id')
      .limit(1);
    if (probe.error && isMissingRelation(probe.error)) {
      return NextResponse.json({
        ok: true,
        dry_run: dryRun,
        trail_table_present: false,
        events: 0,
        planned: 0,
        sent: 0,
        note: 'public.accreditation_ownership_events does not exist yet. Its migration belongs to a sibling lane; this route is a no-op until it is applied, and reports that rather than failing.',
      });
    }
    if (probe.error) {
      throw new Error(`ownership events probe: ${probe.error.message}`);
    }

    const events = await fetchAllPages<OwnershipEvent>(
      () =>
        (supabase as any)
          .from('accreditation_ownership_events')
          .select(
            'id, owner_row_id, institution_id, body_code, metric_code, action, from_user_id, to_user_id, actor_user_id, actor_is_body_owner, note, created_at',
          )
          .gte('created_at', since.toISOString())
          .order('created_at', { ascending: true })
          .order('id', { ascending: true }),
      'ownership events read',
    );

    if (events.length === 0) {
      return NextResponse.json({
        ok: true,
        dry_run: dryRun,
        trail_table_present: true,
        since: since.toISOString(),
        events: 0,
        planned: 0,
        sent: 0,
        note: 'No ownership changes in the window. Nobody is waiting to be told.',
      });
    }

    // ---- Context the pure function needs ----------------------------------
    const ownerRows = await fetchAllPages<OwnerRow>(
      () =>
        (supabase as any)
          .from('accreditation_metric_owners')
          .select('id, owner_user_id, institution_id, body_code, metric_code')
          .order('id', { ascending: true }),
      'current owners read',
    );

    const institutionIds = [
      ...new Set(events.map((e) => e.institution_id).filter(Boolean)),
    ] as string[];

    const institutions = institutionIds.length
      ? await fetchAllPages<InstitutionRow>(
          () =>
            (supabase as any)
              .from('institutions')
              .select('id, name')
              .in('id', institutionIds)
              .order('id', { ascending: true }),
          'institutions read',
        )
      : [];
    const institutionNames: Record<string, string> = {};
    for (const i of institutions) institutionNames[i.id] = i.name ?? 'your college';

    const iqacOfficerByInstitution = await loadIqacOfficers(supabase, institutionIds);
    const institutionsWithoutIqac = institutionIds.filter((id) => !iqacOfficerByInstitution[id]);

    // Every person who could be named in, or receive, a message.
    const peopleIds = [
      ...new Set(
        [
          ...events.flatMap((e) => [e.from_user_id, e.to_user_id, e.actor_user_id]),
          ...ownerRows.map((r) => r.owner_user_id),
          ...Object.values(iqacOfficerByInstitution),
        ].filter(Boolean) as string[],
      ),
    ];

    const profiles = peopleIds.length
      ? await fetchAllPages<ProfileRow>(
          () =>
            (supabase as any)
              .from('profiles')
              .select('id, full_name, email')
              .in('id', peopleIds)
              .order('id', { ascending: true }),
          'profiles read',
        )
      : [];
    const personNames: Record<string, string> = {};
    for (const p of profiles) {
      personNames[p.id] = p.full_name?.trim() || p.email || 'Somebody';
    }

    const ctx: NotifyContext = {
      ownerRows,
      institutionNames,
      personNames,
      iqacOfficerByInstitution,
    };

    const planned = planOwnershipNotifications(events, ctx);

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        trail_table_present: true,
        since: since.toISOString(),
        events: events.length,
        planned: planned.length,
        sent: 0,
        institutions_without_iqac_officer: institutionsWithoutIqac,
        messages: planned.map((p) => ({
          user_id: p.userId,
          reason: p.reason,
          event_id: p.eventId,
          title: p.title,
          body: p.body,
          url: p.url,
          idempotency_key: p.idempotencyKey,
        })),
        note: 'Dry run — nothing was sent. Remove ?dry=1 to send.',
      });
    }

    // created_by is NOT NULL on notifications. Cron-generated alerts use the
    // first super admin, mirroring the sibling accreditation crons.
    const { data: adminRow } = await (supabase as any)
      .from('profiles')
      .select('id')
      .eq('is_super_admin', true)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();
    const createdBy = (adminRow?.id as string | undefined) ?? undefined;

    const sent: Record<string, unknown>[] = [];
    const skipped: Record<string, unknown>[] = [];
    const failed: Record<string, unknown>[] = [];

    // One person's failure must not silence the rest. A throw partway through
    // would otherwise abandon every later recipient AND lose the record of who
    // had already been reached, which makes a re-run un-decidable.
    for (const message of planned) {
      try {
        const result = await fanoutNotification(supabase as any, {
          title: message.title,
          body: message.body,
          userIds: [message.userId],
          createdBy,
          category: 'accreditation',
          kind: 'work_item',
          priority: message.reason === 'new_owner' ? 'high' : 'normal',
          url: message.url,
          idempotencyKey: message.idempotencyKey,
          source: 'accreditation-ownership-notify-cron',
          metadata: {
            event_id: message.eventId,
            reason: message.reason,
          },
        });

        const record = {
          user_id: message.userId,
          reason: message.reason,
          event_id: message.eventId,
          notified: result.notified,
          skipped: result.skipped ?? null,
          notification_id: result.notificationId ?? null,
        };
        if (!result.skipped && result.notified > 0) sent.push(record);
        else skipped.push(record);
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        console.error(
          '[accred-ownership-notify] send failed for',
          message.userId,
          message.eventId,
          detail,
        );
        failed.push({
          user_id: message.userId,
          reason: message.reason,
          event_id: message.eventId,
          error: detail,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: false,
      trail_table_present: true,
      since: since.toISOString(),
      events: events.length,
      planned: planned.length,
      sent: sent.length,
      already_sent: skipped.length,
      failed: failed.length,
      institutions_without_iqac_officer: institutionsWithoutIqac,
      sent_detail: sent,
      skipped_detail: skipped,
      failures: failed,
      // ok stays true on a partial send: the reachable people WERE reached and
      // pretending otherwise would hide that. `failed` is the field to watch —
      // non-zero means those people are still untold, and idempotency makes a
      // re-run safe.
      note: failed.length
        ? `${failed.length} message(s) failed and those people were NOT told. Re-running is safe: everyone already told is skipped by idempotency key.`
        : 'Anyone already told about a given change is skipped by idempotency key, not re-sent.',
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[accred-ownership-notify] failed:', detail);
    return NextResponse.json({ ok: false, error: detail }, { status: 500 });
  }
}
