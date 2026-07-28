/**
 * BoS Email Templates — runtime renderer + placeholder catalog.
 *
 * Templates are stored in the `bos_email_templates` table (per institution +
 * a global fallback). This module:
 *   1. Renders a stored template with a placeholder map.
 *   2. Resolves the right template for a given (institutionsId, code) pair.
 *   3. Exposes the canonical placeholder list to the admin UI.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Placeholder catalog ──────────────────────────────────────────────────────
// Single source of truth for which {{tokens}} a template supports. The admin
// UI uses this list to render the click-to-insert sidebar, and the preview
// API uses BOS_TEMPLATE_PREVIEW_VALUES to render mock data.

export interface BosTemplatePlaceholder {
  key: string;          // {{key}}
  label: string;        // Human-readable name shown in the sidebar
  description: string;
}

export const BOS_TEMPLATE_PLACEHOLDERS: BosTemplatePlaceholder[] = [
  { key: 'member_name',       label: 'Member Name',       description: 'Display name of the recipient (chairman, subject expert, …).' },
  { key: 'member_designation', label: 'Member Designation', description: 'Designation of the recipient if available.' },
  { key: 'member_role',        label: 'Member Role',        description: 'BoS role: Chairman, Subject Expert, Member, etc.' },
  { key: 'meeting_title',      label: 'Meeting Title',     description: 'Title of the BoS meeting.' },
  { key: 'meeting_date',       label: 'Meeting Date',      description: 'Scheduled date, formatted (e.g. "15 May 2026").' },
  { key: 'meeting_time',       label: 'Meeting Time',      description: 'Scheduled time of day.' },
  { key: 'meeting_venue',      label: 'Meeting Venue',     description: 'Venue/location of the meeting.' },
  { key: 'meeting_url',        label: 'Meeting Link',      description: 'Direct link to the meeting detail page.' },
  { key: 'academic_year',      label: 'Academic Year',     description: 'Academic year of the meeting (e.g. "2026-2027").' },
  { key: 'chairman_name',      label: 'Chairman Name',     description: 'Name of the board chairman.' },
  { key: 'institution_name',   label: 'Institution Name',  description: 'Full college/institution name.' },
  { key: 'agenda_summary',     label: 'Agenda Summary',    description: 'Plain-text agenda overview from the meeting.' },
  // ── Sign-off block ─────────────────────────────────────────────────────────
  // Resolved from getInstitutionHeader().officials at send time so the email
  // signature matches the Principal block already used in the PDF call letter.
  { key: 'signoff_name',        label: 'Signoff Name',        description: 'Principal name + qualifications + designation (single line). E.g. "Capt.Dr.M.NALINI, M.Sc.,M.Phil.,Ph.D., Principal".' },
  { key: 'signoff_institution', label: 'Signoff Institution', description: 'Full institution name shown in the signature (typically bold).' },
  { key: 'signoff_address',     label: 'Signoff Address',     description: 'Postal address line for the signing institution.' },
  { key: 'signoff_email',       label: 'Signoff Email',       description: 'Reply-to email address for the signing institution.' },
  { key: 'signoff_contact',     label: 'Signoff Contact',     description: 'Phone/cell number(s) for the signing institution.' },
];

// Mock values used by the live-preview pane and the test-send endpoint so
// the admin can see what a real send will look like.
export const BOS_TEMPLATE_PREVIEW_VALUES: Record<string, string> = {
  member_name: 'Dr. R. Kumar',
  member_designation: 'Professor of Computer Science',
  member_role: 'Subject Expert',
  meeting_title: '3rd BoS Meeting — 2025-2026',
  meeting_date: 'Friday, 15 May 2026',
  meeting_time: '10:30 AM',
  meeting_venue: 'Principal Conference Hall',
  meeting_url: 'https://example.org/bos/meetings/abc-123',
  academic_year: '2026-2027',
  chairman_name: 'Capt.Dr.M.NALINI, Principal',
  institution_name: 'J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE',
  agenda_summary: 'Approval of revised syllabi for CS301 and CS402; review of programme outcomes.',
  signoff_name: 'Capt.Dr.M.NALINI, M.Sc.,M.Phil.,Ph.D., Principal',
  signoff_institution: 'J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)',
  signoff_address: 'Komarapalayam - 638 183, Namakkal District, Tamil Nadu',
  signoff_email: 'arts@jkkn.org',
  signoff_contact: '94878 33330, 99653 63999',
};

// ── Rendering ─────────────────────────────────────────────────────────────────

export interface RenderableTemplate {
  subject: string;
  body_html: string;
}

/**
 * Replace every {{placeholder}} in subject + body_html with the value from
 * the supplied map. Unknown placeholders are left intact (visible in the
 * rendered email) so missing data is debuggable rather than silently dropped.
 */
