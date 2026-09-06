export const dynamic = 'force-dynamic';

/**
 * GET /api/social/instagram/dm/conversations/:id/messages
 *
 * Lists messages for one DM conversation, newest first. Reads ig_dm_messages
 * locally — does not call Graph. Use this for inbox render; the messages are
 * kept fresh by the /api/webhooks/meta/instagram-messaging webhook.
 *
 * Query params:
 *   limit?: number  — default 100, max 500
 *   offset?: number — default 0
 *
 * Auth: super_admin OR profile in the conversation's institution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { canSendDm } from '@/lib/instagram/dm-client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();

  try {
    const { id: conversationId } = await params;

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const sp = new URL(request.url).searchParams;
    const limit = Math.min(Number(sp.get('limit') ?? 100), 500);
    const offset = Number(sp.get('offset') ?? 0);

    // Resolve conversation + auth
    const { data: conv } = await supabase
      .from('ig_dm_conversations')
      .select('id, institution_id, ig_account_id, ig_user_id, lead_id, last_inbound_at')
      .eq('id', conversationId)
      .single();
    if (!conv) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();
    const isSuperAdmin = profile?.role === 'super_admin';
    if (!isSuperAdmin && profile?.institution_id !== conv.institution_id) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const { data: messages, count, error } = await supabase
      .from('ig_dm_messages')
      .select('id, conversation_id, direction, text, media, mid, sent_at, created_at', { count: 'exact' })
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) {
      return NextResponse.json(
        { success: false, error: `Query failed: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        conversation: conv,
        messages: messages ?? [],
        count: count ?? 0,
        limit,
        offset,
        canReply: canSendDm(conv.last_inbound_at),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
