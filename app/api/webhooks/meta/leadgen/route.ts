export const dynamic = 'force-dynamic';

// /api/webhooks/meta/leadgen
// Meta Lead Ads webhook receiver. Pairs with:
//   - lib/meta/lead-ads-client.ts       (Graph API fetch)
//   - lib/services/admission/meta-lead-importer.ts (lead → CRM)
//
// Contract (object=page, field=leadgen):
//   GET  /api/webhooks/meta/leadgen?hub.mode=subscribe
//                                  &hub.verify_token=<policy>
//                                  &hub.challenge=<echo>
//     → echo back hub.challenge if verify_token matches.
//   POST /api/webhooks/meta/leadgen
//     → verify X-Hub-Signature-256 HMAC (sha256=hex(meta_app_secret))
//     → persist raw event
//     → if meta.leadgen.is_enabled: call importer with hydrated fetchLead
//     → respond 200 within ~20s (Vercel waitUntil for background work)
//
// Pattern mirrors /api/webhooks/instagram/route.ts — same HMAC + same
// service-role client + same waitUntil background processing.

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/enhanced-logger';
import { getLead } from '@/lib/meta/lead-ads-client';
import { importMetaLead } from '@/lib/services/admission/meta-lead-importer';
import type {
  FbLeadgenWebhookPayload,
  FbLeadgenWebhookValue,
} from '@/lib/meta/lead-ads-types';

// =============================================================================
// Service-role Supabase client (webhook has no user session)
// =============================================================================

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase service role credentials');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// =============================================================================
// Policy helpers — reads via fn_get_policy_*
// =============================================================================

async function readVerifyToken(db: SupabaseClient): Promise<string | null> {
  const { data, error } = await db.rpc('fn_get_policy_text', {
    p_key: 'meta.leadgen.verify_token',
    p_default: '',
    p_scope_id: null,
  });
  if (error) {
    logger.warn('meta/leadgen-webhook', 'fn_get_policy_text(verify_token) errored', {
      error: error.message,
    });
    return null;
  }
  const v = typeof data === 'string' ? data : '';
  return v.length > 0 ? v : null;
}

async function readSigningSecret(db: SupabaseClient): Promise<string | null> {
  const { data, error } = await db.rpc('fn_get_policy_text', {
    p_key: 'meta.leadgen.signing_secret_key',
    p_default: 'META_APP_SECRET',
    p_scope_id: null,
  });
  if (error) {
    logger.warn('meta/leadgen-webhook', 'fn_get_policy_text(signing_secret_key) errored', {
      error: error.message,
    });
    return null;
  }
  const envKey = typeof data === 'string' && data.length > 0 ? data : 'META_APP_SECRET';
  const secret = process.env[envKey];
  return secret && secret.length > 0 ? secret : null;
}

async function readIsEnabled(db: SupabaseClient): Promise<boolean> {
  const { data, error } = await db.rpc('fn_get_policy_bool', {
    p_key: 'meta.leadgen.is_enabled',
    p_default: false,
    p_scope_id: null,
  });
  if (error) return false;
  return Boolean(data);
}

// =============================================================================
// HMAC-SHA256 signature verification (Meta App Secret)
// =============================================================================

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string | null): boolean {
  if (!secret) {
    logger.warn('meta/leadgen-webhook', 'No signing secret configured — rejecting in prod');
    // Fail closed when secret is unset in prod. In dev (no .env value), this
    // also fails closed — operators should set META_APP_SECRET locally.
    return false;
  }
  if (!signatureHeader) {
    logger.warn('meta/leadgen-webhook', 'Missing X-Hub-Signature-256 header');
    return false;
  }

  const expectedSig = signatureHeader.replace('sha256=', '');
  const computedSig = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf-8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSig, 'hex'),
      Buffer.from(computedSig, 'hex')
    );
  } catch {
    return false;
  }
}

