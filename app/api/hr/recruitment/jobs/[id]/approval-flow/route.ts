export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { RecruitmentService } from '@/lib/services/hr/recruitment-service';
import { RecruitmentJobsService } from '@/lib/services/hr/recruitment-jobs-service';

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

// GET /api/hr/recruitment/jobs/:id/approval-flow
//
// The approval chain this job's applicants WOULD enter on promotion. The
// workspace renders it from the moment someone applies, so reviewers can see
// the configured route before anyone is promoted — until then no candidate row
// exists and there is no frozen chain to show.
//
// Resolved through RecruitmentService.previewApprovalChain, which shares the
// RPC, the matcher and the step mapping with buildApprovalChain. Anything else
// risks previewing a chain that is not the one promotion actually freezes.
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

    const job = await RecruitmentJobsService.getJob(supabase, id);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const preview = await RecruitmentService.previewApprovalChain(
      supabase,
      job.hr_organization_id,
      job.role_category,
      null, // band is only known per-candidate at promote time
    );

    return NextResponse.json({ data: preview });
  } catch (err) {
    console.error('[hr/recruitment/jobs/:id/approval-flow] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
