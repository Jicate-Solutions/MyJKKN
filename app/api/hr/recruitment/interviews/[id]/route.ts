export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { RecruitmentInterviewsService } from '@/lib/services/hr/recruitment-interviews-service';

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const interview = await RecruitmentInterviewsService.getInterview(supabase, id);
    if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });

    return NextResponse.json({ data: interview });
  } catch (err) {
    console.error('[hr/recruitment/interviews/:id] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/hr/recruitment/interviews/[id]
 *
 * Supported actions via `action` field in body:
 *   - 'reschedule' → creates NEW interview row, marks this one 'rescheduled'.
 *                    Requires { scheduled_at, ...optional patch fields }.
 *   - 'cancel'     → marks status='cancelled'. Optional { reason }.
 *   - 'complete'   → marks status='completed' + records outcome_summary.
 *   - 'no_show'    → marks status='no_show' + records outcome_summary.
 *   - (default)    → simple field update (panel_member_ids etc.) BEFORE interview.
 */
export async function PATCH(
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
    const action = body.action as string | undefined;

    if (action === 'reschedule') {
      if (!body.scheduled_at) {
        return NextResponse.json(
          { error: 'scheduled_at is required for reschedule' },
          { status: 400 }
        );
      }
      const newSitting = await RecruitmentInterviewsService.rescheduleInterview(
        supabase,
        id,
        {
          scheduled_at: body.scheduled_at,
          duration_minutes: body.duration_minutes,
          mode: body.mode,
          location_or_link: body.location_or_link,
          panel_member_ids: body.panel_member_ids,
          round_name: body.round_name,
          created_by: user.id,
        }
      );
      return NextResponse.json({ data: newSitting });
    }

    if (action === 'cancel') {
      const cancelled = await RecruitmentInterviewsService.cancelInterview(
        supabase,
        id,
        body.reason
      );
      return NextResponse.json({ data: cancelled });
    }

    if (action === 'complete' || action === 'no_show') {
      const outcome = await RecruitmentInterviewsService.updateOutcome(supabase, id, {
        status: action === 'complete' ? 'completed' : 'no_show',
        outcome_summary: body.outcome_summary ?? null,
      });
      return NextResponse.json({ data: outcome });
    }

    // Default: generic update
    const { action: _a, ...patch } = body;
    const updated = await RecruitmentInterviewsService.updateInterview(supabase, id, patch);
    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('[hr/recruitment/interviews/:id] PATCH error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
