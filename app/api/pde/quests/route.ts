export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const sp = request.nextUrl.searchParams;
    let query = (supabase as any).from('pde_quests').select('*').order('created_at', { ascending: false });
    if (sp.get('quest_type')) query = query.eq('quest_type', sp.get('quest_type'));
    if (sp.get('difficulty')) query = query.eq('difficulty', sp.get('difficulty'));
    if (sp.get('status')) query = query.eq('status', sp.get('status'));
    if (sp.get('source_type')) query = query.eq('source_type', sp.get('source_type'));
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ data: data || [] });
  } catch (e: any) { return NextResponse.json({ error: e.message || 'Error' }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { title, description, problem_statement, quest_type, deliverable_description, ...rest } = body;
    if (!title || !description || !problem_statement || !quest_type || !deliverable_description)
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    const { data, error } = await (supabase as any).from('pde_quests').insert({ title, description, problem_statement, quest_type, deliverable_description, created_by: user.id, ...rest }).select().single();
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (e: any) { return NextResponse.json({ error: e.message || 'Error' }, { status: 500 }); }
}
