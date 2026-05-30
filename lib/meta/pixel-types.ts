// lib/meta/pixel-types.ts
// Types for Meta Pixel + Conversions API (CAPI).
//
// Server-only by convention. Imported by:
//   - lib/meta/pixel-client.ts        (low-level event poster)
//   - lib/meta/pixel-hash.ts          (PII normalization + SHA-256)
//   - app/api/meta/capi/track/route.ts (server-only POST endpoint)
//   - lib/services/admission/lead-capi-hooks.ts
//
// Reference:
//   https://developers.facebook.com/docs/marketing-api/conversions-api/parameters
//   https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters

// ---------------------------------------------------------------------------
// Standard event names (Meta-recognized — get full attribution treatment)
// ---------------------------------------------------------------------------

/**
 * Meta-recognized standard event names. Use these for events that map
 * cleanly to the catalog (PageView, Lead, Purchase, etc.) so the events
 * get full automatic optimization + attribution. For anything else, pass
 * a custom event name via `trackCustomEvent`.
 *
 * Reference:
 * https://developers.facebook.com/docs/meta-pixel/reference#standard-events
 */
export type CapiStandardEventName =
  | 'PageView'
  | 'Lead'
  | 'CompleteRegistration'
  | 'Contact'
  | 'Schedule'
  | 'SubmitApplication'
  | 'Subscribe'
  | 'StartTrial'
  | 'Purchase'
  | 'AddPaymentInfo'
  | 'AddToCart'
  | 'InitiateCheckout'
  | 'ViewContent'
  | 'Search';

export type CapiEventName = CapiStandardEventName | string;

// ---------------------------------------------------------------------------
// Customer information (user_data block)
// ---------------------------------------------------------------------------
//
// CAPI expects PII as lower-cased, trimmed, SHA-256-hashed strings. The
// raw plaintext should NEVER leave the server — see lib/meta/pixel-hash.ts
// for normalization + hash helpers.
//
// Field names match Meta's spec exactly so we can serialise this object
// straight to the wire.

/**
 * Hashed customer information block. All `em`/`ph`/`fn`/`ln`/`country`
 * values MUST be lower-cased, trimmed, then SHA-256 hashed before being
 * placed here. Pass plaintext through `hashUserData()` first.
 *
 * `client_ip_address` and `client_user_agent` should be the END USER's
 * values (forwarded from the browser), NOT the server's — Meta uses them
 * for deduplication with the browser-side Pixel event.
 */
export interface CapiUserData {
  /** SHA-256 of normalized email (lowercased + trimmed). */
  em?: string;
  /** SHA-256 of normalized phone (E.164, digits only — no `+`). */
  ph?: string;
  /** SHA-256 of normalized first name (lowercased + trimmed). */
  fn?: string;
  /** SHA-256 of normalized last name (lowercased + trimmed). */
  ln?: string;
  /** SHA-256 of ISO-3166-1 alpha-2 lower-cased country code (e.g. `in`). */
  country?: string;
  /** ISO-3166-1 alpha-2 lower-cased state/region (NOT hashed — Meta wants raw). */
  ct?: string;
  /** ZIP / PIN — lowercased + trimmed, then SHA-256. */
  zp?: string;
  /** External ID for the user — typically your DB user/profile id. SHA-256. */
  external_id?: string;
  /** End-user IP address (NOT hashed). Used for browser↔CAPI dedup. */
  client_ip_address?: string;
  /** End-user user-agent (NOT hashed). Used for browser↔CAPI dedup. */
  client_user_agent?: string;
  /** Facebook click ID from `_fbc` cookie. Pass raw. */
  fbc?: string;
  /** Facebook browser ID from `_fbp` cookie. Pass raw. */
  fbp?: string;
}

// ---------------------------------------------------------------------------
// Custom data (purchase value, currency, content ids, etc.)
// ---------------------------------------------------------------------------

/**
 * Optional event-payload metadata. Required fields depend on the event:
 *   Purchase  → `value` + `currency` required
 *   Lead      → both optional (but `value` improves bid optimization)
 *   PageView  → both omitted
 */
export interface CapiCustomData {
  /** Monetary value of the event (Purchase, Lead, AddPaymentInfo, etc.). */
  value?: number;
  /** ISO-4217 currency code (e.g. `INR`, `USD`). Required when `value` is set. */
  currency?: string;
  /** Free-text content name (e.g. course title, lead source). */
  content_name?: string;
  /** Catalog / taxonomy slot. */
  content_category?: string;
  /** Array of content IDs (e.g. course slugs, SKUs). */
  content_ids?: string[];
  /** `product` for catalog, `product_group` for variants. */
  content_type?: 'product' | 'product_group';
  /** Number of items in the event. */
  num_items?: number;
  /** Order id / external reference (Purchase). */
  order_id?: string;
  /** Free-text status string used by Meta for Lead-funnel reporting. */
  status?: string;
  /** Free-text search term (Search event). */
  search_string?: string;
  /** Predicted lifetime-value (advanced bidder hint). */
  predicted_ltv?: number;
  /** Arbitrary extras — Meta will accept these as long as they're JSON-serialisable. */
  [extra: string]: unknown;
}

