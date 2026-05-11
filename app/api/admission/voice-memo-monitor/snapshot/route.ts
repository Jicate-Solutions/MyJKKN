// app/api/admission/voice-memo-monitor/snapshot/route.ts
// GET — single-shot snapshot for the Voice Memo Monitor admin surface.
//
// Returns the full VoiceMemoMonitorSnapshot envelope:
//   { policy, counters, cron, recent_failures, recent_completions,
//     cost, digest, generated_at }
//
// Auth: any authenticated user. (Caller is the /admission/counselors/voice-memos
// page, which is itself gated to super_admin / admission-global by parent
// layout. We keep this route auth-only — not role-gated — so cron & ops
// scripts can poll it with a session token.)
//
// Created 2026-05-10 (voice-memo-monitor substrate, Phase 1).

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { VoiceMemoMonitorService } from '@/lib/services/admission/voice-memo-monitor-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET() {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 },
      );
    }
    const supabase = createServiceRoleClient();
    const snapshot = await VoiceMemoMonitorService.getSnapshot(supabase);
    return NextResponse.json({ success: true, data: snapshot });
  } catch (err: any) {
    logger.error('voice-memo-monitor', 'Failed to compute snapshot', err);
    return NextResponse.json(
      {
        error: 'SERVER_ERROR',
        message: err?.message ?? 'Failed to compute snapshot',
      },
      { status: 500 },
    );
  }
}
