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
 * 'bug_intake' (migration 20271010151437), which can do nothing else anywhere:
 * authenticateApiKey (b2a) and the older key routes refuse it. An admin key —
 * including the apps' MYJKKN_API_KEY values, which read learner data — is
 * refused here, so it never needs to sit in a browser.
 *
 * Because the key is public, everything in the body is a CLAIM. The reporter's
 * email and name are stored in metadata only (reporter_verified: false). They
 * are never matched to a MyJKKN profile: reporter_user_id, institution_id and
 * department_id stay NULL, so nobody can plant a bug in a colleague's "My bug
 * reports" or their institution's queue by typing that colleague's email.
 * Linking a sibling bug to a person waits for a server-signed identity from
 * the app. This route is submit-only; there are no read routes for this key.
 *
 * Abuse limits, in this order:
 *   1. per-IP rate limit before any lookup (sibling-intake-auth.ts; in-memory)
 *   2. double-submit guard: metadata.intake_dedup_key hashes app, caller,
 *      reporter email, page, title, description and a DUPLICATE_WINDOW_MS
 *      window; the lookup checks this window and the previous one, so a
 *      repeat is caught for 2 to 4 minutes. It is answered with the bug
 *      already filed, before any cap, so a genuine retry is never refused. The unique index uq_bug_reports_intake_dedup
 *      makes two simultaneous submits collide, and the loser returns the winner.
 *   3. OVER-CAP IS KEPT, NOT REFUSED. Past the per-caller cap
 *      (MAX_REPORTS_PER_IP_PER_APP_PER_DAY, on metadata.client_ip_hash; IPv6
 *      grouped by /64) or the per-app cap (MAX_REPORTS_PER_APP_PER_DAY), a
 *      report is still filed, flagged metadata.over_cap, without its
 *      screenshot, and a warning is logged. These rows reach nothing automated
 *      (quarantine, below), so a flood can never silence real reporters; the
 *      caps only bound storage.
 *   4. hard ceiling (HARD_CEILING_PER_APP_PER_DAY): only past this is a report
 *      refused (429), to bound storage under a sustained flood.
 * The counts fail CLOSED (503) if the database cannot answer. They are SOFT:
 * count, then insert, so a parallel burst can pass one by a few.
 * The caller hash is an HMAC keyed by BUG_INTAKE_IP_PEPPER; without it the
 * route answers 503 (not configured) rather than store a reversible hash.
 *
 * QUARANTINE. Every row is filed with status 'unverified', because its text
 * came in on a public key and may be written to steer an AI. No automated
 * consumer reads that status: fn_bug_cluster_scan clusters only
 * status IN ('new','seen','in_progress') (20261222000000), so neither
 * fn_bug_auto_resolve_scan nor the Max-lane cluster fixers
 * (bug-cluster-fix / bug-cluster-fixability, which take cluster members)
 * ever see it; /fixmyjkkn and the bug-tab AI producer (#4323) also skip rows
 * with an application_id; the export, bulk status updates, the AI buttons and
 * the assistant's ai_rpc_bug_reports / ai_rpc_bug_report_details skip it too.
 * It appears only under All (status = unverified); an admin promotes it to
 * 'new' by hand after reading it, and only then does the normal pipeline apply.
 *
 * module_name on bug_reports is a GENERATED column (computed from page_url,
 * 20260906213000) and cannot be written. The app a bug came from is in
 * application_id (→ sibling_apps.id) and metadata.source_app / source_app_name.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createHash, createHmac, randomUUID } from 'crypto';
import { z } from 'zod';
import { extractRequestMeta, logApiUsage } from '@/lib/api-keys/audit-logger';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  BUG_REPORTS_BUCKET,
  MAX_BODY_CHARS,
  MAX_SCREENSHOT_BYTES,
  decodeScreenshot,
  intakeCorsHeaders,
  normalizeReporterEmail,
  type DecodedScreenshot,
} from '@/lib/bug-reports/sibling-intake';
import { authenticateIntakeKey, intakeClientIp, intakeFail as fail } from '@/lib/bug-reports/sibling-intake-auth';

const LOG_MODULE = 'bug-reports/intake';
const ENDPOINT = '/api/v1/public/bug-reports';

const MAX_CONSOLE_LOGS = 200;
const MAX_NETWORK_TRACE = 50;
const MAX_CLIENT_METADATA_CHARS = 20_000;
const MAX_REPORTS_PER_APP_PER_DAY = 300;
// A whole campus can sit behind one NAT address, so this is per app and
// generous; the app cap above is the real ceiling.
const MAX_REPORTS_PER_IP_PER_APP_PER_DAY = 40;
// Screenshots are up to 3 MB each. Past this many in a day, a report is still
// filed but its screenshot is not stored (metadata.screenshot_dropped).
const MAX_SCREENSHOTS_PER_APP_PER_DAY = 100;
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
// Refuse only past this many reports per app per day (storage bound).
const HARD_CEILING_PER_APP_PER_DAY = 2000;

