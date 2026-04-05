export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Coaching style mapping based on agency level
function getCoachingStyle(level: string): string {
  const styleMap: Record<string, string> = {
    dependent: 'scaffolding',
    directed: 'guided',
    independent: 'challenging',
    self_directed: 'socratic',
    principal: 'peer',
  };
  return styleMap[level] || 'scaffolding';
}

// Placeholder coach reply — will be replaced by Gemini API integration
function generatePlaceholderReply(style: string): string {
  const replies: Record<string, string> = {
    scaffolding: "Let's break this down step by step. What part of this do you understand already, and where do you feel stuck?",
    guided: "You're on the right track. Before I point you further, what do you think the next step should be?",
    challenging: "Interesting approach. But what would happen if the input was unexpected? Have you considered edge cases?",
    socratic: "That's one way to look at it. What would someone who disagrees with your approach say? What assumptions are you making?",
    peer: "I see where you're going. I'd push back on one aspect though — have you validated this with real data?",
  };
  return replies[style] || replies.scaffolding;
}

// GET /api/pde/coach?learnerId=xxx or ?contextType=xxx&contextId=yyy
// Returns conversation history or a specific conversation
export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const learnerId = searchParams.get('learnerId') || user.id;
    const contextType = searchParams.get('contextType');
    const contextId = searchParams.get('contextId');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (contextType && contextId) {
      // Get specific conversation
      const { data, error } = await (supabase as any)
        .from('pde_coach_conversations')
        .select('*')
        .eq('learner_id', learnerId)
        .eq('context_type', contextType)
        .eq('context_id', contextId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ data: data || null });
    }

    // Get conversation history
    const { data, error } = await (supabase as any)
      .from('pde_coach_conversations')
      .select('*')
      .eq('learner_id', learnerId)
      .order('updated_at', { ascending: false })
      .limit(limit);
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

// POST /api/pde/coach — send a message to the AI coach
// Body: { contextType, contextId, message }
export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { contextType, contextId, message } = body;

    if (!contextType || !contextId || !message) {
      return NextResponse.json(
        { error: 'contextType, contextId, and message are required' },
        { status: 400 }
      );
    }

    const learnerId = user.id;
    const now = new Date().toISOString();

    // 1. Determine coaching style from agency level
    const { data: agencyData } = await (supabase as any)
      .from('pde_agency_index')
      .select('level')
      .eq('learner_id', learnerId)
      .order('assessment_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    const coachingStyle = getCoachingStyle(agencyData?.level || 'dependent');

    // 2. Get or create conversation
    const { data: existing } = await (supabase as any)
      .from('pde_coach_conversations')
      .select('*')
      .eq('learner_id', learnerId)
      .eq('context_type', contextType)
      .eq('context_id', contextId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const learnerMsg = { role: 'learner', content: message, timestamp: now };
    const coachReply = generatePlaceholderReply(coachingStyle);
    const coachMsg = { role: 'coach', content: coachReply, timestamp: now };

    let conversationId: string;

    if (!existing) {
      // Create new conversation
      const { data: created, error } = await (supabase as any)
        .from('pde_coach_conversations')
        .insert({
          learner_id: learnerId,
          context_type: contextType,
          context_id: contextId,
          messages: [learnerMsg, coachMsg],
          coaching_style: coachingStyle,
          tokens_used: message.length + coachReply.length,
        })
        .select()
        .single();
      if (error) throw error;
      conversationId = created.id;
    } else {
      // Append to existing
      const updatedMessages = [...(existing.messages || []), learnerMsg, coachMsg];
      const { error } = await (supabase as any)
        .from('pde_coach_conversations')
        .update({
          messages: updatedMessages,
          coaching_style: coachingStyle,
          tokens_used: (existing.tokens_used || 0) + message.length + coachReply.length,
          updated_at: now,
        })
        .eq('id', existing.id);
      if (error) throw error;
      conversationId = existing.id;
    }

    return NextResponse.json({
      data: {
        reply: coachReply,
        conversation_id: conversationId,
        coaching_style: coachingStyle,
      },
    });
  } catch (error: any) {
    console.error('Error sending coach message:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
