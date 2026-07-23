// lib/meta/pixel-client.ts
// Meta Pixel + Conversions API (CAPI) event poster.
//
// Built on lib/meta/graph-api-client.ts — uses `graphRequest` to POST events
// to `/<pixel-id>/events`. Server-only by convention.
//
// =============================================================================
// DEDUPE CONTRACT (read this before changing anything in this file)
// =============================================================================
//
// Meta deduplicates a CAPI event against a browser-side Pixel event using the
// PAIR `(event_name, event_id)`. If you do not pass `event_id`, every event
// you send is unique to Meta — even if the user's browser already fired
// `fbq('track', 'Lead', {...})` for the same action — and you will
// DOUBLE-COUNT every conversion.
//
// Rules this client enforces (and helpers in this file embody):
//   1. trackLead requires `eventId` (defaults to `lead-${someId}` upstream).
//   2. trackPurchase requires `eventId` (defaults to `purchase-${order.id}`).
//   3. trackPageView accepts an optional `eventId`. Pass it ONLY if your
//      browser Pixel call also passes the same `eventID` — otherwise omit.
//   4. trackCustomEvent forwards whatever the caller gives. Caller owns
//      dedup.
//
// The same `event_id` MUST be emitted by both sides for the same conversion:
//
//   Browser (loader component):
//     fbq('track', 'Lead', { value: 100, currency: 'INR' },
//         { eventID: 'lead-9a7b...' });
//
//   Server (this client):
//     trackLead({ eventId: 'lead-9a7b...', user: { email, phone },
//                 customData: { value: 100, currency: 'INR' }});
//
// Choose a stable id derived from the source record (lead row, order row, etc.)
// — NOT a UUID generated at call-time. UUIDs at call-time defeat dedup.
//
// =============================================================================
// AUTH NOTE
// =============================================================================
//
// The Meta access token used here must have either:
//   - `ads_management` (full write) — required if the Pixel is in a Business
//     Manager you don't own (i.e. agency-managed pixel).
//   - `ads_read`                    — sufficient if the Pixel is in your own
//     Business Manager and the token's user has Admin on it.
//
// The Pixel id + token are never hardcoded — both come from runtime config:
//   - `meta.capi.pixel_id`         (platform_policies, per-institution scope)
//   - `meta.capi.access_token_ref` (platform_policies — NAME of env var, not
//                                   token itself; token stays in Vercel env)
//   - `meta.capi.is_enabled`       (platform_policies — kill switch)

import { graphRequest } from '@/lib/meta/graph-api-client';
import { MetaGraphError } from '@/lib/meta/types';
import {
  hashUserData,
  mergeUserData,
  type PlaintextUserData,
} from '@/lib/meta/pixel-hash';
import type {
  CapiClientConfig,
  CapiCustomData,
  CapiEvent,
  CapiEventName,
  CapiEventsRequestBody,
  CapiEventsResponse,
  CapiTrackInput,
  CapiUserData,
} from '@/lib/meta/pixel-types';

const SENTRY_OP = 'meta.capi';

// ---------------------------------------------------------------------------
// Result envelope returned to callers
// ---------------------------------------------------------------------------

/**
 * Result of a CAPI track call. The track helpers ALWAYS resolve (never throw)
 * — they swallow the Graph error and surface it on `error` so the caller can
 * decide whether to retry / alert / drop. CAPI failures must NEVER bubble up
 * into a user-facing flow (admission lead creation, purchase confirmation, …).
 *
 * `sent` is true when Meta returned 2xx; `responseBody` carries Meta's parsed
 * response (typically `{ events_received, messages, fbtrace_id }`).
 */
