export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const isLeaderboard = request.nextUrl.searchParams.get('leaderboard') === 'true';
    const learnerId = request.nextUrl.searchParams.get('learnerId');
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20', 10);
    if (isLeaderboard) {
      const { data, error } = await (supabase as any).from('pde_reputation').select('*').order('total_points', { ascending: false }).limit(Math.min(limit, 100));
      if (error) throw error;
      return NextResponse.json({ data: data || [] });
    }
    const targetId = learnerId || user.id;
    const { data, error } = await (supabase as any).from('pde_reputation').select('*').eq('learner_id', targetId).single();
    if (error && error.code !== 'PGRST116') throw error;
    return NextResponse.json({ data: data || null });
  } catch (e: any) { return NextResponse.json({ error: e.message || 'Error' }, { status: 500 }); }
}