// ---------------------------------------------------------------------------
// Event envelope
// ---------------------------------------------------------------------------

/**
 * One event in a CAPI `/events` batch.
 *
 * Dedupe contract (CRITICAL):
 *   Always set `event_id`. CAPI events without an `event_id` cannot be
 *   deduplicated against the browser-side Pixel event for the same user
 *   action — you'll double-count conversions. Use the source record's
 *   stable id (e.g. `lead-${lead.id}`, `purchase-${order.id}`).
 *
 *   The same `event_id` MUST be emitted by both the browser Pixel call
 *   (`fbq('track', 'Lead', {}, { eventID: 'lead-123' })`) and the server
 *   CAPI call. Meta uses the pair `(event_name, event_id)` for dedup.
 */
export interface CapiEvent {
  /** Event name. Standard names get the best attribution treatment. */
  event_name: CapiEventName;
  /** Unix seconds when the event happened (server-time is fine for CAPI). */
  event_time: number;
  /**
   * Stable dedup key — pair `(event_name, event_id)` MUST match the browser
   * Pixel event for the same conversion. See dedupe contract above.
   */
  event_id?: string;
  /** Source URL where the conversion happened. */
  event_source_url?: string;
  /** `website` for browser conversions; omit for offline. */
  action_source?:
    | 'website'
    | 'email'
    | 'app'
    | 'phone_call'
    | 'chat'
    | 'physical_store'
    | 'system_generated'
    | 'other';
  /** Hashed PII block. */
  user_data: CapiUserData;
  /** Optional event-specific metadata. */
  custom_data?: CapiCustomData;
  /** When testing, set to the `Test Event Code` from Events Manager. */
  opt_out?: boolean;
}

// ---------------------------------------------------------------------------
// Request / response shapes
// ---------------------------------------------------------------------------

/**
 * Body posted to `/{pixel_id}/events`.
 */
export interface CapiEventsRequestBody {
  data: CapiEvent[];
  /**
   * Meta Test Event Code (from Events Manager → Test Events tab). When
   * present, the event is routed to the test panel only — does NOT count
   * toward live attribution. Use during integration testing.
   */
  test_event_code?: string;
  /** Partner attribution string. Optional. */
  partner_agent?: string;
}

/**
 * Response from `/{pixel_id}/events` on success.
 */
export interface CapiEventsResponse {
  events_received: number;
  messages: string[];
  fbtrace_id: string;
}

// ---------------------------------------------------------------------------
// Convenience input shape used by trackLead / trackPurchase / etc.
// ---------------------------------------------------------------------------

/**
 * High-level input the helper trackers accept. The pixel-client converts
 * this into a `CapiEvent` (hashing PII, defaulting timestamps, etc.).
 */
export interface CapiTrackInput {
  /** Stable dedup key (see CapiEvent.event_id). */
  eventId?: string;
  /** Plaintext PII — will be normalized + SHA-256 hashed inside the client. */
  user?: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    country?: string;
    externalId?: string;
    zip?: string;
  };
  /** Pre-hashed user_data (use when caller already hashed). Merges over `user`. */
  userDataRaw?: Partial<CapiUserData>;
  /** Custom data (purchase value, content ids, etc.). */
  customData?: CapiCustomData;
  /** Source URL where the event happened. */
  eventSourceUrl?: string;
  /** Override action_source (defaults to `website`). */
  actionSource?: CapiEvent['action_source'];
  /** Override event_time (unix seconds). Defaults to now. */
  eventTime?: number;
  /** Meta Test Event Code — set to route to the test panel. */
  testEventCode?: string;
}

// ---------------------------------------------------------------------------
// Configuration injected at call-site
// ---------------------------------------------------------------------------

/**
 * Per-call config the pixel-client requires. The institution-level pixel id
 * + access token are resolved by the caller (typically via platform_policies
 * read + env-var lookup) and passed in.
 */
export interface CapiClientConfig {
  /** Meta Pixel id (numeric string). Resolved from `meta.capi.pixel_id` policy. */
  pixelId: string;
  /**
   * Long-lived Meta access token with `ads_management` (write) scope, or
   * `ads_read` if your Pixel ownership permits read-only event posting.
   * Resolved at runtime from process.env using the env-var name stored in
   * the `meta.capi.access_token_ref` policy — the token itself is NEVER in
   * the policy row.
   */
  accessToken: string;
  /** Optional Test Event Code (Events Manager → Test Events). */
  testEventCode?: string;
  /** Override Graph API version. */
  apiVersion?: string;
  /** Partner agent string (analytics attribution). */
  partnerAgent?: string;
}
