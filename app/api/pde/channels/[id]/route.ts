export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);
    const { data: channel, error: chErr } = await (supabase as any).from('pde_channels').select('*').eq('id', id).single();
    if (chErr || !channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    const { data: messages, error: msgErr } = await (supabase as any).from('pde_messages').select('*').eq('channel_id', id).order('created_at', { ascending: true }).limit(Math.min(limit, 200));
    if (msgErr) throw msgErr;
    return NextResponse.json({ data: { channel, messages: messages || [] } });
  } catch (e: any) { return NextResponse.json({ error: e.message || 'Error' }, { status: 500 }); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    if (!body.content) return NextResponse.json({ error: 'content required' }, { status: 400 });
    const { data, error } = await (supabase as any).from('pde_messages').insert({ channel_id: id, author_id: user.id, content: body.content, message_type: body.message_type || 'text', parent_id: body.parent_id || null }).select().single();
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (e: any) { return NextResponse.json({ error: e.message || 'Error' }, { status: 500 }); }
}
