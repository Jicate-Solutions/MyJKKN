// ============================================================================
// template-design-client — browser-side helpers for the Card design tab.
// Created: 2026-07-24 — Canva-background workflow.
//
//   • fetchTemplatesWithLayout() — templates incl. front/back layout JSON
//   • uploadCardBackground()     — PNG/JPEG/WebP → id-card-assets bucket
//   • setTemplateBackground()    — merge/remove background_image in
//                                  front_layout_json (other keys preserved)
//
// Back side (DARK, 2026-07-25): backEnabledOf / setTemplateBackEnabled /
// backImageUrlOf / uploadCardBackBackground / setTemplateBackBackground —
// same patterns against back_layout_json (null = back side off; {} = on
// with the default back design).
//
// All calls go through the session-scoped browser client, so RLS and the
// storage policies (id_cards.templates.edit) stay in force.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { purposeOfLayout, type TemplatePurpose } from '@/lib/id-cards/template-purpose';

export type TemplateDesignRow = {
  id: string;
  name: string | null;
  active: boolean;
  /** institutions.id this template is assigned to (null = unassigned/shared). */
  institution_id: string | null;
  front_layout_json: Record<string, unknown> | null;
  back_layout_json: Record<string, unknown> | null;
};

const BUCKET = 'id-card-assets';

export const BACKGROUND_MAX_UPLOAD_BYTES = 6 * 1024 * 1024; // matches bucket limit
export const ALLOWED_BACKGROUND_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp'
] as const;

