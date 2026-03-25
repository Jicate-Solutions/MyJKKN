// app/api/admission/chatbot/sessions/[id]/handoff/route.ts
// Authenticated endpoint — manual handoff to counselor

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { ChatbotService } from '@/lib/services/ai/chatbot-service';

/**
 * POST /api/admission/chatbot/sessions/[id]/handoff
 *
 * Body: { counselor_id?: string, reason: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { counselor_id, reason } = body;

    if (!reason) {
      return NextResponse.json(
        { error: 'reason is required' },
        { status: 400 }
      );
    }

    await ChatbotService.handoffToHuman(id, reason, counselor_id);

    return NextResponse.json({ success: true, message: 'Session handed off successfully' });
  } catch (error) {
    console.error('[api/admission/chatbot/sessions/[id]/handoff] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
