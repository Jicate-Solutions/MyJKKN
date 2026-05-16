/**
 * HR Forms — TypeScript contracts for the policy-driven form-builder
 * substrate.
 *
 * Wave 3 — M9 substrate (2026-05-15).
 * Spec: specs/wave-3-policy-driven-hr-manual-2026-05-15.md §W3-M9
 *       specs/hr-policy-jsonb-structures-2026-05-15.md §"Form-builder substrate"
 *
 * SCOPE: substrate types only. Visual drag-drop builder, per-widget React
 * renderers, and workflow engine ship in follow-up PRs. The widget union
 * is exhaustive (text/textarea/number/date/dropdown/radio/checkbox/
 * file_upload/signature/conditional) so consumer code can be type-safe
 * before per-widget components land.
 *
 * Mirrors `hr_forms` + `hr_form_submissions` tables (migration
 * 20260613_hr_forms_substrate.sql).
 */

// ---------------------------------------------------------------------------
// Widget schema — discriminated union on `type`
// ---------------------------------------------------------------------------

/**
 * Widget types supported by the form-builder substrate. Renderers for each
 * land in follow-up PRs — for now this exists so service / type code can be
 * type-safe in advance.
 */
export type WidgetType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'dropdown'
  | 'radio'
  | 'checkbox'
  | 'file_upload'
  | 'signature'
  | 'conditional';

/** Base shape shared by every widget. */
export interface WidgetBase {
  /** Stable identifier used in submission_data keys. */
  id: string;
  /** Display label rendered above the input. */
  label: string;
  /** Discriminator. */
  type: WidgetType;
  /** Whether the field is required to submit. Default false. */
  required?: boolean;
  /** Help text shown beneath the input. */
  help_text?: string;
  /** Optional conditional visibility (renders only when expression resolves true). */
  visible_when?: ConditionalExpression;
}

export interface TextWidget extends WidgetBase {
  type: 'text';
  placeholder?: string;
  max_length?: number;
}

export interface TextareaWidget extends WidgetBase {
  type: 'textarea';
  placeholder?: string;
  max_length?: number;
  rows?: number;
}

export interface NumberWidget extends WidgetBase {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
}

export interface DateWidget extends WidgetBase {
  type: 'date';
  min_date?: string;
  max_date?: string;
}

export interface DropdownWidget extends WidgetBase {
  type: 'dropdown';
  options: Array<{ value: string; label: string }>;
}

export interface RadioWidget extends WidgetBase {
  type: 'radio';
  options: Array<{ value: string; label: string }>;
}

export interface CheckboxWidget extends WidgetBase {
  type: 'checkbox';
  options: Array<{ value: string; label: string }>;
}

export interface FileUploadWidget extends WidgetBase {
  type: 'file_upload';
  /** MIME types accepted, e.g. ['image/png','application/pdf']. */
  accept?: string[];
  max_size_mb?: number;
  multiple?: boolean;
}

export interface SignatureWidget extends WidgetBase {
  type: 'signature';
  /** Optional designation/role expected on the signature line. */
  signatory_role?: string;
}

/**
 * Conditional widget — renders one of N child widgets based on the value of
 * another widget. The selector logic itself lives in `expression`.
 */
export interface ConditionalWidget extends WidgetBase {
  type: 'conditional';
  expression: ConditionalExpression;
  /** Widget rendered when expression evaluates truthy. */
  true_widget: Widget;
  /** Widget rendered when expression evaluates falsy. */
  false_widget?: Widget;
}

/** Discriminated union of every widget kind. */
export type Widget =
  | TextWidget
  | TextareaWidget
  | NumberWidget
  | DateWidget
  | DropdownWidget
  | RadioWidget
  | CheckboxWidget
  | FileUploadWidget
  | SignatureWidget
  | ConditionalWidget;

/**
 * Conditional-logic expression. Operator semantics resolved by the runtime
 * (follow-up PR). Kept loose intentionally during substrate phase.
 */
