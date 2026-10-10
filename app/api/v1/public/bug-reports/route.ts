/**
 * POST /api/v1/public/bug-reports — bug reports from the college apps.
 *
 * The five sibling apps (Mentor, TMS, COE, Library, Event Forms) carry the
 * @boobalan_jkkn/bug-reporter-sdk button. Pointing its two settings (API URL
 * and API key) at MyJKKN sends their reports here, into bug_reports. This
 * route speaks the SDK's contract exactly, as served by the central reporter
 * (Jicate-Solutions/BugReporter app/api/v1/public/bug-reports/route.ts):
 *   - header `X-API-Key: <key>` (not Authorization: Bearer)
 *   - JSON body: title, description, page_url, category, screenshot_data_url,
 *     console_logs, network_trace, metadata, reporter_email, reporter_name, …
 *   - 201 `{ success: true, data: { bug_report, message } }`
 *   - failure `{ success: false, error: { code, message } }` — the SDK shows
 *     error.message in its toast
 *
 * THE KEY IS PUBLIC. The SDK reads it from a NEXT_PUBLIC_ variable, so it is
 * in every visitor's browser. This route therefore accepts ONLY a key of kind
 * 'bug_intake' (migration 20271010120000), which can do nothing else anywhere:
 * authenticateApiKey (b2a) and the older key routes refuse it. An admin key —
 * including the apps' MYJKKN_API_KEY values, which read learner data — is
 * refused here, so it never needs to sit in a browser.
 *
 * Because the key is public, everything in the body is a CLAIM. The reporter's
 * email is matched to a profile so the bug lands in that person's "My bug
 * reports", but metadata.reporter_verified is false, and the response never
 * says whether the email matched.
 *
 * module_name on bug_reports is a GENERATED column (computed from page_url,
 * 20260906213000) and cannot be written. The app a bug came from is in
 * application_id (→ sibling_apps.id) and metadata.source_app / source_app_name.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { extractRequestMeta, logApiUsage } from '@/lib/api-keys/audit-logger';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  BUG_REPORTS_BUCKET,
  MAX_BODY_CHARS,
  MAX_SCREENSHOT_BYTES,
  decodeScreenshot,
  intakeCorsHeaders,
  likeLiteral,
  type DecodedScreenshot,
} from '@/lib/bug-reports/sibling-intake';

const LOG_MODULE = 'bug-reports/intake';
const ENDPOINT = '/api/v1/public/bug-reports';

const MAX_CONSOLE_LOGS = 200;
const MAX_NETWORK_TRACE = 50;
const MAX_CLIENT_METADATA_CHARS = 20_000;

const bodySchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(300),
  description: z.string().trim().min(10, 'description must be at least 10 characters').max(20_000),
  page_url: z.string().trim().url('page_url must be a valid URL').max(2_000),
  category: z
    .enum(['bug', 'feature_request', 'ui_design', 'performance', 'security', 'other'])
    .optional()
    .default('bug'),
  screenshot_data_url: z.string().optional().nullable(),
  console_logs: z.array(z.any()).optional().nullable(),
  network_trace: z.array(z.any()).optional().nullable(),
  metadata: z.record(z.any()).optional().nullable(),
  reporter_email: z.string().trim().max(320).optional().nullable(),
  reporter_name: z.string().trim().max(200).optional().nullable(),
  browser_info: z.any().optional(),
  system_info: z.any().optional(),
  attachments: z.array(z.any()).optional().nullable(),
});

function fail(code: string, message: string, status: number, extraHeaders?: Record<string, string>) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { ...intakeCorsHeaders, ...extraHeaders } }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: intakeCorsHeaders });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const { ipAddress, userAgent } = extractRequestMeta(request);

  // ── 1. Key: present, the bug-intake shape, and a live bug_intake row ──────
  const apiKey = (request.headers.get('x-api-key') ?? '').trim();
  if (!apiKey) {
    return fail('UNAUTHORIZED', 'API key is required. Send it in the X-API-Key header.', 401);
  }
  if (!apiKey.startsWith('jkkn_bi_')) {
    // Admin keys (jkkn_…), personal keys (jkkn_pk_…) and anything else: no
    // lookup at all. Only a bug-intake key may be used from a browser.
    return fail('UNAUTHORIZED', 'This endpoint accepts only a bug-intake key.', 401);
  }

  const supabase = createServiceRoleClient();
  const hashedKey = createHash('sha256').update(apiKey).digest('hex');

  const { data: keyRow, error: keyError } = await supabase
    .from('api_keys')
    .select('id, is_active, expires_at, key_kind, sibling_app_id')
    .eq('key_value', hashedKey)
    .eq('is_active', true)
    .maybeSingle();

  if (keyError || !keyRow) {
    return fail('UNAUTHORIZED', 'Invalid or inactive API key.', 401);
  }
  if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
    return fail('UNAUTHORIZED', 'API key has expired.', 401);
  }
  if (keyRow.key_kind !== 'bug_intake' || !keyRow.sibling_app_id) {
    return fail('FORBIDDEN', 'This key cannot submit bug reports.', 403);
  }

  const { data: app, error: appError } = await supabase
    .from('sibling_apps')
    .select('id, slug, name, is_active')
    .eq('id', keyRow.sibling_app_id)
    .maybeSingle();

  if (appError || !app || app.is_active !== true) {
    return fail('FORBIDDEN', 'The app this key belongs to is not accepting bug reports.', 403);
  }

  // ── 2. Rate limit: per key AND per caller, since the key itself is public ─
  const rate = checkRateLimit(`bug-intake:${keyRow.id}:${ipAddress ?? 'unknown'}`);
  if (!rate.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000));
    return fail('RATE_LIMITED', 'Too many bug reports. Please try again in a minute.', 429, {
      'Retry-After': String(retryAfter),
    });
  }

  const audit = (statusCode: number) =>
    logApiUsage({
      apiKeyId: keyRow.id,
      endpoint: ENDPOINT,
      module: 'bug-reports',
      institutionId: null,
      statusCode,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
    });

  // ── 3. Body: size cap, JSON, schema, screenshot ──────────────────────────
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BODY_CHARS) {
    audit(413);
    return fail('PAYLOAD_TOO_LARGE', 'The report is too large. Try a smaller screenshot.', 413);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    audit(400);
    return fail('INVALID_REQUEST', 'Could not read the request body.', 400);
  }
  if (raw.length > MAX_BODY_CHARS) {
    audit(413);
    return fail('PAYLOAD_TOO_LARGE', 'The report is too large. Try a smaller screenshot.', 413);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    audit(400);
    return fail('INVALID_JSON', 'The request body is not valid JSON.', 400);
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    audit(400);
    return fail(
      'VALIDATION_ERROR',
      parsed.error.errors.map((e) => `${e.path.join('.') || 'body'}: ${e.message}`).join('; '),
      400
    );
  }
  const body = parsed.data;

  let screenshot: DecodedScreenshot | null = null;
  if (body.screenshot_data_url) {
    const decoded = decodeScreenshot(body.screenshot_data_url);
    if (decoded === 'too_large') {
      audit(413);
      return fail(
        'PAYLOAD_TOO_LARGE',
        `The screenshot is larger than ${MAX_SCREENSHOT_BYTES / (1024 * 1024)} MB.`,
        413
      );
    }
    if (decoded === 'invalid') {
      audit(400);
      return fail('VALIDATION_ERROR', 'screenshot_data_url must be a base64 PNG, JPEG or WebP data URL.', 400);
    }
    screenshot = decoded;
  }

  // ── 4. Reporter: match the claimed email to a profile, if exactly one ─────
  const reporterEmail = body.reporter_email ? body.reporter_email.toLowerCase() : null;
  let reporterUserId: string | null = null;
  let institutionId: string | null = null;
  let departmentId: string | null = null;

  if (reporterEmail && reporterEmail.includes('@')) {
    const { data: matches, error: profileError } = await supabase
      .from('profiles')
      .select('id, institution_id, department_id')
      .ilike('email', likeLiteral(reporterEmail))
      .limit(2);

    if (profileError) {
      logger.warn(LOG_MODULE, 'Reporter profile lookup failed; filing without a reporter', profileError);
    } else if (matches && matches.length === 1) {
      reporterUserId = matches[0].id;
      institutionId = matches[0].institution_id ?? null;
      departmentId = matches[0].department_id ?? null;
    }
  }

  // ── 5. Insert (display_id comes from the set_bug_display_id trigger) ──────
  const clientMetadata =
    body.metadata && JSON.stringify(body.metadata).length <= MAX_CLIENT_METADATA_CHARS
      ? body.metadata
      : null;

  const report = {
    application_id: app.id,
    reporter_user_id: reporterUserId,
    institution_id: institutionId,
    department_id: departmentId,
    page_url: body.page_url,
    description: body.description,
    category: body.category,
    status: 'new',
    console_logs: body.console_logs ? body.console_logs.slice(-MAX_CONSOLE_LOGS) : null,
    reporter_user_agent: userAgent,
    metadata: {
      source: 'sibling_app',
      source_app: app.slug,
      source_app_name: app.name,
      sibling_app_id: app.id,
      title: body.title,
      reporter_email: reporterEmail,
      reporter_name: body.reporter_name || null,
      // The key is public: who sent this is a claim, never a proof.
      reporter_verified: false,
      browser_info: body.browser_info ?? (clientMetadata?.userAgent as string | undefined) ?? null,
      system_info: body.system_info ?? null,
      viewport: (clientMetadata?.viewport as string | undefined) ?? null,
      screen_resolution: (clientMetadata?.screenResolution as string | undefined) ?? null,
      client_timestamp: (clientMetadata?.timestamp as string | undefined) ?? null,
      client_metadata: clientMetadata,
      network_trace: body.network_trace ? body.network_trace.slice(-MAX_NETWORK_TRACE) : null,
      // File attachments from the SDK are not stored yet (Phase B).
      attachments_received: body.attachments?.length ?? 0,
    },
  };

  let created: Record<string, any> | null = null;
  let insertError: { message: string } | null = null;
  for (let attempt = 1; attempt <= 3 && !created; attempt++) {
    const result = await supabase.from('bug_reports').insert(report).select().single();
    if (!result.error) {
      created = result.data;
      insertError = null;
      break;
    }
    insertError = result.error;
    // Same race the signed-in intake retries: two inserts drew one display_id.
    if (!insertError.message.includes('bug_reports_display_id_key')) break;
    await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
  }

  if (!created) {
    logger.error(LOG_MODULE, 'Insert failed', insertError);
    audit(500);
    return fail('INTERNAL_ERROR', 'Could not save the bug report. Please try again.', 500);
  }

  // ── 6. Screenshot: same bucket and path shape as the signed-in intake ─────
  let screenshotUrl: string | null = null;
  if (screenshot) {
    const path = `${created.id}/screenshot.${screenshot.ext}`;
    const { error: uploadError } = await supabase.storage
      .from(BUG_REPORTS_BUCKET)
      .upload(path, screenshot.buffer, { contentType: screenshot.contentType, upsert: false });

    if (uploadError) {
      // The report is still useful without its picture; keep it.
      logger.warn(LOG_MODULE, 'Screenshot upload failed; report kept without it', uploadError);
    } else {
      const { data: publicData } = supabase.storage.from(BUG_REPORTS_BUCKET).getPublicUrl(path);
      const { error: updateError } = await supabase
        .from('bug_reports')
        .update({ screenshot_url: publicData.publicUrl })
        .eq('id', created.id);
      if (updateError) {
        logger.warn(LOG_MODULE, 'Could not store screenshot_url', updateError);
      } else {
        screenshotUrl = publicData.publicUrl;
      }
    }
  }

  audit(201);

  // Only what the reporter already knows, plus the id and display_id. Never
  // reporter_user_id: that would tell any caller whether an email has a
  // MyJKKN account.
  return NextResponse.json(
    {
      success: true,
      data: {
        bug_report: {
          id: created.id,
          display_id: created.display_id ?? null,
          title: body.title,
          description: created.description,
          category: created.category,
          status: created.status,
          page_url: created.page_url,
          screenshot_url: screenshotUrl,
          created_at: created.created_at,
        },
        message: 'Bug report submitted successfully. Thank you for your report!',
      },
    },
    { status: 201, headers: intakeCorsHeaders }
  );
}
