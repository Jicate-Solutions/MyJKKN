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

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; packageId: string }> }
) {
  await connection();
  try {
    const { id, packageId } = await params;
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
      packageId,
    });
    if (scope === 'not_found') return NextResponse.json({ error: 'Package not found' }, { status: 404 });

    const updated = await RecruitmentPackageService.approvePackage(supabase, packageId, user.id);
    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('[hr/recruitment/candidates/:id/packages/:packageId/approve] error', err);
    if (err instanceof HrScopeError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
