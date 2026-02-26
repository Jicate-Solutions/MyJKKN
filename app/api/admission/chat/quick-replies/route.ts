// CRUD /api/admission/chat/quick-replies
// Manage quick reply templates for counselors

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppChatService } from '@/lib/services/whatsapp/whatsapp-chat-service';

// GET: List quick replies
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .single();

    if (!profile?.institution_id) {
      return NextResponse.json({ error: 'No institution assigned' }, { status: 403 });
    }

    const replies = await WhatsAppChatService.getQuickReplies(profile.institution_id);
    return NextResponse.json({ data: replies });
  } catch (error) {
    console.error('[chat/quick-replies] GET Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Create quick reply
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .single();

    if (!profile?.institution_id) {
      return NextResponse.json({ error: 'No institution assigned' }, { status: 403 });
    }

    const body = await request.json();
    const { title, content, shortcut, category } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: 'title and content are required' },
        { status: 400 }
      );
    }

    const reply = await WhatsAppChatService.createQuickReply({
      institution_id: profile.institution_id,
      title,
      content,
      shortcut: shortcut || undefined,
      category: category || undefined,
      created_by: user.id,
    });

    return NextResponse.json({ data: reply }, { status: 201 });
  } catch (error) {
    console.error('[chat/quick-replies] POST Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create quick reply' },
      { status: 500 }
    );
  }
}

// PUT: Update quick reply
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, title, content, shortcut, category } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const reply = await WhatsAppChatService.updateQuickReply(id, {
      title,
      content,
      shortcut,
      category,
    });

    return NextResponse.json({ data: reply });
  } catch (error) {
    console.error('[chat/quick-replies] PUT Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update quick reply' },
      { status: 500 }
    );
  }
}

// DELETE: Delete quick reply
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await WhatsAppChatService.deleteQuickReply(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[chat/quick-replies] DELETE Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete quick reply' },
      { status: 500 }
    );
  }
}