export function renderBosEmailTemplate(
  template: RenderableTemplate,
  values: Record<string, string | null | undefined>
): RenderableTemplate {
  const replace = (s: string) =>
    s.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
      const v = values[key];
      return v == null || v === '' ? `{{${key}}}` : String(v);
    });

  return {
    subject: replace(template.subject),
    body_html: replace(template.body_html),
  };
}

// ── Resolver ──────────────────────────────────────────────────────────────────

interface BosEmailTemplateRow {
  id: string;
  institutions_id: string | null;
  template_code: string;
  subject: string;
  body_html: string;
  // ── Per-committee / versioning fields (20260724140000) ─────────────────────
  body_type_code?: string | null;
  effective_from?: string | null;   // ISO date
  pdf_heading?: string | null;
  pdf_intro_html?: string | null;
  pdf_closing_html?: string | null;
  reply_to_email?: string | null;
  signoff_html?: string | null;
}

// Default catalog code used when a meeting can't be mapped to a specific body.
export const BOS_DEFAULT_BODY_TYPE = 'BOS';

/**
 * Resolve the active template for (institutionsId, templateCode). Per-
 * institution row wins; falls back to the global default (institutions_id IS
 * NULL). Returns null if neither exists.
 *
 * NOTE: This is the legacy, body-agnostic resolver kept for callers that
 * haven't adopted per-committee formats. New callers should use
 * resolveBosEmailTemplateForBody, which adds the body-type + effective-date
 * axes. This helper still works because every row now carries body_type_code
 * (backfilled to 'BOS'); it simply ignores that dimension.
 */
export async function resolveBosEmailTemplate(
  supabase: SupabaseClient,
  templateCode: string,
  institutionsId: string | null,
): Promise<BosEmailTemplateRow | null> {
  let query = supabase
    .from('bos_email_templates')
    .select('id, institutions_id, template_code, subject, body_html')
    .eq('template_code', templateCode)
    .eq('is_active', true);

  if (institutionsId) {
    query = query.or(`institutions_id.eq.${institutionsId},institutions_id.is.null`);
  } else {
    query = query.is('institutions_id', null);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[bos-email-templates] resolver error:', error);
    return null;
  }
  if (!data || data.length === 0) return null;

  // Prefer the institution-specific row over the global default.
  const specific = data.find((r) => r.institutions_id === institutionsId);
  return specific ?? data.find((r) => r.institutions_id === null) ?? null;
}

// A meeting shape sufficient to resolve its governing body.
export interface BodyResolvableMeeting {
  meeting_type?: string | null;
  committee_id?: string | null;
}

/**
 * Map a meeting to one of the catalog body codes (bos_body_types.code) via the
 * agreed waterfall:
 *
 *   meeting_type = 'academic_council' → 'AC'
 *   meeting_type = 'governing_body'   → 'GB'
 *   else committee_id → bos_committees.body_type_code
 *        └─ if that instance row is unmapped (NULL), fall back to the master
 *           TEMPLATE committee (composition_id IS NULL) with the same
 *           institution + name — committee NAMES vary per institution, and an
 *           instance created before body_type_code existed may be blank while
 *           its template is mapped.
 *   default                            → 'BOS'
 *
 * Never throws — any lookup failure degrades to 'BOS' so a send is never
 * blocked by body resolution.
 */
