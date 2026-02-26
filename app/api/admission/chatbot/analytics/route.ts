// app/api/admission/chatbot/analytics/route.ts
// Authenticated endpoint — chatbot analytics

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { ChatbotService } from '@/lib/services/ai/chatbot-service';

/**
 * GET /api/admission/chatbot/analytics
 *
 * Query: { chatbot_id, from?, to? }
 * Returns: ChatbotAnalytics
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const chatbotId = searchParams.get('chatbot_id');
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;

    if (!chatbotId) {
      return NextResponse.json(
        { error: 'chatbot_id is required' },
        { status: 400 }
      );
    }

    const analytics = await ChatbotService.getAnalytics(chatbotId, from, to);

    return NextResponse.json({ analytics });
  } catch (error) {
    console.error('[api/admission/chatbot/analytics] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
