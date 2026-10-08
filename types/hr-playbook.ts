/**
 * HR duty playbooks, the lessons log and credited authorship
 * (supabase/migrations/20271007161139_hr_duty_playbooks_and_lessons.sql).
 *
 * A duty code is the harness key (R1–R9, L1–L5, A1–A6, P1–P4, S1–S4, G1–G10),
 * the same key as hr_duty_definitions.config_key in draft #4152. No FK joins
 * them yet.
 */

export const HR_DUTY_CODE_PATTERN = /^(R[1-9]|L[1-5]|A[1-6]|P[1-4]|S[1-4]|G([1-9]|10))$/;

/** The duty screens that show a playbook card, in the order the page lists them. */
export const PLAYBOOK_DUTIES = [
  { code: 'L1', label: 'Approve or reject leave', href: '/hr/leave/approvals' },
  { code: 'L2', label: 'Comp-off claims', href: '/hr/leave/compensatory-off' },
  { code: 'A3', label: 'Attendance corrections', href: '/hr/attendance/regularize/approvals' },
  { code: 'S2', label: 'Verify team member documents', href: '/hr/documents/verify' },
  { code: 'S3', label: 'Review team member photographs', href: '/hr/staff-photos' },
  { code: 'G2', label: 'HR forms and their approvals', href: '/hr/forms/inbox' },
  { code: 'R5', label: 'Approve a candidate at your step', href: '/hr/recruitment/approvals' },
] as const;

export type PlaybookDutyCode = (typeof PLAYBOOK_DUTIES)[number]['code'];

export function dutyLabel(code: string): string {
  return PLAYBOOK_DUTIES.find((d) => d.code === code)?.label ?? code;
}

export const PLAYBOOK_LINE_MIN = 10;
export const PLAYBOOK_LINE_MAX = 240;

export type PlaybookLineSource = 'hr_head' | 'suggestion' | 'lesson_pattern';
export type PlaybookProposalSource = 'suggestion' | 'lesson_pattern';

/** One row of fn_hr_playbook_for_duty — names read from profiles at read time. */
export interface PlaybookLine {
  id: string;
  duty_code: string;
  line_text: string;
  line_position: number;
  source: PlaybookLineSource;
  authored_by: string;
  author_name: string | null;
  lesson_count: number | null;
  accepted_by: string;
  accepted_by_name: string | null;
  accepted_at: string;
  /** Set when the decider changed the words before accepting. */
  edited_by: string | null;
  edited_by_name: string | null;
}

/** {count, window_days, first_at, last_at} only — no item ids, no names. */
export interface PlaybookEvidence {
  count: number;
  window_days: number;
  first_at: string;
  last_at: string;
}

/** One row of fn_hr_playbook_open_proposals. */
export interface PlaybookProposal {
  id: string;
  duty_code: string;
  proposed_text: string;
  source: PlaybookProposalSource;
  reason_code: string | null;
  reason_label: string | null;
  evidence: PlaybookEvidence | null;
  suggested_by: string | null;
  suggested_by_name: string | null;
  created_at: string;
}

/** One row of fn_hr_playbook_contributors — ordered by name, never by count. */
export interface PlaybookContributor {
  authored_by: string;
  author_name: string | null;
  line_count: number;
}

export type PlaybookDecision = 'accept' | 'decline';

export interface PlaybookDecideInput {
  decision: PlaybookDecision;
  edited_text?: string | null;
  note?: string | null;
}
