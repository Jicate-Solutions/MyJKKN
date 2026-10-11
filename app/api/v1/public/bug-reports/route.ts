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
 * THE CALLER is callerKeyFromIp(ip) (sibling-intake.ts): IPv4 as is, an
 * IPv4-mapped IPv6 address as its IPv4, any other IPv6 address as its /64.
 * The in-memory limiter and every database cap use that same key.
 *
 * Abuse limits, in this order:
 *   1. per-caller rate limit before any lookup (sibling-intake-auth.ts;
 *      in-memory, per server instance)
 *   2. double-submit guard: metadata.intake_dedup_key hashes app, caller,
 *      reporter email, page, title, description and a DUPLICATE_WINDOW_MS
 *      window; the lookup checks this window and the previous one, so a
 *      repeat is caught for 2 to 4 minutes. It is answered with the bug
 *      already filed, before any cap, so a genuine retry is never refused. The unique index uq_bug_reports_intake_dedup
 *      makes two simultaneous submits collide, and the loser returns the winner.
 *   3. EVERY ROW IS SIZE-BOUNDED. console_logs + network_trace together are
 *      trimmed (oldest first) to MAX_LOG_BYTES; client metadata, browser and
 *      system info each have a byte cap; and the whole row must fit in
 *      MAX_ROW_BYTES or it is stored minimal.
 *   4. OVER-CAP IS KEPT MINIMAL. A caller past MAX_REPORTS_PER_IP_PER_APP_PER_DAY
 *      (a "heavy" caller), or any report once the app has
 *      MAX_FULL_REPORTS_PER_APP_PER_DAY full rows today, is filed MINIMAL:
 *      title, description (clipped to MINIMAL_DESCRIPTION_CHARS) and page_url,
 *      nothing else the caller sent, and at most MAX_MINIMAL_ROW_BYTES;
 *      flagged metadata.over_cap. Full rows are counted as rows with no
 *      over_cap flag, so minimal rows never use up the full-row budget.
 *   5. REFUSAL (429) has two ceilings, so a heavy caller cannot use up a light
 *      caller's room. A heavy caller is refused once the app has
 *      HARD_CEILING_PER_APP_PER_DAY rows today. A light caller (under its
 *      per-caller cap) is refused only past HARD_CEILING + RESERVE_FOR_LIGHT_CALLERS.
 * WORST CASE STORED PER APP PER DAY (the counts are soft, below, so a parallel
 * burst adds a little):
 *   full rows    MAX_FULL_REPORTS (300) × MAX_ROW_BYTES (200 KB)        = 60 MB
 *   minimal rows (CEILING + RESERVE − 300 = 2,200) × 24 KB               = 52.8 MB
 *   table total about 113 MB per app per day, about 564 MB for five apps;
 *   screenshots, in the storage bucket: MAX_SCREENSHOTS (100) × 3 MB     = 300 MB
 * WHAT THIS DOES NOT CLOSE: a caller is a network, not a person. Someone with
 * many /64 networks can file as many light callers and fill the day's
 * RESERVE (about 63 networks × 40 reports reach the 2,500 ceiling). Storage
 * stays bounded as above; closing this fully needs a signed per-app token
 * from each app's server, or signed-in users only.
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
  boundedJson,
  callerKeyFromIp,
  decodeScreenshot,
  intakeCorsHeaders,
  jsonBytes,
  newestEntriesWithin,
  normalizeReporterEmail,
  type DecodedScreenshot,
} from '@/lib/bug-reports/sibling-intake';
import { authenticateIntakeKey, intakeClientIp, intakeFail as fail } from '@/lib/bug-reports/sibling-intake-auth';

const LOG_MODULE = 'bug-reports/intake';
const ENDPOINT = '/api/v1/public/bug-reports';

