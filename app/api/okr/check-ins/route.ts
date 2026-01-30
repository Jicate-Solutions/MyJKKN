// app/api/okr/check-ins/route.ts
// Internal API for OKR Check-ins (session-based auth)

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Helper to get current week info
function getCurrentWeek(): { weekNumber: number; year: number; startDate: Date; endDate: Date } {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);

  // Calculate week start (Monday) and end (Sunday)
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return {
    weekNumber,
    year: now.getFullYear(),
    startDate: monday,
    endDate: sunday
  };
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    // Authenticate user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 100);
    const userId = url.searchParams.get('user_id');
    const weekNumber = url.searchParams.get('week_number');
    const year = url.searchParams.get('year');
    const isCompleted = url.searchParams.get('is_completed');
    const isOverdue = url.searchParams.get('is_overdue');
    const currentOnly = url.searchParams.get('current') === 'true';

    // Build query
    let query = (supabase as any)
      .from('okr_check_ins')
      .select(`
        *,
        user:profiles!user_id(id, full_name, email, avatar_url),
        kr_updates:okr_kr_updates(
          *,
          key_result:okr_key_results(id, title, unit)
        )
      `, { count: 'exact' });

    // Filter by user (default to current user)
    if (userId) {
      query = query.eq('user_id', userId);
    } else {
      query = query.eq('user_id', user.id);
    }

    // Filter current week only
    if (currentOnly) {
      const { weekNumber: currentWeek, year: currentYear } = getCurrentWeek();
      query = query.eq('week_number', currentWeek).eq('year', currentYear);
    } else {
      if (weekNumber) {
        query = query.eq('week_number', parseInt(weekNumber));
      }
      if (year) {
        query = query.eq('year', parseInt(year));
      }
    }

    if (isCompleted !== null) {
      query = query.eq('is_completed', isCompleted === 'true');
    }
    if (isOverdue !== null) {
      query = query.eq('is_overdue', isOverdue === 'true');
    }

    // Apply pagination
    const from = (page - 1) * limit;
    query = query
      .range(from, from + limit - 1)
      .order('due_date', { ascending: false });

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      data: data || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0
      }
    });

  } catch (error) {
    console.error('[OKR Check-ins API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    // Authenticate user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { weekNumber, year, startDate, endDate } = getCurrentWeek();

    // Check if check-in already exists for current week
    const { data: existing } = await (supabase as any)
      .from('okr_check_ins')
      .select('id')
      .eq('user_id', user.id)
      .eq('week_number', weekNumber)
      .eq('year', year)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Check-in already exists for this week', data: existing },
        { status: 409 }
      );
    }

    // Create new check-in
    const checkInData = {
      user_id: user.id,
      week_number: weekNumber,
      year: year,
      week_start_date: startDate.toISOString(),
      due_date: endDate.toISOString(),
      status: 'pending',
      is_completed: false,
      is_overdue: false
    };

    const { data, error } = await (supabase as any)
      .from('okr_check_ins')
      .insert([checkInData])
      .select()
      .single();

    if (error) {
      console.error('[OKR Check-ins API] Create error:', error);
      throw error;
    }

    return NextResponse.json({ data }, { status: 201 });

  } catch (error) {
    console.error('[OKR Check-ins API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
