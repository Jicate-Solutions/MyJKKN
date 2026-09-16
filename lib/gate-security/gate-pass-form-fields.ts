/**
 * The built-in Gate Pass block of a service request.
 *
 * A service type with `issues_gate_pass` does not need the admin to author
 * these fields — they are prepended to the request form as virtual fields and
 * their answers land in `service_requests.form_data` under the keys below.
 * `issue_gate_pass_for_service_request` (SQL) reads exactly these keys.
 *
 * Profile data (name, roll number, MyJKKN id, email, mobile) is NOT asked
 * for here: it comes from the learner profile at issue/scan time.
 */

import type { ServiceTypeField } from '@/types/service-request';

export const GATE_PASS_FIELD_KEYS = {
  date: 'gate_pass_date',
  exitTime: 'gate_pass_exit_time',
  returnTime: 'gate_pass_return_time',
  reason: 'gate_pass_reason',
  altMobile: 'gate_pass_alt_mobile',
  remarks: 'gate_pass_remarks',
} as const;

const base = (
  key: string,
  label: string,
  type: ServiceTypeField['field_type'],
  order: number,
  extra: Partial<ServiceTypeField> = {}
): ServiceTypeField => ({
  id: `virtual-${key}`,
  service_type_id: 'virtual',
  field_key: key,
  field_label: label,
  field_type: type,
  field_options: null,
  is_required: true,
  display_order: order,
  placeholder: null,
  help_text: null,
  default_value: null,
  created_at: '',
  ...extra,
});

/** Display order is negative so the block always sits above custom fields. */
export const GATE_PASS_FORM_FIELDS: ServiceTypeField[] = [
  base(GATE_PASS_FIELD_KEYS.date, 'Date of leaving', 'date', -60, {
    help_text: 'The pass is valid on this date only.',
  }),
  base(GATE_PASS_FIELD_KEYS.exitTime, 'Expected exit time', 'time', -50),
  base(GATE_PASS_FIELD_KEYS.returnTime, 'Expected return time', 'time', -40, {
    help_text: 'A return time earlier than the exit time means the next day.',
  }),
  base(GATE_PASS_FIELD_KEYS.reason, 'Reason for leaving', 'textarea', -30, {
    placeholder: 'e.g. Medical appointment, bank work, family function',
  }),
  base(GATE_PASS_FIELD_KEYS.altMobile, 'Alternate mobile number', 'text', -20, {
    is_required: false,
    placeholder: 'Optional',
  }),
  base(GATE_PASS_FIELD_KEYS.remarks, 'Additional remarks', 'textarea', -10, {
    is_required: false,
    placeholder: 'Optional',
  }),
];

export const GATE_PASS_FIELD_LABELS: Record<string, string> = Object.fromEntries(
  GATE_PASS_FORM_FIELDS.map((f) => [f.field_key, f.field_label])
);

/** Prepend the block when the type issues gate passes; otherwise unchanged. */
export function withGatePassFields(
  issuesGatePass: boolean | null | undefined,
  fields: ServiceTypeField[]
): ServiceTypeField[] {
  if (!issuesGatePass) return fields;
  const custom = fields.filter((f) => !(f.field_key in GATE_PASS_FIELD_LABELS));
  return [...GATE_PASS_FORM_FIELDS, ...custom];
}

/** Today in the Indian calendar as YYYY-MM-DD, for the date field default. */
export function todayIsoIndia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
