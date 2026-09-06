// lib/meta/lead-ads-client.ts
// Meta Lead Ads (Facebook Lead Generation) client. Built on
// `lib/meta/graph-api-client.ts`. Mirrors the Phase-1A Instagram client pattern.
//
// Scope (Phase 1):
//   - listForms(pageId)               — list Lead Gen forms for a Page
//   - getForm(formId)                 — single form + questions
//   - getLead(leadgenId)              — fetch a single lead (post-webhook)
//   - backfillLeads(formId, since)    — paginate /{form-id}/leads since `since`
//
// All methods accept an `accessToken` (long-lived Page token with
// `leads_retrieval` + `pages_show_list` + `pages_manage_metadata` scopes).
// All methods are read-only — no publishing or form-edit flows here.
//
// Sentry op set to `meta.lead_ads` so transactions surface separately from
// Instagram / WhatsApp / Facebook Page calls.

import {
  graphRequest,
  graphRequestData,
} from '@/lib/meta/graph-api-client';
import type { MetaGraphListResponse } from '@/lib/meta/types';
import type {
  FbLeadgenForm,
  FbLeadgenLead,
} from '@/lib/meta/lead-ads-types';

const SENTRY_OP = 'meta.lead_ads';

// ---------------------------------------------------------------------------
// Default field sets
// ---------------------------------------------------------------------------

const DEFAULT_FORM_FIELDS = [
  'id',
  'name',
  'status',
  'locale',
  'page',
  'leads_count',
  'created_time',
  'questions{key,label,type}',
].join(',');

const DEFAULT_LEAD_FIELDS = [
  'id',
  'created_time',
  'ad_id',
  'ad_name',
  'adset_id',
  'adset_name',
  'campaign_id',
  'campaign_name',
  'form_id',
  'is_organic',
  'platform',
  'field_data',
  'custom_disclaimer_responses',
].join(',');

// ---------------------------------------------------------------------------
// Call config
// ---------------------------------------------------------------------------

export interface LeadAdsCallConfig {
  /**
   * Page access token with scopes:
   *   leads_retrieval, pages_show_list, pages_manage_metadata, business_management
   */
  accessToken: string;
  /** Override Graph API version. Falls through to lib/meta default (v21.0). */
  apiVersion?: string;
}

// ---------------------------------------------------------------------------
// 1. listForms(pageId)
// ---------------------------------------------------------------------------

/**
 * List Lead Generation forms owned by a Facebook Page.
 *
 * Endpoint: `GET /{page-id}/leadgen_forms`
 *
 * Returns paginated forms with questions inlined. Auto-paginates via the
 * `after` cursor — callers receive a fully-merged array.
 */
export async function listForms(
  pageId: string,
  config: LeadAdsCallConfig,
  options?: { fields?: string; limit?: number }
): Promise<FbLeadgenForm[]> {
  const fields = options?.fields || DEFAULT_FORM_FIELDS;
  const limit = options?.limit ?? 100;

  const out: FbLeadgenForm[] = [];
  let after: string | undefined;

  // Hard cap pagination at 50 pages to avoid runaway loops on broken cursors.
  for (let page = 0; page < 50; page++) {
    const payload = await graphRequestData<MetaGraphListResponse<FbLeadgenForm>>({
      endpoint: `/${pageId}/leadgen_forms`,
      accessToken: config.accessToken,
      apiVersion: config.apiVersion,
      query: { fields, limit, after },
      sentryOp: SENTRY_OP,
      sentrySpanName: 'listForms',
    });

    if (payload.data?.length) out.push(...payload.data);

    const next = payload.paging?.cursors?.after;
    if (!next || !payload.paging?.next) break;
    after = next;
  }

  return out;
}

// ---------------------------------------------------------------------------
// 2. getForm(formId)
// ---------------------------------------------------------------------------

/**
 * Fetch a single Lead Gen form by id, including its question definitions.
 */
export async function getForm(
  formId: string,
  config: LeadAdsCallConfig,
  options?: { fields?: string }
): Promise<FbLeadgenForm> {
  return graphRequestData<FbLeadgenForm>({
    endpoint: `/${formId}`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: { fields: options?.fields || DEFAULT_FORM_FIELDS },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getForm',
  });
}

