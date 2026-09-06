// app/api/meta/capi/track/route.ts
//
// Server-only POST endpoint for posting Meta Conversions API (CAPI) events
// from any server-side caller (server actions, cron, internal services).
//
// =============================================================================
// FLOW
// =============================================================================
//   1. Auth — caller must be authenticated (super_admin OR admin). Plaintext
//      PII passes through this endpoint, so it must not be exposed publicly.
//      Internal server-to-server callers should prefer importing
//      `trackLead` / `trackPurchase` directly instead of going through HTTP.
//   2. Resolve institution scope from body or caller's profile.
//   3. Read policy rows:
//        meta.capi.is_enabled        — bool; if false, short-circuit + log.
//        meta.capi.pixel_id          — string; required for live posting.
//        meta.capi.access_token_ref  — string; env-var NAME holding token.
//   4. Look up the actual token from process.env[token_ref]. The token NEVER
//      lives in the DB.
//   5. Build CapiClientConfig + call the requested helper from
//      lib/meta/pixel-client.ts.
//   6. Persist an audit row to meta_capi_events. CAPI failure does NOT make
//      the endpoint return an error — the audit row carries `error` and the
//      caller decides how to react.
// =============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';

import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import {
  trackCustomEvent,
  trackLead,
  trackPageView,
  trackPurchase,
  type CapiClientConfig,
  type CapiTrackInput,
  type CapiTrackResult,
} from '@/lib/meta/pixel-client';
import type { CapiEventName } from '@/lib/meta/pixel-types';

interface TrackBody {
  event_name: CapiEventName;
  institution_id?: string;
  input: CapiTrackInput;
}

// ---------------------------------------------------------------------------
// Policy + token resolver
// ---------------------------------------------------------------------------

interface ResolvedConfig {
  enabled: boolean;
  pixelId: string;
  accessToken: string;
  tokenRef: string;
  reason?: string;
}

async function resolveCapiConfig(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  institutionId: string | null
): Promise<ResolvedConfig> {
  const [enabledRes, pixelRes, tokenRefRes] = await Promise.all([
    supabase.rpc('fn_get_policy', {
      p_key: 'meta.capi.is_enabled',
      p_scope_id: institutionId,
    }),
    supabase.rpc('fn_get_policy', {
      p_key: 'meta.capi.pixel_id',
      p_scope_id: institutionId,
    }),
    supabase.rpc('fn_get_policy', {
      p_key: 'meta.capi.access_token_ref',
      p_scope_id: institutionId,
    }),
  ]);

  const enabled = enabledRes.data === true;
  const pixelId = typeof pixelRes.data === 'string' ? pixelRes.data.trim() : '';
  const tokenRef =
    typeof tokenRefRes.data === 'string' ? tokenRefRes.data.trim() : '';

  let accessToken = '';
  if (tokenRef.length > 0) {
    const fromEnv = process.env[tokenRef];
    accessToken = typeof fromEnv === 'string' ? fromEnv.trim() : '';
  }

  let reason: string | undefined;
  if (!enabled) reason = 'kill-switch off (meta.capi.is_enabled=false)';
  else if (pixelId.length === 0) reason = 'meta.capi.pixel_id is empty';
  else if (tokenRef.length === 0) reason = 'meta.capi.access_token_ref is empty';
  else if (accessToken.length === 0)
    reason = `env var ${tokenRef} is unset on this deployment`;

  return { enabled, pixelId, accessToken, tokenRef, reason };
}

// ---------------------------------------------------------------------------
// Audit-row writer
// ---------------------------------------------------------------------------

