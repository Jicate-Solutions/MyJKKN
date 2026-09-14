// ============================================================================
// ID Card subsystem — local type contract.
// Agent B (UI) uses these. Agent A ships types/id-cards.ts (canonical).
// After all 3 PRs merge, a cleanup PR consolidates into types/id-cards.ts.
// ============================================================================

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

// ──────────────────────────────────────────────────────────────────────────────
// Print jobs (used by print-queue page)
// ──────────────────────────────────────────────────────────────────────────────
export type IdCardPrintJob = {
  id: string;
  student_name: string;
  template_name: string;
  status: IdCardPrintJobStatus;
  enqueued_at: string; // ISO-8601
  result_message: string | null;
};

// ──────────────────────────────────────────────────────────────────────────────
// Template field mappings (used by template page)
// ──────────────────────────────────────────────────────────────────────────────
// The card-field alphabet is OWNED by the render engine (lib/id-cards/
// render-data.ts). Re-exported here so this tab can never drift from what the
// renderer accepts — a field the tab does not know is a field it would drop
// from the array on the next save.
export type { CardField } from '@/lib/id-cards/render-data';
import { CARD_FIELDS, type CardField as RenderCardField } from '@/lib/id-cards/render-data';

export const CARD_FIELD_LABELS: Record<RenderCardField, string> = {
  name_line_1: 'Full name (line 1)',
  roll_number: 'Roll number',
  course: 'Course',
  department: 'Department',
  valid_until: 'Valid until date',
  study_period: 'Study period (YEAR)',
  staff_id: 'Team member ID',
  principal_name: 'Principal name / designation',
  institution_email: 'Institution email',
  institution_phone: 'Institution phone',
  institution_address: 'Institution address',
  // Image zones — placed by the layout, NOT resolvable through a column
  // mapping (the render engine never consults mappings for them).
  qr_code: 'QR code (image — mapping has no effect)',
  photo: 'Learner photo (image — mapping has no effect)',
  institution_logo: 'Institution logo (image — mapping has no effect)',
  principal_signature: 'Principal signature (image — mapping has no effect)'
};

/** Zones whose value CAN come from a column mapping (text fields only). */
export const MAPPABLE_CARD_FIELDS: readonly RenderCardField[] = CARD_FIELDS.filter(
  (f) => !['qr_code', 'photo', 'institution_logo', 'principal_signature'].includes(f)
);

// Keys the render engine actually puts in its value bag (assembleCardData in
// lib/id-cards/render-data.ts). Anything else maps to an empty string.
// Team-member columns live on the `staff` table; the value-bag key keeps that
// table name (render-data.ts reads it verbatim) while the label shows JKKN copy.
const TEAM_MEMBER_TABLE = 'staff';
const TEAM_MEMBER_COLUMNS = [
  { column: 'first_name', hint: '' },
  { column: 'last_name', hint: '' },
  { column: 'designation', hint: '' },
  { column: 'staff_id', hint: 'ID code' },
  { column: 'department_id', hint: 'department name' },
  { column: 'phone', hint: '' },
  { column: 'blood_group', hint: '' },
] as const;

export const DB_COLUMN_OPTIONS = [
  { value: 'profiles.full_name', label: 'profiles.full_name (account display name)' },
  { value: 'learners_profiles.first_name', label: 'learners_profiles.first_name' },
  { value: 'learners_profiles.last_name', label: 'learners_profiles.last_name' },
  { value: 'learners_profiles.roll_number', label: 'learners_profiles.roll_number' },
  { value: 'learners_profiles.register_number', label: 'learners_profiles.register_number' },
  { value: 'learners_profiles.program_id', label: 'learners_profiles.program_id (program name)' },
  { value: 'programs.card_short_name', label: 'programs.card_short_name' },
  { value: 'learners_profiles.department_id', label: 'learners_profiles.department_id (department name)' },
  { value: 'departments.department_name', label: 'departments.department_name' },
  { value: 'learners_profiles.batch_id', label: 'learners_profiles.batch_id (study period)' },
  { value: 'batches.batch_name', label: 'batches.batch_name' },
  { value: 'learners_profiles.blood_group', label: 'learners_profiles.blood_group' },
  { value: 'learners_profiles.date_of_birth', label: 'learners_profiles.date_of_birth' },
  { value: 'learners_profiles.father_name', label: 'learners_profiles.father_name' },
  { value: 'learners_profiles.mother_name', label: 'learners_profiles.mother_name' },
  { value: 'learners_profiles.student_mobile', label: 'learners_profiles.student_mobile' },
  ...TEAM_MEMBER_COLUMNS.map(({ column, hint }) => ({
    value: `${TEAM_MEMBER_TABLE}.${column}`,
    label: `Team member ${column.replace(/_/g, ' ')}` + (hint ? ` (${hint})` : ''),
  })),
  { value: 'institutions.email', label: 'institutions.email (template block first)' },
  { value: 'institutions.phone', label: 'institutions.phone (template block first)' },
  { value: 'institutions.address', label: 'institutions.address (template block first)' },
  { value: 'institutions.website', label: 'institutions.website (template block first)' }
];

export type FieldMappingRow = {
  id: string;
  card_field: RenderCardField;
  db_column: string;
};

export type PhotoFallbackStep = {
  id: string;
  sort_order: number;
  label: string;
  source: string;
  is_active: boolean;
};
