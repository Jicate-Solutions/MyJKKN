// app/api/admission/chatbot/knowledge/route.ts
// Authenticated endpoint — CRUD knowledge base documents

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, getAuthUser } from '@/lib/supabase/server';

/**
 * GET /api/admission/chatbot/knowledge
 *
 * Query: { chatbot_id, status? }
 * Returns: { documents, total }
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const chatbotId = searchParams.get('chatbot_id');
    const status = searchParams.get('status');

    if (!chatbotId) {
      return NextResponse.json(
        { error: 'chatbot_id is required' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    let query = supabase
      .from('chatbot_knowledge_base')
      .select('*', { count: 'exact' })
      .eq('chatbot_id', chatbotId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[api/admission/chatbot/knowledge] Error:', error);
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
    }

    return NextResponse.json({
      documents: data || [],
      total: count || 0,
    });
  } catch (error) {
    console.error('[api/admission/chatbot/knowledge] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admission/chatbot/knowledge
 *
 * Body: { chatbot_id, title, source_type, source_url?, content }
 */
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { chatbot_id, title, source_type, source_url, content } = body;

    if (!chatbot_id || !title || !source_type || !content) {
      return NextResponse.json(
        { error: 'chatbot_id, title, source_type, and content are required' },
        { status: 400 }
      );
    }

    const validSourceTypes = ['url', 'document', 'manual'];
    if (!validSourceTypes.includes(source_type)) {
      return NextResponse.json(
        { error: `source_type must be one of: ${validSourceTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('chatbot_knowledge_base')
      .insert({
        chatbot_id,
        title,
        source_type,
        source_url: source_url || null,
        content,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ document: data, message: 'Document added' }, { status: 201 });
  } catch (error) {
    console.error('[api/admission/chatbot/knowledge] POST Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/admission/chatbot/knowledge
 *
 * Body: { id, ...fields }
 */
export async function PUT(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Document id is required' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('chatbot_knowledge_base')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ document: data, message: 'Document updated' });
  } catch (error) {
    console.error('[api/admission/chatbot/knowledge] PUT Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/admission/chatbot/knowledge
 *
 * Query: { id }
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from('chatbot_knowledge_base')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ message: 'Document deleted' });
  } catch (error) {
    console.error('[api/admission/chatbot/knowledge] DELETE Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
