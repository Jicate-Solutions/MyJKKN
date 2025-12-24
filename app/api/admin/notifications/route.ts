import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
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
      .limit(100); // Add a reasonable limit

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
