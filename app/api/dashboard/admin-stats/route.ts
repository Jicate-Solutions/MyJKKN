import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * GET /api/dashboard/admin-stats
 *
 * Server-side admin dashboard data endpoint.
 * Uses the Supabase service-role client to bypass RLS on user_activity_logs.
 * JKKN API calls run server-to-server via the existing proxy routes.
 *
 * Query params:
 *   ?type=overview  → system counts (institutions, depts, programs, sections, users)
 *   ?type=activity  → recent activity logs with profile join
 *   ?limit=N        → number of activity records (default 10)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  // Service-role client bypasses RLS — never reaches the browser
  const supabase = createServiceRoleClient();

  if (type === 'overview') {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    const [instRes, deptRes, progRes, sectRes, usersRes] = await Promise.all([
      fetch(`${baseUrl}/api/jkkn/institutions?page=1&limit=1`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
      fetch(`${baseUrl}/api/jkkn/departments?page=1&limit=1`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
      fetch(`${baseUrl}/api/jkkn/programs?page=1&limit=1`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
      fetch(`${baseUrl}/api/jkkn/sections?page=1&limit=1`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
    ]);

    return NextResponse.json({
      total_institutions: instRes?.metadata?.total ?? 0,
      total_departments:  deptRes?.metadata?.total ?? 0,
      total_programs:     progRes?.metadata?.total ?? 0,
      total_sections:     sectRes?.metadata?.total ?? 0,
      total_users:        usersRes.count ?? 0,
      active_sessions:    0,
    });
  }

  if (type === 'activity') {
    const limit = Math.min(Number(searchParams.get('limit') ?? 10), 50);

    const { data: logs, error } = await supabase
      .from('user_activity_logs')
      .select(`id, action_type, description, created_at, profiles:user_id(full_name, email)`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json([], { status: 200 });
    }

    const mapped = (logs ?? []).map((log: any) => ({
      id:            log.id,
      activity_type: log.action_type,
      description:   log.description || 'No description',
      user_name:     log.profiles?.full_name || log.profiles?.email || 'Unknown User',
      timestamp:     log.created_at,
    }));

    return NextResponse.json(mapped);
  }

  return NextResponse.json({ error: 'Unknown type. Use ?type=overview or ?type=activity' }, { status: 400 });
}
