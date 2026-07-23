export const dynamic = 'force-dynamic';

/**
 * POST /api/social/instagram/dm/conversations/:id/reply
 *
 * Sends an outbound DM. Enforces the 24-hour messaging window via sendDM()
 * which reads ig_dm_conversations.last_inbound_at. On window violation
 * returns 422 with a typed error so the inbox UI can render a clear
 * "Window expired — wait for the user to reply" message instead of a
 * generic "Send failed."
 *
 * Body:
 *   text: string
 *
 * Auth: super_admin OR a profile in the conversation's institution.
 *
 * Honors `ig.dm.is_enabled` — when off, returns 503.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { sendDM, IgDmOutsideWindowError } from '@/lib/instagram/dm-client';

export async function POST(
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

    const body = (await request.json().catch(() => ({}))) as { text?: string };
    const text = body.text?.trim();
    if (!text) {
      return NextResponse.json(
        { success: false, error: 'text is required (non-empty)' },
        { status: 400 }
      );
    }

    // Resolve conversation + account (need ig_user_id of OUR account for endpoint)
    const { data: conv } = await supabase
      .from('ig_dm_conversations')
      .select('id, institution_id, ig_account_id, ig_user_id, last_inbound_at')
      .eq('id', conversationId)
      .single();
    if (!conv) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 });
    }

    const { data: account } = await supabase
      .from('ig_accounts')
      .select('id, ig_user_id, institution_id')
      .eq('id', conv.ig_account_id)
      .single();
    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    // Auth gate
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();
    const isSuperAdmin = profile?.role === 'super_admin';
    const isInstitutionUser =
      profile?.institution_id === conv.institution_id;
    if (!isSuperAdmin && !isInstitutionUser) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // Policy gate
    const { data: isEnabledRaw } = await supabase.rpc('fn_get_policy', {
      p_key: 'ig.dm.is_enabled',
      p_scope_id: null,
    });
    if (isEnabledRaw === false) {
      return NextResponse.json(
        { success: false, error: 'Instagram DM is disabled (ig.dm.is_enabled=false)' },
        { status: 503 }
      );
    }

    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'INSTAGRAM_ACCESS_TOKEN not configured' },
        { status: 503 }
      );
    }

    // Send via Graph (24h window enforced in sendDM)
    let sent: { recipient_id: string; message_id: string };
    try {
      sent = await sendDM(
        {
          igAccountId: account.ig_user_id,
          recipientIgUserId: conv.ig_user_id,
          text,
          lastInboundAt: conv.last_inbound_at,
          conversationId: conv.id,
        },
        { accessToken }
      );
    } catch (sendErr) {
      if (sendErr instanceof IgDmOutsideWindowError) {
        return NextResponse.json(
          {
            success: false,
            error: 'outside_messaging_window',
            message: sendErr.message,
            details: {
              last_inbound_at: sendErr.lastInboundAt,
              hours_elapsed: sendErr.windowHoursElapsed,
              window_hours: 24,
            },
          },
          { status: 422 }
        );
      }
      throw sendErr;
    }

    // Persist outbound row (service-role so we bypass RLS write-policies — none defined for writes)
    const service = createServiceRoleClient();
    await service
      .from('ig_dm_messages')
      .insert({
        conversation_id: conv.id,
        direction: 'out',
        text,
        media: null,
        mid: sent.message_id,
        sent_at: new Date().toISOString(),
      });

    await service
      .from('ig_dm_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conv.id);

    return NextResponse.json({
      success: true,
      data: {
        message_id: sent.message_id,
        recipient_id: sent.recipient_id,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Reply failed' },
      { status: 500 }
    );
  }
}
