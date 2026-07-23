export const dynamic = 'force-dynamic';
// Waits long-poll the ai_jobs chat queue (scoped Windows drain claims ~every min).
export const maxDuration = 300;

/**
 * AI Query Route
 * Handles natural language questions via the scoped AI-jobs chat lane.
 *
 * Each question is enqueued as an `ai_query.chat` job (fn_ai_enqueue) and the
 * Windows chat drain answers it AS the requesting user (a per-user scoped session,
 * auth.uid()-gated tools) — so a user only ever sees their own institution's data.
 * fn_ai_enqueue also enforces access (allow_rule permission:ai_query.view) and the
 * configurable per-person daily cap. No paid fallback: if the seat can't answer,
 * the user is told to try again later.
 */

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AIQueryService } from '@/lib/services/ai-query-service';
import type { AIQueryRequest, ArtifactRef, ArtifactType } from '@/types/ai-query';

const ARTIFACT_TYPES: ArtifactType[] = ['chart', 'report', 'spreadsheet', 'slides'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate + narrow the artifact refs the drain put in ai_jobs.result.artifacts.
 *  The drain stores the real rows (owner-bound) via fn_ai_create_artifact; this
 *  is a defensive shape-check before the refs reach the client. Content is NOT
 *  carried here — the panel fetches it lazily (owner-scoped) via fn_ai_get_artifact. */
function sanitizeArtifacts(raw: unknown): ArtifactRef[] {
  if (!Array.isArray(raw)) return [];
  const out: ArtifactRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    if (typeof a.id !== 'string' || !UUID_RE.test(a.id)) continue;
    if (typeof a.type !== 'string' || !ARTIFACT_TYPES.includes(a.type as ArtifactType)) continue;
    out.push({
      id: a.id,
      type: a.type as ArtifactType,
      title: typeof a.title === 'string' ? a.title : null,
      is_sensitive: a.is_sensitive === true,
    });
    if (out.length >= 10) break;
  }
  return out;
}

const MAX_LANE_POLL_MS = 2_500;
const MAX_LANE_UNCLAIMED_DEADLINE_MS = 120_000;
// Long-poll window raised 180s → 285s (2026-07-12) so heavy analytical questions
// (e.g. multi-table profitability) can finish on the Max seat instead of erroring.
// Kept 15s under maxDuration (300s) so the route can still cancel + respond before
// the platform hard-kills the function. Coordinated with the Windows chat drain's
// per-question SIGKILL budget (225s = this window − ~60s worst-case pickup); the
// two MUST move together — see the ai-jobs chat drain PER_QUESTION_TIMEOUT_MS.
const MAX_LANE_TOTAL_DEADLINE_MS = 285_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Why the scoped chat lane didn't answer. 'forbidden'/'capped' are pre-flight
 *  rejections (access / daily cap) surfaced with their own HTTP status; the rest
 *  are runtime misses shown inline with a note. */
type MaxLaneMiss = 'offline' | 'busy' | 'slow' | 'error' | 'forbidden' | 'capped';

const MAX_LANE_MISS_NOTE: Record<'offline' | 'busy' | 'slow' | 'error', string> = {
  offline: 'ⓘ _The AI Assistant is temporarily offline. Please try again in a little while._',
  busy: 'ⓘ _You already have questions in progress. Please wait for those to finish._',
  slow: 'ⓘ _The AI Assistant didn’t finish in time. Please try again._',
  error: 'ⓘ _The AI Assistant hit an error. Please try again._',
};

/**
 * Enqueue one question on the scoped ai_jobs chat lane and wait for the drain's
 * answer. Returns { answer } on success, or { answer: null, miss } for ANY
 * failure. 'forbidden' (no access) and 'capped' (daily limit) are pre-flight
 * rejections carrying { cap, used } for the caller's message.
 */
type ChatResult = {
  answer: string | null;
  miss?: MaxLaneMiss;
  requestId?: string;
  cap?: number;
  used?: number;
  elapsedMs?: number;
  artifacts?: ArtifactRef[];
};

