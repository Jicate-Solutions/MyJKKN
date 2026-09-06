export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/social/lead-ads/leads
 *
 * "Received Leads" admin view for the /admin/social/lead-ads page.
 *
 * Surfaces meta_leadgen_events that have been hydrated by the importer,
 * joined with the admission_leads row when the importer succeeded. This
 * answers the question "which Meta submissions have we received, and did
 * we manage to create CRM leads from them?".
 *
 * Shape per row (1:1 with a Meta submission):
 *   - event_id, fb_leadgen_id, fb_form_id, form_name (from meta_lead_forms)
 *   - submitted_at (received_at), processed_at, status
 *   - full_name / email / phone — read from hydrated_payload.field_data
 *   - lead_id, lead_full_name — from joined admission_leads (when imported)
 *   - error_message — from the event row when failed/skipped
 *
 * Role gate: super_admin / administrator (RLS already enforces this on
 * meta_leadgen_events; we also check here so 401/403 are clean).
 *
 * Query params:
 *   - limit (1..200, default 50)
 *   - form_id (uuid, optional) — meta_lead_forms.id
 *   - status (optional) — filter to a single event status
 *   - only_imported (boolean, optional) — narrow to status IN (imported, merged)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type LeadgenEventStatus = 'pending' | 'imported' | 'merged' | 'failed' | 'skipped';

async function requireAdmin(permissionKey: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (!profile) return { ok: false as const, status: 403 };

  let allowed =
    profile.is_super_admin ||
    profile.role === 'super_admin' ||
    profile.role === 'administrator';

  // 2026-06-11 granular-permission retrofit: roles granted the social.*
  // key via Role Management pass too.
  if (!allowed) {
    const { data: perm } = await supabase.rpc('user_has_permission', {
      permission_name: permissionKey,
    });
    allowed = !!perm;
  }
  if (!allowed) return { ok: false as const, status: 403 };

  return { ok: true as const, supabase };
}

// Pull a single value for a Meta field key out of the hydrated payload.
// field_data is an array of { name, values: string[] }.
function extractField(
  hydrated: Record<string, unknown> | null,
  keys: string[]
): string | null {
  if (!hydrated || typeof hydrated !== 'object') return null;
  const fieldData = (hydrated as { field_data?: Array<{ name?: string; values?: string[] }> })
    .field_data;
  if (!Array.isArray(fieldData)) return null;
  for (const key of keys) {
    const match = fieldData.find(
      (f) => typeof f?.name === 'string' && f.name.toLowerCase() === key.toLowerCase()
    );
    const v = match?.values?.[0];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

const FULL_NAME_KEYS = ['full_name', 'fullname', 'name'];
const FIRST_NAME_KEYS = ['first_name', 'firstname'];
const LAST_NAME_KEYS = ['last_name', 'lastname'];
const EMAIL_KEYS = ['email', 'email_address'];
const PHONE_KEYS = ['phone_number', 'phone', 'mobile_number', 'mobile', 'work_phone_number'];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin('social.lead_ads.view');
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  const supabase = auth.supabase;
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '50'), 1), 200);
  const formId = url.searchParams.get('form_id');
  const status = url.searchParams.get('status') as LeadgenEventStatus | null;
  const onlyImported = url.searchParams.get('only_imported') === 'true';

  // Pull events. We join meta_lead_forms for the form display name and
  // left-join admission_leads to get the human-readable lead label.
  // PostgREST embed syntax: `relation:fk(cols)` — left join by default
  // (we deliberately do NOT use !inner so events without a lead still show).
  let q = supabase
    .from('meta_leadgen_events')
    .select(
      `id,
       form_id,
       fb_form_id,
       fb_page_id,
       fb_leadgen_id,
       status,
       lead_id,
       hydrated_payload,
       error_message,
       received_at,
       processed_at,
       attempt_count,
       form:meta_lead_forms!form_id(id, name, fb_form_id),
       lead:admission_leads!lead_id(id, full_name, email, phone, funnel_stage, institution_id)
      `
    )
    .order('received_at', { ascending: false })
    .limit(limit);

  if (formId) q = q.eq('form_id', formId);
  if (status) q = q.eq('status', status);
  if (onlyImported) q = q.in('status', ['imported', 'merged']);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((row) => {
    const hydrated = (row.hydrated_payload as Record<string, unknown> | null) ?? null;
    const directFullName = extractField(hydrated, FULL_NAME_KEYS);
    const composedFullName =
      [
        extractField(hydrated, FIRST_NAME_KEYS),
        extractField(hydrated, LAST_NAME_KEYS),
      ]
        .filter(Boolean)
        .join(' ') || null;
    const fullName = directFullName ?? composedFullName;
    const email = extractField(hydrated, EMAIL_KEYS);
    const phone = extractField(hydrated, PHONE_KEYS);

    // PostgREST embed returns the related row as object (or null for left join);
    // some versions wrap in an array — handle both for resilience.
    const formRel = Array.isArray(row.form) ? row.form[0] : row.form;
    const leadRel = Array.isArray(row.lead) ? row.lead[0] : row.lead;

    return {
      event_id: row.id as string,
      fb_leadgen_id: row.fb_leadgen_id as string,
      fb_form_id: row.fb_form_id as string | null,
      fb_page_id: row.fb_page_id as string | null,
      form_id: row.form_id as string | null,
      form_name: (formRel?.name as string | undefined) ?? null,
      status: row.status as LeadgenEventStatus,
      submitted_at: row.received_at as string,
      processed_at: row.processed_at as string | null,
      attempt_count: (row.attempt_count as number | null) ?? 0,
      error_message: row.error_message as string | null,
      // From hydrated_payload
      full_name: fullName || null,
      email,
      phone,
      // From joined admission_leads row (null when not yet imported)
      lead_id: (leadRel?.id as string | undefined) ?? null,
      lead_full_name: (leadRel?.full_name as string | undefined) ?? null,
      lead_funnel_stage: (leadRel?.funnel_stage as string | undefined) ?? null,
    };
  });

  return NextResponse.json({ ok: true, data: rows });
}
