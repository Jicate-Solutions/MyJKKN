// app/api/ai-pulse/submit/domain-sync/route.ts
// ============================================================================
// AI Pulse — Domain-Sync artifact submission (SOP Phase II write path).
//
//   GET  /api/ai-pulse/submit/domain-sync?cycle=<uuid|current>
//        → submit context: cycle, learner's team, existing submission, and
//          the deadline (cycle start + ai_pulse_policies.domain_sync_deadline_offset_days).
//
//   POST /api/ai-pulse/submit/domain-sync
//        body: { cycle_id, app_name, description, solution_summary?,
//                github_url?, proof_urls?: string[] }
//        → upserts the team's event_submissions row with the Domain-Sync
//          artifact record (description / solution_summary / proof_urls).
//
// Auth: session cookie. Permission gate: aiPulse:submit.domain_sync via
// user_has_permission RPC (super-admin bypass inside the RPC) — same shape
// as app/api/ai-pulse/evidence/naac/route.ts.
//
// Service-role usage (deliberate, scoped): event_submissions RLS allows
// insert/update by the registration OWNER only, but any ACCEPTED team member
// may submit for the team per SOP. The route proves membership
// (event_team_members, status='accepted') BEFORE writing, and writes only to
// that registration's row for this cycle.
//
// Policy reads (Config Mandate — never hardcoded):
//   domain_sync_deadline_offset_days (3).
// ============================================================================

export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection, type NextRequest } from 'next/server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { AiPulseLearnerService } from '@/lib/services/ai-pulse/learner-service';
import {
  computeDeadline,
  readPolicyValue,
  resolveAiPulseCycle,
  toExistingSubmissionSummary,
  type DomainSyncSubmitContext,
} from '@/lib/services/ai-pulse/pulse-impact-service';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'ai-pulse/submit-domain-sync';
const PERMISSION_KEY = 'aiPulse:submit.domain_sync';
const MAX_PROOF_URLS = 10;

async function createSessionClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // route handler may run in a context that disallows cookie writes
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          } catch {
            // ignore
          }
        },
      },
    }
  );
}

async function authorize(): Promise<
  | { user: { id: string }; errorResponse: null }
  | { user: null; errorResponse: NextResponse }
> {
  const supabase = await createSessionClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      user: null,
      errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: canSubmit } = await (supabase as any).rpc('user_has_permission', {
    permission_name: PERMISSION_KEY,
  });
  if (!canSubmit) {
    return {
      user: null,
      errorResponse: NextResponse.json(
        {
          error: `You don't have the ${PERMISSION_KEY} permission. Ask your Class Incharge or AI Pulse Champion for access.`,
          code: 'FORBIDDEN',
        },
        { status: 403 }
      ),
    };
  }

  return { user: { id: user.id }, errorResponse: null };
}

async function readOffsetDays(svc: any): Promise<number> {
  const { data, error } = await svc
    .from('ai_pulse_policies')
    .select('config_key, value_jsonb')
    .eq('is_active', true)
    .eq('config_key', 'domain_sync_deadline_offset_days');
  if (error) {
    logger.error(MODULE, 'failed to read ai_pulse_policies', error);
    return 3;
  }
  return readPolicyValue<number>(
    (data ?? []) as Array<{ config_key: string; value_jsonb: unknown }>,
    'domain_sync_deadline_offset_days',
    3
  );
}

async function getExistingSubmission(
  svc: any,
  eventId: string,
  registrationId: string
) {
  const { data } = await svc
    .from('event_submissions')
    .select(
      'id, app_name, github_url, description, solution_summary, proof_urls, submitted_at'
    )
    .eq('event_id', eventId)
    .eq('registration_id', registrationId)
    .maybeSingle();
  return data ?? null;
}