export interface ConditionalExpression {
  /** ID of the widget whose value is being inspected. */
  field_id: string;
  /** Comparison operator. */
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'not_in';
  /** Right-hand value. */
  value: string | number | boolean | Array<string | number | boolean>;
}

// ---------------------------------------------------------------------------
// Approval workflow
// ---------------------------------------------------------------------------

/**
 * One step in the approval workflow. The workflow engine that consumes these
 * ships in a follow-up PR (W3-M9 substrate-only scope).
 */
export interface ApprovalWorkflowStep {
  /** 1-based ordering. */
  order: number;
  /** Human label shown in the approval queue + audit trail. */
  label: string;
  /** Role key required to act on this step (e.g. 'hod', 'principal', 'cao'). */
  required_role: string;
  /** If true, the step auto-advances when the prior step is approved. */
  auto_advance?: boolean;
  /**
   * Optional skip-when expression — if evaluated truthy against the
   * submission_data, this step is skipped entirely.
   */
  skip_when?: ConditionalExpression;
  /**
   * Optional list of notification channels to fan out when this step
   * becomes active. Renders to WhatsApp / email / in-app per channel
   * (channel wiring ships in follow-up PR).
   */
  notify_channels?: Array<'whatsapp' | 'email' | 'in_app' | 'sms'>;
}

// ---------------------------------------------------------------------------
// hr_forms row
// ---------------------------------------------------------------------------

export type FormClassification = 'operational' | 'major';

/**
 * Wire-shape of a single `hr_forms` row.
 */
export interface HrForm {
  id: string;
  /** Stable form_key used as the lookup handle (e.g. 'reimbursement'). */
  form_key: string;
  form_title: string;
  description: string | null;
  /** Published widget schema. */
  schema: { widgets: Widget[] };
  /** Published approval workflow. */
  approval_workflow: { steps: ApprovalWorkflowStep[] };
  classification: FormClassification;
  is_published: boolean;
  /** Unpublished draft schema (set while editing, copied to schema on publish). */
  draft_schema: { widgets: Widget[] } | null;
  /** Unpublished draft workflow. */
  draft_approval_workflow: { steps: ApprovalWorkflowStep[] } | null;
  institution_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Input shape for creating a brand-new form. */
export interface CreateFormInput {
  form_key: string;
  form_title: string;
  description?: string;
  classification?: FormClassification;
  schema?: { widgets: Widget[] };
  approval_workflow?: { steps: ApprovalWorkflowStep[] };
  institution_id?: string;
}

// ---------------------------------------------------------------------------
// hr_form_submissions row
// ---------------------------------------------------------------------------

export type SubmissionStatus =
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'withdrawn';

/**
 * One entry in the per-submission audit trail. Append-only.
 */
export interface ApprovalHistoryEntry {
  /** Step index acted upon (1-based). */
  step: number;
  /** Action taken at this step. */
  action: 'submit' | 'approve' | 'reject' | 'withdraw' | 'auto_advance';
  /** Profile id of the actor. NULL for 'auto_advance'. */
  actor_id: string | null;
  /** Mandatory reason note (English). */
  reason: string;
  /** ISO timestamp. */
  at: string;
}

/**
 * Wire-shape of a single `hr_form_submissions` row.
 */
export interface HrFormSubmission {
  id: string;
  form_id: string;
  submitted_by: string;
  institution_id: string | null;
  /**
   * Submission payload keyed by widget.id → answer value. The shape of each
   * value follows the widget type (string for text, number for number,
   * file_id[] for file_upload, etc).
   */
  submission_data: Record<string, unknown>;
  current_step: number;
  status: SubmissionStatus;
  approval_history: ApprovalHistoryEntry[];
  created_at: string;
  updated_at: string;
}

/** Filter shape for listSubmissions. */
export interface SubmissionFilters {
  form_id?: string;
  submitted_by?: string;
  institution_id?: string;
  status?: SubmissionStatus | SubmissionStatus[];
  page?: number;
  pageSize?: number;
}
