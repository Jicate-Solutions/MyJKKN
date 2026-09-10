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
// CORRECTION 2026-09-07 — that standard was not actually met when this merged.
// Two sentences failed it, and both are fixed below:
//   · "most of it is already gathered from the records your college keeps day
//     to day" was FALSE for 6 of the 14 recipients. quality_evidence_mappings
//     holds zero rows for DCI, PCI, INC, QS and AICTE, and 46 rows covering
//     one of NBA's nine metrics. It was the only sentence here that made a
//     claim about the world, and it was wrong for nearly half the readers.
//   · "decline and say who" asked for something the product cannot accept:
//     the Decline control is a bare button and the acknowledge RPC takes no
//     free text. Nowhere on that path can a person say who.
// Neither was replaced by a computed figure — the settled decision that this
// message carries no counts still stands. They were replaced by sentences that
// are true for every recipient regardless of what any college has on file.
//
// Once an owner accepts, `shouldSendDigest` starts returning true for them on
// its own and the digest arms itself with NO further code. This route is the
// key, not a second mailer.
//
// DOUBLE-SEND PROTECTION is the idempotency key, not a timestamp column. The
// key is derived from the person plus the exact set of assignments they are
// being told about, so re-running this cron mails nobody twice. There is no
// last_sent_at to drift.
//
// CHANGE 2026-09-10 — ASSIGNMENT IS OWNERSHIP (Director, 2026-09-08)
// "Assignment is ownership. No accepting. Record who has seen it." The Accept
// buttons are gone, so a row now stays `pending` for good. Two things followed,
// and both would have gone wrong had this route kept mailing every pending row:
//   · The key covered the WHOLE pending set per person. With nothing ever
//     leaving that set, each new assignment would have produced a new key over
//     a longer list, and the person would have been re-sent everything.
//   · It said again what accreditation-ownership-notify already says. That cron
//     tells the new owner about every assignment and reassignment recorded in
//     accreditation_ownership_events (`accred_ownership_change:<event>:<owner>`,
//     every 6 hours, 14-day lookback). All 31 rows the 2026-09-10 run would
//     have announced, to 5 people, had already been announced that way, and 3
//     people had already received both messages.
// So the route now invites only the rows lib/services/accreditation/
// owner-invitation-selection.ts selects: no live (note IS NULL) event hands the
// row to its current owner, and no earlier invitation to that same owner
// listed it. Measured by the session that took the decision, the 2026-09-10 run
// would have sent 0 under this rule. The key format is unchanged and is
// computed over the selected rows only. The message no longer asks anyone to
// accept; Decline still exists, so its sentence stays.
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
import {
  OWNER_INVITE_KEY_PREFIX,
  priorInviteFromNotification,
  selectAssignmentsToInvite,
  type LiveOwnershipEvent,
  type PriorInvite,
} from '@/lib/services/accreditation/owner-invitation-selection';

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

  // Count DISTINCT bodies, not assignment rows. Someone holding NAAC
  // body-wide plus NAAC metric 3.1.1 holds two assignments and one awarding
  // body; the old `lines.length` would have told them "2 awarding bodies".
  // Dormant today — all 14 live assignments are one body-level row per person
  // — and it stops being dormant the first time IQAC assigns a metric-level
  // owner alongside a body-level one, which is exactly what metric_code is for.
  const distinctBodies = [...new Set(rows.map((r) => r.body_code).filter(Boolean))];
  const one = distinctBodies.length === 1;
  const title = one
    ? `You have been named the accreditation owner for ${distinctBodies[0] ?? rows[0].body_code ?? 'an awarding body'}`
    : `You have been named the accreditation owner for ${distinctBodies.length} awarding bodies`;

  const body = [
    // This was a ternary whose two branches were byte-identical, so it never
    // selected anything. Someone meant to write different singular and plural
    // openings and never did. Collapsed rather than left as a decision the
    // code appears to make and does not.
    'The IQAC has recorded you as the accreditation owner for:',
    ...lines.map((l) => `  • ${l}`),
    '',
    // The clause that used to end this sentence — "most of it is already
    // gathered from the records your college keeps day to day" — was removed
    // 2026-09-07. It was the ONLY sentence in the message that made a claim
    // about the world, and it was false for 6 of the 14 people about to
    // receive it: quality_evidence_mappings holds ZERO rows for DCI, PCI, INC,
    // QS and AICTE, and 46 rows covering a single one of NBA's 9 metrics.
    //
    // Telling somebody their evidence is mostly gathered, in the first message
    // they have ever received about a duty recorded 25 days earlier, is the
    // one way to make the message worse than silence: they open My Gaps,
    // find nothing gathered, and learn that this channel does not know what
    // it is talking about. The channel is then spent.
    //
    // It is NOT replaced by a real count. The settled decision is that this
    // invitation carries no duty list and no gap counts, and the counts
    // themselves are still the digest's unmet condition 2 — unchecked by any
    // person who knows. What is left is true for all 14 regardless of what
    // any college has on file.
    'Being the owner means you are the person we come to for it, and you decide what still needs collecting. It does not mean you have to fill everything in yourself.',
    '',
    // Until 2026-09-10 this sentence asked the reader to accept. There is no
    // Accept any more (Director, 2026-09-08): being named is being the owner.
    'Open My Gaps to see what it covers.',
    '',
    // "decline and say who" was removed 2026-09-07: the product gives them
    // nowhere to say it. The Decline control on /accreditation/my-gaps is a
    // bare button calling respond(id, 'declined'), and
    // fn_accreditation_acknowledge_ownership accepts only (p_owner_id,
    // p_decision) and writes only assignment_status, acknowledged_at and
    // acknowledged_by. There is no free-text field anywhere on that path.
    //
    // Asking for something the screen cannot accept teaches the reader that
    // the message was not written by anyone who had looked at the screen —
    // and the reader is right.
    'Declining is a genuine option. If this belongs with someone else, declining is far more useful than an assignment nobody acts on.',
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

    // ---- Which of those still need an invitation --------------------------
    // See the CHANGE 2026-09-10 note in the header and
    // lib/services/accreditation/owner-invitation-selection.ts. The id list is
    // chunked so a long pending set cannot overflow the request URL.
    const ID_CHUNK = 150;
    const pendingIds = withOwner.map((r) => r.id);
    const liveEvents: LiveOwnershipEvent[] = [];
    for (let i = 0; i < pendingIds.length; i += ID_CHUNK) {
      const chunk = pendingIds.slice(i, i + ID_CHUNK);
      liveEvents.push(
        ...(await fetchAllPages<LiveOwnershipEvent>(
          () =>
            (supabase as any)
              .from('accreditation_ownership_events')
              .select('owner_row_id, to_user_id')
              .is('note', null)
              .in('owner_row_id', chunk)
              .order('id', { ascending: true }),
          'ownership events read',
        )),
      );
    }

    const priorNotifications = await fetchAllPages<{
      idempotency_key: string | null;
      targeting: unknown;
      metadata: unknown;
    }>(
      () =>
        (supabase as any)
          .from('notifications')
          .select('idempotency_key, targeting, metadata')
          .like('idempotency_key', `${OWNER_INVITE_KEY_PREFIX}%`)
          .order('id', { ascending: true }),
      'prior invitations read',
    );
    const priorInvites = priorNotifications
      .map(priorInviteFromNotification)
      .filter((p): p is PriorInvite => p !== null);

    const selection = selectAssignmentsToInvite({ pending: withOwner, liveEvents, priorInvites });
    const selected = selection.toInvite;
    const excluded = {
      announced_by_ownership_change: selection.excluded.announcedByChange.length,
      already_invited: selection.excluded.alreadyInvited.length,
    };

    const institutionIds = [...new Set(selected.map((r) => r.institution_id).filter(Boolean))] as string[];
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

    // One invitation per person, however many bodies they were given — built
    // over the SELECTED rows only, so the key names exactly what is announced.
    const byUser = new Map<string, PendingOwnerRow[]>();
    for (const row of selected) {
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
        selected_assignments: selected.length,
        excluded,
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
    const failed: Record<string, unknown>[] = [];

    // One person's failure must not silence the rest.
    //
    // Before this try/catch, a throw inside fanoutNotification on person 7 fell
    // straight through to the outer catch: persons 8-14 were never attempted,
    // and the response was a bare 500 that had already lost `sent` to scope —
    // so the operator could not tell who HAD been mailed before it died. Re-running
    // is safe (the idempotency key skips anyone already invited), but only if you
    // know a re-run is needed, and a bare 500 does not tell you that.
    //
    // Per-person isolation makes a partial send legible: everyone reachable is
    // reached, and the response names exactly who was not and why.
    for (const invite of invitations) {
      try {
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
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('[accred-owner-invitations] invite failed for', invite.userId, message);
        failed.push({
          user_id: invite.userId,
          assignments: invite.assignmentIds.length,
          error: message,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: false,
      pending_assignments: withOwner.length,
      selected_assignments: selected.length,
      excluded,
      people_pending: invitations.length,
      invited: sent.length,
      already_invited: skipped.length,
      failed: failed.length,
      sent,
      skipped,
      failures: failed,
      // ok stays true on a partial send: the reachable people WERE reached, and
      // pretending otherwise would hide that. `failed` is the field to watch —
      // a non-zero value means those people are still uninvited and a re-run is
      // needed, which idempotency makes safe.
      note: failed.length
        ? `${failed.length} invitation(s) failed and those people were NOT told. Re-running is safe: everyone already invited is skipped by idempotency key.`
        : 'An owner already invited for this exact assignment set is skipped by idempotency key, not re-mailed.',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[accred-owner-invitations] failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
