import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { RecruitmentService } from '@/lib/services/hr/recruitment-service';
import { getErrorMessage } from '@/lib/utils';
import { purgeRejectedApplicant } from '@/app/api/hr/recruitment/_lib/purge-rejected-applicant';

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

    const candidate = await RecruitmentService.getCandidate(supabase, id);
    if (!candidate) return await candidateNotVisibleResponse(supabase);

    return NextResponse.json({ data: candidate });
  } catch (err) {
    console.error('[hr/recruitment/candidates/:id] GET error', err);
    // PostgrestError is a plain object — getErrorMessage keeps its text.
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

/**
 * RLS hides a candidate row the caller may not read, so "no row" means either
 * "does not exist" or "not yours to see". A person without Recruitment view
 * access (e.g. a faculty member someone forwarded the link to) was told
 * "Candidate not found" and had no idea what to do (BUG-006128). Say so
 * plainly instead, and name who can help. Whether the row exists is never
 * revealed: the answer depends only on the caller's own access.
 */
async function candidateNotVisibleResponse(
  supabase: Awaited<ReturnType<typeof getClient>>
) {
  const [{ data: isSuperAdmin }, { data: isAdmin }, { data: canView }] = await Promise.all([
    supabase.rpc('is_super_admin'),
    supabase.rpc('is_admin'),
    supabase.rpc('user_has_permission', { permission_name: 'hr.recruitment.view' }),
  ]);
  if (!isSuperAdmin && !isAdmin && !canView) {
    return NextResponse.json(
      {
        error:
          'You do not have access to recruitment candidates, so this shared link cannot open for you. ' +
          'Ask HR or the COO to share the details with you, or to give your role Recruitment view access.',
        reason: 'no_recruitment_access',
      },
      { status: 403 }
    );
  }
  return NextResponse.json(
    {
      error:
        'Candidate not found. It may have been removed, or it belongs to an institution outside your access.',
    },
    { status: 404 }
  );
}

/**
 * Permanently erase a REJECTED candidate — super admins only.
 *
 * The pipeline-side twin of DELETE /applications/:id. Removes the candidate row
 * (interviews, scorecards, packages and comments cascade), every application that
 * promoted into it, and their Google Drive resumes. Authorization and the
 * rejected-only guard live in the SECURITY DEFINER RPC. Irreversible.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const result = await purgeRejectedApplicant(supabase, { candidateId: id });
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('[hr/recruitment/candidates/:id] DELETE error', err);
    // PostgrestError is a plain object — getErrorMessage keeps the RPC's guard text.
    const code = (err as { code?: string })?.code;
    return NextResponse.json(
      { error: getErrorMessage(err) },
      { status: code === '42501' ? 403 : code === 'P0002' ? 404 : 400 }
    );
  }
}
