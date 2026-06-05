export const dynamic = 'force-dynamic';

// app/api/admission/leads/[id]/route.ts
// Server-side single-lead detail endpoint — uses the service role to bypass
// RLS overhead, mirroring app/api/admission/leads/list/route.ts.
//
// Why this exists (BUG-003956): the leads LIST and this DETAIL endpoint must
// agree on visibility, or a lead shows in the list but 404s on its detail page.
// Both now resolve scope through the SAME shared module
// (lib/api-helpers/admission-lead-visibility.ts → resolveLeadAccess + the
// fn_admission_lead_scope RPC) and the SAME predicates. The list applies them as
// a query filter (applyLeadVisibility, excludeReferral=true); this route applies
// them per-row (canSeeLead) and DELIBERATELY keeps owned referral leads openable
// (excludeReferral=false). Ownership/institution is enforced per-row, so dropping
// the referral exclusion does not widen visibility beyond the operator's own leads.

import { connection } from 'next/server';
import { createServiceRoleClient, getAuthUser } from '@/lib/supabase/server';
import { jsonNoStore } from '@/lib/api-helpers/no-store-response';
import {
  resolveLeadAccess,
  leadViewDenialReason,
  canSeeLead,
} from '@/lib/api-helpers/admission-lead-visibility';

// Retry only on undici / Node fetch transient failures (cold-start flakes on
// Windows + Turbopack). Postgres errors should surface immediately without retry.
function isTransientFetchError(err: unknown): boolean {
  const msg =
    (err as any)?.message ??
    (err as any)?.details ??
    (typeof err === 'string' ? err : '');
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|UND_ERR/i.test(String(msg));
}

async function retryOnFetchFailure<T>(fn: () => Promise<T>): Promise<T> {
  const attempts = 3;
  let delay = 200;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const isLastAttempt = i === attempts - 1;
      if (isLastAttempt || !isTransientFetchError(err)) throw err;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.floor(delay * 1.5);
    }
  }
  // Unreachable, satisfies TS
  throw new Error('retryOnFetchFailure: exhausted attempts');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();

  const { id } = await params;
  if (!id) {
    return jsonNoStore({ error: 'Lead id is required' }, { status: 400 });
  }

  // 1. Authenticate the user (wrapped so undici cold-start flakes auto-retry)
  let user: any = null;
  try {
    const result = await retryOnFetchFailure(() => getAuthUser());
    if (result.error || !result.user) {
      return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });
    }
    user = result.user;
  } catch (err) {
    console.error('[admission/leads/:id] Auth fetch failed:', err);
    return jsonNoStore(
      { error: 'Authentication temporarily unavailable. Please retry.' },
      { status: 503 }
    );
  }

  // 2. Resolve the caller's lead-access scope in ONE round-trip (same RPC and
  //    shared module as the list route, so list/detail enforcement can never
  //    diverge — BUG-003956). Replaces the former profile + permission +
  //    allowlist + global-flag query chain.
  const supabase = createServiceRoleClient();

  let access;
  try {
    access = await resolveLeadAccess(supabase, user.id);
  } catch (err) {
    console.error('[admission/leads/:id] Scope resolution failed:', err);
    return jsonNoStore(
      { error: 'Authentication temporarily unavailable. Please retry.' },
      { status: 503 }
    );
  }

  if (!access.profileExists) {
    return jsonNoStore({ error: 'Profile not found' }, { status: 403 });
  }

  const denial = leadViewDenialReason(access);
  if (denial) {
    return jsonNoStore({ error: denial }, { status: 403 });
  }

  try {
    // 3. Fetch the row by id with the service role (bypasses RLS). The select
    //    mirrors LeadService.getLead's embeds so normalizeLead gets the shape
    //    the detail page expects.
    const { data: lead, error } = await retryOnFetchFailure(() =>
      supabase
        .from('admission_leads')
        .select(`
          *,
          counselor:admission_counselors(id, name, email),
          program:programs!program_id(id, program_name, program_id),
          admission_year:admission_years(id, admission_year_name, year)
        `)
        .eq('id', id)
        .maybeSingle()
    );

    if (error) throw error;
    if (!lead) {
      return jsonNoStore({ error: 'Lead not found' }, { status: 404 });
    }

    // 4. Per-row ownership / scope check via the shared canSeeLead() — the SAME
    //    predicates as the list's applyLeadVisibility (strict-counselor first,
    //    then institution clamp, then global), but WITHOUT the blanket
    //    `source <> 'referral'` exclusion (an owned referral lead must open —
    //    BUG-003956). Ownership/institution is enforced per-row, so this never
    //    widens visibility beyond the operator's own leads.
    if (!canSeeLead(access, lead as any)) {
      return jsonNoStore({ error: 'Lead not found' }, { status: 404 });
    }

    return jsonNoStore({ data: lead });
  } catch (err) {
    console.error('[admission/leads/:id] API route error:', err);
    // Postgrest errors are plain objects (not Error instances).
    const message =
      (err as any)?.message ||
      (err as any)?.details ||
      (err as any)?.hint ||
      (err as any)?.error_description ||
      (typeof err === 'string' ? err : null) ||
      'Internal server error';
    const status = isTransientFetchError(err) ? 503 : 500;
    return jsonNoStore({ error: message }, { status });
  }
}
