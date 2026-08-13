// app/api/ai-pulse/submit/publication/route.ts
// ============================================================================
// AI Pulse — Publication submission (SOP Phase V write path).
//
//   GET  /api/ai-pulse/submit/publication?cycle=<uuid|current>
//        → submit context: cycle, learner's team, existing submission,
//          deadline (ai_pulse_policies.ig_post_deadline_hours vs cycle start),
//          and reach threshold (ai_pulse_policies.ig_reach_threshold).
//
//   POST /api/ai-pulse/submit/publication
//        body: { cycle_id, ig_url, github_url?, app_name? }
//        → verifies the IG URL against ig_posts (must be a post on the
//          learner's OWN department account — friendly error otherwise),
//          reads the latest reach/likes snapshot, and upserts the team's
//          event_submissions row (proof_urls carries the IG permalink).
//
// Auth: session cookie. Permission gate: aiPulse:submit.publication via
// user_has_permission RPC (super-admin bypass inside the RPC) — same shape
// as app/api/ai-pulse/evidence/naac/route.ts.
//
// Service-role usage (deliberate, scoped):
//   - ig_posts / ig_post_metrics / ig_accounts reads — RLS on these tables
//     requires social.instagram.view, which learners do not hold. The route
//     reads ONLY the single post matching the submitted shortcode.
//   - event_submissions upsert — RLS insert/update is owner_id-only, but any
//     ACCEPTED team member may submit for the team per SOP. The route proves
//     membership (event_team_members, status='accepted') BEFORE writing, and
//     writes only to that registration's row for this cycle.
//
// Policy reads (Config Mandate — never hardcoded):
//   ig_post_deadline_hours (24), ig_reach_threshold (500).
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
  extractIgShortcode,
  readPolicyValue,
  resolveAiPulseCycle,
  toExistingSubmissionSummary,
  type IgVerificationResult,
  type PublicationSubmitContext,
} from '@/lib/services/ai-pulse/pulse-impact-service';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'ai-pulse/submit-publication';
const PERMISSION_KEY = 'aiPulse:submit.publication';

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

/** Auth + permission gate. Returns the user or a ready error response. */
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

interface PolicyRow {
  config_key: string;
  value_jsonb: unknown;
}

