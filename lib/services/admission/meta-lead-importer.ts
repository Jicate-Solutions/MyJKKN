// lib/services/admission/meta-lead-importer.ts
// Maps a captured Meta Lead Ads lead → MyJKKN admission_leads via the
// canonical LeadService.captureLead() RPC path.
//
// Why this layer:
//   - The webhook receiver only knows the leadgen_id; the actual lead body
//     comes from a follow-up Graph fetch.
//   - The cron backfill enumerates a form's recent leads and needs the
//     same mapping logic the webhook uses.
//   - We DO NOT alter the existing `admission_leads` schema. Whitelisted
//     Meta question keys go into CreateLeadInput columns; everything else
//     lands in the LeadSourceCapture.raw_payload jsonb. The capture's
//     metadata is the audit trail.
//
// Server-only by convention — relies on a service-role Supabase client.
//
// Flow (called from the webhook / cron):
//   1. importMetaLead({ event, supabaseService, fetchLead })
//      → fetches the lead body via fetchLead(leadgen_id) callback
//      → resolves form + mappings + target institution
//      → builds CreateLeadInput + CaptureMetaInput
//      → calls LeadService.captureLead(..., supabaseOverride=service)
//      → updates the meta_leadgen_events row with result
//
// The fetchLead callback is injected so this module doesn't pull in
// lib/meta/lead-ads-client.ts (keeps it test-friendly).

import type { SupabaseClient } from '@supabase/supabase-js';
import { LeadService } from '@/lib/services/admission/lead-service';
import type {
  CreateLeadInput,
  CaptureMetaInput,
  CaptureLeadResult,
  LeadSource,
} from '@/types/admission';
import type {
  FbLeadgenLead,
  FbLeadgenWebhookValue,
} from '@/lib/meta/lead-ads-types';

// ---------------------------------------------------------------------------
// Whitelisted lead columns the importer is allowed to write to. The admin
// UI's field-mapping table enforces this on the user-facing side; this is
// the runtime guard so a stale row can't be smuggled in.
// ---------------------------------------------------------------------------

export const ALLOWED_LEAD_COLUMNS: ReadonlySet<keyof CreateLeadInput> = new Set<
  keyof CreateLeadInput
>([
  'first_name',
  'last_name',
  'phone',
  'email',
  'alternate_phone',
  'date_of_birth',
  'gender',
  'address_line1',
  'city',
  'state',
  'district',
  'pincode',
  'parent_name',
  'parent_phone',
  'parent_email',
  'twelfth_group',
  'notes',
  'preferred_channel',
  'student_interest_level',
  'parent_decision_status',
]);

// ---------------------------------------------------------------------------
// Lead source — Meta Lead Ads run on Facebook by default. We tag the lead
// with `facebook_ads` (existing enum value). Cross-platform Instagram lead
// forms route the same way per the Meta API contract.
// ---------------------------------------------------------------------------

const META_LEAD_SOURCE: LeadSource = 'facebook_ads';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetaLeadImporterDeps {
  /** Service-role Supabase client. Bypasses RLS for the cross-table write. */
  supabaseService: SupabaseClient;
  /**
   * Callback that hydrates the full lead body from Meta. Injected so this
   * module stays free of the Graph-API client (testability + reduced fan-out).
   */
  fetchLead: (leadgenId: string) => Promise<FbLeadgenLead>;
}

export interface MetaLeadImportRequest {
  /** Either the raw webhook value OR a synthetic one for backfill. */
  event: FbLeadgenWebhookValue;
  /** Optional pre-resolved meta_leadgen_events row id, if the caller already
   *  inserted one. If absent, the importer will insert one itself. */
  eventRowId?: string;
}

export type MetaLeadImportStatus =
  | 'imported'
  | 'merged'
  | 'failed'
  | 'skipped';

