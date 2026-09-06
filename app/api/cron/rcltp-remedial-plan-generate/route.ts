// =====================================================================
// RCLTP remedial-plan draft loop — Slice 2: generation handler (cron)
// =====================================================================
// COLLECT (default / ?mode=collect): drain done `rcltp.remedial_plan_draft`
//   jobs off the ₹0 Max lane, parse each plan, and write status='draft' via
//   fn_rcltp_remedial_plan_ai_draft_upsert (the SAME row the direct path writes).
//   Enqueue is UI-triggered (POST /api/rcltp/remedial-plans/enqueue) — a Senior
//   Learner clicks "Draft remedial plan"; this cron records the result later.
//
// GENERATE_NOW (?mode=generate_now&learnerId=X): generate ONE plan synchronously
//   via a direct Anthropic call and record it immediately. For an operator/admin
//   "generate now" and for deterministic proof when the async Max seat is idle.
//   Paid call (not the ₹0 lane) — secret-gated, never a learner-facing path.
//
// HARD INVARIANT: nothing here ever writes status='approved'. AI is the author;
// a Senior Learner must call fn_rcltp_remedial_plan_approve (Slice 3) — the ONLY
// path to approved. English only (Nattraja CBSE).
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`.
// Created: 2026-07-23 (Slice 2 of the RCLTP remedial-plan loop).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { collectJobsLane } from '@/lib/services/platform/ai-jobs-lane';
import {
  REMEDIAL_PLAN_JOB_TYPE,
  parsePlanMessage,
  recordDraft,
  generateDraftDirect,
  type DraftSnapshot,
} from '@/lib/services/rcltp/remedial-plan-service';

const DEFAULT_CAP = 25;

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
  const mode = request.nextUrl.searchParams.get('mode');

  // ── GENERATE_NOW — synchronous direct generation for one learner ──────────
  if (mode === 'generate_now') {
    const learnerId = request.nextUrl.searchParams.get('learnerId');
    if (!learnerId) {
      return NextResponse.json(
        { ok: false, error: 'learnerId is required for generate_now' },
        { status: 400 },
      );
    }
    const r = await generateDraftDirect(admin, learnerId);
    return NextResponse.json(
      { ok: r.ok, mode: 'generate_now', ...r, elapsed_ms: Date.now() - started },
      { status: r.ok ? 200 : 422 },
    );
  }

  // ── COLLECT (default) — drain done Max-lane jobs → write drafts ───────────
  let collected = 0;
  let recorded = 0;
  let skipped = 0;
  let failed = 0;
  try {
    const items = await collectJobsLane(admin, [REMEDIAL_PLAN_JOB_TYPE], DEFAULT_CAP);
    for (const item of items) {
      collected++;
      const snap = item.context as unknown as DraftSnapshot;
      if (!snap?.learnerId || !snap?.assessmentId || snap?.cycleNo == null) {
        console.error('[cron/rcltp-remedial-plan-generate] job missing _ctx snapshot — skipping');
        skipped++;
        continue;
      }
      const plan = parsePlanMessage(item.message);
      if (!plan) {
        skipped++;
        continue;
      }
      const rec = await recordDraft(admin, snap, plan, `maxlane:${REMEDIAL_PLAN_JOB_TYPE}`);
      if (rec.ok) {
        recorded++;
      } else {
        failed++;
        console.error('[cron/rcltp-remedial-plan-generate] draft record failed:', rec.error);
      }
    }
  } catch (e) {
    console.error('[cron/rcltp-remedial-plan-generate] collect failed:', e);
  }

  return NextResponse.json({
    ok: true,
    mode: 'collect',
    collected,
    recorded,
    skipped,
    failed,
    elapsed_ms: Date.now() - started,
  });
}
