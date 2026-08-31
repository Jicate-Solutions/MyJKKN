// app/api/cron/orchestration-run-ai/academic/route.ts
//
// GET /api/cron/orchestration-run-ai/academic
// One thin wrapper per module — the actual logic lives in
// ../_lib/run-module-check.ts. A dedicated file per module (instead of a
// single ?moduleKey= route) exists because the console's run route
// (app/api/admin/orchestration/run/route.ts) fires this with a bare GET —
// no query string, no body — so the module key has to be baked into the
// path itself. See the shared handler's header comment for the full story,
// including why a query string would silently fail the registry's own
// cron-wiring test.
//
// Registered in lib/ai-routines/registry.ts as
// "orchestration-run-ai-academic" (type: 'cron', safeToManualTrigger: true).
// Auth: Authorization: Bearer <CRON_SECRET> only — see the shared handler.

import { NextRequest } from 'next/server';
import { runOrchestrationModuleCheck } from '../_lib/run-module-check';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 90;

export async function GET(request: NextRequest) {
  return runOrchestrationModuleCheck(request, 'academic');
}