/** One enqueue + poll attempt on the scoped ai_jobs chat lane. */
async function scopedChatOnce(
  supabase: Awaited<ReturnType<typeof createClient>>,
  message: string,
  conversationId: string | undefined,
): Promise<ChatResult> {
  try {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const { data: enq, error: enqError } = await supabase.rpc('fn_ai_enqueue', {
      p_job_type: 'ai_query.chat',
      p_payload: {
        message,
        conversation_id:
          conversationId && uuidRe.test(conversationId) ? conversationId : null,
      },
    });
    if (enqError || !enq?.ok || typeof enq?.job_id !== 'string') {
      const errText = typeof enq?.error === 'string' ? enq.error : '';
      // Feature off (ai_query.chat disabled) — treat as "unavailable, try later".
      if (errText === 'unknown or disabled job_type') return { answer: null, miss: 'offline' };
      if (errText === 'not allowed for this job_type') return { answer: null, miss: 'forbidden' };
      if (errText === 'daily limit reached') {
        return { answer: null, miss: 'capped', cap: enq?.cap, used: enq?.used };
      }
      if (errText === 'too many in-flight jobs of this type') return { answer: null, miss: 'busy' };
      return { answer: null, miss: 'error' };
    }

    const jobId = enq.job_id;
    const startedAt = Date.now();
    while (Date.now() - startedAt < MAX_LANE_TOTAL_DEADLINE_MS) {
      await sleep(MAX_LANE_POLL_MS);
      const { data: st, error: stError } = await supabase.rpc('fn_ai_job_status', {
        p_job_id: jobId,
      });
      if (stError || !st || typeof st.status !== 'string') continue;
      if (st.status === 'done') {
        const result =
          st.result && typeof st.result === 'object'
            ? (st.result as { answer?: unknown; artifacts?: unknown })
            : null;
        const answer = result ? result.answer : null;
        if (typeof answer === 'string' && answer.trim().length > 0) {
          return { answer, requestId: jobId, artifacts: sanitizeArtifacts(result?.artifacts) };
        }
        return { answer: null, miss: 'error' };
      }
      if (st.status === 'error' || st.status === 'canceled' || st.status === 'not_found') {
        return { answer: null, miss: 'error' };
      }
      if (st.status === 'pending' && Date.now() - startedAt > MAX_LANE_UNCLAIMED_DEADLINE_MS) {
        break;
      }
    }

    await supabase.rpc('fn_ai_job_cancel', { p_job_id: jobId });
    return { answer: null, miss: 'slow' };
  } catch (err) {
    console.error('[ai-query] scoped-chat attempt threw:', err);
    return { answer: null, miss: 'error' };
  }
}

/**
 * Enqueue one question and wait for the answer, with a single QUIET RETRY on a
 * transient miss (a timeout or a runner error — NOT on access/cap/busy, which are
 * deterministic). Reports elapsedMs (total user-perceived time) on success so the
 * UI can show how long it took next to the "max lane" badge.
 */
async function tryScopedChat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  message: string,
  conversationId: string | undefined,
): Promise<ChatResult> {
  const t0 = Date.now();
  let r = await scopedChatOnce(supabase, message, conversationId);
  if (r.answer === null && (r.miss === 'error' || r.miss === 'slow')) {
    // A one-off model-loop timeout (seen in the pilot) usually succeeds on retry.
    r = await scopedChatOnce(supabase, message, conversationId);
  }
  if (r.answer !== null) r.elapsedMs = Date.now() - t0;
  return r;
}

/**
 * PATCH route — acknowledge delivery of rendered Max answers.
 * Body: { ack_ids: uuid[] }. Called by the client only AFTER the answers are
 * on screen (inbox restores and live deliveries alike); the RPC is
 * requester-scoped so users can only ack their own rows. Idempotent.
 */
export async function PATCH(request: NextRequest) {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Please log in to continue.' } },
      { status: 401 },
    );
  }
  let body: { ack_ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = Array.isArray(body.ack_ids)
    ? body.ack_ids.filter((v): v is string => typeof v === 'string' && uuidRe.test(v)).slice(0, 50)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: 'ack_ids required' }, { status: 400 });
  }
  const { error } = await supabase.rpc('fn_ai_job_ack', { p_ids: ids });
  if (error) {
    console.error('[ai-query] ack failed:', error.message);
    return NextResponse.json({ ok: false, error: 'ack failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * GET route — the Max-lane "while you were away" inbox.
 * PURE READ (idempotent — safe under prefetch/retries): returns finished,
 * still-unacknowledged Max answers for the CALLER (the RPC is requester-
 * scoped; users who never ride the Max lane simply get []). Delivery is
 * stamped only by the PATCH ack after the client has rendered the answers.
 */
export async function GET() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Please log in to continue.' } },
      { status: 401 },
    );
  }
  const { data, error } = await supabase.rpc('fn_ai_chat_inbox');
  if (error) {
    return NextResponse.json({ inbox: [] });
  }
  return NextResponse.json({ inbox: Array.isArray(data) ? data : [] });
}

