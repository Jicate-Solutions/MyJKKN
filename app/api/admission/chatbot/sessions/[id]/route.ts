// app/api/admission/chatbot/sessions/[id]/route.ts
// Authenticated admin endpoint — get session detail with messages

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getAuthUser } from '@/lib/supabase/server';

/**
 * GET /api/admission/chatbot/sessions/[id]
 *
 * Returns: { session, messages }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    // Get session with config
    const { data: session, error: sessionError } = await supabase
      .from('chatbot_sessions')
      .select('*, chatbot_configs(name, welcome_message)')
      .eq('id', id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Get messages
    const { data: messages, error: messagesError } = await supabase
      .from('chatbot_messages')
      .select('*')
      .eq('session_id', id)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('[api/admission/chatbot/sessions/[id]] Messages error:', messagesError);
    }

    return NextResponse.json({
      session,
      messages: messages || [],
    });
  } catch (error) {
    console.error('[api/admission/chatbot/sessions/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