export interface CapiTrackResult {
  sent: boolean;
  eventName: CapiEventName;
  eventId?: string;
  responseStatus?: number;
  responseBody?: CapiEventsResponse | Record<string, unknown>;
  error?: {
    message: string;
    status: number;
    code?: number;
    subcode?: number;
    fbtraceId?: string;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the wire-format `CapiEvent` from caller-friendly input. Hashes
 * plaintext user PII through `hashUserData`, then merges any pre-hashed
 * `userDataRaw` overrides (e.g. IP, user-agent, fbc, fbp).
 */
function buildEvent(
  eventName: CapiEventName,
  input: CapiTrackInput
): CapiEvent {
  const plain: PlaintextUserData = input.user ?? {};
  const hashed: CapiUserData = hashUserData(plain);
  const merged: CapiUserData = mergeUserData(hashed, input.userDataRaw);

  return {
    event_name: eventName,
    event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: input.eventId,
    event_source_url: input.eventSourceUrl,
    action_source: input.actionSource ?? 'website',
    user_data: merged,
    custom_data: input.customData,
  };
}

/**
 * Low-level: post a batch of events to `/{pixel_id}/events`. Caller is
 * responsible for assembling the events array. Returns `CapiTrackResult` for
 * the FIRST event in the batch (used by the helpers which always send a
 * single event); callers posting batches should use `postEventsRaw` instead.
 */
async function postEvents(
  config: CapiClientConfig,
  events: CapiEvent[],
  spanName: string
): Promise<CapiTrackResult> {
  if (!config.pixelId || config.pixelId.trim().length === 0) {
    return {
      sent: false,
      eventName: events[0]?.event_name ?? 'unknown',
      eventId: events[0]?.event_id,
      error: {
        message: 'CAPI call rejected: pixelId is empty',
        status: 0,
      },
    };
  }
  if (!config.accessToken || config.accessToken.trim().length === 0) {
    return {
      sent: false,
      eventName: events[0]?.event_name ?? 'unknown',
      eventId: events[0]?.event_id,
      error: {
        message: 'CAPI call rejected: accessToken is empty',
        status: 0,
      },
    };
  }

  const body: CapiEventsRequestBody = {
    data: events,
    ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}),
    ...(config.partnerAgent ? { partner_agent: config.partnerAgent } : {}),
  };

