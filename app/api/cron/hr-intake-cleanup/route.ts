// =====================================================================
// HR intake helper — close idle uploads and remove their resume copies
// =====================================================================
// A CVViZ upload keeps copies of applicants' resumes in the private
// 'hr-intake' bucket while it is open. A batch normally closes itself once
// every row is settled; one that is abandoned (nobody decides the rest, or a
// row waits on "needs a new job" for ever) would keep those copies with no end
// date. This sweep closes every batch nobody has touched for 30 days (the batch
// AND its rows), removes its resume copies, and clears the paths on its rows.
// Applications already filed into MyJKKN are not touched.
//
// SENDS NOTHING. Idempotent: a closed batch is never picked again, so a manual
// trigger is safe.
//
// Fired daily (03:30 IST) by the AI-routine dispatcher (ai_routine_schedules
// row 'hr-intake-cleanup', seeded by 20270613101319 — day/time editable in
// /admin/ai-routines), NOT a raw vercel.json cron. The numeric 'count' key is
// on the dispatcher's summarize() allowlist.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> ONLY (constant-time).
// Does not call Claude. Created 2026-10-01.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { cleanupIdleBatches } from '@/lib/services/hr/intake/intake-service';

function bearerMatches(authHeader: string | null, secret: string): boolean {
  const presented = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !bearerMatches(request.headers.get('authorization'), cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const summary = await cleanupIdleBatches(createServiceRoleClient());
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'The clean-up did not run.' },
      { status: 500 },
    );
  }
}
