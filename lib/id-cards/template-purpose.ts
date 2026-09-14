// ============================================================================
// lib/id-cards/template-purpose.ts
// Created: 2026-09-05 — "what is this template FOR".
//
// An institution keeps SEVERAL active templates at once (Learners, Senior
// Learners = faculty, Administrators, …). Each template carries a purpose in
// front_layout_json.purpose so selection can pick the right one:
//
//   { key: 'senior_learner', label: 'Senior Learners', audience: 'team_member',
//     is_default: true }
//
//   • audience   — who the card is for. 'learner' cards render learner zones
//                  (roll no, study period); 'team_member' cards render staff
//                  zones (staff id, designation). Decided by the person's kind.
//   • key/label  — the purpose the operator can choose at print time when an
//                  institution has more than one template for an audience.
//   • is_default — the one used when the operator does not choose.
//
// A template without a purpose block is treated as a learner template (every
// template that existed before this file was a learner card).
// Pure: no I/O, unit-tested.
// ============================================================================

export type TemplateAudience = 'learner' | 'team_member';

export type TemplatePurpose = {
  /** Stable machine key (slug), e.g. 'learner', 'senior_learner', 'administrator'. */
  key: string;
  /** Human label shown in pickers, e.g. 'Senior Learners'. */
  label: string;
  audience: TemplateAudience;
  is_default: boolean;
};

export const DEFAULT_PURPOSE: TemplatePurpose = {
  key: 'learner',
  label: 'Learners',
  audience: 'learner',
  is_default: true
};

/** Common purposes offered as suggestions in the editor. */
export const SUGGESTED_PURPOSES: ReadonlyArray<Pick<TemplatePurpose, 'key' | 'label' | 'audience'>> = [
  { key: 'learner', label: 'Learners', audience: 'learner' },
  { key: 'senior_learner', label: 'Senior Learners (teaching)', audience: 'team_member' },
  { key: 'administrator', label: 'Administrators', audience: 'team_member' },
  { key: 'support_staff', label: 'Support team', audience: 'team_member' },
  { key: 'visitor', label: 'Visitors / temporary', audience: 'learner' }
];

export function slugifyPurposeKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'purpose';
}

/** Defensive parse of front_layout_json.purpose (any shape in → a purpose out). */
export function purposeOfLayout(layout: unknown): TemplatePurpose {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return DEFAULT_PURPOSE;
  const raw = (layout as Record<string, unknown>).purpose;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return DEFAULT_PURPOSE;
  const p = raw as Record<string, unknown>;
  const audience: TemplateAudience = p.audience === 'team_member' ? 'team_member' : 'learner';
  const label =
    typeof p.label === 'string' && p.label.trim() !== ''
      ? p.label.trim().slice(0, 80)
      : audience === 'learner'
        ? 'Learners'
        : 'Team members';
  const key =
    typeof p.key === 'string' && p.key.trim() !== '' ? slugifyPurposeKey(p.key) : slugifyPurposeKey(label);
  return { key, label, audience, is_default: p.is_default === true };
}

export interface PurposeCarrier {
  id: string;
  active: boolean;
  institution_id: string | null;
  purpose: TemplatePurpose;
}

/**
 * Pick the template for one person:
 *   institution match → active → audience match → purposeKey match (when the
 *   operator chose one) → is_default → the only one → first.
 * Returns null when the institution has no usable template for that audience.
 */
export function selectTemplateForPerson<T extends PurposeCarrier>(
  templates: readonly T[],
  institutionId: string | null | undefined,
  audience: TemplateAudience,
  purposeKey?: string | null
): T | null {
  if (!institutionId) return null;
  const pool = templates.filter(
    (t) => t.active && t.institution_id === institutionId && t.purpose.audience === audience
  );
  if (pool.length === 0) return null;
  if (purposeKey) {
    const byKey = pool.find((t) => t.purpose.key === purposeKey);
    if (byKey) return byKey;
  }
  return pool.find((t) => t.purpose.is_default) ?? pool[0];
}

/** Distinct purposes (key → label) available across the given templates for an audience. */
export function distinctPurposes<T extends PurposeCarrier>(
  templates: readonly T[],
  audience: TemplateAudience,
  institutionIds?: ReadonlySet<string> | null
): Array<{ key: string; label: string }> {
  const seen = new Map<string, string>();
  for (const t of templates) {
    if (!t.active || t.purpose.audience !== audience) continue;
    if (institutionIds && (!t.institution_id || !institutionIds.has(t.institution_id))) continue;
    if (!seen.has(t.purpose.key)) seen.set(t.purpose.key, t.purpose.label);
  }
  return Array.from(seen, ([key, label]) => ({ key, label }));
}
