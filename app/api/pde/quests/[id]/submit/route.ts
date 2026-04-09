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
    const body = await request.json();
    if (!body.title || !body.submission_type) return NextResponse.json({ error: 'title and submission_type required' }, { status: 400 });
    const { data: enrollment } = await (supabase as any).from('pde_quest_enrollments').select('id, team_id').eq('quest_id', questId).eq('learner_id', user.id).eq('status', 'active').maybeSingle();
    if (!enrollment) return NextResponse.json({ error: 'Not enrolled or not active' }, { status: 403 });
    const { data, error } = await (supabase as any).from('pde_quest_submissions').insert({ quest_id: questId, learner_id: user.id, team_id: enrollment.team_id || null, submission_type: body.submission_type, title: body.title, description: body.description || null, evidence_urls: body.evidence_urls || null, reflection: body.reflection || null }).select().single();
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (e: any) { return NextResponse.json({ error: e.message || 'Error' }, { status: 500 }); }
}
