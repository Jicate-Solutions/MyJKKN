export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const mine = request.nextUrl.searchParams.get('mine') === 'true';
    if (mine) {
      const { data, error } = await (supabase as any).from('pde_learner_badges').select('*, badge:pde_badges(*)').eq('learner_id', user.id).order('earned_at', { ascending: false });
      if (error) throw error;
      return NextResponse.json({ data: data || [] });
    }
    const { data, error } = await (supabase as any).from('pde_badges').select('*').order('category').order('name');
    if (error) throw error;
    return NextResponse.json({ data: data || [] });
  } catch (e: any) { return NextResponse.json({ error: e.message || 'Error' }, { status: 500 }); }
}
