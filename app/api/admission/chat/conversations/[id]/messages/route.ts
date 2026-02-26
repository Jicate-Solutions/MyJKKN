// GET /api/admission/chat/conversations/[id]/messages — List messages (cursor-based)
// POST /api/admission/chat/conversations/[id]/messages — Send a message

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppChatService } from '@/lib/services/whatsapp/whatsapp-chat-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50');

    const result = await WhatsAppChatService.getMessages(id, cursor, limit);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[chat/messages] GET Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { message_type, content, template_name, language_code, template_components } = body;

    let message;

    if (message_type === 'template' && template_name) {
      message = await WhatsAppChatService.sendTemplateMessage(
        id,
        user.id,
        template_name,
        language_code || 'en',
        template_components
      );
    } else {
      message = await WhatsAppChatService.sendMessage(id, user.id, {
        text: content?.text,
        media_url: content?.media_url,
        media_type: content?.media_type,
        caption: content?.caption,
        filename: content?.filename,
      });
    }

    return NextResponse.json({ data: message }, { status: 201 });
  } catch (error) {
    console.error('[chat/messages] POST Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send message' },
      { status: 500 }
    );
  }
}
