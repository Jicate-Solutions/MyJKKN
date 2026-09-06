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
export type CardField =
  | 'name_line_1'
  | 'roll_number'
  | 'course'
  | 'department'
  | 'valid_until'
  | 'qr_code'
  | 'photo';

export const CARD_FIELD_LABELS: Record<CardField, string> = {
  name_line_1: 'Full name (line 1)',
  roll_number: 'Roll number',
  course: 'Course',
  department: 'Department',
  valid_until: 'Valid until date',
  qr_code: 'QR code data',
  photo: 'Learner photo',
};

// Real columns on learners_profiles (the canonical learner table — the old
// `students` table was renamed before this module shipped).
export const DB_COLUMN_OPTIONS = [
  { value: 'learners_profiles.first_name', label: 'learners_profiles.first_name' },
  { value: 'learners_profiles.last_name', label: 'learners_profiles.last_name' },
  { value: 'learners_profiles.roll_number', label: 'learners_profiles.roll_number' },
  { value: 'learners_profiles.register_number', label: 'learners_profiles.register_number' },
  { value: 'learners_profiles.program_id', label: 'learners_profiles.program_id' },
  { value: 'learners_profiles.department_id', label: 'learners_profiles.department_id' },
  { value: 'learners_profiles.id', label: 'learners_profiles.id (for QR)' },
  { value: 'learners_profiles.student_photo_url', label: 'learners_profiles.student_photo_url' },
];

export type FieldMappingRow = {
  id: string;
  card_field: CardField;
  db_column: string;
};

export type PhotoFallbackStep = {
  id: string;
  sort_order: number;
  label: string;
  source: string;
  is_active: boolean;
};
