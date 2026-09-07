// =====================================================================
// Accreditation owner digest — COMPUTES ONLY, SENDS NOTHING
// =====================================================================
// Tells each named accreditation owner what evidence they still owe. Or
// rather: it works out exactly what it would tell them, and then stops.
//
// THIS ROUTE CANNOT SEND. There is no email, SMS or WhatsApp call in this file
// or anywhere beneath it — no Resend, no Exotel, no Meta, no fanoutNotification.
// It reads rows, computes a preview, and returns the preview as JSON. Arming it
// is a separate, explicitly-authorised change that has not been made.
//
// WHY IT SHIPS INERT  (updated 2026-09-07 — the first bullet has changed)
// This platform sends real email to real people. Two things were not true when
// this route was written. One of them still is not.
//   · accreditation_metric_owners had 0 rows. It now has 14, recorded
//     2026-08-13 — every one of them body-level (metric_code IS NULL) and
//     every one of them still 'pending' 25 days later. So there is somebody to
//     address, but nobody who has accepted; shouldSendDigest still refuses all
//     14, correctly. See app/api/cron/accreditation-owner-invitations.
//   · STILL UNMET: the gap counts have never been checked against a person who
//     knows the answer. Verified against production 2026-09-07: the framework
//     catalogue is thin for seven of ten bodies (NAAC 69 active metrics, NIRF
//     17, NBA 9 — but AICTE 1, NCTE 1, and DCI/PCI/INC/QS/UGC 2 each), and
//     quality_evidence_mappings holds rows for only three bodies (NIRF 11,396,
//     NAAC 261, NBA 46; zero for the other seven). The arithmetic over those
//     rows is sound — zero orphaned metric codes across all 11,703 evidence
//     rows — but a PCI owner told "2 metric(s) awaiting evidence" is reading a
//     true statement about this catalogue and a false one about PCI.
//     buildDigestPreview now names the basis out loud rather than leaving the
//     reader to assume the catalogue is complete. That reduces the harm; it
//     does not discharge the condition, which needs a human.
// A digest armed before both are true mails staff a confident, wrong list of
// duties. Nobody reads the second one. The channel is spent, permanently, and
// no later correctness fixes it.
//
// WHAT ARMING WOULD TAKE (deliberately not done here)
//   1. Real owner rows, acknowledged by the people named.
//   2. A human confirming a sample of gap counts against reality.
//   3. A transport call, plus the last_sent_at write that stops double-sends.
// (3) is the only code change. It is last on purpose.
//
// last_sent_at IS NEVER WRITTEN BY THIS ROUTE. The scheduling arithmetic that
// reads it is live and tested, so an armed version inherits working
// double-send protection rather than growing it late; but nothing here claims
// a send that did not happen.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` (Vercel cron sends it
// automatically) OR `?secret=` for manual runs — identical to the sibling
// app/api/cron/accreditation-narrative-reminders. Does not call Claude.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  buildDigestPreview,
  computeOwnerDigest,
  confirmedOwnersWithoutConfig,
  isDigestDue,
  shouldSendDigest,
  type DigestConfigRow,
  type EvidenceRow,
  type FrameworkMetric,
  type OwnerRow,
  type SubmissionRow,
} from '@/lib/services/accreditation/owner-digest';

