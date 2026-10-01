export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * POST /api/bug-reports/feedback/[id]/snooze
 *
 * "Ask me later" on the blocking feedback screen (Director ruling 2,
 * 2026-09-16): hides the reporter's own "is this fixed for you?" question
 * for one day, at most three times. The fourth press is refused and the
 * screen stays until answered. Runs under the reporter's session; the
 * SECURITY DEFINER RPC checks reporter_user_id = auth.uid() itself.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id: requestId } = await params;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data, error } = await (supabase as any).rpc('fn_bug_feedback_snooze', {
      p_request_id: requestId
    });
    if (error) throw error;
    if (!data?.success) {
      return NextResponse.json(
        { error: data?.error ?? 'snooze failed', snooze_count: data?.snooze_count ?? null },
        { status: 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      snooze_count: data.snooze_count,
      snoozed_until: data.snoozed_until,
      can_snooze: data.can_snooze
    });
  } catch (error) {
    logger.error('bug-reports/feedback', `Snooze failed for ${requestId}`, error);
    return NextResponse.json({ error: 'Could not snooze this question. Try again.' }, { status: 500 });
  }
}
