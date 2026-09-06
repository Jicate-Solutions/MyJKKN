export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * POST /api/bug-reports/feedback/[id]
 *
 * The reporter acting on their own "is this fixed for you?" prompt.
 * Runs under the reporter's OWN session; the SECDEF RPCs verify
 * reporter_user_id = auth.uid() internally.
 *
 *   { action: 'ack' }                     — at-least-once delivery ack: the
 *                                           client calls this when the prompt
 *                                           RENDERS. Never marks answered.
 *   { action: 'answer', answer: 'fixed' | 'not_fixed' }
 *                                         — the 👍/👎 GROUND TRUTH. Written
 *                                           only by the reporter; re-answer
 *                                           within the window is allowed.
 */
export async function POST(
  request: NextRequest,
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

    const body = await request.json().catch(() => ({}));

    if (body?.action === 'ack') {
      const { data, error } = await (supabase as any).rpc('fn_bug_feedback_ack_delivery', {
        p_request_id: requestId
      });
      if (error) throw error;
      return NextResponse.json({ ok: !!data?.success });
    }

    if (body?.action === 'answer') {
      const { data, error } = await (supabase as any).rpc('fn_bug_feedback_answer', {
        p_request_id: requestId,
        p_answer: body?.answer
      });
      if (error) throw error;
      if (!data?.success) {
        return NextResponse.json({ error: data?.error ?? 'answer failed' }, { status: 400 });
      }
      return NextResponse.json({ ok: true, answer: data.answer });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    logger.error('bug-reports/feedback', `Feedback action failed for ${requestId}`, error);
    return NextResponse.json({ error: 'Could not record your answer. Try again.' }, { status: 500 });
  }
}