export async function resolveMeetingBodyType(
  supabase: SupabaseClient,
  meeting: BodyResolvableMeeting,
): Promise<string> {
  if (meeting.meeting_type === 'academic_council') return 'AC';
  if (meeting.meeting_type === 'governing_body') return 'GB';

  if (meeting.committee_id) {
    const { data, error } = await supabase
      .from('bos_committees')
      .select('body_type_code, name, institutions_id')
      .eq('id', meeting.committee_id)
      .maybeSingle();
    if (error) {
      console.warn('[bos-email-templates] committee body-type lookup failed:', error);
    }
    const row = data as
      | { body_type_code?: string | null; name?: string | null; institutions_id?: string | null }
      | null;

    if (row?.body_type_code) return row.body_type_code;

    // Instance unmapped → try its master template row (composition_id IS NULL)
    // matched by institution + case-insensitive name.
    if (row?.name && row?.institutions_id) {
      const { data: tmpl } = await supabase
        .from('bos_committees')
        .select('body_type_code')
        .is('composition_id', null)
        .eq('institutions_id', row.institutions_id)
        .ilike('name', row.name)
        .maybeSingle();
      const tmplCode = (tmpl as { body_type_code?: string | null } | null)?.body_type_code;
      if (tmplCode) return tmplCode;
    }
  }

  return BOS_DEFAULT_BODY_TYPE;
}

/**
 * Resolve the effective template for a specific body on a specific date.
 *
 * Selection precedence, applied in this order:
 *   1. Institution row for the exact body, newest effective_from ≤ onDate
 *   2. Institution row for the default body (BOS), same date rule
 *   3. Global (institutions_id NULL) row for the exact body
 *   4. Global row for the default body (BOS)
 *
 * Steps 2 & 4 implement the "fall back to a global/base default, never block a
 * send" decision: a body with no configured format inherits BOS's, then the
 * global default. Returns null only if the table is completely empty.
 *
 * @param onDate  ISO date string (typically meeting.scheduled_date). When
 *                null/absent we use "no upper bound" — i.e. the newest version.
 */
export async function resolveBosEmailTemplateForBody(
  supabase: SupabaseClient,
  params: {
    templateCode: string;
    institutionsId: string | null;
    bodyTypeCode: string;
    onDate?: string | null;
  },
): Promise<BosEmailTemplateRow | null> {
  const { templateCode, institutionsId, bodyTypeCode, onDate } = params;

  let query = supabase
    .from('bos_email_templates')
    .select(
      'id, institutions_id, template_code, subject, body_html, body_type_code, effective_from, pdf_heading, pdf_intro_html, pdf_closing_html, reply_to_email, signoff_html',
    )
    .eq('template_code', templateCode)
    .eq('is_active', true);

  if (institutionsId) {
    query = query.or(`institutions_id.eq.${institutionsId},institutions_id.is.null`);
  } else {
    query = query.is('institutions_id', null);
  }

  // Only versions that are already in effect for the target date.
  if (onDate) query = query.lte('effective_from', onDate);

  const { data, error } = await query.order('effective_from', { ascending: false });
  if (error) {
    console.error('[bos-email-templates] versioned resolver error:', error);
    return null;
  }
  const rows = (data ?? []) as BosEmailTemplateRow[];
  if (rows.length === 0) return null;

  // rows are newest-effective first. Pick the best (institution, body) combo.
  const pick = (instMatch: boolean, body: string) =>
    rows.find(
      (r) =>
        (instMatch ? r.institutions_id === institutionsId : r.institutions_id === null) &&
        (r.body_type_code ?? BOS_DEFAULT_BODY_TYPE) === body,
    );

  return (
    pick(true, bodyTypeCode) ??
    pick(true, BOS_DEFAULT_BODY_TYPE) ??
    pick(false, bodyTypeCode) ??
    pick(false, BOS_DEFAULT_BODY_TYPE) ??
    rows[0] ??
    null
  );
}
