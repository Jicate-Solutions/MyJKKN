// =====================================================================
// OneMark AI drafts — ₹0 Max-lane collect pass (cron) + paid inline run
// =====================================================================
// The `onemark.item_draft` job type (Lane S migration) is queued by
// POST /api/foundation/onemark/draft (Lane I). Its prompt runs on the ₹0 Max
// lane; the model text lands in ai_jobs.result. THIS route is what turns
// that text into fp_items DRAFT rows (is_active=false, source_key='internal')
// that queue on /foundation/onemark/review — without it a finished draft job
// sits in the queue forever (Lane S's fixer finding: no runner on main writes
// an fp_items output target).
//
// COLLECT (default / ?mode=collect): claim finished, unfiled draft jobs
//   exactly once, validate every item against the draft contract, insert the
//   survivors, record {inserted, rejected[]} on the job. Same pattern as
//   rcltp-question-generate's collect lane and metaloop-charter-collect.
//
// DRAFT_NOW (?mode=generate_now&jobId=X): run ONE pending job inline through
//   the estate's paid chat client (model from the job type row, spend
//   recorded), complete it on the queue, then collect. Secret-gated; an
//   operator "draft now" and a deterministic proof when the seat is idle.
//   A green run here does NOT prove the seat runner's template rendering.
//
// HARD INVARIANT: nothing here ever writes is_active=true. AI drafts; one
// subject Senior Learner approves on the review queue (decision 7).
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`.
// Created: 2026-09-05 (OneMark Wave 2, Lane J).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { collectItemDrafts, runItemDraftNow } from '@/lib/services/onemark/draft-collect';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const admin = createServiceRoleClient();
  const mode = request.nextUrl.searchParams.get('mode') ?? 'collect';

  if (mode === 'generate_now') {
    const jobId = request.nextUrl.searchParams.get('jobId');
    if (!jobId || !UUID_RE.test(jobId)) {
      return NextResponse.json(
        { ok: false, error: 'jobId (uuid) is required for generate_now' },
        { status: 400 },
      );
    }
    const r = await runItemDraftNow(admin, jobId);
    return NextResponse.json(
      { mode: 'generate_now', ...r, elapsed_ms: Date.now() - started },
      { status: r.ok ? 200 : 422 },
    );
  }

  const summary = await collectItemDrafts(admin);
  return NextResponse.json({
    ok: true,
    mode: 'collect',
    ...summary,
    elapsed_ms: Date.now() - started,
  });
}
