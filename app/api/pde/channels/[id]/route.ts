export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/pde/channels/[id] — get channel messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id: channelId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: channel, error: chError } = await (supabase as any)
      .from('pde_channels')
      .select('*')
      .eq('id', channelId)
      .single();

    if (chError || !channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: messages, error: msgError } = await (supabase as any)
      .from('pde_messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(Math.min(limit, 200));

    if (msgError) throw msgError;

    return NextResponse.json({
      data: {
        channel,
        messages: messages || [],
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error fetching channel messages:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/pde/channels/[id] — post a message to a channel
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id: channelId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { content, message_type, parent_id } = body;

    if (!content) {
      return NextResponse.json(
        { error: 'content is required' },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('pde_messages')
      .insert({
        channel_id: channelId,
        author_id: user.id,
        content,
        message_type: message_type || 'text',
        parent_id: parent_id || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error posting message:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
