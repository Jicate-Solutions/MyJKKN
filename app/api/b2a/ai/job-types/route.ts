/**
 * B2A — External AI door: the job-type catalogue.
 *
 * GET /api/b2a/ai/job-types                  All job types (admin view)
 * GET /api/b2a/ai/job-types?external_only=1  Only tasks external apps may run
 * GET /api/b2a/ai/job-types?include=prompt   Adds prompt_template to each row
 *
 * WHY THIS EXISTS. The centralized bug reporter currently hardcodes the list of
 * runnable tasks in its own `lib/ai/tasks.ts`, with a comment saying it "mirrors
 * the external_allowed recipes seeded in MyJKKN's ai_job_types". A hand-copied
 * mirror drifts, and it already has: `ops.brief` is external_allowed here and
 * absent there, so no app can see or run it. This endpoint lets the reporter
 * read the real list instead of keeping a copy.
 *
 * READ-ONLY BY DESIGN (for now). Writing job types means defining the prompt a
 * Max-lane worker will execute, which is a materially bigger privilege than
 * enqueueing a pre-approved task. The b2a key is a SINGLE SHARED key: MyJKKN can
 * verify "the reporter is calling" but not *who* is behind it. Until the caller
 * gates an admin surface on its own side, this endpoint only reads. Writes get
 * their own PR, with fn_ai_job_type_upsert / _set_enabled / _delete behind it.
 *
 * Same trusted-caller model as /api/b2a/ai/run and /api/b2a/ai/stats: the
 * reporter holds the single 'ai'-module key.
 *
 * prompt_template is omitted unless asked for. Prompts are long, the catalogue
 * view never needs them, and they are the most sensitive field here — an
 * external-app operator does not need the wording of internal recipes to render
 * a task menu.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { corsHeaders } from '@/lib/api-keys/cors';

const MODULE_KEY = 'ai' as const;
const ENDPOINT = '/api/b2a/ai/job-types';

/**
 * Columns safe to expose to the reporter. Deliberately excludes
 * monthly_spend_cap_inr and daily_cap_per_user (internal budget policy) and
 * created_at/updated_by (internal audit trail).
 */
const BASE_COLUMNS = [
  'job_type',
  'title',
  'description',
  'lane',
  'interactive',
  'enabled',
  'external_allowed',
  'schedulable',
  'provider',
  'model_id',
  'max_inflight',
  'expected_seconds',
  'allow_rule',
  'tool_set',
  'output_target',
  'input_schema',
  'loop_key',
  'updated_at',
].join(', ');

function isTruthy(v: string | null): boolean {
  return v === '1' || v === 'true' || v === 'yes';
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  const authResult = await authenticateApiKey(request, {
    requiredModule: MODULE_KEY,
    requireRead: true,
  });
  if ('error' in authResult) return authResult.error;
  const { context } = authResult;

  const rate = checkRateLimit(context.keyId);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'Retry-After': String(Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }

  const { ipAddress, userAgent } = extractRequestMeta(request);
  const url = new URL(request.url);
  const externalOnly = isTruthy(url.searchParams.get('external_only'));
  const includePrompt = url.searchParams.get('include') === 'prompt';

  const columns = includePrompt ? `${BASE_COLUMNS}, prompt_template` : BASE_COLUMNS;

  try {
    let query = context.supabase
      .from('ai_job_types')
      .select(columns)
      .order('job_type', { ascending: true });

    if (externalOnly) query = query.eq('external_allowed', true);

    const { data, error } = await query;
    if (error) throw error;

    const jobTypes = data ?? [];

    logApiUsage({
      apiKeyId: context.keyId,
      endpoint: ENDPOINT,
      module: MODULE_KEY,
      institutionId: null,
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
    });

    return NextResponse.json(
      {
        job_types: jobTypes,
        total: jobTypes.length,
        external_only: externalOnly,
        includes_prompt: includePrompt,
      },
      { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logApiUsage({
      apiKeyId: context.keyId,
      endpoint: ENDPOINT,
      module: MODULE_KEY,
      institutionId: null,
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
    });
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: `Failed to read the AI job-type catalogue: ${message}`,
        },
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
