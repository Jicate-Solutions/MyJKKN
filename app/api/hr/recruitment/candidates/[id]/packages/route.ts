export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { RecruitmentPackageService } from '@/lib/services/hr/recruitment-package-service';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { HrScopeError, assertCandidatePackagesInScope } from '@/lib/hr/scope-gate';

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

// GET  /api/hr/recruitment/candidates/[id]/packages  — list all packages for candidate
// POST /api/hr/recruitment/candidates/[id]/packages  — propose new package

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

    // Institution scope is answered BEFORE the read, and answered as 403 —
    // RLS alone would return an empty list, which hides the leak it prevents.
    const scope = await assertCandidatePackagesInScope({
      admin: createServiceRoleClient(),
      supabase,
      userId: user.id,
      candidateId: id,
    });
    if (scope === 'not_found') return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

    const packages = await RecruitmentPackageService.listPackages(supabase, id);
    return NextResponse.json({ data: packages });
  } catch (err) {
    console.error('[hr/recruitment/candidates/:id/packages] GET error', err);
    if (err instanceof HrScopeError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

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

    // Institution scope is answered BEFORE the read, and answered as 403 —
    // RLS alone would return an empty list, which hides the leak it prevents.
    const scope = await assertCandidatePackagesInScope({
      admin: createServiceRoleClient(),
      supabase,
      userId: user.id,
      candidateId: id,
    });
    if (scope === 'not_found') return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

    const body = await request.json();

    const created = await RecruitmentPackageService.proposePackage(supabase, {
      ...body,
      candidate_id: id,
      proposed_by: user.id,
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    console.error('[hr/recruitment/candidates/:id/packages] POST error', err);
    if (err instanceof HrScopeError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