export interface MetaLeadImportResult {
  status: MetaLeadImportStatus;
  leadId?: string;
  eventRowId: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Process a single Meta leadgen event end-to-end: hydrate via Graph API,
 * map fields, call LeadService.captureLead, and persist the meta_leadgen_events
 * row outcome.
 *
 * Failure modes are all caught and recorded — this function does NOT throw on
 * normal failure paths. It only throws on unexpected Supabase errors that
 * should re-queue the webhook (Meta retries on non-2xx for ~24h).
 */
export async function importMetaLead(
  req: MetaLeadImportRequest,
  deps: MetaLeadImporterDeps
): Promise<MetaLeadImportResult> {
  const { supabaseService: db, fetchLead } = deps;
  const { event } = req;

  // 1. Insert or look up the meta_leadgen_events row.
  const eventRowId = await ensureEventRow(req, db);

  // 2. Bump attempt counter so we have visibility into stalled imports.
  await db
    .from('meta_leadgen_events')
    .update({ attempt_count: 0 })
    .eq('id', eventRowId);

  // 3. Resolve form + field mappings + target institution.
  const formCtx = await resolveFormContext(event.form_id, db);
  if (!formCtx.institutionId) {
    return finalizeFailure(
      eventRowId,
      db,
      'No institution_id resolved for this form (set meta_lead_forms.institution_id or seed meta.leadgen.default_institution_id policy).'
    );
  }

  // 4. Hydrate the lead body via Graph.
  let lead: FbLeadgenLead;
  try {
    lead = await fetchLead(event.leadgen_id);
  } catch (err) {
    return finalizeFailure(
      eventRowId,
      db,
      `fetchLead failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 5. Persist hydrated payload immediately (audit trail).
  await db
    .from('meta_leadgen_events')
    .update({ hydrated_payload: lead as unknown as Record<string, unknown> })
    .eq('id', eventRowId);

  // 6. Build the CreateLeadInput + CaptureMetaInput.
  let mapped: BuiltLeadInput;
  try {
    mapped = buildLeadInput({
      lead,
      institutionId: formCtx.institutionId,
      formId: formCtx.formId,
      fbFormId: event.form_id,
      mappings: formCtx.mappings,
    });
  } catch (err) {
    return finalizeFailure(
      eventRowId,
      db,
      `mapping failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!mapped.leadInput.phone) {
    return finalizeSkipped(
      eventRowId,
      db,
      'No phone number resolved from form fields — Meta lead has no MyJKKN-required phone, skipping.'
    );
  }

  // 7. Call captureLead via the canonical service path.
  let capture: CaptureLeadResult;
  try {
    capture = await LeadService.captureLead(
      mapped.leadInput,
      mapped.captureMeta,
      undefined, // no auth.user — this is a service-role insert
      db
    );
  } catch (err) {
    return finalizeFailure(
      eventRowId,
      db,
      `captureLead failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 8. Mark the event row done.
  const status: MetaLeadImportStatus =
    capture.action === 'created' ? 'imported' : 'merged';

  await db
    .from('meta_leadgen_events')
    .update({
      status,
      lead_id: capture.lead.id,
      processed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', eventRowId);

  // 9. Back-link the admission_leads row to this event for the "Received
  //    Leads" admin view. Failure here is non-fatal — capture already
  //    succeeded; this is only the reverse-lookup pointer.
  //
  // We only set this on `created` (the meta-leadgen event is the *origin*
  // of the lead). On `merged` the lead pre-existed via another channel,
  // so overwriting the pointer would lose that original attribution.
  if (capture.action === 'created') {
    try {
      await db
        .from('admission_leads')
        .update({ meta_leadgen_event_id: eventRowId })
        .eq('id', capture.lead.id);
    } catch {
      // Audit-only failure; do not change the import status.
    }
  }

  return { status, leadId: capture.lead.id, eventRowId };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface BuiltLeadInput {
  leadInput: CreateLeadInput;
  captureMeta: CaptureMetaInput;
}

interface FormContext {
  formId: string | null;
  institutionId: string | null;
  mappings: FieldMapping[];
}

interface FieldMapping {
  fb_field_key: string;
  lead_column: string;
  transform: string | null;
}

async function ensureEventRow(
  req: MetaLeadImportRequest,
  db: SupabaseClient
): Promise<string> {
  if (req.eventRowId) return req.eventRowId;

  const { data, error } = await db
    .from('meta_leadgen_events')
    .upsert(
      {
        fb_leadgen_id: req.event.leadgen_id,
        fb_form_id: req.event.form_id,
        fb_page_id: req.event.page_id,
        raw_payload: req.event as unknown as Record<string, unknown>,
        status: 'pending',
      },
      { onConflict: 'fb_leadgen_id', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert meta_leadgen_events: ${error?.message}`);
  }
  return data.id as string;
}

async function resolveFormContext(
  fbFormId: string,
  db: SupabaseClient
): Promise<FormContext> {
  const { data: form } = await db
    .from('meta_lead_forms')
    .select('id, institution_id')
    .eq('fb_form_id', fbFormId)
    .maybeSingle();

  let institutionId: string | null = (form?.institution_id as string) ?? null;
  const formId: string | null = (form?.id as string) ?? null;

  // Fallback: global default institution policy.
  if (!institutionId) {
    const { data: policy } = await db.rpc('fn_get_policy', {
      p_key: 'meta.leadgen.default_institution_id',
      p_scope_id: null,
    });
    if (typeof policy === 'string' && policy.length > 0) {
      institutionId = policy;
    }
  }

  let mappings: FieldMapping[] = [];
  if (formId) {
    const { data: rows } = await db
      .from('meta_lead_field_mappings')
      .select('fb_field_key, lead_column, transform')
      .eq('form_id', formId);
    mappings = (rows as FieldMapping[]) ?? [];
  }

  return { formId, institutionId, mappings };
}

/**
 * Build CreateLeadInput + CaptureMetaInput from a hydrated Meta lead +
 * configured mappings.
 *
 * Phone is required (CRM contract); we try in order:
 *   1. mapped `phone` column
 *   2. any field_data entry whose key is in PHONE_FALLBACK_KEYS
 *
 * First-name defaults to "Meta Lead" if neither `first_name` nor `full_name`
 * was mapped — LeadService.captureLead would otherwise reject the row.
 */
function buildLeadInput(args: {
  lead: FbLeadgenLead;
  institutionId: string;
  formId: string | null;
  fbFormId: string;
  mappings: FieldMapping[];
}): BuiltLeadInput {
  const { lead, institutionId, formId, fbFormId, mappings } = args;

  // Build a {key: values[]} lookup for the lead.
  const fieldValues: Record<string, string[]> = {};
  for (const fd of lead.field_data ?? []) {
    fieldValues[fd.name] = fd.values ?? [];
  }

  const mapped: Partial<CreateLeadInput> = {};

  for (const m of mappings) {
    if (!ALLOWED_LEAD_COLUMNS.has(m.lead_column as keyof CreateLeadInput)) {
      // Silently skip — a stale row pointing at a column we don't support.
      continue;
    }
    const raw = fieldValues[m.fb_field_key]?.[0];
    if (raw === undefined || raw === null || raw === '') continue;
    const v = applyTransform(raw, m.transform);
    (mapped as Record<string, unknown>)[m.lead_column] = v;
  }

  // Fallbacks for the CRM-required fields.
  const phone =
    (mapped.phone as string | undefined) ?? extractPhone(fieldValues);
  const firstName =
    (mapped.first_name as string | undefined) ??
    extractFirstName(fieldValues) ??
    'Meta Lead';

  const leadInput: CreateLeadInput = {
    institution_id: institutionId,
    first_name: firstName,
    phone: phone ?? '',
    source: META_LEAD_SOURCE,
    ...mapped,
  };

  const captureMeta: CaptureMetaInput = {
    source: META_LEAD_SOURCE,
    source_detail: `meta_lead_ads:${fbFormId}`,
    utm_source: 'facebook',
    utm_medium: 'lead_ads',
    utm_campaign: lead.campaign_name ?? lead.campaign_id ?? null,
    raw_payload: {
      meta_lead_id: lead.id,
      meta_form_id: lead.form_id ?? fbFormId,
      meta_internal_form_id: formId,
      ad_id: lead.ad_id ?? null,
      ad_name: lead.ad_name ?? null,
      adset_id: lead.adset_id ?? null,
      adset_name: lead.adset_name ?? null,
      campaign_id: lead.campaign_id ?? null,
      campaign_name: lead.campaign_name ?? null,
      platform: lead.platform ?? null,
      is_organic: lead.is_organic ?? null,
      field_data: lead.field_data ?? [],
      custom_disclaimer_responses: lead.custom_disclaimer_responses ?? [],
      created_time: lead.created_time,
    },
  };

  return { leadInput, captureMeta };
}

// ---------------------------------------------------------------------------
// Transforms — kept tiny and predictable. Unknown values are pass-through.
// ---------------------------------------------------------------------------

function applyTransform(raw: string, transform: string | null): string {
  const v = raw.trim();
  switch (transform) {
    case 'trim':
      return v;
    case 'lowercase':
      return v.toLowerCase();
    case 'phone_e164':
      return v.replace(/[^\d+]/g, '');
    case 'split_first_name':
      return v.split(/\s+/)[0] ?? v;
    default:
      return v;
  }
}

// ---------------------------------------------------------------------------
// Phone + first-name fallbacks (used when mapping is missing/empty)
// ---------------------------------------------------------------------------

const PHONE_FALLBACK_KEYS = [
  'phone_number',
  'phone',
  'mobile_number',
  'mobile',
  'work_phone_number',
];

const FIRST_NAME_KEYS = ['first_name', 'firstname'];
const FULL_NAME_KEYS = ['full_name', 'fullname', 'name'];

function extractPhone(
  fieldValues: Record<string, string[]>
): string | undefined {
  for (const k of PHONE_FALLBACK_KEYS) {
    const v = fieldValues[k]?.[0];
    if (v) return v.replace(/[^\d+]/g, '');
  }
  return undefined;
}

function extractFirstName(
  fieldValues: Record<string, string[]>
): string | undefined {
  for (const k of FIRST_NAME_KEYS) {
    const v = fieldValues[k]?.[0];
    if (v) return v.trim();
  }
  for (const k of FULL_NAME_KEYS) {
    const v = fieldValues[k]?.[0];
    if (v) return v.trim().split(/\s+/)[0];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Outcome finalizers
// ---------------------------------------------------------------------------

async function finalizeFailure(
  eventRowId: string,
  db: SupabaseClient,
  reason: string
): Promise<MetaLeadImportResult> {
  await db
    .from('meta_leadgen_events')
    .update({
      status: 'failed',
      error_message: reason,
      processed_at: new Date().toISOString(),
    })
    .eq('id', eventRowId);
  return { status: 'failed', eventRowId, reason };
}

async function finalizeSkipped(
  eventRowId: string,
  db: SupabaseClient,
  reason: string
): Promise<MetaLeadImportResult> {
  await db
    .from('meta_leadgen_events')
    .update({
      status: 'skipped',
      error_message: reason,
      processed_at: new Date().toISOString(),
    })
    .eq('id', eventRowId);
  return { status: 'skipped', eventRowId, reason };
}