// ---------------------------------------------------------------------------
// 3. getLead(leadgenId)
// ---------------------------------------------------------------------------

/**
 * Fetch a single lead by its `leadgen_id`. This is the call made after a
 * webhook arrives — the webhook only carries the id; the field data lives
 * on the Graph endpoint.
 *
 * Endpoint: `GET /{leadgen-id}`
 *
 * Requires the Page token used to authenticate to have `leads_retrieval`
 * permission AND to belong to (or be assigned to) the Page that owns the form.
 */
export async function getLead(
  leadgenId: string,
  config: LeadAdsCallConfig,
  options?: { fields?: string }
): Promise<FbLeadgenLead> {
  return graphRequestData<FbLeadgenLead>({
    endpoint: `/${leadgenId}`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: { fields: options?.fields || DEFAULT_LEAD_FIELDS },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getLead',
  });
}

// ---------------------------------------------------------------------------
// 4. backfillLeads(formId, since)
// ---------------------------------------------------------------------------

export interface BackfillLeadsOptions {
  /**
   * ISO-8601 timestamp OR unix seconds. Returns only leads created at or
   * after this time. Passed to Meta as the `filtering` parameter (not
   * `since` — that's not supported on `/{form-id}/leads`).
   */
  since?: string | number;
  /** Page size hint. Meta caps at 100; default 100 here. */
  limit?: number;
  /** Override the field set. Default = full lead field set. */
  fields?: string;
  /** Hard pagination cap; default 100 pages. */
  maxPages?: number;
}

/**
 * Pull every lead submitted to a form since a timestamp. Auto-paginates and
 * returns a merged array. Use this for cron-driven backfill (Meta's webhook
 * is best-effort — drops happen).
 *
 * Endpoint: `GET /{form-id}/leads`
 *
 * Filtering uses Meta's `filtering` param (JSON-encoded array) because
 * `since` is not honored on this endpoint:
 *   filtering=[{"field":"time_created","operator":"GREATER_THAN","value":<unix>}]
 */
export async function backfillLeads(
  formId: string,
  config: LeadAdsCallConfig,
  options?: BackfillLeadsOptions
): Promise<FbLeadgenLead[]> {
  const fields = options?.fields || DEFAULT_LEAD_FIELDS;
  const limit = options?.limit ?? 100;
  const maxPages = options?.maxPages ?? 100;

  const sinceUnix = (() => {
    if (options?.since === undefined || options?.since === null) return undefined;
    if (typeof options.since === 'number') return Math.floor(options.since);
    const ms = Date.parse(options.since);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
  })();

  const filtering = sinceUnix
    ? JSON.stringify([
        { field: 'time_created', operator: 'GREATER_THAN', value: sinceUnix },
      ])
    : undefined;

  const out: FbLeadgenLead[] = [];
  let after: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const payload = await graphRequestData<MetaGraphListResponse<FbLeadgenLead>>({
      endpoint: `/${formId}/leads`,
      accessToken: config.accessToken,
      apiVersion: config.apiVersion,
      query: { fields, limit, after, filtering },
      sentryOp: SENTRY_OP,
      sentrySpanName: 'backfillLeads',
    });

    if (payload.data?.length) out.push(...payload.data);

    const next = payload.paging?.cursors?.after;
    if (!next || !payload.paging?.next) break;
    after = next;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Rate-limit-aware variant — surfaces the envelope so callers can pause
// polling when the response says we're near the per-app or per-business cap.
// ---------------------------------------------------------------------------

/**
 * Same as `getLead` but returns the full envelope (status + rateLimit) so
 * webhook receivers / cron poller can react to back-pressure.
 */
export async function getLeadWithMeta(
  leadgenId: string,
  config: LeadAdsCallConfig,
  options?: { fields?: string }
) {
  return graphRequest<FbLeadgenLead>({
    endpoint: `/${leadgenId}`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: { fields: options?.fields || DEFAULT_LEAD_FIELDS },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getLeadWithMeta',
  });
}
