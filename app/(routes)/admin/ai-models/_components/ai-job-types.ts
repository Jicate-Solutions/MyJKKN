// ============================================================================
// AI Studio — shared types for the AI-jobs registry admin UI.
// Created: 2026-07-13.
//
// Mirrors the ai_job_types registry table (#1998) plus the two columns the
// Registry-backend stream adds for the auto-drawn run form:
//   input_schema jsonb NOT NULL DEFAULT '[]'
//   expected_seconds int NULL
//
// The UI CONSUMES these endpoints (created by the Registry-backend stream):
//   GET    /api/admin/ai-job-types            -> { jobTypes: AiJobType[] }
//   POST   /api/admin/ai-job-types            body = AiJobTypeDef -> upsert
//   PATCH  /api/admin/ai-job-types/[job_type] body { enabled } -> set_enabled
//   DELETE /api/admin/ai-job-types/[job_type] -> delete
//   POST   /api/ai-jobs/enqueue  body { job_type, payload } -> { job_id } | { error }
//   GET    /api/ai-jobs/status?id=<uuid>       -> { status, result, completed_at }
// ============================================================================

/** A single field descriptor in a job type's input_schema — drives one form
 *  control in the generic Run card. */
export type InputFieldType = 'text' | 'textarea' | 'number' | 'select';

export interface InputSchemaField {
  key: string;
  label: string;
  type: InputFieldType;
  options?: string[]; // only for type === 'select'
  required?: boolean;
}

/** One registry row as returned by GET /api/admin/ai-job-types. */
export interface AiJobType {
  job_type: string;
  title: string;
  description: string | null;
  prompt_template: string | null;
  tool_set: string;
  output_target: string;
  interactive: boolean;
  lane: string; // 'max' | 'api' | 'either'
  allow_rule: string; // 'seat_owner' | 'authenticated' | 'permission:<key>'
  max_inflight: number;
  schedulable: boolean;
  enabled: boolean;
  input_schema: InputSchemaField[];
  expected_seconds: number | null;
  // Optional — included by the list payload IF the backend joins
  // fn_ai_job_type_last_run into the row. Absent → the Run card falls back to
  // the completed_at of the newest job it ran this session.
  last_run?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** The JSON def POSTed to /api/admin/ai-job-types (fn_ai_job_type_upsert). */
export interface AiJobTypeDef {
  job_type: string;
  title: string;
  description: string | null;
  prompt_template: string | null;
  tool_set: string;
  output_target: string;
  interactive: boolean;
  lane: string;
  allow_rule: string;
  schedulable: boolean;
  expected_seconds: number | null;
  input_schema: InputSchemaField[];
}

/** Terminal + in-flight statuses from fn_ai_job_status. */
export type AiJobStatus =
  | 'pending'
  | 'claimed'
  | 'running'
  | 'done'
  | 'error'
  | 'canceled'
  | 'not_found';

export interface AiJobStatusResponse {
  status: AiJobStatus;
  result: unknown;
  completed_at: string | null;
}

export const LANE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'max', label: 'Max (₹0 lane)' },
  { value: 'api', label: 'API (paid)' },
  { value: 'either', label: 'Either' },
];

export const FIELD_TYPE_OPTIONS: ReadonlyArray<{ value: InputFieldType; label: string }> = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown' },
];

/** Pull a human answer string out of a done job's result payload. The generic
 *  runner may return { answer } (chat-shaped) or an arbitrary object. */
export function extractAnswer(result: unknown): string {
  if (result == null) return '';
  if (typeof result === 'string') return result;
  if (typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if (typeof r.answer === 'string') return r.answer;
    if (typeof r.text === 'string') return r.text;
    if (typeof r.message === 'string') return r.message;
    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  }
  return String(result);
}
