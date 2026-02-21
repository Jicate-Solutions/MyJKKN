// app/api/chatbot/sessions/route.ts
// PUBLIC endpoint — creates new chatbot sessions for prospects

import { NextRequest, NextResponse } from 'next/server';
import { ChatbotService } from '@/lib/services/ai/chatbot-service';

/**
 * POST /api/chatbot/sessions
 *
 * Body: { chatbot_id: string, channel?: 'website' | 'whatsapp', visitor_id?: string }
 * Returns: { session }
 */
export async function POST(request: NextRequest) {
  try {
    if (!ChatbotService.isConfigured()) {
      return NextResponse.json(
        { error: 'Chatbot service is not configured' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { chatbot_id, channel, visitor_id } = body;

    if (!chatbot_id) {
      return NextResponse.json(
        { error: 'chatbot_id is required' },
        { status: 400 }
      );
    }

    const validChannels = ['website', 'whatsapp'];
    const sessionChannel = validChannels.includes(channel) ? channel : 'website';

    const session = await ChatbotService.createSession(
      chatbot_id,
      sessionChannel,
      visitor_id
    );

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error('[api/chatbot/sessions] Error:', error);

    const message = error instanceof Error ? error.message : 'Internal server error';

    if (message.includes('not found') || message.includes('disabled')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}
