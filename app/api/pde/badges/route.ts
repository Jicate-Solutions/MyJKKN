

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/pde/badges?mine=true  (all badges, or current user's badges)
export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const mine = request.nextUrl.searchParams.get('mine') === 'true';

    if (mine) {
      // Get current user's badges with badge details
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('pde_learner_badges')
        .select('*, badge:pde_badges(*)')
        .eq('learner_id', user.id)
        .order('earned_at', { ascending: false });

      if (error) throw error;
      return NextResponse.json({ data: data || [] });
    }

    // Get all available badges
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('pde_badges')
      .select('*')
      .order('category')
      .order('name');

    if (error) throw error;
    return NextResponse.json({ data: data || [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error fetching badges:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