function getContextAwareSuggestions(toolsCalled: string[]): string[] {
  // Module-specific suggestions
  const suggestionsByModule: Record<string, string[]> = {
    admissions: [
      'Show admission statistics by institution',
      'List pending admission applications',
      'Show admissions from Salem district',
      'Get admission analytics and trends',
      'Show admissions by community breakdown',
      'List first-year admissions',
      'Show hostel accommodation requests',
      'Show top 5 consultants and their referrals',
      'List consultants with their programs and locations',
      'Get consultant performance analytics',
    ],
    academic: [
      'Show learners with participation below 75%',
      'Get learning participation summary by department',
      'Show today\'s participation status',
      'List sections with low participation',
      'Get department-wise participation trends',
    ],
    billing: [
      'List fee defaulters',
      'Show pending bills summary',
      'Get billing statistics by department',
      'Show overdue payments',
      'List partially paid bills',
    ],
    learners: [
      'Get department-wise learner count',
      'Show learners by status',
      'List learners from specific district',
      'Get learner demographics summary',
      'Show section-wise learner distribution',
    ],
    staff: [
      'List facilitators by department',
      'Show facilitator count by category',
      'Get facilitator details',
      'List active facilitators',
    ],
    organization: [
      'Show institution hierarchy',
      'List all departments',
      'Get program-wise summary',
      'Show organization structure',
    ],
    dashboard: [
      'Get KPI summary',
      'Show analytics overview',
      'Get institution performance metrics',
      'Show key statistics',
    ],
  };

  const toolModuleMap: Record<string, string> = {
    get_admissions: 'admissions',
    get_admission_details: 'admissions',
    get_admissions_by_location: 'admissions',
    get_admission_statistics: 'admissions',
    get_admission_analytics: 'admissions',
    get_admission_referrers: 'admissions',
    get_attendance: 'academic',
    get_attendance_summary: 'academic',
    get_attendance_defaulters: 'academic',
    get_student_bills: 'billing',
    get_fee_defaulters: 'billing',
    get_bills_summary: 'billing',
    get_students: 'learners',
    get_student_details: 'learners',
    get_students_by_department: 'learners',
    get_students_summary: 'learners',
    get_learners_by_location: 'learners',
    get_learners_comprehensive: 'learners',
    get_staff: 'staff',
    get_staff_details: 'staff',
    get_staff_by_department: 'staff',
    get_hierarchy_summary: 'organization',
    get_departments: 'organization',
    get_institutions: 'organization',
    get_kpi_summary: 'dashboard',
    get_analytics_overview: 'dashboard',
  };

  const queriedModulesSet = new Set<string>();
  for (const tool of toolsCalled) {
    const moduleName = toolModuleMap[tool];
    if (moduleName) {
      queriedModulesSet.add(moduleName);
    }
  }
  const queriedModules = Array.from(queriedModulesSet);

  const suggestions: string[] = [];
  for (const queriedModule of queriedModules) {
    const moduleSuggestions = suggestionsByModule[queriedModule] || [];
    suggestions.push(...moduleSuggestions.slice(0, 3));
  }

  if (suggestions.length > 0) {
    for (let i = suggestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [suggestions[i], suggestions[j]] = [suggestions[j], suggestions[i]];
    }
    return suggestions.slice(0, 4);
  }

  return [
    'Show me learning participation defaulters',
    'List fee defaulters',
    'Get KPI summary',
    'Show department-wise learner count',
  ];
}

export async function POST(request: NextRequest) {
  await connection();
  const startTime = Date.now();
  const toolsCalled: string[] = [];

  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Please log in to continue.' } },
        { status: 401 }
      );
    }

    AIQueryService.initialize(supabase as any);

    const body: AIQueryRequest = await request.json();
    const { message, conversation_id } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'Message is required' } },
        { status: 400 }
      );
    }

    const rateLimit = await AIQueryService.checkRateLimit(user.id);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please wait a moment.',
            reset_at: rateLimit.reset_at
          }
        },
        { status: 429 }
      );
    }

    const userContext = await AIQueryService.getUserContext(user.id);
    if (!userContext) {
      return NextResponse.json(
        { error: { code: 'CONTEXT_ERROR', message: 'Failed to get user context' } },
        { status: 500 }
      );
    }

    await AIQueryService.incrementQueryCount(user.id);

    const { answer: maxAnswer, miss, requestId: maxRequestId, cap, used, elapsedMs, artifacts: maxArtifacts } =
      await tryScopedChat(supabase, message, conversation_id);

    if (maxAnswer !== null) {
      toolsCalled.push('max_lane');
      await AIQueryService.logQuery({
        userId: user.id,
        institutionId: userContext.institution_ids?.[0],
        queryText: message,
        queryType: 'data_query',
        toolsCalled,
        responseTimeMs: Date.now() - startTime,
        success: true,
        ipAddress,
        userAgent,
      });

      return NextResponse.json({
        conversation_id: conversation_id || crypto.randomUUID(),
        max_request_id: maxRequestId,
        response_ms: elapsedMs,
        message: {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: maxAnswer,
          timestamp: new Date().toISOString(),
          toolCalls: toolsCalled.map(name => ({ name, status: 'completed' })),
        },
        artifacts: maxArtifacts ?? [],
        suggestions: getContextAwareSuggestions(toolsCalled),
        rate_limit: rateLimit,
      });
    }

    // Pre-flight rejections carry their own HTTP status.
    if (miss === 'forbidden') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'You don’t have access to the AI Assistant. Ask an administrator to grant it.' } },
        { status: 403 }
      );
    }
    if (miss === 'capped') {
      const capMsg =
        typeof cap === 'number'
          ? `You’ve reached today’s limit of ${cap} questions. Please try again tomorrow.`
          : 'You’ve reached today’s question limit. Please try again tomorrow.';
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: capMsg, cap, used } },
        { status: 429 }
      );
    }

    const errorMessage =
      miss && miss in MAX_LANE_MISS_NOTE
        ? MAX_LANE_MISS_NOTE[miss as 'offline' | 'busy' | 'slow' | 'error']
        : 'The AI Assistant is currently unavailable.';
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: errorMessage } },
      { status: 500 }
    );

  } catch (error) {
    console.error('[ai-query] Route error:', error);
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' } },
      { status: 500 }
    );
  }
}
