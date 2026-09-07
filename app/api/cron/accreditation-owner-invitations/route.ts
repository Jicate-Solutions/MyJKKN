// =====================================================================
// Accreditation owner invitations — tells a named owner they were named
// =====================================================================
// On 2026-08-13 the Executive Admin Officer recorded 14 accreditation owners.
// Twenty-five days later all 14 were still `pending`: nobody had accepted, and
// nobody had declined. Not reluctance — nobody had told them. In that window
// those same 14 people received ~1,800 other notifications and exactly one
// mentioning accreditation, so the channel that reaches them works. It had
// simply never carried this.
//
// WHY THIS IS A SEPARATE ROUTE FROM THE DIGEST
// The sibling `accreditation-owner-digest` deliberately refuses to mail anyone
// whose assignment is still `pending`, and it is right to:
//
//   "ownership is accepted, not imposed. Mailing somebody a list of duties they
//    have not accepted is the imposition that decision exists to prevent."
//
// That guard, plus a route that cannot send, plus no cron, plus zero rows in
// accreditation_digest_config, compose into a system with no entry point: the
// digest waits for an acceptance that cannot happen, because the only message
// that would make acceptance possible is one the digest is right to refuse.
//
// This route sends the OTHER message. It carries no duty list, no gap counts,
// no deadline — only the fact of the assignment and the two ways to answer it.
// That fact is one we are certain of; the gap counts are not (nobody has yet
// checked them against a person who knows). So nothing here can be confidently
// wrong, which is the standard the digest's own header sets.
//
// Once an owner accepts, `shouldSendDigest` starts returning true for them on
// its own and the digest arms itself with NO further code. This route is the
// key, not a second mailer.
//
// DOUBLE-SEND PROTECTION is the idempotency key, not a timestamp column. The
// key is derived from the person plus the exact set of assignments they are
// being told about, so: re-running this cron mails nobody twice; being given a
// NEW body next month produces a new key and one new invitation; and accepting
// or declining removes the row from the pending set entirely. There is no
// last_sent_at to drift.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` (Vercel cron sends it
// automatically) OR `?secret=` for manual runs — identical to its siblings.
// `?dry=1` computes and returns the invitations WITHOUT sending, so the wording
// and the recipient list can be read before anything reaches a person.
// Does not call Claude.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * PostgREST caps an unbounded select at 1000 rows and says nothing about it.
 * Every multi-row read here is paged — the same discipline as the sibling
 * digest, for the same reason: a truncated read would silently leave a named
 * owner uninvited, which is the exact failure this route exists to end.
 */
const PAGE = 1000;
const MAX_PAGES = 100;

type Queryable = {
  range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};

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
  throw new Error(`${label}: exceeded ${MAX_PAGES} pages; refusing to invite a partial list`);
}

interface PendingOwnerRow {
  id: string;
  owner_user_id: string | null;
  institution_id: string | null;
  body_code: string | null;
  metric_code: string | null;
}

interface InstitutionRow {
  id: string;
  name: string | null;
}

/** One person's whole pending set, collapsed into a single invitation. */
interface Invitation {
  userId: string;
  assignmentIds: string[];
  lines: string[];
  title: string;
  body: string;
  idempotencyKey: string;
}

const MY_GAPS_URL = '/accreditation/my-gaps';

/**
 * A body-level assignment (metric_code IS NULL) covers every metric that body
 * asks of that college — that is the granularity the Director chose on
 * 2026-08-13. Saying so plainly matters: a reader who thinks they owe 107
 * individual answers does nothing, and they would be wrong.
 */
function describeAssignment(bodyCode: string, collegeName: string, metricCode: string | null): string {
  return metricCode
    ? `${bodyCode} · ${metricCode} — ${collegeName}`
    : `${bodyCode} (the whole body) — ${collegeName}`;
}

