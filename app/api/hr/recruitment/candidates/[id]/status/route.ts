export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import {
  RecruitmentService,
  RecruitmentForbiddenError,
  RecruitmentDbConflictError,
} from '@/lib/services/hr/recruitment-service';
import type { CandidateStatus } from '@/types/hr-recruitment';

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

// PATCH /api/hr/recruitment/candidates/[id]/status
// Body: { status: CandidateStatus }
// Used for: joined, no_show, offer_issued, offer_rescinded transitions
//
// GATED 2026-09-12. Until this PR the route checked authentication only and
// handed straight to the service, whose one test is the forward-transition map.
// The write was still bounded by the UPDATE policy on
// hr_recruitment_candidates (hr.recruitment.edit AND
// role_has_institution_access), but an RLS refusal here matches zero rows and
// raises PGRST116 — not an `Error` instance — so the catch below answered
// **400 "Unknown error"** and the caller was told nothing about why. Same
// signature PR #3418 fixed on approve/reject. This PR adds the first UI caller
// of this route (the Issue Offer button), so the refusal is now named:
// RecruitmentService.assertMayUpdateStatus runs first and a refusal is a 403
// carrying a stable `reason`, never a silent redirect (CLAUDE.md #27).

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

    const body = await request.json().catch(() => ({}));
    if (!body.status) {
      return NextResponse.json({ error: 'status is required in request body' }, { status: 400 });
    }

    // Read the row first so a missing candidate is a 404 rather than a 403, and
    // so the gate has the hr_organization_id it scopes on. Both service methods
    // below re-read it; one extra select is the price of a truthful refusal.
    const candidate = await RecruitmentService.getCandidate(supabase, id);
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }
    await RecruitmentService.assertMayUpdateStatus(supabase, candidate);

    // Special case: no_show uses its own service method with validation
    if (body.status === 'no_show') {
      const updated = await RecruitmentService.markNoShow(supabase, id);
      return NextResponse.json({ data: updated });
    }

    const updated = await RecruitmentService.updateStatus(supabase, id, body.status as CandidateStatus);
    return NextResponse.json({ data: updated });
  } catch (err) {
    // A permission refusal is a 403 with its own reason — never folded into the
    // 400 that a malformed body or a disallowed transition produces.
    //
    // This covers BOTH kinds of refusal now (review round 1, P3):
    //   reason 'missing_permission' / 'outside_your_organisation' — the route's
    //     own gate said no.
    //   reason 'refused_by_database' — the gate said yes and RLS said no. The two
    //     predicates differ (fn_my_hr_organization_ids vs
    //     role_has_institution_access), so this is a REACHABLE case, not a
    //     theoretical one: an RLS-filtered `.update().select().single()` matches
    //     zero rows and PostgREST reports PGRST116 as a PLAIN OBJECT, which
    //     `err instanceof Error` does not catch — the answer used to be
    //     400 "Unknown error". `dbCode` is carried so a support request can name
    //     the exact refusal.
    if (err instanceof RecruitmentForbiddenError) {
      return NextResponse.json(
        { error: err.message, reason: err.reason, db_code: err.dbCode },
        { status: 403 }
      );
    }
    // A constraint violation is the caller's state being stale, not a refusal.
    if (err instanceof RecruitmentDbConflictError) {
      return NextResponse.json(
        { error: err.message, reason: 'conflict', db_code: err.dbCode },
        { status: 409 }
      );
    }
    console.error('[hr/recruitment/candidates/:id/status] PATCH error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
