// POST /api/admission/chat/conversations/[id]/resolve
// Mark a conversation as resolved

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppChatService } from '@/lib/services/whatsapp/whatsapp-chat-service';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await WhatsAppChatService.resolveConversation(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[chat/resolve] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resolve' },
      { status: 500 }
    );
  }
}
