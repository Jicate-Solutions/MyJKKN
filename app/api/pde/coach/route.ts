export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/pde/coach?learnerId=xxx&contextType=xxx&contextId=xxx
// Returns coach conversation history
export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const learnerId = searchParams.get('learnerId');
    const contextType = searchParams.get('contextType');
    const contextId = searchParams.get('contextId');

    if (!learnerId) {
      return NextResponse.json(
        { error: 'learnerId query param is required' },
        { status: 400 }
      );
    }

    let query = (supabase as any)
      .from('pde_coach_conversations')
      .select('*')
      .eq('learner_id', learnerId)
      .order('created_at', { ascending: true });

    if (contextType) query = query.eq('context_type', contextType);
    if (contextId) query = query.eq('context_id', contextId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error: any) {
    console.error('Error fetching coach conversations:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/pde/coach — send message to coach
// Body: { learnerId, contextType, contextId, message }
export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { learnerId, contextType, contextId, message } = body;

    if (!learnerId || !message) {
      return NextResponse.json(
        { error: 'learnerId and message are required' },
        { status: 400 }
      );
    }

    // Store user message
    const { data: userMsg, error: userErr } = await (supabase as any)
      .from('pde_coach_conversations')
      .insert({
        learner_id: learnerId,
        context_type: contextType || 'general',
        context_id: contextId || null,
        role: 'user',
        content: message,
      })
      .select()
      .single();

    if (userErr) throw userErr;

    // Generate placeholder coach reply based on coaching style
    const coachReply = generateCoachReply(message, contextType);

    const { data: coachMsg, error: coachErr } = await (supabase as any)
      .from('pde_coach_conversations')
      .insert({
        learner_id: learnerId,
        context_type: contextType || 'general',
        context_id: contextId || null,
        role: 'coach',
        content: coachReply,
      })
      .select()
      .single();

    if (coachErr) throw coachErr;

    return NextResponse.json(
      { data: { userMessage: userMsg, coachReply: coachMsg } },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error in coach conversation:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Placeholder coach reply generator — will be replaced with AI in Phase 4
function generateCoachReply(message: string, contextType?: string): string {
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes('stuck') || lowerMsg.includes('help') || lowerMsg.includes('confused')) {
    return "I can see you're working through a challenge. Let's break this down step by step. What specific part is giving you trouble? Sometimes identifying the exact sticking point makes the solution clearer.";
  }

  if (lowerMsg.includes('done') || lowerMsg.includes('finished') || lowerMsg.includes('completed')) {
    return "Great progress! Before moving on, take a moment to reflect: What was the key insight you gained? Understanding the 'why' behind your work deepens your learning.";
  }

  if (contextType === 'quest') {
    return "You're making progress on your quest. Remember, the goal isn't just completion — it's building genuine understanding. What connections can you draw between this quest and your broader learning goals?";
  }

  if (contextType === 'assessment') {
    return "As you work through this assessment, focus on understanding the underlying concepts rather than just finding the right answer. What principles are being tested here?";
  }

  return "That's a great question. Let me guide you through this: think about the fundamental principles at play here. What do you already know that might apply? Building on existing knowledge is the fastest path to understanding.";
}
