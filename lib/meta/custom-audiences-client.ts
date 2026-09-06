// PII HASHING REQUIRED.
// ALL user data (em, ph, fn, ln, country, ct, st, zip, ge, doby) MUST be
// SHA-256 hashed AFTER normalization (lowercase, trim, E.164 for phone)
// BEFORE sending to Meta. NEVER send plain email or phone over the wire.

// lib/meta/custom-audiences-client.ts
// Meta Marketing API — Custom Audiences client. Built on
// `lib/meta/graph-api-client.ts` (do not modify).
//
// Scope:
//   - createAudience(adAccountId, name, description)
//   - addUsersToAudience(audienceId, users[])    // users are RAW; hashed here
//   - removeUsersToAudience(audienceId, users[]) // users are RAW; hashed here
//   - listAudiences(adAccountId)
//   - getAudience(audienceId)
//
// All user-row payloads are SHA-256 hashed at the boundary via
// `lib/meta/audience-hash.ts`. Callers pass RAW PII; we never let raw PII
// touch the wire. See the file-top contract.
//
// Sentry op = `meta.custom_audiences` so traces surface separately from
// Instagram + WhatsApp.

import {
  graphRequestData,
} from '@/lib/meta/graph-api-client';
import {
  META_USER_SCHEMA,
  hashUserPayload,
  hasAnyMatchKey,
  type RawUserPayload,
} from '@/lib/meta/audience-hash';
import type { MetaGraphListResponse } from '@/lib/meta/types';

const SENTRY_OP = 'meta.custom_audiences';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetaAudienceCallConfig {
  /** Long-lived access token with `ads_management` + `business_management`. */
  accessToken: string;
  /** Override Graph API version. Default = lib/meta default. */
  apiVersion?: string;
}

export interface CreateAudienceInput {
  /** Display name as it will appear in Ads Manager. Max 100 chars. */
  name: string;
  /** Optional description. */
  description?: string;
  /**
   * Subtype is locked to CUSTOM for first-party-data audiences. Pass
   * 'LOOKALIKE' if you're seeding a lookalike (out of scope for v1).
   */
  subtype?: 'CUSTOM' | 'LOOKALIKE';
  /**
   * Required by Meta when subtype=CUSTOM. We default to true (MyJKKN is
   * the data origin — first-party admission / learner data) and require
   * the caller to flip it explicitly if not.
   */
  customerFileSource?: 'USER_PROVIDED_ONLY' | 'PARTNER_PROVIDED_ONLY' | 'BOTH_USER_AND_PARTNER_PROVIDED';
}

export interface MetaAudienceSummary {
  id: string;
  name: string;
  subtype?: string;
  approximate_count?: number;
  time_created?: number;
  time_updated?: number;
}

export interface AudienceUsersPushResult {
  /** Meta's audience id (echoed back). */
  audience_id: string;
  /**
   * Meta's `num_received` — how many rows it accepted. Rows with no match
   * keys are silently dropped by us BEFORE send (see `hasAnyMatchKey`).
   */
  num_received: number;
  /** Meta's `num_invalid_entries`. */
  num_invalid_entries: number;
  /**
   * How many rows we filtered out client-side because they had no match
   * keys (all empty after hashing). Useful for the sync history log.
   */
  num_skipped_no_match_key: number;
  /** Meta's session id (for follow-up status calls; v1 doesn't use it). */
  session_id?: number;
}

// ---------------------------------------------------------------------------
// 1. createAudience
// ---------------------------------------------------------------------------

/**
 * Create a new Custom Audience under the given ad account.
 *
 * Endpoint: `POST /act_{ad-account-id}/customaudiences`
 *
 * The returned audience starts with zero users. Call `addUsersToAudience`
 * to populate it.
 *
 * Note: `adAccountId` may be passed WITH or WITHOUT the `act_` prefix; we
 * normalize. Meta requires it on the wire.
 */
export async function createAudience(
  adAccountId: string,
  input: CreateAudienceInput,
  config: MetaAudienceCallConfig
): Promise<{ id: string }> {
  const acct = normalizeAdAccountId(adAccountId);
  const subtype = input.subtype || 'CUSTOM';

  const body: Record<string, unknown> = {
    name: input.name,
    subtype,
  };
  if (input.description) body.description = input.description;
  if (subtype === 'CUSTOM') {
    body.customer_file_source =
      input.customerFileSource || 'USER_PROVIDED_ONLY';
  }

  return graphRequestData<{ id: string }>({
    endpoint: `/${acct}/customaudiences`,
    method: 'POST',
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    body,
    sentryOp: SENTRY_OP,
    sentrySpanName: 'createAudience',
  });
}

// ---------------------------------------------------------------------------
// 2. addUsersToAudience
// ---------------------------------------------------------------------------

/**
 * Add users to a Custom Audience.
 *
 * Endpoint: `POST /{audience-id}/users`
 *
 * IMPORTANT: callers pass RAW user payloads. This function SHA-256 hashes
 * every field at the boundary; raw PII never touches the network. Rows
 * with no usable match key (every field empty after normalization) are
 * dropped before send and counted in `num_skipped_no_match_key`.
 *
 * Meta caps payload at 10,000 users per call. Callers (or the sync cron)
 * must batch larger jobs; we throw if exceeded so the caller chunks
 * deliberately instead of silently truncating.
 */
