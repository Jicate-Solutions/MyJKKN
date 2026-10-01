export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/notifications/answer   { notification_id, answer }
 *
 * A recipient's pick on a "must answer" announcement (Director ruling 1,
 * 2026-09-16). The SECURITY DEFINER RPC checks that the caller received the
 * notification, that it requires an answer, and that the pick is one of its
 * options; it also stamps the acknowledgment so compliance counts it.
 */
export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const notificationId = typeof body?.notification_id === 'string' ? body.notification_id : null;
    const answer = typeof body?.answer === 'string' ? body.answer.trim() : '';
    if (!notificationId || !answer) {
      return NextResponse.json(
        { error: 'notification_id and answer are required' },
        { status: 400 }
      );
    }

    const { data, error } = await (supabase as any).rpc('fn_notification_answer', {
      p_notification_id: notificationId,
      p_answer: answer
    });
    if (error) {
      console.error('[notifications/answer] rpc error:', error);
      return NextResponse.json({ error: 'Failed to record your answer' }, { status: 500 });
    }
    if (!data?.success) {
      return NextResponse.json({ error: data?.error ?? 'answer failed' }, { status: 400 });
    }
    return NextResponse.json(
      { ok: true, answer: data.answer },
      { headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } }
    );
  } catch (error) {
    console.error('[notifications/answer] unexpected:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