function buildInvitation(
  userId: string,
  rows: PendingOwnerRow[],
  institutionNames: Map<string, string>,
): Invitation {
  const assignmentIds = rows.map((r) => r.id).sort();
  const lines = rows
    .map((r) =>
      describeAssignment(
        r.body_code ?? 'an awarding body',
        institutionNames.get(r.institution_id ?? '') ?? 'your college',
        r.metric_code,
      ),
    )
    .sort();

  const one = lines.length === 1;
  const title = one
    ? `You have been named the accreditation owner for ${rows[0].body_code ?? 'an awarding body'}`
    : `You have been named the accreditation owner for ${lines.length} awarding bodies`;

  const body = [
    one
      ? 'The IQAC has recorded you as the accreditation owner for:'
      : 'The IQAC has recorded you as the accreditation owner for:',
    ...lines.map((l) => `  • ${l}`),
    '',
    'Being the owner means you are the person we come to for it, and you decide what still needs collecting. It does not mean you have to fill everything in yourself — most of it is already gathered from the records your college keeps day to day.',
    '',
    'Open My Gaps to accept or decline.',
    '',
    'Declining is a genuine option. If this belongs with someone else, decline and say who — that is more useful than an assignment nobody acts on.',
  ].join('\n');

  // Keyed on the person AND the exact assignment set: re-runs send nothing,
  // a new assignment next month sends exactly one new invitation.
  const idempotencyKey = `accred_owner_invite:${userId}:${assignmentIds.join(',')}`;

  return { userId, assignmentIds, lines, title, body, idempotencyKey };
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
  const supabase = createServiceRoleClient();

  try {
    const pending = await fetchAllPages<PendingOwnerRow>(
      () =>
        (supabase as any)
          .from('accreditation_metric_owners')
          .select('id, owner_user_id, institution_id, body_code, metric_code')
          .eq('assignment_status', 'pending')
          .order('id', { ascending: true }),
      'pending owners read',
    );

    const withOwner = pending.filter((r) => r.owner_user_id);
    if (withOwner.length === 0) {
      return NextResponse.json({
        ok: true,
        dry_run: dryRun,
        pending_assignments: 0,
        invited: 0,
        note: 'No pending assignments. Nobody is waiting to be told.',
      });
    }

    const institutionIds = [...new Set(withOwner.map((r) => r.institution_id).filter(Boolean))] as string[];
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
    const institutionNames = new Map(institutions.map((i) => [i.id, i.name ?? 'your college']));

    // One invitation per person, however many bodies they were given.
    const byUser = new Map<string, PendingOwnerRow[]>();
    for (const row of withOwner) {
      const uid = row.owner_user_id as string;
      const list = byUser.get(uid) ?? [];
      list.push(row);
      byUser.set(uid, list);
    }

    const invitations = [...byUser.entries()].map(([uid, rows]) =>
      buildInvitation(uid, rows, institutionNames),
    );

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        sent: 0,
        pending_assignments: withOwner.length,
        would_invite: invitations.length,
        invitations: invitations.map((i) => ({
          user_id: i.userId,
          assignments: i.lines,
          title: i.title,
          body: i.body,
          idempotency_key: i.idempotencyKey,
        })),
        note: 'Dry run — nothing was sent. Remove ?dry=1 to send.',
      });
    }

    // created_by is NOT NULL on notifications. Cron-generated alerts use the
    // first super admin, mirroring lib/instagram/sync-accounts.ts.
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

    for (const invite of invitations) {
      const result = await fanoutNotification(supabase as any, {
        title: invite.title,
        body: invite.body,
        userIds: [invite.userId],
        createdBy,
        category: 'accreditation',
        kind: 'work_item',
        priority: 'high',
        url: MY_GAPS_URL,
        idempotencyKey: invite.idempotencyKey,
        source: 'accreditation-owner-invitations-cron',
        metadata: {
          assignment_ids: invite.assignmentIds,
          assignment_count: invite.assignmentIds.length,
        },
      });

      // fanoutNotification returns { notified, notificationId?, skipped? }.
      // `skipped: 'idempotent'` is the expected steady state once everyone
      // pending has been invited once — it is not a failure.
      const record = {
        user_id: invite.userId,
        assignments: invite.assignmentIds.length,
        notified: result.notified,
        skipped: result.skipped ?? null,
        notification_id: result.notificationId ?? null,
      };
      if (!result.skipped && result.notified > 0) sent.push(record);
      else skipped.push(record);
    }

    return NextResponse.json({
      ok: true,
      dry_run: false,
      pending_assignments: withOwner.length,
      people_pending: invitations.length,
      invited: sent.length,
      already_invited: skipped.length,
      sent,
      skipped,
      note: 'An owner already invited for this exact assignment set is skipped by idempotency key, not re-mailed.',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[accred-owner-invitations] failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
