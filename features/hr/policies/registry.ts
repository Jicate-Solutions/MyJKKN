/**
 * Policy Table Registry
 * Source of truth for the 19 HR policy tables. Each entry tells the generic
 * PolicyEditor how to render the form, list, and history for that table.
 *
 * Add a new HR config table by appending one entry here — no new component code needed.
 */

export type PolicyFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'percent'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'time'
  | 'enum'
  | 'fk_cadre'
  | 'fk_designation'
  | 'fk_leave_type'
  | 'json';

export interface PolicyFieldDef {
  name: string;
  label: string;
  type: PolicyFieldType;
  required?: boolean;
  helpText?: string;
  enumValues?: string[];
  jsonShape?: 'array' | 'object';
}

export interface PolicyTableDef {
  table: string;
  label: string;
  description: string;
  category: 'Leave & Approval' | 'Compensation' | 'Schedule & Holidays' | 'Onboarding' | 'Discipline & Compliance' | 'Development' | 'Engagement & Feedback';
  iconKey?: string;
  fields: PolicyFieldDef[];
  /** Optional list of fields used as the row label in lists/history */
  displayField?: string;
}

export const POLICY_TABLES: PolicyTableDef[] = [
  // ── Leave & Approval ──────────────────────────────────────
  // NOTE: `hr_leave_types` was unified into the pre-existing `leave_types` catalog
  //       on 2026-04-15. Staff types live in `leave_types` with scope='staff'.
  //       The PolicyEditor entry is removed because PolicyEditor is single-table
  //       CRUD; the unified `leave_types` needs scope-aware admin UI (follow-up).
  //       For now, staff leave types are seeded (66 rows, 6 per org) and edits
  //       go through the Supabase dashboard or a dedicated /hr/leave/types admin page.
  {
    table: 'hr_leave_policies',
    label: 'Leave Policies',
    description: 'Per-cadre rules: days/year, max consecutive, encashment',
    category: 'Leave & Approval',
    displayField: 'leave_type_id',
    fields: [
      { name: 'leave_type_id', label: 'Leave type', type: 'fk_leave_type', required: true },
      { name: 'cadre_id', label: 'Applies to cadre (optional)', type: 'fk_cadre' },
      { name: 'days_per_year', label: 'Days per year', type: 'number', required: true },
      { name: 'max_consecutive_days', label: 'Max consecutive days', type: 'number' },
      { name: 'min_notice_days', label: 'Min advance notice (days)', type: 'number' },
      { name: 'carry_forward_max', label: 'Carry-forward max (days)', type: 'number' },
      { name: 'encashable', label: 'Encashable', type: 'boolean' },
      { name: 'encashment_rate_pct', label: 'Encashment rate (%)', type: 'percent' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    table: 'hr_approval_flows',
    label: 'Approval Flows',
    description: 'Conditional multi-step approval chains',
    category: 'Leave & Approval',
    displayField: 'flow_name',
    fields: [
      { name: 'flow_name', label: 'Flow name', type: 'text', required: true },
      { name: 'flow_for', label: 'Flow for', type: 'enum', enumValues: ['leave_request', 'reimbursement', 'training_request', 'incentive_claim', 'termination', 'memo_appeal'], required: true },
      { name: 'conditions', label: 'Trigger conditions (JSON)', type: 'json', jsonShape: 'object', helpText: 'e.g. {"days_gt": 3, "cadre": "TEACHING"}' },
      { name: 'steps', label: 'Approval steps (JSON array)', type: 'json', jsonShape: 'array', helpText: 'e.g. [{"role":"hod"},{"role":"principal"}]' },
      { name: 'is_active', label: 'Active', type: 'boolean' },
    ],
  },

  // ── Compensation ───────────────────────────────────────────
  {
    table: 'hr_pay_scales',
    label: 'Pay Scales',
    description: 'Salary scales per designation (HR manual §6)',
    category: 'Compensation',
    displayField: 'scale_name',
    fields: [
      { name: 'scale_name', label: 'Scale name', type: 'text', required: true },
      { name: 'designation_id', label: 'Designation', type: 'fk_designation' },
      { name: 'cadre_id', label: 'Cadre', type: 'fk_cadre' },
      { name: 'basic_pay', label: 'Basic pay', type: 'currency', required: true },
      { name: 'pay_band', label: 'Pay band', type: 'text' },
      { name: 'grade_pay', label: 'Grade pay', type: 'currency' },
      { name: 'effective_from', label: 'Effective from', type: 'date', required: true },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    table: 'hr_allowances',
    label: 'Allowances',
    description: 'HRA, transport, HOD allowance, etc.',
    category: 'Compensation',
    displayField: 'name',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'code', label: 'Code', type: 'text', required: true },
      { name: 'allowance_type', label: 'Type', type: 'enum', enumValues: ['fixed', 'percent_of_basic', 'conditional'], required: true },
      { name: 'amount', label: 'Fixed amount (₹)', type: 'currency' },
      { name: 'amount_pct_of_basic', label: 'Percent of basic (%)', type: 'percent' },
      { name: 'conditions', label: 'Conditions (JSON)', type: 'json', jsonShape: 'object' },
      { name: 'is_taxable', label: 'Taxable', type: 'boolean' },
      { name: 'is_active', label: 'Active', type: 'boolean' },
    ],
  },
  {
    table: 'hr_incentive_schemes',
    label: 'Incentive Schemes',
    description: 'Research/performance incentives (HR manual §5.6, §12)',
    category: 'Compensation',
    displayField: 'scheme_name',
    fields: [
      { name: 'scheme_name', label: 'Scheme name', type: 'text', required: true },
      { name: 'category', label: 'Category', type: 'enum', enumValues: ['research_publication', 'consultancy', 'awards', 'special_recognition'], required: true },
      { name: 'eligibility_criteria', label: 'Eligibility (JSON)', type: 'json', jsonShape: 'object' },
      { name: 'payout_formula', label: 'Payout formula (JSON)', type: 'json', jsonShape: 'object' },
      { name: 'cap_amount', label: 'Cap amount (₹)', type: 'currency' },
      { name: 'is_active', label: 'Active', type: 'boolean' },
    ],
  },

  // ── Schedule & Holidays ────────────────────────────────────
  {
    table: 'hr_work_schedules',
    label: 'Work Schedules',
    description: 'Shift definitions per cadre (HR manual §14)',
    category: 'Schedule & Holidays',
    displayField: 'schedule_name',
    fields: [
      { name: 'schedule_name', label: 'Schedule name', type: 'text', required: true },
      { name: 'cadre_id', label: 'Cadre (optional)', type: 'fk_cadre' },
      { name: 'start_time', label: 'Start time', type: 'time', required: true },
      { name: 'end_time', label: 'End time', type: 'time', required: true },
      { name: 'lunch_start', label: 'Lunch start', type: 'time' },
      { name: 'lunch_end', label: 'Lunch end', type: 'time' },
      { name: 'working_days_mask', label: 'Working days bitmask (Mon=1..Sun=64)', type: 'number', helpText: 'Default 63 = Mon-Sat' },
      { name: 'grace_minutes', label: 'Grace period (minutes)', type: 'number' },
      { name: 'is_active', label: 'Active', type: 'boolean' },
    ],
  },
  {
    table: 'hr_public_holidays',
    label: 'Public Holidays',
    description: 'Annual holiday calendar per institution',
    category: 'Schedule & Holidays',
    displayField: 'name',
    fields: [
      { name: 'holiday_date', label: 'Date', type: 'date', required: true },
      { name: 'name', label: 'Holiday name', type: 'text', required: true },
      { name: 'is_optional', label: 'Optional/Restricted', type: 'boolean' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },

  // ── Onboarding ─────────────────────────────────────────────
  {
    table: 'hr_onboarding_checklists',
    label: 'Onboarding Checklists',
    description: 'Joining process steps per cadre (HR manual §7)',
    category: 'Onboarding',
    displayField: 'checklist_name',
    fields: [
      { name: 'checklist_name', label: 'Checklist name', type: 'text', required: true },
      { name: 'applies_to_cadre_id', label: 'Cadre', type: 'fk_cadre' },
      { name: 'steps', label: 'Steps (JSON array)', type: 'json', jsonShape: 'array', helpText: 'e.g. [{"step":"Submit ID proof"}, {"step":"Issue ID card"}]' },
      { name: 'is_active', label: 'Active', type: 'boolean' },
    ],
  },
  {
    table: 'hr_required_documents',
    label: 'Required Documents',
    description: 'Documents demanded at hire',
    category: 'Onboarding',
    displayField: 'document_name',
    fields: [
      { name: 'document_name', label: 'Document name', type: 'text', required: true },
      { name: 'document_code', label: 'Code', type: 'text', required: true },
      { name: 'category', label: 'Category', type: 'enum', enumValues: ['identity', 'education', 'experience', 'medical', 'other'] },
      { name: 'is_mandatory', label: 'Mandatory', type: 'boolean' },
      { name: 'applies_to_employment_types', label: 'Applies to (comma-sep)', type: 'text', helpText: 'e.g. full_time,guest' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },

  // ── Discipline & Compliance ────────────────────────────────
  {
    table: 'hr_memo_rules',
    label: 'Memo Rules',
    description: 'Auto-generated memo triggers (HR manual §15)',
    category: 'Discipline & Compliance',
    displayField: 'rule_name',
    fields: [
      { name: 'rule_name', label: 'Rule name', type: 'text', required: true },
      { name: 'trigger_condition', label: 'Trigger condition (JSON)', type: 'json', jsonShape: 'object', helpText: 'e.g. {"lop_in_month": 2}' },
      { name: 'memo_template', label: 'Memo template', type: 'textarea', required: true },
      { name: 'severity', label: 'Severity', type: 'enum', enumValues: ['warning', 'serious', 'final'] },
      { name: 'is_active', label: 'Active', type: 'boolean' },
    ],
  },
  {
    table: 'hr_termination_rules',
    label: 'Termination Rules',
    description: 'Termination triggers + approval chain',
    category: 'Discipline & Compliance',
    displayField: 'rule_name',
    fields: [
      { name: 'rule_name', label: 'Rule name', type: 'text', required: true },
      { name: 'trigger_condition', label: 'Trigger (JSON)', type: 'json', jsonShape: 'object', helpText: 'e.g. {"memos_count": 3}' },
      { name: 'notice_period_days', label: 'Notice period (days)', type: 'number' },
      { name: 'requires_director_approval', label: 'Requires Director approval', type: 'boolean' },
      { name: 'is_active', label: 'Active', type: 'boolean' },
    ],
  },
  {
    table: 'hr_disciplinary_penalties',
    label: 'Disciplinary Penalties',
    description: 'Penalty catalog per HR manual §19.1',
    category: 'Discipline & Compliance',
    displayField: 'penalty_type',
    fields: [
      { name: 'penalty_type', label: 'Penalty type', type: 'text', required: true },
      { name: 'severity', label: 'Severity', type: 'enum', enumValues: ['minor', 'major'], required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'monetary_amount', label: 'Monetary amount (if any)', type: 'currency' },
      { name: 'requires_approval_role', label: 'Required approver role', type: 'text' },
      { name: 'is_active', label: 'Active', type: 'boolean' },
    ],
  },
  {
    table: 'hr_conduct_rules',
    label: 'Code of Conduct',
    description: 'Do/Don\u2019t rules per cadre (HR manual §18.5)',
    category: 'Discipline & Compliance',
    displayField: 'rule_text',
    fields: [
      { name: 'category', label: 'Category', type: 'enum', enumValues: ['do', 'dont', 'communication', 'workplace', 'professional'], required: true },
      { name: 'rule_text', label: 'Rule text', type: 'textarea', required: true },
      { name: 'applies_to_cadre_id', label: 'Cadre (optional)', type: 'fk_cadre' },
      { name: 'display_order', label: 'Display order', type: 'number' },
      { name: 'is_active', label: 'Active', type: 'boolean' },
    ],
  },

  // ── Development ────────────────────────────────────────────
  {
    table: 'hr_promotion_criteria',
    label: 'Promotion Criteria',
    description: 'Promotion paths + scoring (HR manual §17)',
    category: 'Development',
    displayField: 'from_designation_id',
    fields: [
      { name: 'from_designation_id', label: 'From designation', type: 'fk_designation', required: true },
      { name: 'to_designation_id', label: 'To designation', type: 'fk_designation', required: true },
      { name: 'min_years_in_grade', label: 'Min years in grade', type: 'number' },
      { name: 'required_qualifications', label: 'Qualifications (JSON array)', type: 'json', jsonShape: 'array' },
      { name: 'scoring_rubric', label: 'Scoring rubric (JSON)', type: 'json', jsonShape: 'object' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    table: 'hr_training_programs',
    label: 'Training Programs',
    description: 'Training catalog (HR manual §23)',
    category: 'Development',
    displayField: 'program_name',
    fields: [
      { name: 'program_name', label: 'Program name', type: 'text', required: true },
      { name: 'category', label: 'Category', type: 'enum', enumValues: ['induction', 'internal', 'specialised', 'external'] },
      { name: 'duration_hours', label: 'Duration (hours)', type: 'number' },
      { name: 'is_mandatory', label: 'Mandatory', type: 'boolean' },
      { name: 'applies_to_cadre_id', label: 'Cadre', type: 'fk_cadre' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'is_active', label: 'Active', type: 'boolean' },
    ],
  },
  {
    table: 'hr_role_descriptions',
    label: 'Role Descriptions',
    description: 'Detailed role responsibilities (HR manual §4)',
    category: 'Development',
    displayField: 'designation_id',
    fields: [
      { name: 'designation_id', label: 'Designation', type: 'fk_designation', required: true },
      { name: 'responsibilities', label: 'Responsibilities (JSON array)', type: 'json', jsonShape: 'array' },
      { name: 'qualifications', label: 'Qualifications (JSON array)', type: 'json', jsonShape: 'array' },
      { name: 'reporting_line', label: 'Reports to', type: 'text' },
    ],
  },

  // ── Engagement & Feedback ──────────────────────────────────
  {
    table: 'hr_welfare_events',
    label: 'Welfare Events',
    description: 'Founders Day, Women\u2019s Day, etc. (HR manual §24)',
    category: 'Engagement & Feedback',
    displayField: 'event_name',
    fields: [
      { name: 'event_name', label: 'Event name', type: 'text', required: true },
      { name: 'category', label: 'Category', type: 'enum', enumValues: ['celebration', 'health', 'training', 'recognition'] },
      { name: 'recurrence', label: 'Recurrence', type: 'enum', enumValues: ['one_time', 'annual', 'monthly'] },
      { name: 'next_date', label: 'Next date', type: 'date' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'is_active', label: 'Active', type: 'boolean' },
    ],
  },
  {
    table: 'hr_feedback_dimensions',
    label: 'Feedback Dimensions',
    description: 'Feedback evaluation axes (HR manual §10)',
    category: 'Engagement & Feedback',
    displayField: 'dimension_name',
    fields: [
      { name: 'dimension_name', label: 'Dimension', type: 'text', required: true },
      { name: 'category', label: 'Category', type: 'enum', enumValues: ['teaching_process', 'environment', 'management', 'peer'] },
      { name: 'weight', label: 'Weight', type: 'number' },
      { name: 'scale_min', label: 'Scale min', type: 'number' },
      { name: 'scale_max', label: 'Scale max', type: 'number' },
      { name: 'applies_to_role', label: 'Applies to role', type: 'text' },
      { name: 'is_active', label: 'Active', type: 'boolean' },
    ],
  },
];

export const POLICY_CATEGORIES = Array.from(
  new Set(POLICY_TABLES.map((t) => t.category))
);

export function getPolicyTableDef(table: string): PolicyTableDef | undefined {
  return POLICY_TABLES.find((t) => t.table === table);
}