// ---------------------------------------------------------------------------
// GET — submit context
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  await connection();
  try {
    const auth = await authorize();
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.user.id;

    const svc = createServiceRoleClient();
    const cycleParam = new URL(request.url).searchParams.get('cycle');

    const [cycle, offsetDays] = await Promise.all([
      resolveAiPulseCycle(svc, cycleParam),
      readOffsetDays(svc),
    ]);

    let team = null;
    let existing = null;
    if (cycle) {
      team = await AiPulseLearnerService.getMyTeam(cycle.id, userId, svc);
      if (team) {
        existing = await getExistingSubmission(svc, cycle.id, team.registration_id);
      }
    }

    const anchor = cycle?.start_date ?? cycle?.demo_date ?? null;
    const response: DomainSyncSubmitContext = {
      cycle,
      team: team
        ? {
            registration_id: team.registration_id,
            team_name: team.team_name,
            is_leader: team.is_leader,
            member_count: team.member_count,
          }
        : null,
      existing: toExistingSubmissionSummary(existing),
      deadline: cycle
        ? computeDeadline(anchor, offsetDays * 24 * 60 * 60 * 1000)
        : null,
      policies: { domain_sync_deadline_offset_days: offsetDays },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    logger.error(MODULE, 'GET failed', error);
    return NextResponse.json(
      { error: 'Failed to load domain-sync submit context' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST — submit / resubmit
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  await connection();
  try {
    const auth = await authorize();
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.user.id;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    const cycleId = typeof body?.cycle_id === 'string' ? body.cycle_id : '';
    const appName =
      typeof body?.app_name === 'string' ? body.app_name.trim() : '';
    const description =
      typeof body?.description === 'string' ? body.description.trim() : '';
    const solutionSummary =
      typeof body?.solution_summary === 'string'
        ? body.solution_summary.trim()
        : '';
    const githubUrl =
      typeof body?.github_url === 'string' ? body.github_url.trim() : '';
    const proofLinksInput: string[] = Array.isArray(body?.proof_urls)
      ? body.proof_urls
          .filter((u: unknown): u is string => typeof u === 'string')
          .map((u: string) => u.trim())
          .filter(Boolean)
      : [];

    if (!appName) {
      return NextResponse.json(
        { error: 'Give your artifact a title.', code: 'MISSING_TITLE' },
        { status: 422 }
      );
    }
    if (description.length < 20) {
      return NextResponse.json(
        {
          error:
            'Describe what your team applied this week (at least a couple of sentences).',
          code: 'DESCRIPTION_TOO_SHORT',
        },
        { status: 422 }
      );
    }
    if (githubUrl && !/^https:\/\/(www\.)?github\.com\//i.test(githubUrl)) {
      return NextResponse.json(
        {
          error: 'GitHub link must start with https://github.com/',
          code: 'INVALID_GITHUB_URL',
        },
        { status: 422 }
      );
    }
    if (proofLinksInput.length > MAX_PROOF_URLS) {
      return NextResponse.json(
        {
          error: `At most ${MAX_PROOF_URLS} artifact links per submission.`,
          code: 'TOO_MANY_LINKS',
        },
        { status: 422 }
      );
    }
    const badLink = proofLinksInput.find((u) => !/^https?:\/\//i.test(u));
    if (badLink) {
      return NextResponse.json(
        {
          error: `Artifact links must be full URLs starting with http(s):// — check "${badLink}".`,
          code: 'INVALID_PROOF_URL',
        },
        { status: 422 }
      );
    }

    const svc = createServiceRoleClient();

    // 1. Cycle.
    const cycle = await resolveAiPulseCycle(svc, cycleId || 'current');
    if (!cycle) {
      return NextResponse.json(
        {
          error: 'No active AI Pulse cycle found for this submission.',
          code: 'NO_CYCLE',
        },
        { status: 422 }
      );
    }

    // 2. Team membership (authorizes the service-role write below).
    const team = await AiPulseLearnerService.getMyTeam(cycle.id, userId, svc);
    if (!team) {
      return NextResponse.json(
        {
          error:
            "You're not on a team for this cycle yet, so there's nothing to submit against. Ask your Class Incharge to add you to a team.",
          code: 'NO_TEAM',
        },
        { status: 422 }
      );
    }

    // 3. Deadline (policy-driven).
    const offsetDays = await readOffsetDays(svc);
    const anchor = cycle.start_date ?? cycle.demo_date ?? null;
    const deadline = computeDeadline(anchor, offsetDays * 24 * 60 * 60 * 1000);

    // 4. Upsert — preserve any Instagram proof URLs the publication flow
    //    stored; domain-sync owns the non-IG artifact links.
    const existing = await getExistingSubmission(svc, cycle.id, team.registration_id);
    const existingIgProofs: string[] = Array.isArray(existing?.proof_urls)
      ? existing.proof_urls.filter(
          (u: string) => u && /instagram\.com/i.test(u)
        )
      : [];
    const proofUrls = [...existingIgProofs, ...proofLinksInput];

    const upsertRow: Record<string, unknown> = {
      event_id: cycle.id,
      registration_id: team.registration_id,
      app_name: appName,
      description,
      proof_urls: proofUrls,
      submitted_at: new Date().toISOString(),
      submitted_by: userId,
    };
    if (solutionSummary) upsertRow.solution_summary = solutionSummary;
    if (githubUrl) upsertRow.github_url = githubUrl;

    const { error: upsertErr } = await svc
      .from('event_submissions')
      .upsert(upsertRow, { onConflict: 'event_id,registration_id' });

    if (upsertErr) {
      logger.error(MODULE, 'event_submissions upsert failed', upsertErr);
      return NextResponse.json(
        { error: 'Could not save your submission. Try again shortly.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, late: deadline.is_past, deadline },
      { status: 200 }
    );
  } catch (error) {
    logger.error(MODULE, 'POST failed', error);
    return NextResponse.json(
      { error: 'Failed to submit domain-sync artifact' },
      { status: 500 }
    );
  }
}
