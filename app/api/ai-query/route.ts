export const dynamic = 'force-dynamic';
// Max-lane waits long-poll the chat queue (runner box claims every ~2 min).
export const maxDuration = 300;

/**
 * AI Query Route
 * Handles natural language queries using the Max lane.
 *
 * All questions are queued to the Max lane
 * (max_lane_chat_requests -> Windows runner -> answer).
 */

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AIQueryService } from '@/lib/services/ai-query-service';
import type { AIQueryRequest } from '@/types/ai-query';

const MAX_LANE_POLL_MS = 2_500;
const MAX_LANE_UNCLAIMED_DEADLINE_MS = 120_000;
// Long-poll window raised 180s → 285s (2026-07-12) so heavy analytical questions
// (e.g. multi-table profitability) can finish on the Max seat instead of erroring.
// Kept 15s under maxDuration (300s) so the route can still cancel + respond before
// the platform hard-kills the function. Coordinated with the Windows runner's
// per-question SIGKILL budget (225s = this window − ~60s worst-case pickup); the
// two MUST move together — see ai-query-chat.mjs PER_QUESTION_TIMEOUT_MS.
const MAX_LANE_TOTAL_DEADLINE_MS = 285_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Why the Max lane didn't answer */
type MaxLaneMiss = 'offline' | 'busy' | 'slow' | 'error';

const MAX_LANE_MISS_NOTE: Record<MaxLaneMiss, string> = {
  offline: 'ⓘ _The Max lane machine is asleep._',
  busy: 'ⓘ _The Max lane queue is full._',
  slow: 'ⓘ _The Max lane didn’t finish in time._',
  error: 'ⓘ _The Max lane hit an error._',
};

/**
 * Queue one question on the Max lane and wait for the runner's answer.
 * Returns { answer } on success, or { answer: null, miss } for ANY failure
 * (runner offline, queue full, unclaimed too long, runner error, timeout).
 */
async function tryMaxLane(
  supabase: Awaited<ReturnType<typeof createClient>>,
  message: string,
  conversationId: string | undefined,
): Promise<{ answer: string | null; miss?: MaxLaneMiss; requestId?: string }> {
  try {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const { data: req, error: reqError } = await supabase.rpc('fn_max_chat_request', {
      p_message: message,
      p_conversation_id:
        conversationId && uuidRe.test(conversationId) ? conversationId : null,
    });
    if (reqError || !req?.ok || typeof req?.request_id !== 'string') {
      const errText = typeof req?.error === 'string' ? req.error : '';
      if (errText === 'runner offline') return { answer: null, miss: 'offline' };
      if (errText === 'queue full') return { answer: null, miss: 'busy' };
      return { answer: null };
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < MAX_LANE_TOTAL_DEADLINE_MS) {
      await sleep(MAX_LANE_POLL_MS);
      const { data: st, error: stError } = await supabase.rpc('fn_max_chat_status', {
        p_id: req.request_id,
      });
      if (stError || !st || typeof st.status !== 'string') continue;
      if (st.status === 'done') {
        if (typeof st.answer === 'string' && st.answer.trim().length > 0) {
          return { answer: st.answer, requestId: req.request_id };
        }
        return { answer: null, miss: 'error' };
      }
      if (st.status === 'error') return { answer: null, miss: 'error' };
      if (st.status === 'not_found') return { answer: null, miss: 'error' };
      if (st.status === 'pending' && Date.now() - startedAt > MAX_LANE_UNCLAIMED_DEADLINE_MS) {
        break;
      }
    }

    await supabase.rpc('fn_max_chat_cancel', { p_id: req.request_id });
    return { answer: null, miss: 'slow' };
  } catch (err) {
    console.error('[ai-query] max-lane attempt threw:', err);
    return { answer: null, miss: 'error' };
  }
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
  const { error } = await supabase.rpc('fn_max_chat_ack', { p_ids: ids });
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
  const { data, error } = await supabase.rpc('fn_max_chat_inbox');
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

    const { answer: maxAnswer, miss, requestId: maxRequestId } =
      await tryMaxLane(supabase, message, conversation_id);

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
        message: {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: maxAnswer,
          timestamp: new Date().toISOString(),
          toolCalls: toolsCalled.map(name => ({ name, status: 'completed' })),
        },
        suggestions: getContextAwareSuggestions(toolsCalled),
        rate_limit: rateLimit,
      });
    }

    const errorMessage = miss ? MAX_LANE_MISS_NOTE[miss] : 'The Max lane is currently unavailable.';
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
