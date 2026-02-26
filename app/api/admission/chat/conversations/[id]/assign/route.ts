// POST /api/admission/chat/conversations/[id]/assign
// Assign a conversation to a counselor

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppChatService } from '@/lib/services/whatsapp/whatsapp-chat-service';

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

    const { counselor_id } = await request.json();
    if (!counselor_id) {
      return NextResponse.json({ error: 'counselor_id is required' }, { status: 400 });
    }

    await WhatsAppChatService.assignConversation(id, counselor_id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[chat/assign] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to assign' },
      { status: 500 }
    );
  }
}