async function writeAuditRow(args: {
  institutionId: string | null;
  eventName: CapiEventName;
  result: CapiTrackResult;
  userDataHash: Record<string, unknown> | null;
  customData: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const service = createServiceRoleClient();
    await service.from('meta_capi_events').insert({
      institution_id: args.institutionId,
      event_name: String(args.eventName),
      event_id: args.result.eventId ?? null,
      user_data_hash: args.userDataHash,
      custom_data: args.customData,
      response_status: args.result.responseStatus ?? null,
      response_body:
        (args.result.responseBody as Record<string, unknown> | undefined) ??
        null,
      error: args.result.error?.message ?? null,
    });
  } catch (err) {
    console.warn('[meta-capi-track] Audit write failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

async function dispatch(
  eventName: CapiEventName,
  config: CapiClientConfig,
  input: CapiTrackInput
): Promise<CapiTrackResult> {
  switch (eventName) {
    case 'Lead':
      return trackLead(config, input);
    case 'Purchase':
      return trackPurchase(config, input);
    case 'PageView':
      return trackPageView(config, input);
    default:
      return trackCustomEvent(config, String(eventName), input);
  }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Body parse
    let body: TrackBody;
    try {
      body = (await request.json()) as TrackBody;
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    if (
      !body.event_name ||
      typeof body.event_name !== 'string' ||
      body.event_name.trim().length === 0
    ) {
      return NextResponse.json(
        { success: false, error: 'event_name is required' },
        { status: 400 }
      );
    }
    if (!body.input || typeof body.input !== 'object') {
      return NextResponse.json(
        { success: false, error: 'input is required' },
        { status: 400 }
      );
    }

    // Admin gate — caller must be super_admin OR admin. We piggy-back on the
    // platform_policies UPDATE RLS by attempting a no-op read of a
    // privileged-by-policy row; rather than that hack, query profiles role.
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('role, institution_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr || !profile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 403 }
      );
    }
    const role = profile.role as string | null;
    const isAdminish =
      role === 'super_admin' || role === 'admin' || role === 'institution_admin';
    if (!isAdminish) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden — super_admin / admin / institution_admin only',
        },
        { status: 403 }
      );
    }

    const institutionId =
      (body.institution_id && body.institution_id.trim().length > 0
        ? body.institution_id.trim()
        : (profile.institution_id as string | null) ?? null) || null;

    // Resolve policy + env token
    const resolved = await resolveCapiConfig(supabase, institutionId);

    // Short-circuit if not enabled / config incomplete — still write audit.
    if (
      !resolved.enabled ||
      resolved.pixelId.length === 0 ||
      resolved.accessToken.length === 0
    ) {
      const userDataHash =
        (body.input.userDataRaw as Record<string, unknown> | undefined) ?? null;
      const customData =
        (body.input.customData as Record<string, unknown> | undefined) ?? null;
      const skipResult: CapiTrackResult = {
        sent: false,
        eventName: body.event_name,
        eventId: body.input.eventId,
        error: {
          message: resolved.reason ?? 'CAPI not configured',
          status: 0,
        },
      };
      await writeAuditRow({
        institutionId,
        eventName: body.event_name,
        result: skipResult,
        userDataHash,
        customData,
      });
      return NextResponse.json(
        {
          success: true,
          sent: false,
          reason: resolved.reason,
        },
        { status: 200 }
      );
    }

    // Live post
    const config: CapiClientConfig = {
      pixelId: resolved.pixelId,
      accessToken: resolved.accessToken,
    };
    const result = await dispatch(body.event_name, config, body.input);

    // Re-derive the hashed user_data for audit. We re-hash inside the helper
    // and don't get the post-hash object back, but we can preserve the
    // already-hashed override block + a redacted summary of which fields the
    // caller supplied so the audit page can show "what was sent".
    const userDataHash: Record<string, unknown> = {
      // Plaintext keys the caller supplied (just the keys — not the values).
      _present: body.input.user ? Object.keys(body.input.user) : [],
      ...(body.input.userDataRaw ?? {}),
    };
    const customData =
      (body.input.customData as Record<string, unknown> | undefined) ?? null;

    await writeAuditRow({
      institutionId,
      eventName: body.event_name,
      result,
      userDataHash,
      customData,
    });

    return NextResponse.json(
      {
        success: true,
        sent: result.sent,
        responseStatus: result.responseStatus,
        error: result.error,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('[meta-capi-track] Unhandled error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
