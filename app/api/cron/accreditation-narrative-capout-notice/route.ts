// =====================================================================
// Accreditation — "the AI gave up on this narrative" notice
// =====================================================================
// Companion to app/api/cron/accreditation-naac-narrative-draft. That route
// re-drafts an ungrounded narrative until it reaches the policy cap
// accreditation.narrative_max_draft_attempts, and then stops offering the pair
// — SILENTLY. Nobody is told, nothing is flagged, and the blocked draft sits in
// the work-list looking like one that is merely waiting its turn. This route
// closes that gap: once per capped-out narrative, forever, it tells the person
// responsible.
//
// MECHANISM (all three guards documented in
// supabase/migrations/20260730013000_accreditation_narrative_capout_notice.sql)
//   1. fn_accreditation_narrative_capout_pending — read-only detector. Returns
//      capped-out, not-yet-notified narratives with recipients already
//      resolved: the metric owner, else the IQAC/admin queue at that
//      institution, else every super admin. Nothing is ever orphaned — today
//      only 11 of 80 narratives have an owner, and one institution
//      (Nattraja Vidhyalya CBSE) has no local admin account at all.
//   2. fanoutNotification's idempotencyKey — notifications has a UNIQUE partial
//      index on it, so a duplicate bell item is impossible even if this route
//      crashes after sending but before claiming.
//   3. fn_accreditation_narrative_mark_capout_notified — the atomic claim
//      (UPDATE ... WHERE capout_notified_at IS NULL). Only the caller that set
//      it gets true, so two concurrent runs cannot both notify.
//
// WHAT IT NEVER DOES
//   No AI call. It does not relax the grounding gate, does not advance,
//   approve, edit or re-draft anything, does not touch attempt counting, and
//   does not change which pairs the drafter picks up. It only reads and sends.
//
// TODAY IT IS CORRECTLY QUIET: every live narrative sits at attempt_count 0
// against a cap of 5, so the detector returns zero rows. It starts speaking
// the first night a draft actually exhausts its budget. Verify what it WOULD
// send at any time with ?dry=1 — that path sends nothing and claims nothing.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> ONLY (constant-time),
// identical to the drafter route. Vercel Cron supplies the header.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import {
  buildCapoutNotice,
  type CapoutNarrativeRow,
} from '@/lib/services/accreditation/narrative-capout-notice';

const BODY_CODE = 'NAAC';
const BATCH = 50;
const NOTICE_CATEGORY = 'accreditation';
const SOURCE = 'accreditation-narrative-capout-cron';

function bearerMatches(authHeader: string | null, secret: string): boolean {
  const presented = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || !bearerMatches(authHeader, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get('dry') === '1';
  const admin = createServiceRoleClient();
  const summary = { pending: 0, notified: 0, already_sent: 0, no_recipients: 0, errors: 0 };

  const { data, error } = await admin.rpc('fn_accreditation_narrative_capout_pending', {
    p_body_code: BODY_CODE,
    p_limit: BATCH,
  });
  if (error) {
    console.error('[accred-capout] detector failed:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as CapoutNarrativeRow[];
  summary.pending = rows.length;

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      ...summary,
      would_send: rows.map((row) => ({
        narrative_id: row.narrative_id,
        recipient_kind: row.recipient_kind,
        recipients: (row.recipient_ids ?? []).length,
        ...buildCapoutNotice(row),
      })),
    });
  }

  for (const row of rows) {
    try {
      const recipients = (row.recipient_ids ?? []).filter(Boolean);
      if (recipients.length === 0) {
        // The detector's platform-admin tier makes this unreachable in practice.
        // If it ever happens, log loudly and leave the row UNCLAIMED so the next
        // run retries — swallowing it would recreate the silence we are fixing.
        summary.no_recipients++;
        console.error('[accred-capout] no recipient resolved for narrative', row.narrative_id);
        continue;
      }

      const notice = buildCapoutNotice(row);
      const outcome = await fanoutNotification(admin, {
        title: notice.title,
        body: notice.body,
        url: notice.url,
        userIds: recipients,
        // A cron-emitted item a person must act on — 'work_item' keeps it out of
        // the /notifications/admin announcement surface.
        kind: 'work_item',
        priority: 'high',
        category: NOTICE_CATEGORY,
        idempotencyKey: notice.idempotencyKey,
        metadata: notice.metadata,
        source: SOURCE,
      });

      // The row may ONLY be claimed once a notice provably exists — either this
      // call created one, or 'idempotent' proves an earlier call did. Claiming
      // on any other outcome would mark the narrative "told" while nobody was
      // told, which is precisely the silence this route exists to end.
      const delivered = outcome.skipped === 'idempotent' || outcome.notified > 0;
      if (!delivered) {
        summary.errors++;
        console.error(
          '[accred-capout] fanout delivered nothing, leaving unclaimed for retry:',
          row.narrative_id,
          outcome.skipped ?? 'no notification row returned',
        );
        continue;
      }

      if (outcome.skipped === 'idempotent') summary.already_sent++;
      else summary.notified++;

      // Claim AFTER the send, and claim on the idempotent path too — that path
      // means the notice already exists, so the row must stop being offered.
      const { error: claimErr } = await admin.rpc(
        'fn_accreditation_narrative_mark_capout_notified',
        { p_narrative_id: row.narrative_id },
      );
      if (claimErr) {
        // The notice went out; only the claim failed. The idempotency key means
        // the next run re-sends nothing and simply re-tries the claim.
        summary.errors++;
        console.error('[accred-capout] claim failed:', row.narrative_id, claimErr.message);
      }
    } catch (e) {
      summary.errors++;
      console.error('[accred-capout] item failed:', e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({ ok: true, body_code: BODY_CODE, ...summary });
}
