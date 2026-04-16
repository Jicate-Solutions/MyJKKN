export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { RecruitmentJobsService } from '@/lib/services/hr/recruitment-jobs-service';
import type { JobStatus, RoleCategory } from '@/types/hr-recruitment';

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

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const statuses = url.searchParams.getAll('status') as JobStatus[];

    const result = await RecruitmentJobsService.listJobs(supabase, {
      hr_organization_id: url.searchParams.get('hr_organization_id') ?? undefined,
      institution_id: url.searchParams.get('institution_id') ?? undefined,
      status: statuses.length > 0 ? statuses : undefined,
      role_category: (url.searchParams.get('role_category') as RoleCategory) ?? undefined,
      department_id: url.searchParams.get('department_id') ?? undefined,
      is_public: url.searchParams.has('is_public')
        ? url.searchParams.get('is_public') === 'true'
        : undefined,
      search: url.searchParams.get('search') ?? undefined,
      page: url.searchParams.get('page') ? parseInt(url.searchParams.get('page')!, 10) : 1,
      pageSize: url.searchParams.get('pageSize') ? parseInt(url.searchParams.get('pageSize')!, 10) : 50,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[hr/recruitment/jobs] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();

    // created_by is always the logged-in user
    const created = await RecruitmentJobsService.createJob(supabase, {
      ...body,
      created_by: user.id,
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    console.error('[hr/recruitment/jobs] POST error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
