export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse , connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';


export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    // Clamp caller-supplied limit to avoid unbounded fetches on admin view.
    // Default 500 covers ~a week of activity even with a noisy notification
    // source (e.g. lead-rescue cron that fires 100+ per day).
    const requestedLimit = parseInt(searchParams.get('limit') || '500', 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 1000)
      : 500;

    let query = (supabase as any).from('notifications').select(`
        id, title, body, url, icon, priority, category, sent_at,
        expires_at, targeting, created_by, created_at
      `);

    if (search) {
      query = query.or(
        `title.ilike.%${search}%,body.ilike.%${search}%,category.ilike.%${search}%`
      );
    }

    const { data: notifications, error } = await query
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}