const MAX_CONSOLE_LOGS = 200;
const MAX_NETWORK_TRACE = 50;
// console_logs + network_trace TOGETHER, as JSON (UTF-8 bytes).
const MAX_LOG_BYTES = 64_000;
const MAX_CLIENT_METADATA_BYTES = 20_000;
// browser_info and system_info, each; the small client_metadata fields copied
// out of it (viewport and so on) have their own tiny cap.
const MAX_INFO_BYTES = 4_000;
const MAX_SMALL_FIELD_BYTES = 200;
const MAX_USER_AGENT_CHARS = 1_000;
// The whole stored row. The field caps add up to about 165 KB (description
// 20,000 characters is at most 60 KB of UTF-8); anything over this is stored
// minimal instead.
const MAX_ROW_BYTES = 200_000;
// A minimal row: title, clipped description and page_url, plus bookkeeping.
const MINIMAL_DESCRIPTION_CHARS = 4_000;
const MAX_MINIMAL_ROW_BYTES = 24_000;
// Full rows (with logs and metadata) per app per day; past this, minimal.
const MAX_FULL_REPORTS_PER_APP_PER_DAY = 300;
// A whole campus can sit behind one NAT address, so this is per app and
// generous. Past it a caller is "heavy": minimal rows, first to be refused.
const MAX_REPORTS_PER_IP_PER_APP_PER_DAY = 40;
// Screenshots are up to 3 MB each. Past this many in a day, a report is still
// filed but its screenshot is not stored (metadata.screenshot_dropped).
const MAX_SCREENSHOTS_PER_APP_PER_DAY = 100;
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
// Heavy callers are refused past this many rows per app per day ...
const HARD_CEILING_PER_APP_PER_DAY = 2000;
// ... light callers only past this many more, so a flood cannot use their room.
const RESERVE_FOR_LIGHT_CALLERS_PER_APP_PER_DAY = 500;

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

  // Only what the caller sent, plus the id and display_id. The status is
  // always 'unverified': on a double-submit hit the bug may have been triaged
  // since, and anyone behind the same network could replay the same text.
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
            description: body.description,
            category: body.category,
            status: 'unverified',
            page_url: body.page_url,
            // Never returned: the stored picture is public-by-URL, and quarantined.
            screenshot_url: null,
            created_at: bug.created_at,
          },
          message: 'Bug report submitted successfully. Thank you for your report!',
        },
      },
      { status, headers: intakeCorsHeaders }
    );
  };
  const DEDUP_SELECT = 'id, display_id, created_at';

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
  const countToday = (filter?: (q: any) => any) => {
    const q = supabase
      .from('bug_reports')
      .select('id', { count: 'exact', head: true })
      .eq('application_id', app.id)
      .gte('created_at', dayAgo);
    return filter ? filter(q) : q;
  };
  const refuseUnavailable = (what: string, error: unknown) => {
    logger.error(LOG_MODULE, `${what} count failed; refusing`, error);
    audit(503);
    return fail('UNAVAILABLE', 'Could not accept the report right now. Please try again shortly.', 503);
  };

  let heavyCaller = false;
  if (clientIpHash) {
    const { count: callerCount, error: callerError } = await countToday((q) =>
      q.eq('metadata->>client_ip_hash', clientIpHash)
    );
    if (callerError) return refuseUnavailable('Per-caller cap', callerError);
    heavyCaller = (callerCount ?? 0) >= MAX_REPORTS_PER_IP_PER_APP_PER_DAY;
  }

  const { count: todayCount, error: countError } = await countToday();
  if (countError) return refuseUnavailable('Daily cap', countError);
  const total = todayCount ?? 0;
  const ceiling = heavyCaller
    ? HARD_CEILING_PER_APP_PER_DAY
    : HARD_CEILING_PER_APP_PER_DAY + RESERVE_FOR_LIGHT_CALLERS_PER_APP_PER_DAY;
  if (total >= ceiling) {
    logger.warn(LOG_MODULE, 'App hit the daily ceiling; refusing', { app: app.slug, count: total, heavyCaller });
    audit(429);
    return fail('RATE_LIMITED', 'This app has sent too many bug reports today. Please try again tomorrow.', 429);
  }

  // Full rows are rows with no over_cap flag: minimal rows never use this budget.
  const { count: fullCount, error: fullError } = await countToday((q) => q.is('metadata->>over_cap', null));
  if (fullError) return refuseUnavailable('Full-row cap', fullError);
  const overCap: 'caller' | 'app' | null = heavyCaller
    ? 'caller'
    : (fullCount ?? 0) >= MAX_FULL_REPORTS_PER_APP_PER_DAY
      ? 'app'
      : null;
  if (overCap) {
    logger.warn(LOG_MODULE, 'Over the daily cap; filing a minimal row', { app: app.slug, overCap });
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
  const report = buildIntakeRow({
    app,
    body,
    reporterEmail,
    userAgent,
    clientIpHash,
    dedupKey: clientIpHash ? currentKey : null,
    overCap,
    screenshotDropped,
  });

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

  return answer(created, 201);
}

