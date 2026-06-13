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
}

/**
 * Resolve the active template for (institutionsId, templateCode). Per-
 * institution row wins; falls back to the global default (institutions_id IS
 * NULL). Returns null if neither exists.
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
