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

export type TemplateDesignRow = {
  id: string;
  name: string | null;
  active: boolean;
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
    .select('id, name, active, front_layout_json, back_layout_json')
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
export async function currentProfileId(): Promise<string | null> {
  const supabase = createClientSupabaseClient();
  // getSession (not getUser) — getUser network-stalls the flow; the local
  // session is fine for reading the already-authenticated user id.
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}
