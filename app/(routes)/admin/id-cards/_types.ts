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
  photo: 'Student photo',
};

export const DB_COLUMN_OPTIONS = [
  { value: 'students.full_name', label: 'students.full_name' },
  { value: 'students.roll_number', label: 'students.roll_number' },
  { value: 'students.course_id', label: 'students.course_id' },
  { value: 'students.department_id', label: 'students.department_id' },
  { value: 'students.valid_until', label: 'students.valid_until' },
  { value: 'students.id', label: 'students.id (for QR)' },
  { value: 'students.photo_url', label: 'students.photo_url' },
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
