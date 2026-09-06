export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { RecruitmentService } from '@/lib/services/hr/recruitment-service';
import { getErrorMessage } from '@/lib/utils';
import { purgeRejectedApplicant } from '../../_lib/purge-rejected-applicant';

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
    if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

    return NextResponse.json({ data: candidate });
  } catch (err) {
    console.error('[hr/recruitment/candidates/:id] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
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
