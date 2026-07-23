export const dynamic = 'force-dynamic';

/**
 * GET /api/social/messenger/conversations/{id}/messages
 *
 * Returns the full message log for a single conversation, oldest-first so the
 * 2-pane inbox right rail can append-render. Enforces institution scope at the
 * conversation level.
 *
 * Query params:
 *   limit?: number (max 200)   — default 100
 *
 * Auth: super_admin OR institution_admin in the conversation's institution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: conversationId } = await context.params;
    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: 'conversation id required' },
        { status: 400 }
      );
    }

    const service = createServiceRoleClient();

    const { data: conversation, error: convErr } = await service
      .from('messenger_conversations')
      .select('id, institution_id')
      .eq('id', conversationId)
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

    const { searchParams } = new URL(request.url);
    const limitRaw = Number(searchParams.get('limit') || '100');
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;

    const { data, error } = await service
      .from('messenger_messages')
      .select('id, conversation_id, direction, mid, text, attachments, sent_at, created_at')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: true })
      .limit(limit);
    if (error) throw error;

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
