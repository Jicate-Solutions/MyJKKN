export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data, error } = await (supabase as any).from('pde_capabilities').select('*').eq('id', id).single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { data: ls } = await (supabase as any).from('pde_learner_capabilities').select('status, demonstrated_at, demonstration_score').eq('capability_id', id).eq('learner_id', user.id).maybeSingle();
    return NextResponse.json({ data: { ...data, learner_status: ls?.status || 'locked', demonstrated_at: ls?.demonstrated_at || null } });
  } catch (e: any) { return NextResponse.json({ error: e.message || 'Error' }, { status: 500 }); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { data, error } = await (supabase as any).from('pde_capabilities').update(body).eq('id', id).select().single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e: any) { return NextResponse.json({ error: e.message || 'Error' }, { status: 500 }); }
}