type IntakeBody = z.infer<typeof bodySchema>;

/**
 * The row to insert, always within its size bound (see the header).
 * Full: everything the caller sent, each field capped, the whole row at most
 * MAX_ROW_BYTES. Minimal (over cap, or a full row that would not fit): title,
 * clipped description and page_url only, at most MAX_MINIMAL_ROW_BYTES.
 */
function buildIntakeRow(opts: {
  app: { id: string; slug: string; name: string };
  body: IntakeBody;
  reporterEmail: string | null;
  userAgent: string | null | undefined;
  clientIpHash: string | null;
  dedupKey: string | null;
  overCap: 'caller' | 'app' | null;
  screenshotDropped: string | null;
}) {
  const { app, body } = opts;
  const base = {
    application_id: app.id,
    // Never derived from the claimed email (see the header).
    reporter_user_id: null,
    institution_id: null,
    department_id: null,
    page_url: body.page_url,
    category: body.category,
    // Quarantine: see the header. No automation reads 'unverified'.
    status: 'unverified',
  };
  const bookkeeping = {
    source: 'sibling_app',
    source_app: app.slug,
    source_app_name: app.name,
    sibling_app_id: app.id,
    title: body.title,
    intake_dedup_key: opts.dedupKey,
    client_ip_hash: opts.clientIpHash,
    screenshot_dropped: opts.screenshotDropped,
  };

  const minimal = (overCap: string) => {
    let clip = MINIMAL_DESCRIPTION_CHARS;
    const row = (chars: number) => ({
      ...base,
      description: body.description.slice(0, chars),
      console_logs: null,
      reporter_user_agent: null,
      metadata: {
        ...bookkeeping,
        over_cap: overCap,
        description_clipped: body.description.length > chars,
        reporter_verified: false,
      },
    });
    // The arithmetic already fits (4,000 characters ≤ 12 KB); this only guards
    // a description of escape-heavy text, measured as JSON.
    while (jsonBytes(row(clip)) > MAX_MINIMAL_ROW_BYTES && clip > 250) clip = Math.floor(clip / 2);
    return row(clip);
  };
  if (opts.overCap) return minimal(opts.overCap);

  const clientMetadata = boundedJson(body.metadata ?? null, MAX_CLIENT_METADATA_BYTES);
  const small = (value: unknown) => boundedJson(value ?? null, MAX_SMALL_FIELD_BYTES);
  // console_logs and network_trace share MAX_LOG_BYTES, console first.
  const consoleLogs = newestEntriesWithin(body.console_logs?.slice(-MAX_CONSOLE_LOGS), MAX_LOG_BYTES);
  const networkTrace = newestEntriesWithin(
    body.network_trace?.slice(-MAX_NETWORK_TRACE),
    MAX_LOG_BYTES - (consoleLogs ? jsonBytes(consoleLogs) : 0)
  );

  const full = {
    ...base,
    description: body.description,
    console_logs: consoleLogs,
    reporter_user_agent: opts.userAgent ? opts.userAgent.slice(0, MAX_USER_AGENT_CHARS) : null,
    metadata: {
      ...bookkeeping,
      over_cap: null,
      reporter_email: opts.reporterEmail,
      reporter_name: body.reporter_name || null,
      // The key is public: who sent this is a claim, never a proof.
      reporter_verified: false,
      browser_info: boundedJson(body.browser_info ?? clientMetadata?.userAgent ?? null, MAX_INFO_BYTES),
      system_info: boundedJson(body.system_info ?? null, MAX_INFO_BYTES),
      viewport: small(clientMetadata?.viewport),
      screen_resolution: small(clientMetadata?.screenResolution),
      client_timestamp: small(clientMetadata?.timestamp),
      client_metadata: clientMetadata,
      network_trace: networkTrace,
      // File attachments from the SDK are not stored yet (Phase B).
      attachments_received: body.attachments?.length ?? 0,
    },
  };
  return jsonBytes(full) <= MAX_ROW_BYTES ? full : minimal('row_size');
}