/**
 * PostgREST caps an unbounded select at 1000 rows and says nothing about it.
 * quality_evidence_mappings is already 11,608 rows: a truncated read would make
 * covered metrics look uncovered and put metrics in the digest that are
 * actually complete. Every multi-row read here is paged.
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
  throw new Error(`${label}: exceeded ${MAX_PAGES} pages; refusing to report partial counts`);
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

  const supabase = createServiceRoleClient();
  const now = new Date();

  try {
    // Read UNFILTERED and before the config check, on purpose. Everything else
    // this route reads is scoped to the institutions and bodies named in the
    // config rows — which means that with no config rows, nothing is read and
    // nobody is reported. An owner who has accepted accountability and is
    // waiting would be invisible rather than pending. The table is small
    // (one row per person per body per institution) and paged like the rest.
    const allOwners = await fetchAllPages<OwnerRow>(
      () =>
        (supabase as any)
          .from('accreditation_metric_owners')
          .select('id, institution_id, body_code, metric_code, programme_id, owner_user_id, assignment_status, created_at')
          .order('id', { ascending: true }),
      'metric owners read (unfiltered)',
    );

    const configs = await fetchAllPages<DigestConfigRow>(
      () =>
        (supabase as any)
          .from('accreditation_digest_config')
          .select('id, user_id, institution_id, body_code, is_enabled, email, frequency, last_sent_at')
          .eq('is_enabled', true)
          .order('id', { ascending: true }),
      'digest config read',
    );

    const unreachable = confirmedOwnersWithoutConfig(allOwners, configs);

    // Nobody has opted in. This is the honest answer today, not a failure:
    // the table is opt-in by construction and has 0 rows.
    if (configs.length === 0) {
      return NextResponse.json({
        ok: true,
        sends_email: false,
        armed: false,
        note: 'Computed only. This route cannot send; no transport is wired to it.',
        enabled_configs: 0,
        due: 0,
        would_send: [],
        skipped: [],
        // Distinguishes "nobody is owed anything" from "somebody is owed
        // something and this route has no way to reach them". Those two look
        // identical in an empty would_send, and only one of them is fine.
        confirmed_owners_without_config: unreachable,
        total_owner_rows: allOwners.length,
        message:
          unreachable.length > 0
            ? `No digests to send — but ${unreachable.length} confirmed owner(s) have no digest config row, so they could not be reached even if this route were armed.`
            : 'No digests to send — no owner has opted in to a digest yet.',
      });
    }

    const institutionIds = [...new Set(configs.map((c) => c.institution_id))];
    const bodyCodes = [...new Set(configs.map((c) => c.body_code))];

    // allOwners is a superset of what the old filtered read returned;
    // resolveMetricOwners filters by institution and body internally, so the
    // digest arithmetic is unchanged by the wider input.
    const owners = allOwners;

    const [metrics, evidence, submissions] = await Promise.all([
      fetchAllPages<FrameworkMetric>(
        () =>
          (supabase as any)
            .from('sh_accreditation_metrics')
            .select('metric_code, metric_type, metric_name, category, is_active')
            .in('metric_type', bodyCodes)
            // Ordered by the primary key, not metric_code: metric_code is only
            // unique per body, and paging over a non-unique sort can repeat or
            // skip rows at a page boundary.
            .order('id', { ascending: true }),
        'framework metrics read',
      ),
      fetchAllPages<EvidenceRow>(
        () =>
          (supabase as any)
            .from('quality_evidence_mappings')
            .select('institution_id, body_code, metric_code')
            .in('institution_id', institutionIds)
            .in('body_code', bodyCodes)
            .order('id', { ascending: true }),
        'evidence read',
      ),
      fetchAllPages<SubmissionRow>(
        () =>
          (supabase as any)
            .from('accreditation_submissions')
            .select('institution_id, body_code, due_date, status, period_label')
            .in('institution_id', institutionIds)
            .in('body_code', bodyCodes)
            .order('id', { ascending: true }),
        'submissions read',
      ),
    ]);

    const wouldSend: Record<string, unknown>[] = [];
    const skipped: Record<string, unknown>[] = [];
    let dueCount = 0;

    for (const config of configs) {
      const verdict = isDigestDue(config, now);
      if (!verdict.due) {
        skipped.push({ config_id: config.id, user_id: config.user_id, reason: verdict.reason });
        continue;
      }
      dueCount++;

      const digest = computeOwnerDigest({ config, owners, metrics, evidence, submissions, now });
      if (!shouldSendDigest(digest)) {
        skipped.push({
          config_id: config.id,
          user_id: config.user_id,
          reason: 'nothing_outstanding',
          owned_metrics: digest.ownedMetricCount,
          awaiting_acknowledgement: digest.awaitingAcknowledgementCount,
          declined: digest.declinedCount,
        });
        continue;
      }

      wouldSend.push({
        config_id: config.id,
        ...buildDigestPreview(digest),
        owned_metrics: digest.ownedMetricCount,
        metrics_with_evidence: digest.metricsWithEvidenceCount,
        awaiting_acknowledgement: digest.awaitingAcknowledgementCount,
        declined: digest.declinedCount,
        next_deadline: digest.nextDeadline,
      });
    }

    return NextResponse.json({
      ok: true,
      sends_email: false,
      armed: false,
      note: 'Computed only. This route cannot send; no transport is wired to it. last_sent_at was not written.',
      enabled_configs: configs.length,
      due: dueCount,
      would_send: wouldSend,
      skipped,
      confirmed_owners_without_config: unreachable,
      total_owner_rows: allOwners.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[accred-owner-digest] failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
