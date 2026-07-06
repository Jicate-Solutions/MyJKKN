export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id: questId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const { data: existing } = await (supabase as any).from('pde_quest_enrollments').select('id').eq('quest_id', questId).eq('learner_id', user.id).maybeSingle();
    if (existing) return NextResponse.json({ error: 'Already enrolled' }, { status: 409 });
    const { data: q } = await (supabase as any).from('pde_quests').select('target_institution_id').eq('id', questId).single();
    const { data: lp } = await (supabase as any).from('profiles').select('institution_id').eq('id', user.id).single();
    const isPilot = !!q?.target_institution_id && lp?.institution_id === q.target_institution_id;
    const { data, error } = await (supabase as any).from('pde_quest_enrollments').insert({ quest_id: questId, learner_id: user.id, team_id: body.team_id || null, role: body.team_id ? 'member' : 'lead', is_pilot: isPilot }).select().single();
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (e: any) { return NextResponse.json({ error: e.message || 'Error' }, { status: 500 }); }
}
