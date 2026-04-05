export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/pde/reputation?leaderboard=true&limit=20  OR  ?learnerId=xxx
export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isLeaderboard = request.nextUrl.searchParams.get('leaderboard') === 'true';
    const learnerId = request.nextUrl.searchParams.get('learnerId');
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20', 10);

    if (isLeaderboard) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('pde_reputation')
        .select('*')
        .order('total_points', { ascending: false })
        .limit(Math.min(limit, 100));

      if (error) throw error;
      return NextResponse.json({ data: data || [] });
    }

    // Get specific learner's reputation (default to current user)
    const targetId = learnerId || user.id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('pde_reputation')
      .select('*')
      .eq('learner_id', targetId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows

    return NextResponse.json({ data: data || null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error fetching reputation:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
