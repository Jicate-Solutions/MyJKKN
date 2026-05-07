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
};

export type IdCardPrintJobStatus =
  | 'pending'
  | 'rendering'
  | 'sent_to_agent'
  | 'printed'
  | 'failed';

export type IdCardPrintJob = {
  id: string;
  student_id: string;
  template_id: string;
  status: IdCardPrintJobStatus;
  enqueued_by: string;
  enqueued_at: string;
  picked_up_at: string | null;
  result: { success: boolean; error_message: string | null } | null;
};

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
  'id_card.photo_fallback'
] as const;

export type IdCardPolicyKey = (typeof ID_CARD_POLICY_KEYS)[number];

// Roles allowed to enqueue print jobs and to read job lists with a user session.
// agent-token is a separate auth path (Bearer header) and is checked elsewhere.
export const JOB_WRITER_ROLES = ['super_admin', 'registrar', 'admission_admin'] as const;
export const JOB_READER_ROLES = ['super_admin', 'registrar', 'admission_admin'] as const;
export const TEMPLATE_RENDER_ROLES = ['super_admin', 'registrar', 'admission_admin'] as const;