// =============================================================================
// GET — Meta Webhook Verification (challenge-response handshake)
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  let verifyToken: string | null = null;
  try {
    verifyToken = await readVerifyToken(getServiceClient());
  } catch (err) {
    logger.error('meta/leadgen-webhook', 'verify_token policy read failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (mode === 'subscribe' && verifyToken && token === verifyToken) {
    logger.info('meta/leadgen-webhook', 'Webhook verification succeeded');
    return new NextResponse(challenge ?? '', { status: 200 });
  }

  logger.warn('meta/leadgen-webhook', 'Webhook verification failed', {
    mode,
    tokenMatch: Boolean(verifyToken) && token === verifyToken,
  });
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// =============================================================================
// POST — Receive Meta leadgen events
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const db = getServiceClient();

  // 1. HMAC signature verification.
  const signingSecret = await readSigningSecret(db);
  const signature = request.headers.get('x-hub-signature-256');
  if (!verifySignature(rawBody, signature, signingSecret)) {
    logger.warn('meta/leadgen-webhook', 'Invalid webhook signature — rejecting');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 2. Parse JSON.
  let payload: FbLeadgenWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logger.error('meta/leadgen-webhook', 'Failed to parse webhook JSON');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 3. Only page-object events are in scope.
  if (payload.object !== 'page') {
    logger.info('meta/leadgen-webhook', 'Ignoring non-page event', {
      object: payload.object,
    });
    return NextResponse.json({ received: true });
  }

  // 4. Collect every leadgen value before responding (so we don't lose
  //    payloads on a process restart). Persist raw rows immediately —
  //    the importer can run async after.
  const leadgenValues = collectLeadgenValues(payload);

  // 5. Insert raw event rows synchronously. The unique index on
  //    fb_leadgen_id makes the upsert idempotent against Meta retries.
  for (const value of leadgenValues) {
    try {
      await db
        .from('meta_leadgen_events')
        .upsert(
          {
            fb_leadgen_id: value.leadgen_id,
            fb_form_id: value.form_id,
            fb_page_id: value.page_id,
            raw_payload: value as unknown as Record<string, unknown>,
            status: 'pending',
          },
          { onConflict: 'fb_leadgen_id', ignoreDuplicates: true }
        );
    } catch (err) {
      logger.error('meta/leadgen-webhook', 'Failed to upsert event row', {
        leadgenId: value.leadgen_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 6. Respond 200 immediately. Importer runs in background.
  const response = NextResponse.json({ received: true }, { status: 200 });

  const isEnabled = await readIsEnabled(db);
  if (!isEnabled) {
    logger.info('meta/leadgen-webhook', 'meta.leadgen.is_enabled=false — importer skipped', {
      pendingCount: leadgenValues.length,
    });
    return response;
  }

  const pageAccessToken = process.env.META_LEAD_ADS_PAGE_ACCESS_TOKEN;
  if (!pageAccessToken) {
    logger.warn('meta/leadgen-webhook', 'META_LEAD_ADS_PAGE_ACCESS_TOKEN unset — cannot hydrate leads');
    return response;
  }

  const processAll = async () => {
    for (const value of leadgenValues) {
      try {
        await importMetaLead(
          { event: value },
          {
            supabaseService: db,
            fetchLead: (leadgenId) =>
              getLead(leadgenId, { accessToken: pageAccessToken }),
          }
        );
      } catch (err) {
        logger.error('meta/leadgen-webhook', 'importMetaLead threw unexpectedly', {
          leadgenId: value.leadgen_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  try {
    const { waitUntil } = await import('@vercel/functions');
    waitUntil(processAll());
  } catch {
    await processAll();
  }

  return response;
}

// =============================================================================
// Helpers
// =============================================================================

function collectLeadgenValues(
  payload: FbLeadgenWebhookPayload
): FbLeadgenWebhookValue[] {
  const out: FbLeadgenWebhookValue[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen') continue;
      const v = change.value as Partial<FbLeadgenWebhookValue> | null;
      if (!v || !v.leadgen_id || !v.form_id || !v.page_id) continue;
      out.push({
        leadgen_id: String(v.leadgen_id),
        form_id: String(v.form_id),
        page_id: String(v.page_id),
        created_time: Number(v.created_time ?? Math.floor(Date.now() / 1000)),
        ad_id: v.ad_id ? String(v.ad_id) : undefined,
        adgroup_id: v.adgroup_id ? String(v.adgroup_id) : undefined,
      });
    }
  }
  return out;
}
