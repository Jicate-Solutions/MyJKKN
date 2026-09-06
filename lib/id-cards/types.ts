// lib/id-cards/types.ts
// Phase 1C — local types for the id-card subsystem.
// Mirrors Agent A's reader fn (`fn_get_id_card_policy`) return shape and the
// `id_card_print_jobs` table schema. Zod schemas live in ./validation.ts.

export type IdCardPolicy = {
  printer_model: 'primacy_2';
  sides: 1 | 2;
  encoding: {
    magstripe_enabled: boolean;
    magstripe_hardware_present: boolean;
    chip_enabled: boolean;
    chip_hardware_present: boolean;
    rfid_enabled: boolean;
    rfid_hardware_present: boolean;
  };
  station_endpoint_url: string | null;
  ribbon_type: 'YMCKO' | 'YMCKOK' | 'monochrome';
  photo_fallback: string[];
  /**
   * How long a printed card is valid for (2026-09-02). Absent on databases
   * that predate migration 20260902010000 — every reader must fail soft to
   * the built-in defaults, which ARE the Director's rules.
   */
  validity?: {
    /** 'course_end' = a learner's card lasts their whole course. */
    learner_mode: 'course_end' | 'yearly';
    /** Team-member cards are re-issued each academic year. */
    team_member_mode: 'yearly';
    /** Academic-year end as `MM-DD` (default '05-31'). */
    year_end_mmdd: string;
  };
};

export type IdCardPrintJobStatus =
  | 'pending'
  | 'rendering'
  | 'sent_to_agent'
  | 'printed'
  | 'failed';

export type IdCardPrintJob = {
  id: string;
  profile_id: string;
  template_id: string;
  status: IdCardPrintJobStatus;
  enqueued_by: string;
  enqueued_at: string;
  picked_up_at: string | null;
  result: { success: boolean; error_message: string | null } | null;
};

// Pickup response shape (POST /api/id-cards/jobs/:id/pickup) — the claimed job
// row PLUS the duplex hint. `has_back` tells the print bridge whether the
// job's template has a configured back side (back_layout_json non-null), i.e.
// whether GET .../render?side=back will return a PNG instead of 404
// back_not_configured. Additive field: bridges that predate it ignore it and
// keep printing fronts only, so shipping this is dark by construction.
export type IdCardPrintJobPickup = IdCardPrintJob & {
  has_back: boolean;
};

/**
 * Duplex hint: does a template row's back_layout_json mean "back side
 * configured"? Mirrors the render route's DARK gate exactly — any non-null /
 * non-undefined value (including `{}` = default back design) counts as
 * configured; NULL (every prod template until it opts in) does not.
 * Pure so the pickup route and tests share one definition.
 */
export function hasBackSide(backLayoutJson: unknown): boolean {
  return backLayoutJson !== null && backLayoutJson !== undefined;
}

// Allowlist of writeable platform_policies keys for the id-card subsystem.
// Anything outside this list is rejected by PATCH /api/id-cards/policy.
// Keep in sync with Agent A's reader fn schema.
export const ID_CARD_POLICY_KEYS = [
  'id_card.printer_model',
  'id_card.sides',
  'id_card.encoding.magstripe_enabled',
  'id_card.encoding.magstripe_hardware_present',
  'id_card.encoding.chip_enabled',
  'id_card.encoding.chip_hardware_present',
  'id_card.encoding.rfid_enabled',
  'id_card.encoding.rfid_hardware_present',
  'id_card.station_endpoint_url',
  'id_card.ribbon_type',
  'id_card.photo_fallback',
  // Card validity (2026-09-02). Dotted form — this is what the seeded rows and
  // fn_get_id_card_policy actually read.
  'id_card.validity.learner_mode',
  'id_card.validity.team_member_mode',
  'id_card.validity.year_end_mmdd'
] as const;

export type IdCardPolicyKey = (typeof ID_CARD_POLICY_KEYS)[number];

// Roles allowed to enqueue print jobs and to read job lists with a user session.
// agent-token is a separate auth path (Bearer header) and is checked elsewhere.
// Role keys verified against prod custom_roles 2026-07-23 — 'admission_admin'
// does not exist; the admission-side role_key is 'admission'.
export const JOB_WRITER_ROLES = ['super_admin', 'registrar', 'admission'] as const;
export const JOB_READER_ROLES = ['super_admin', 'registrar', 'admission'] as const;
export const TEMPLATE_RENDER_ROLES = ['super_admin', 'registrar', 'admission'] as const;
