export const dynamic = 'force-dynamic';

// GET /api/hr/recruitment/pipeline — every application and pipeline candidate
// the caller may see, with the jobs and institutions they point at. Feeds the
// All Candidates page (/hr/recruitment/candidates), which merges and filters
// in memory. RLS (hr.recruitment.view + institution access) bounds every read.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
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

export async function GET() {
  await connection();
  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    return NextResponse.json(await RecruitmentService.listPipeline(supabase));
  } catch (err) {
    console.error('[hr/recruitment/pipeline] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
