export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { RecruitmentService } from '@/lib/services/hr/recruitment-service';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch {}
        },
      },
    }
  );
}

/**
 * POST /api/hr/recruitment/candidates/[id]/schedule-step-interview
 * Body: { scheduled_at, duration_minutes?, mode, location_or_link?, panel_member_ids? }
 * Schedules (or reschedules) the interview for the candidate's CURRENT approval
 * step and stamps its id onto that step. Approver-only (enforced in service).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    if (!body.scheduled_at || !body.mode) {
      return NextResponse.json({ error: 'scheduled_at and mode are required' }, { status: 400 });
    }

    const result = await RecruitmentService.scheduleStepInterview(supabase, id, user.id, {
      scheduled_at: body.scheduled_at,
      duration_minutes: body.duration_minutes,
      mode: body.mode,
      location_or_link: body.location_or_link ?? null,
      panel_member_ids: Array.isArray(body.panel_member_ids) ? body.panel_member_ids : undefined,
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('[hr/recruitment/candidates/:id/schedule-step-interview] error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