  try {
    const res = await graphRequest<CapiEventsResponse>({
      endpoint: `/${config.pixelId}/events`,
      method: 'POST',
      accessToken: config.accessToken,
      apiVersion: config.apiVersion,
      body,
      sentryOp: SENTRY_OP,
      sentrySpanName: spanName,
    });
    return {
      sent: true,
      eventName: events[0]?.event_name ?? 'unknown',
      eventId: events[0]?.event_id,
      responseStatus: res.status,
      responseBody: res.data,
    };
  } catch (err) {
    if (err instanceof MetaGraphError) {
      return {
        sent: false,
        eventName: events[0]?.event_name ?? 'unknown',
        eventId: events[0]?.event_id,
        responseStatus: err.status,
        error: {
          message: err.message,
          status: err.status,
          code: err.code,
          subcode: err.subcode,
          fbtraceId: err.fbtraceId,
        },
      };
    }
    return {
      sent: false,
      eventName: events[0]?.event_name ?? 'unknown',
      eventId: events[0]?.event_id,
      error: {
        message: err instanceof Error ? err.message : 'Unknown CAPI error',
        status: 0,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Track a Lead event. Dedup-key REQUIRED — use the lead's row id
 * (`lead-${lead.id}`). The same `eventId` MUST be passed to the browser
 * Pixel call to avoid double-counting.
 *
 * Resolves to `CapiTrackResult` — never throws. CAPI failures must not
 * cascade into the lead-creation flow.
 */
export async function trackLead(
  config: CapiClientConfig,
  input: CapiTrackInput
): Promise<CapiTrackResult> {
  if (!input.eventId) {
    return {
      sent: false,
      eventName: 'Lead',
      error: {
        message:
          'trackLead requires eventId for dedup with browser Pixel — pass e.g. `lead-${lead.id}`',
        status: 0,
      },
    };
  }
  const event = buildEvent('Lead', input);
  return postEvents(
    { ...config, testEventCode: input.testEventCode ?? config.testEventCode },
    [event],
    'trackLead'
  );
}

/**
 * Track a Purchase event. Requires `eventId` (e.g. `purchase-${order.id}`)
 * AND `customData.value` + `customData.currency` to get full attribution.
 */
export async function trackPurchase(
  config: CapiClientConfig,
  input: CapiTrackInput
): Promise<CapiTrackResult> {
  if (!input.eventId) {
    return {
      sent: false,
      eventName: 'Purchase',
      error: {
        message:
          'trackPurchase requires eventId for dedup with browser Pixel — pass e.g. `purchase-${order.id}`',
        status: 0,
      },
    };
  }
  if (!input.customData?.value || !input.customData?.currency) {
    return {
      sent: false,
      eventName: 'Purchase',
      eventId: input.eventId,
      error: {
        message:
          'trackPurchase requires customData.value and customData.currency for attribution',
        status: 0,
      },
    };
  }
  const event = buildEvent('Purchase', input);
  return postEvents(
    { ...config, testEventCode: input.testEventCode ?? config.testEventCode },
    [event],
    'trackPurchase'
  );
}

/**
 * Track a PageView. `eventId` is optional but recommended — pass it ONLY if
 * the browser Pixel for the same page-load also passes the same id; mixed
 * passing (one side has id, the other doesn't) wastes attribution.
 */
export async function trackPageView(
  config: CapiClientConfig,
  input: CapiTrackInput
): Promise<CapiTrackResult> {
  const event = buildEvent('PageView', input);
  return postEvents(
    { ...config, testEventCode: input.testEventCode ?? config.testEventCode },
    [event],
    'trackPageView'
  );
}

/**
 * Track a non-standard event. Caller owns the name + dedup contract.
 * Standard names (PageView, Lead, Purchase, …) get better attribution
 * treatment — prefer the dedicated helpers when applicable.
 */
export async function trackCustomEvent(
  config: CapiClientConfig,
  eventName: string,
  input: CapiTrackInput
): Promise<CapiTrackResult> {
  if (!eventName || eventName.trim().length === 0) {
    return {
      sent: false,
      eventName: 'unknown',
      error: {
        message: 'trackCustomEvent requires a non-empty eventName',
        status: 0,
      },
    };
  }
  const event = buildEvent(eventName, input);
  return postEvents(
    { ...config, testEventCode: input.testEventCode ?? config.testEventCode },
    [event],
    `trackCustomEvent:${eventName}`
  );
}

/**
 * Low-level: post a pre-built batch of events. Caller assembles the events
 * (including hashing PII via `hashUserData`). Returns the result for the
 * batch (status from the first event).
 */
export async function postEventsRaw(
  config: CapiClientConfig,
  events: CapiEvent[]
): Promise<CapiTrackResult> {
  if (events.length === 0) {
    return {
      sent: false,
      eventName: 'empty',
      error: {
        message: 'postEventsRaw requires at least one event',
        status: 0,
      },
    };
  }
  return postEvents(config, events, `postEventsRaw:${events.length}`);
}

/**
 * Re-export helpers from sibling files so external callers can do
 * `import { trackLead, hashUserData } from '@/lib/meta/pixel-client'`
 * if they want everything from one entry-point.
 */
export {
  hashUserData,
  mergeUserData,
  normalizeEmail,
  normalizePhone,
  normalizeName,
  normalizeCountry,
  normalizeZip,
  normalizeExternalId,
  sha256Hex,
} from '@/lib/meta/pixel-hash';

// Re-export commonly-imported types for ergonomic single-line imports.
export type {
  CapiClientConfig,
  CapiCustomData,
  CapiEvent,
  CapiEventName,
  CapiTrackInput,
  CapiUserData,
  CapiEventsResponse,
} from '@/lib/meta/pixel-types';