export function backgroundImageUrlOf(row: TemplateDesignRow): string | null {
  const value = row.front_layout_json?.background_image;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export async function fetchTemplatesWithLayout(): Promise<TemplateDesignRow[]> {
  const supabase = createClientSupabaseClient();
  // id_card_templates is not yet present in the generated Database types
  // (types/supabase.ts) — cast for this one query. RLS still applies.
  const { data, error } = await (supabase.from('id_card_templates' as never) as any)
    .select('id, name, active, institution_id, front_layout_json, back_layout_json')
    .order('active', { ascending: false })
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as TemplateDesignRow[];
}

/** Upload artwork and return its public URL. Throws with a plain message. */
export async function uploadCardBackground(
  templateId: string,
  file: File
): Promise<string> {
  if (!(ALLOWED_BACKGROUND_TYPES as readonly string[]).includes(file.type)) {
    throw new Error('Artwork must be a PNG, JPEG or WebP image.');
  }
  if (file.size > BACKGROUND_MAX_UPLOAD_BYTES) {
    throw new Error('Artwork is larger than 6 MB — export a smaller file.');
  }
  const supabase = createClientSupabaseClient();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `backgrounds/${templateId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ─────────────────────────────────────────────────────────────────────────────
// Institution block (2026-09-05) — front_layout_json.institution + institution_id
// ─────────────────────────────────────────────────────────────────────────────

export type TemplateInstitutionBlock = {
  name?: string;
  header_text?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  logo_image?: string;
  principal_name?: string;
  principal_designation?: string;
  principal_signature_image?: string;
};

/** The template's purpose (Learners / Senior Learners / …) — see lib/id-cards/template-purpose. */
export function purposeOf(row: TemplateDesignRow): TemplatePurpose {
  return purposeOfLayout(row.front_layout_json);
}

/** Save the purpose block, preserving every other key in front_layout_json. */
export async function setTemplatePurpose(
  template: TemplateDesignRow,
  purpose: TemplatePurpose
): Promise<void> {
  const next: Record<string, unknown> = { ...(template.front_layout_json ?? {}), purpose };
  const supabase = createClientSupabaseClient();
  const { error } = await (supabase.from('id_card_templates' as never) as any)
    .update({ front_layout_json: next, updated_at: new Date().toISOString() })
    .eq('id', template.id);
  if (error) throw new Error(error.message);
}

/**
 * Create a template. Rides the id_card_templates_create RLS policy
 * (id_cards.templates.create). `active` is the operator's choice — activating
 * one template never deactivates another (an institution keeps several live).
 */
export async function createTemplate(input: {
  /** Client-reserved uuid so logo/signature can be uploaded BEFORE the row exists. */
  id?: string;
  name: string;
  institutionId: string | null;
  purpose: TemplatePurpose;
  active: boolean;
  /** Institution details captured in the same dialog (all optional). */
  institution?: TemplateInstitutionBlock;
}): Promise<string> {
  const supabase = createClientSupabaseClient();
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.institution ?? {})) {
    if (typeof v === 'string' && v.trim() !== '') cleaned[k] = v.trim();
  }
  const frontLayout: Record<string, unknown> = { purpose: input.purpose };
  if (Object.keys(cleaned).length > 0) frontLayout.institution = cleaned;
  const { data, error } = await (supabase.from('id_card_templates' as never) as any)
    .insert({
      ...(input.id ? { id: input.id } : {}),
      name: input.name.trim(),
      institution_id: input.institutionId,
      active: input.active,
      front_layout_json: frontLayout,
      back_layout_json: null,
      field_mappings: []
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

/**
 * Starting values for a NEW template's institution block, read from the
 * `institutions` row (name/email/phone/website/address/logo). The in-charge
 * edits them in the dialog; what is saved lives on the template, not here.
 */
export async function fetchInstitutionDefaults(
  institutionId: string
): Promise<TemplateInstitutionBlock> {
  const supabase = createClientSupabaseClient();
  const { data, error } = await supabase
    .from('institutions')
    .select('name, email, phone, website, logo_url, address_line1, address_line2, address_line3, city, state, pin_code')
    .eq('id', institutionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return {};
  const row = data as {
    name: string | null; email: string | null; phone: string | null; website: string | null;
    logo_url: string | null; address_line1: string | null; address_line2: string | null;
    address_line3: string | null; city: string | null; state: string | null; pin_code: string | null;
  };
  const address = [row.address_line1, row.address_line2, row.address_line3, row.city, row.state, row.pin_code]
    .map((v) => (v ?? '').trim())
    .filter((v) => v !== '')
    .join(', ');
  const out: TemplateInstitutionBlock = {};
  if (row.name?.trim()) out.header_text = row.name.trim().toUpperCase();
  if (row.email?.trim()) out.email = row.email.trim();
  if (row.phone?.trim()) out.phone = row.phone.trim();
  if (row.website?.trim()) out.website = row.website.trim();
  if (address) out.address = address;
  if (row.logo_url && /^https:\/\//i.test(row.logo_url.trim())) out.logo_image = row.logo_url.trim();
  return out;
}

export function institutionBlockOf(row: TemplateDesignRow): TemplateInstitutionBlock {
  const raw = row.front_layout_json?.institution;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: TemplateInstitutionBlock = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim() !== '') (out as Record<string, string>)[k] = v.trim();
  }
  return out;
}

/** Upload a logo or principal signature to the id-card-assets bucket; returns its public URL. */
export async function uploadCardAsset(
  templateId: string,
  kind: 'logo' | 'signature',
  file: File
): Promise<string> {
  if (!(ALLOWED_BACKGROUND_TYPES as readonly string[]).includes(file.type)) {
    throw new Error('Image must be a PNG, JPEG or WebP.');
  }
  if (file.size > BACKGROUND_MAX_UPLOAD_BYTES) {
    throw new Error('Image is larger than 6 MB.');
  }
  const supabase = createClientSupabaseClient();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `${kind}s/${templateId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Save the template's institution assignment + institution block (+ optionally
 * its purpose) in ONE write, preserving every other key in front_layout_json.
 * Empty strings clear a field.
 *
 * One write matters: two sequential updates that each spread the row's OLD
 * front_layout_json would have the second silently drop what the first wrote
 * (the bug behind "unable to update details", 2026-09-05).
 */
export async function setTemplateInstitution(
  template: TemplateDesignRow,
  institutionId: string | null,
  block: TemplateInstitutionBlock,
  purpose?: TemplatePurpose
): Promise<void> {
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(block)) {
    if (typeof v === 'string' && v.trim() !== '') cleaned[k] = v.trim();
  }
  const next: Record<string, unknown> = { ...(template.front_layout_json ?? {}) };
  if (Object.keys(cleaned).length > 0) next.institution = cleaned;
  else delete next.institution;
  if (purpose) next.purpose = purpose;
  const supabase = createClientSupabaseClient();
  const { error } = await (supabase.from('id_card_templates' as never) as any)
    .update({
      institution_id: institutionId,
      front_layout_json: next,
      updated_at: new Date().toISOString()
    })
    .eq('id', template.id);
  if (error) throw new Error(error.message);
}

/**
 * Set (url) or clear (null) the template's background_image, preserving every
 * other key already stored in front_layout_json.
 */
export async function setTemplateBackground(
  template: TemplateDesignRow,
  url: string | null
): Promise<void> {
  const next: Record<string, unknown> = { ...(template.front_layout_json ?? {}) };
  if (url) {
    next.background_image = url;
  } else {
    delete next.background_image;
  }
  const supabase = createClientSupabaseClient();
  const { error } = await (supabase.from('id_card_templates' as never) as any)
    .update({ front_layout_json: next, updated_at: new Date().toISOString() })
    .eq('id', template.id);
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// Availability for printing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Switch a template on (offered on every print picker) or off (design-only).
 *
 * `active` defaults FALSE in the schema and until now NOTHING in the codebase
 * ever wrote it — a template could only be switched on by a hand-run SQL
 * UPDATE. That is why this ships alongside the print-picker filter: without it,
 * hiding inactive templates from the pickers would block printing outright with
 * no way back from inside the app.
 *
 * Same shape, table and session client as setTemplateBackEnabled, so it rides
 * the id_cards.templates.edit RLS path already proven in production.
 */
export async function setTemplateActive(
  template: TemplateDesignRow,
  active: boolean
): Promise<void> {
  const supabase = createClientSupabaseClient();
  const { error } = await (supabase.from('id_card_templates' as never) as any)
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', template.id);
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// Back side (DARK feature)
// ─────────────────────────────────────────────────────────────────────────────

/** Back side is enabled when back_layout_json is non-null ({} = defaults). */
export function backEnabledOf(row: TemplateDesignRow): boolean {
  return row.back_layout_json !== null && row.back_layout_json !== undefined;
}

export function backImageUrlOf(row: TemplateDesignRow): string | null {
  const value = row.back_layout_json?.background_image;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * Turn the back side on ({} → default back design) or off (null).
 * Turning it off DISCARDS the template's back configuration — the caller's
 * UI copy must say so.
 */
export async function setTemplateBackEnabled(
  template: TemplateDesignRow,
  enabled: boolean
): Promise<void> {
  const next: Record<string, unknown> | null = enabled
    ? { ...(template.back_layout_json ?? {}) }
    : null;
  const supabase = createClientSupabaseClient();
  const { error } = await (supabase.from('id_card_templates' as never) as any)
    .update({ back_layout_json: next, updated_at: new Date().toISOString() })
    .eq('id', template.id);
  if (error) throw new Error(error.message);
}

/** Upload back artwork and return its public URL. Same rules as the front. */
export async function uploadCardBackBackground(
  templateId: string,
  file: File
): Promise<string> {
  if (!(ALLOWED_BACKGROUND_TYPES as readonly string[]).includes(file.type)) {
    throw new Error('Artwork must be a PNG, JPEG or WebP image.');
  }
  if (file.size > BACKGROUND_MAX_UPLOAD_BYTES) {
    throw new Error('Artwork is larger than 6 MB — export a smaller file.');
  }
  const supabase = createClientSupabaseClient();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `back-backgrounds/${templateId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Set (url) or clear (null) the back artwork, preserving every other key in
 * back_layout_json. Only meaningful while the back side is enabled.
 */
export async function setTemplateBackBackground(
  template: TemplateDesignRow,
  url: string | null
): Promise<void> {
  const next: Record<string, unknown> = { ...(template.back_layout_json ?? {}) };
  if (url) {
    next.background_image = url;
  } else {
    delete next.background_image;
  }
  const supabase = createClientSupabaseClient();
  const { error } = await (supabase.from('id_card_templates' as never) as any)
    .update({ back_layout_json: next, updated_at: new Date().toISOString() })
    .eq('id', template.id);
  if (error) throw new Error(error.message);
}

/** The signed-in person's profiles.id (for "preview with my data"). */
/**
 * A learner WITH an account from the given institution (null → any learner),
 * for "Preview with a learner": the admin's own account is a team member and
 * never shows learner-only zones (roll number, study period, guardian).
 */
export async function sampleLearnerProfileId(
  institutionId: string | null
): Promise<string | null> {
  const supabase = createClientSupabaseClient();
  let q = (supabase.from('learners_profiles') as any)
    .select('id')
    .not('student_photo_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(40);
  if (institutionId) q = q.eq('institution_id', institutionId);
  const { data: learners, error } = await q;
  if (error) throw new Error(error.message);
  const ids = ((learners ?? []) as Array<{ id: string }>).map((l) => l.id);
  if (ids.length === 0) return null;
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('id')
    .in('learner_id', ids)
    .limit(1)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  return profile?.id ?? null;
}

export async function currentProfileId(): Promise<string | null> {
  const supabase = createClientSupabaseClient();
  // getSession (not getUser) — getUser network-stalls the flow; the local
  // session is fine for reading the already-authenticated user id.
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}
