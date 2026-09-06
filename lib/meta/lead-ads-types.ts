// lib/meta/lead-ads-types.ts
// Meta Lead Ads (Facebook Lead Generation) types — separate file from
// lib/meta/types.ts to avoid touching shared substrate.
//
// Reference: https://developers.facebook.com/docs/marketing-api/guides/lead-ads
//
// Server-only by convention. Used by:
//   - lib/meta/lead-ads-client.ts                 (Graph API methods)
//   - app/api/webhooks/meta/leadgen/route.ts      (webhook receiver)
//   - app/api/cron/meta-leadgen-backfill/route.ts (backfill cron)
//   - lib/services/admission/meta-lead-importer.ts (lead → CRM mapping)
//
// All identifiers from Meta are STRINGS (Graph IDs are 64-bit, JS-unsafe as
// numbers). All timestamps are ISO-8601 strings as returned by the Graph API.

// ---------------------------------------------------------------------------
// Lead Form
// ---------------------------------------------------------------------------

/**
 * Single question on a Lead Gen form. `key` is the stable identifier we use
 * in `meta_lead_field_mappings` to map a form question to a MyJKKN lead column.
 *
 * Standard Meta keys include: `full_name`, `first_name`, `last_name`,
 * `email`, `phone_number`, `city`, `state`, `country`, `dob`, plus
 * advertiser-defined `custom_*` keys for custom questions.
 */
export interface FbLeadField {
  key: string;
  label: string;
  type?: string;
}

/**
 * A Meta Lead Generation form. Returned by
 *   GET /{page-id}/leadgen_forms
 * Each form is owned by a Page and is referenced by Ads.
 */
export interface FbLeadgenForm {
  id: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DELETED' | 'PAUSED' | 'DRAFT' | string;
  locale?: string;
  page_id?: string;
  /** Total leads collected since the form was created — not paginated. */
  leads_count?: number;
  created_time?: string;
  /**
   * Form questions. Available when `fields=questions{...}` is requested.
   * Meta returns the question array under `questions` for newer forms and
   * under `qualifiers` for legacy forms — callers should accept either.
   */
  questions?: FbLeadField[];
}

// ---------------------------------------------------------------------------
// Lead
// ---------------------------------------------------------------------------

/**
 * A single field/value pair on a captured lead. `name` corresponds to a
 * `FbLeadField.key` from the form definition; `values` is an array because
 * multi-select questions can have multiple selected values.
 */
export interface FbLeadFieldData {
  name: string;
  values: string[];
}

/**
 * A captured lead. Returned by
 *   GET /{leadgen-id}
 *   GET /{form-id}/leads
 *
 * `created_time` is the lead-submission timestamp.
 * `ad_id`, `adset_id`, `campaign_id`, `form_id` are useful for attribution.
 */
export interface FbLeadgenLead {
  id: string;
  created_time: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  is_organic?: boolean;
  platform?: string;
  field_data: FbLeadFieldData[];
  /** Custom disclaimer responses (consent checkboxes), if the form has them. */
  custom_disclaimer_responses?: Array<{
    checkbox_key: string;
    values: string[];
  }>;
}

// ---------------------------------------------------------------------------
// Webhook payload (object=page, field=leadgen)
// ---------------------------------------------------------------------------

/**
 * The `value` payload inside `entry[].changes[]` when `field === 'leadgen'`.
 * Meta sends this when a new lead is submitted on a subscribed form.
 *
 * Note: `leadgen_id` is the only field guaranteed to be present. The actual
 * lead body must be fetched via `GET /{leadgen-id}` with a Page token that
 * has `leads_retrieval` permission.
 */
export interface FbLeadgenWebhookValue {
  leadgen_id: string;
  page_id: string;
  form_id: string;
  /** Unix seconds when the lead was created (NOT ISO). */
  created_time: number;
  ad_id?: string;
  adgroup_id?: string;
}

export interface FbLeadgenWebhookChange {
  field: 'leadgen' | string;
  value: FbLeadgenWebhookValue | unknown;
}

export interface FbLeadgenWebhookEntry {
  id: string;
  time?: number;
  changes: FbLeadgenWebhookChange[];
}

export interface FbLeadgenWebhookPayload {
  object: 'page' | string;
  entry: FbLeadgenWebhookEntry[];
}
