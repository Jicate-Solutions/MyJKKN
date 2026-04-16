export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { RecruitmentScorecardsService } from '@/lib/services/hr/recruitment-scorecards-service';

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
 * GET /api/hr/recruitment/interviews/[id]/scorecards
 *
 * Lists all scorecards for the given interview.
 * Stricter RLS auto-filters: only the submitting interviewer, approval-chain
 * members, hr.recruitment.scorecards.view holders, and super_admin get rows.
 */
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

    const scorecards = await RecruitmentScorecardsService.listForInterview(supabase, id);
    return NextResponse.json({ data: scorecards });
  } catch (err) {
    console.error('[hr/recruitment/interviews/:id/scorecards] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/hr/recruitment/interviews/[id]/scorecards
 *
 * Submit a scorecard for this interview. interviewer_id is forced to the
 * logged-in user (RLS WITH CHECK also enforces this at DB level).
 * UNIQUE constraint ensures submit-once per interviewer per interview.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id: interviewId } = await params;
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();

    const created = await RecruitmentScorecardsService.submitScorecard(supabase, {
      ...body,
      interview_id: interviewId,
      interviewer_id: user.id,
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    console.error('[hr/recruitment/interviews/:id/scorecards] POST error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
