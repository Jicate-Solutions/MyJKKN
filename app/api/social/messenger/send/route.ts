export const dynamic = 'force-dynamic';

/**
 * POST /api/social/messenger/send
 *
 * Send a Messenger reply from `page_id` to `psid`. Persists the outbound row
 * in messenger_messages and updates `last_outbound_at` on the conversation.
 *
 * Body:
 *   { page_id: string, psid: string, text: string, tag?: MessengerMessageTag }
 *
 * Auth: super_admin OR institution_admin whose institution owns the
 *       conversation (page_id + psid).
 *
 * Killswitch: when platform_policies.meta.messenger.is_enabled is false,
 *             returns 503.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import { sendText, MessengerWindowError } from '@/lib/messenger/api-client';
import type { MessengerMessageTag } from '@/lib/messenger/types';

interface SendBody {
  page_id?: string;
  psid?: string;
  text?: string;
  tag?: MessengerMessageTag;
}

export async function POST(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as SendBody;
    const pageId = body.page_id?.trim();
    const psid = body.psid?.trim();
    const text = body.text?.trim();
    const tag = body.tag;

    if (!pageId || !psid || !text) {
      return NextResponse.json(
        { success: false, error: 'page_id, psid, and text are required' },
        { status: 400 }
      );
    }

    const service = createServiceRoleClient();

    // 1) Killswitch
    const { data: policy } = await service
      .from('platform_policies')
      .select('value')
      .eq('policy_key', 'meta.messenger.is_enabled')
      .eq('scope_type', 'global')
      .is('scope_id', null)
      .maybeSingle();
    if (policy?.value !== true) {
      return NextResponse.json(
        { success: false, error: 'Messenger module disabled by policy' },
        { status: 503 }
      );
    }

    // 2) Resolve conversation + verify caller is scoped to its institution
    const { data: conversation, error: convErr } = await service
      .from('messenger_conversations')
      .select('id, institution_id, last_inbound_at')
      .eq('page_id', pageId)
      .eq('psid', psid)
      .maybeSingle();
    if (convErr) throw convErr;
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    const { data: profile, error: profileErr } = await service
      .from('profiles')
      .select('institution_id, is_super_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (profileErr) throw profileErr;

    const isSuperAdmin = profile?.is_super_admin === true;
    if (!isSuperAdmin && profile?.institution_id !== conversation.institution_id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden — institution scope mismatch' },
        { status: 403 }
      );
    }

    // 3) Pick access token from env. Production secret lives in Vercel.
    const accessToken =
      process.env.MESSENGER_PAGE_ACCESS_TOKEN ||
      process.env.META_PAGE_ACCESS_TOKEN ||
      process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'MESSENGER_PAGE_ACCESS_TOKEN missing on server',
        },
        { status: 500 }
      );
    }

    // 4) Send via Graph API (24h window enforced inside sendText)
    let sendResult;
    try {
      sendResult = await sendText(
        pageId,
        psid,
        text,
        { lastInboundAt: conversation.last_inbound_at, tag },
        { accessToken }
      );
    } catch (err) {
      if (err instanceof MessengerWindowError) {
        return NextResponse.json(
          { success: false, error: err.message },
          { status: 409 }
        );
      }
      throw err;
    }

    const sentAt = new Date().toISOString();

    // 5) Persist outbound + advance conversation timestamp
    const { error: insertErr } = await service.from('messenger_messages').insert({
      conversation_id: conversation.id,
      direction: 'out',
      mid: sendResult.message_id,
      text,
      attachments: null,
      sent_at: sentAt,
    });
    if (insertErr) throw insertErr;

    await service
      .from('messenger_conversations')
      .update({ last_outbound_at: sentAt, status: 'open' })
      .eq('id', conversation.id);

    return NextResponse.json({
      success: true,
      data: {
        message_id: sendResult.message_id,
        recipient_id: sendResult.recipient_id,
        sent_at: sentAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