export async function addUsersToAudience(
  audienceId: string,
  users: RawUserPayload[],
  config: MetaAudienceCallConfig
): Promise<AudienceUsersPushResult> {
  return sendUsersOp({
    audienceId,
    users,
    config,
    method: 'POST',
    spanName: 'addUsersToAudience',
  });
}

// ---------------------------------------------------------------------------
// 3. removeUsersFromAudience
// ---------------------------------------------------------------------------

/**
 * Remove users from a Custom Audience.
 *
 * Endpoint: `DELETE /{audience-id}/users`
 *
 * Same hashing + batching contract as `addUsersToAudience`.
 */
export async function removeUsersFromAudience(
  audienceId: string,
  users: RawUserPayload[],
  config: MetaAudienceCallConfig
): Promise<AudienceUsersPushResult> {
  return sendUsersOp({
    audienceId,
    users,
    config,
    method: 'DELETE',
    spanName: 'removeUsersFromAudience',
  });
}

// ---------------------------------------------------------------------------
// 4. listAudiences
// ---------------------------------------------------------------------------

/**
 * List Custom Audiences under the given ad account. Paginates implicitly
 * (returns the first page; caller can extend if needed).
 *
 * Endpoint: `GET /act_{ad-account-id}/customaudiences`
 */
export async function listAudiences(
  adAccountId: string,
  config: MetaAudienceCallConfig,
  options?: { limit?: number; after?: string }
): Promise<MetaGraphListResponse<MetaAudienceSummary>> {
  const acct = normalizeAdAccountId(adAccountId);

  return graphRequestData<MetaGraphListResponse<MetaAudienceSummary>>({
    endpoint: `/${acct}/customaudiences`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: {
      fields: 'id,name,subtype,approximate_count,time_created,time_updated',
      limit: options?.limit ?? 50,
      after: options?.after,
    },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'listAudiences',
  });
}

// ---------------------------------------------------------------------------
// 5. getAudience
// ---------------------------------------------------------------------------

/**
 * Fetch a single audience by id.
 *
 * Endpoint: `GET /{audience-id}`
 */
export async function getAudience(
  audienceId: string,
  config: MetaAudienceCallConfig
): Promise<MetaAudienceSummary> {
  return graphRequestData<MetaAudienceSummary>({
    endpoint: `/${audienceId}`,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    query: {
      fields: 'id,name,subtype,approximate_count,time_created,time_updated',
    },
    sentryOp: SENTRY_OP,
    sentrySpanName: 'getAudience',
  });
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Hard cap per Meta docs. We throw rather than truncate. */
export const META_USERS_PER_CALL_CAP = 10000;

function normalizeAdAccountId(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

/**
 * Shared engine for add/remove. Hashes user rows at the boundary, filters
 * empty rows, sends one batched request.
 */
async function sendUsersOp(args: {
  audienceId: string;
  users: RawUserPayload[];
  config: MetaAudienceCallConfig;
  method: 'POST' | 'DELETE';
  spanName: string;
}): Promise<AudienceUsersPushResult> {
  const { audienceId, users, config, method, spanName } = args;

  if (users.length > META_USERS_PER_CALL_CAP) {
    throw new Error(
      `Meta custom-audiences user push exceeds per-call cap of ${META_USERS_PER_CALL_CAP} ` +
        `(received ${users.length}). Caller must chunk explicitly.`
    );
  }

  // Hash at the boundary. raw -> hashed rows aligned to META_USER_SCHEMA.
  let numSkipped = 0;
  const hashedRows: string[][] = [];
  for (const u of users) {
    const row = hashUserPayload(u);
    if (!hasAnyMatchKey(row)) {
      numSkipped += 1;
      continue;
    }
    hashedRows.push(row);
  }

  // All-empty payload: short-circuit, do not hit Meta.
  if (hashedRows.length === 0) {
    return {
      audience_id: audienceId,
      num_received: 0,
      num_invalid_entries: 0,
      num_skipped_no_match_key: numSkipped,
    };
  }

  // Meta's wire format for /{audience}/users:
  //   { payload: { schema: [...], data: [[hashedField, ...], ...] } }
  const body = {
    payload: {
      schema: [...META_USER_SCHEMA],
      data: hashedRows,
    },
  };

  type MetaUsersResponse = {
    audience_id: string;
    num_received?: number;
    num_invalid_entries?: number;
    session_id?: number;
  };

  const resp = await graphRequestData<MetaUsersResponse>({
    endpoint: `/${audienceId}/users`,
    method,
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    body,
    sentryOp: SENTRY_OP,
    sentrySpanName: spanName,
  });

  return {
    audience_id: resp.audience_id ?? audienceId,
    num_received: resp.num_received ?? hashedRows.length,
    num_invalid_entries: resp.num_invalid_entries ?? 0,
    num_skipped_no_match_key: numSkipped,
    session_id: resp.session_id,
  };
}