async function readPolicies(svc: any): Promise<PolicyRow[]> {
  const { data, error } = await svc
    .from('ai_pulse_policies')
    .select('config_key, value_jsonb')
    .eq('is_active', true)
    .in('config_key', ['ig_post_deadline_hours', 'ig_reach_threshold']);
  if (error) {
    logger.error(MODULE, 'failed to read ai_pulse_policies', error);
    return [];
  }
  return (data ?? []) as PolicyRow[];
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

    const [cycle, policies] = await Promise.all([
      resolveAiPulseCycle(svc, cycleParam),
      readPolicies(svc),
    ]);

    const deadlineHours = readPolicyValue<number>(
      policies,
      'ig_post_deadline_hours',
      24
    );
    const reachThreshold = readPolicyValue<number>(
      policies,
      'ig_reach_threshold',
      500
    );

    let team = null;
    let existing = null;
    if (cycle) {
      team = await AiPulseLearnerService.getMyTeam(cycle.id, userId, svc);
      if (team) {
        existing = await getExistingSubmission(svc, cycle.id, team.registration_id);
      }
    }

    const anchor = cycle?.start_date ?? cycle?.demo_date ?? null;
    const response: PublicationSubmitContext = {
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
        ? computeDeadline(anchor, deadlineHours * 60 * 60 * 1000)
        : null,
      policies: {
        ig_post_deadline_hours: deadlineHours,
        ig_reach_threshold: reachThreshold,
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    logger.error(MODULE, 'GET failed', error);
    return NextResponse.json(
      { error: 'Failed to load publication submit context' },
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

    const igUrl = typeof body?.ig_url === 'string' ? body.ig_url.trim() : '';
    const githubUrl =
      typeof body?.github_url === 'string' ? body.github_url.trim() : '';
    const appName =
      typeof body?.app_name === 'string' ? body.app_name.trim() : '';
    const cycleId = typeof body?.cycle_id === 'string' ? body.cycle_id : '';

    const shortcode = extractIgShortcode(igUrl);
    if (!shortcode) {
      return NextResponse.json(
        {
          error:
            'That does not look like an Instagram post link. Paste the full URL of the post or reel (e.g. https://www.instagram.com/p/ABC123/).',
          code: 'INVALID_IG_URL',
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

    const svc = createServiceRoleClient();

    // 1. Cycle — must be a real AI Pulse cycle.
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

    // 2. Team membership — caller must be an ACCEPTED member of a team in
    //    this cycle (this is what authorizes the service-role write below).
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

    // 3. IG verification — the post must exist on a tracked department
    //    account. Poller lag is ~1 hour, so a fresh post may not be here yet.
    const { data: igPost, error: igErr } = await svc
      .from('ig_posts')
      .select(
        'id, permalink, posted_at, ig_media_id, account_id, ig_accounts(id, username, department_id)'
      )
      .ilike('permalink', `%/${shortcode}/%`)
      .limit(1)
      .maybeSingle();

    if (igErr) {
      logger.error(MODULE, 'ig_posts lookup failed', igErr);
      return NextResponse.json(
        { error: 'Could not verify the Instagram post. Try again shortly.' },
        { status: 500 }
      );
    }

    if (!igPost) {
      return NextResponse.json(
        {
          error:
            "We couldn't find this post on any department Instagram account. Two common reasons: (1) the post is on a personal account — publications must be posted on your department's official account; (2) the post went live less than ~1 hour ago — our metrics poller runs hourly, so wait a little and resubmit.",
          code: 'POST_NOT_FOUND',
        },
        { status: 422 }
      );
    }

    const account = (igPost as any).ig_accounts ?? null;

    // 4. Department ownership — post's account must be the learner's own
    //    department account. Learner dept resolves via profiles.learner_id →
    //    learners_profiles.department_id, falling back to profiles.department_id.
    let learnerDeptId: string | null = null;
    const { data: prof } = await svc
      .from('profiles')
      .select('learner_id, department_id')
      .eq('id', userId)
      .maybeSingle();
    learnerDeptId = prof?.department_id ?? null;
    if (prof?.learner_id) {
      const { data: lp } = await svc
        .from('learners_profiles')
        .select('department_id')
        .eq('id', prof.learner_id)
        .maybeSingle();
      if (lp?.department_id) learnerDeptId = lp.department_id;
    }

    let departmentCheck: IgVerificationResult['department_check'] = 'skipped';
    if (learnerDeptId && account?.department_id) {
      if (account.department_id !== learnerDeptId) {
        return NextResponse.json(
          {
            error: `This post is on @${account.username ?? 'another account'}, which is not your department's account. Publications must be posted on your OWN department's official Instagram account.`,
            code: 'WRONG_DEPARTMENT_ACCOUNT',
          },
          { status: 422 }
        );
      }
      departmentCheck = 'ok';
    }

    // 5. Latest reach/likes snapshot (likes live only in the raw JSONB).
    const { data: metric } = await svc
      .from('ig_post_metrics')
      .select('reach, raw, snapshot_at')
      .eq('post_id', (igPost as any).id)
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const reach = typeof metric?.reach === 'number' ? metric.reach : null;
    const rawLikes = metric?.raw ? (metric.raw as any)?.likes : null;
    const likes =
      rawLikes !== null && rawLikes !== undefined && !Number.isNaN(Number(rawLikes))
        ? Number(rawLikes)
        : null;

    // 6. Policies → deadline + reach threshold.
    const policies = await readPolicies(svc);
    const deadlineHours = readPolicyValue<number>(
      policies,
      'ig_post_deadline_hours',
      24
    );
    const reachThreshold = readPolicyValue<number>(
      policies,
      'ig_reach_threshold',
      500
    );
    const anchor = cycle.start_date ?? cycle.demo_date ?? null;
    const deadline = computeDeadline(anchor, deadlineHours * 60 * 60 * 1000);

    // 7. Upsert event_submissions — proof_urls keeps non-IG links and stores
    //    the canonical permalink for the IG entry.
    const existing = await getExistingSubmission(svc, cycle.id, team.registration_id);
    const existingProofs: string[] = Array.isArray(existing?.proof_urls)
      ? existing.proof_urls.filter(Boolean)
      : [];
    const permalink = (igPost as any).permalink as string;
    const proofUrls = [
      ...existingProofs.filter((u) => !/instagram\.com/i.test(u)),
      permalink,
    ];

    const upsertRow: Record<string, unknown> = {
      event_id: cycle.id,
      registration_id: team.registration_id,
      proof_urls: proofUrls,
      submitted_at: new Date().toISOString(),
      submitted_by: userId,
    };
    if (githubUrl) upsertRow.github_url = githubUrl;
    if (appName) upsertRow.app_name = appName;

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

    const ig: IgVerificationResult = {
      matched: true,
      permalink,
      account_username: account?.username ?? null,
      posted_at: (igPost as any).posted_at ?? null,
      reach,
      likes,
      reach_threshold: reachThreshold,
      reach_met: typeof reach === 'number' && reach >= reachThreshold,
      department_check: departmentCheck,
    };

    return NextResponse.json(
      { success: true, late: deadline.is_past, deadline, ig },
      { status: 200 }
    );
  } catch (error) {
    logger.error(MODULE, 'POST failed', error);
    return NextResponse.json(
      { error: 'Failed to submit publication' },
      { status: 500 }
    );
  }
}