/** The caller key for caps and dedup: IPv4 as is, IPv6 grouped by its /64. */
function callerKeyFromIp(ip: string): string {
  if (!ip.includes(':')) return ip;
  const head = ip.split('::')[0].split(':').filter(Boolean);
  // A '::' inside the first four groups means the rest of the /64 is zeros.
  while (head.length < 4) head.push('0');
  return `${head.slice(0, 4).join(':').toLowerCase()}::/64`;
}

const bodySchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(300),
  description: z.string().trim().min(10, 'description must be at least 10 characters').max(20_000),
  // https only: admin screens and exports render it as a link, and module_name
  // is computed from it. javascript:, data:, file: and http: are refused.
  page_url: z
    .string()
    .trim()
    .url('page_url must be a valid URL')
    .max(2_000)
    .refine((u) => u.toLowerCase().startsWith('https://'), 'page_url must be an https:// address'),
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

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: intakeCorsHeaders });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const { userAgent } = extractRequestMeta(request);
  const ipAddress = intakeClientIp(request);

  // ── 1–2. Key (live bug_intake row, active app) and rate limit ────────────
  // lib/bug-reports/sibling-intake-auth.ts
  const auth = await authenticateIntakeKey(request, {
    rateLimitBucket: 'bug-intake',
    rateLimitedMessage: 'Too many bug reports. Please try again in a minute.',
    ipAddress,
  });
  if ('response' in auth) return auth.response;
  const { app, supabase, keyId } = auth;

  const audit = (statusCode: number) =>
    logApiUsage({
      apiKeyId: keyId,
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

  const reporterEmail = normalizeReporterEmail(body.reporter_email);

  // ── 4. Double-submit guard, then the daily caps (see the header) ─────────
  const sha = (text: string) => createHash('sha256').update(text).digest('hex');
  const windowNo = Math.floor(Date.now() / DUPLICATE_WINDOW_MS);
  // The caller, as a keyed hash: a plain sha256 of app + IPv4 could be reversed
  // by trying all 2^32 addresses. Keyed ONLY by BUG_INTAKE_IP_PEPPER (its own
  // secret, so rotating another key never resets the caps); missing → 503.
  const pepper = process.env.BUG_INTAKE_IP_PEPPER;
  if (!pepper) {
    logger.error(LOG_MODULE, 'BUG_INTAKE_IP_PEPPER is not set; refusing intake');
    audit(503);
    return fail('UNAVAILABLE', 'Bug reports are not accepted here yet. Please try again later.', 503);
  }
  const clientIpHash = ipAddress
    ? createHmac('sha256', pepper).update(`${app.id}:${callerKeyFromIp(ipAddress)}`).digest('hex')
    : null;
  // With no platform IP (off Vercel), strangers must not be merged or share a
  // cap: the double-submit check and the per-caller cap are skipped.
  const dedupKey = (win: number) =>
    sha(
      [app.id, clientIpHash ?? '', reporterEmail ?? '', body.page_url, body.title, body.description, String(win)].join(
        '\u0000'
      )
    );
  const currentKey = dedupKey(windowNo);

  const answer = (bug: Record<string, any>, status: number) => {
    audit(status);
    return NextResponse.json(
      {
        success: true,
        data: {
          bug_report: {
            id: bug.id,
            display_id: bug.display_id ?? null,
            title: body.title,
            description: bug.description,
            category: bug.category,
            status: bug.status,
            page_url: bug.page_url,
            // The caller sent this screenshot itself; never echo a stored URL.
            screenshot_url: null,
            created_at: bug.created_at,
          },
          message: 'Bug report submitted successfully. Thank you for your report!',
        },
      },
      { status, headers: intakeCorsHeaders }
    );
  };
  const DEDUP_SELECT = 'id, display_id, description, category, status, page_url, screenshot_url, created_at';

  const { data: recent, error: recentError } = clientIpHash
    ? await supabase
        .from('bug_reports')
        .select(DEDUP_SELECT)
        .eq('application_id', app.id)
        .eq('metadata->>source', 'sibling_app')
        .in('metadata->>intake_dedup_key', [currentKey, dedupKey(windowNo - 1)])
        .limit(1)
    : { data: null, error: null };
  if (recentError) {
    logger.warn(LOG_MODULE, 'Double-submit lookup failed; relying on the unique index', recentError);
  } else if (recent && recent.length > 0) {
    // A double-click or an SDK retry by the same reporter: the bug already filed.
    return answer(recent[0], 200);
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let overCap: 'caller' | 'app' | null = null;
  if (clientIpHash) {
    const { count: callerCount, error: callerError } = await supabase
      .from('bug_reports')
      .select('id', { count: 'exact', head: true })
      .eq('application_id', app.id)
      .eq('metadata->>client_ip_hash', clientIpHash)
      .gte('created_at', dayAgo);
    if (callerError) {
      logger.error(LOG_MODULE, 'Per-caller cap count failed; refusing', callerError);
      audit(503);
      return fail('UNAVAILABLE', 'Could not accept the report right now. Please try again shortly.', 503);
    }
    if ((callerCount ?? 0) >= MAX_REPORTS_PER_IP_PER_APP_PER_DAY) overCap = 'caller';
  }

  const { count: todayCount, error: countError } = await supabase
    .from('bug_reports')
    .select('id', { count: 'exact', head: true })
    .eq('application_id', app.id)
    .gte('created_at', dayAgo);
  if (countError) {
    logger.error(LOG_MODULE, 'Daily cap count failed; refusing', countError);
    audit(503);
    return fail('UNAVAILABLE', 'Could not accept the report right now. Please try again shortly.', 503);
  }
  if ((todayCount ?? 0) >= HARD_CEILING_PER_APP_PER_DAY) {
    logger.warn(LOG_MODULE, 'App hit the hard daily ceiling; refusing', { app: app.slug, count: todayCount });
    audit(429);
    return fail('RATE_LIMITED', 'This app has sent too many bug reports today. Please try again tomorrow.', 429);
  }
  if ((todayCount ?? 0) >= MAX_REPORTS_PER_APP_PER_DAY) overCap = overCap ?? 'app';
  if (overCap) {
    logger.warn(LOG_MODULE, 'Over the daily cap; filing without a screenshot', { app: app.slug, overCap });
  }

  // Screenshot budget: past MAX_SCREENSHOTS_PER_APP_PER_DAY the report is kept
  // and its picture is not stored. If the count fails, the picture is dropped.
  let screenshotDropped: string | null = null;
  if (screenshot && overCap) {
    screenshot = null;
    screenshotDropped = 'over_cap';
  }
  if (screenshot) {
    const { count: shotCount, error: shotError } = await supabase
      .from('bug_reports')
      .select('id', { count: 'exact', head: true })
      .eq('application_id', app.id)
      .not('screenshot_url', 'is', null)
      .gte('created_at', dayAgo);
    if (shotError || (shotCount ?? 0) >= MAX_SCREENSHOTS_PER_APP_PER_DAY) {
      screenshot = null;
      screenshotDropped = shotError ? 'count_failed' : 'daily_budget';
    }
  }

  // ── 5. Insert (display_id comes from the set_bug_display_id trigger) ──────
  const clientMetadata =
    body.metadata && JSON.stringify(body.metadata).length <= MAX_CLIENT_METADATA_CHARS
      ? body.metadata
      : null;

  const report = {
    application_id: app.id,
    // Never derived from the claimed email (see the header).
    reporter_user_id: null,
    institution_id: null,
    department_id: null,
    page_url: body.page_url,
    description: body.description,
    category: body.category,
    // Quarantine: see the header. No automation reads 'unverified'.
    status: 'unverified',
    console_logs: body.console_logs ? body.console_logs.slice(-MAX_CONSOLE_LOGS) : null,
    reporter_user_agent: userAgent,
    metadata: {
      source: 'sibling_app',
      source_app: app.slug,
      source_app_name: app.name,
      sibling_app_id: app.id,
      title: body.title,
      intake_dedup_key: clientIpHash ? currentKey : null,
      client_ip_hash: clientIpHash,
      screenshot_dropped: screenshotDropped,
      over_cap: overCap,
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
    // Two identical submits in one window: the other one won. Answer with it.
    if (insertError.message.includes('uq_bug_reports_intake_dedup')) {
      const { data: winner } = await supabase
        .from('bug_reports')
        .select(DEDUP_SELECT)
        .eq('application_id', app.id)
        .eq('metadata->>intake_dedup_key', currentKey)
        .limit(1);
      if (winner && winner.length > 0) return answer(winner[0], 200);
      break;
    }
    // Same race the signed-in intake retries: two inserts drew one display_id.
    if (!insertError.message.includes('bug_reports_display_id_key')) break;
    await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
  }

  if (!created) {
    logger.error(LOG_MODULE, 'Insert failed', insertError);
    audit(500);
    return fail('INTERNAL_ERROR', 'Could not save the bug report. Please try again.', 500);
  }

  // ── 6. Screenshot: same bucket as the signed-in intake, private-by-name path ─
  if (screenshot) {
    // An unguessable name under sibling/: the bug id is returned to the caller,
    // so an id-only path would let anyone with the key host a file at a known
    // public URL. The 201 never returns the URL either.
    const path = `sibling/${created.id}/${randomUUID()}.${screenshot.ext}`;
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
      }
    }
  }

  audit(201);

  // Only what the reporter already knows, plus the id and display_id.
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
          // Never returned: the stored picture is public-by-URL, and quarantined.
          screenshot_url: null,
          created_at: created.created_at,
        },
        message: 'Bug report submitted successfully. Thank you for your report!',
      },
    },
    { status: 201, headers: intakeCorsHeaders }
  );
}
