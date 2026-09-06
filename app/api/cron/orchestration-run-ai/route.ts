// app/api/cron/orchestration-run-ai/route.ts
//
// GET /api/cron/orchestration-run-ai?moduleKey=<key>
//
// Manual/debug entry point for the orchestration "Run AI" routine — the real
// per-module logic lives in ./_lib/run-module-check.ts, and the console's
// Run AI button actually fires one of the per-module sibling routes
// (./campus-living/route.ts, ./referral/route.ts, ...), never this one.
//
// Why two shapes of the same thing: app/api/admin/orchestration/run/route.ts
// (owned by another agent, not edited here) resolves a routine from
// lib/ai-routines/registry.ts and does a bare `fetch(origin + triggerPath)` —
// no query string, no body. So each registered routine's triggerPath has to
// fully identify its module on its own, which only a distinct path segment
// can do (a `?moduleKey=` here would make the registry's own cron-wiring
// test fail — see ./_lib/run-module-check.ts's header for the full reasoning).
// This bare route exists only so `?moduleKey=` still works for a human
// operator hand-curling the routine, and so this literal path — the one
// named in this PR's brief — resolves to something real rather than a 404.
//
// Auth: Authorization: Bearer <CRON_SECRET> only — see the shared handler.

import { NextRequest, NextResponse } from 'next/server';
import { runOrchestrationModuleCheck } from './_lib/run-module-check';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 90;

export async function GET(request: NextRequest) {
  const moduleKey = request.nextUrl.searchParams.get('moduleKey')?.trim();
  if (!moduleKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'moduleKey is required, e.g. ?moduleKey=campus-living. The Orchestration Console itself fires ' +
          'the per-module route directly (e.g. /api/cron/orchestration-run-ai/campus-living) — this bare ' +
          'path is for manual testing only.',
      },
      { status: 400 },
    );
  }
  return runOrchestrationModuleCheck(request, moduleKey);
}
