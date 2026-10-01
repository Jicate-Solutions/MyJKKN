/**
 * HR intake helper — the shared shape (pinned 2026-10-01).
 *
 * The helper prepares, HR decides. HR uploads a CVViZ candidate export plus the
 * resume files; the helper reads each row, cleans it, spots duplicates, reads the
 * resume, and proposes ONE action per candidate with its reasons. HR confirms or
 * corrects with one tap. A correction becomes a match rule credited to the person
 * who made it, and the next batch uses it.
 *
 * Nothing is filed until a person decides. Filing reuses the careers path:
 * the resume goes into the job's Drive folder and an hr_job_applications row is
 * written with source 'cvviz_import'.
 *
 * Every lane builds against these types. Change them only through the integrator.
 */

export type IntakeSource = 'cvviz_export';

export type IntakeBatchStatus = 'preparing' | 'ready' | 'closed';

export interface IntakeBatch {
  id: string;
  source: IntakeSource;
  file_name: string;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  status: IntakeBatchStatus;
  row_count: number;
  /** Rows a person has decided, and rows filed into MyJKKN. */
  decided_count: number;
  applied_count: number;
}

/** What the helper proposes, and what a person decides. */
export type IntakeAction =
  | 'file_under_job' // add as an application to job_id
  | 'merge_existing' // same person already applied; attach nothing new, link the row
  | 'needs_new_job' // no open job fits; HR should open one first
  | 'skip'; // not a candidate (test row, spam, duplicate in this file)

export type IntakeConfidence = 'high' | 'medium' | 'low';

export interface IntakeCandidate {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  /** Plain-English problem with the phone cell, e.g. "Looks like a date (25/07/85)". */
  phone_issue: string | null;
  qualification: string | null;
  current_job_title: string | null;
  current_company: string | null;
  cities: string[];
  linkedin_url: string | null;
  cvviz_profile_url: string | null;
  cvviz_job_title: string | null;
  cvviz_job_code: string | null;
  /** ISO timestamp from the export's "Resume Upload Date", if readable. */
  applied_at: string | null;
}

/** What the AI read from the resume. Every field optional; null when unread. */
export interface ResumeExtract {
  qualification: string | null;
  subject: string | null;
  experience_years: number | null;
  current_role: string | null;
  /** One sentence, for the card. */
  summary: string | null;
}

export interface IntakeResume {
  /** File name the export names in its "File Name" column. */
  file_name: string | null;
  /** True when a file with that name was uploaded in this batch. */
  matched_upload: boolean;
  /** Storage path of the uploaded file while the batch is open; null if none. */
  storage_path: string | null;
  extract: ResumeExtract | null;
}

export type IntakeDuplicateKind =
  | 'none'
  | 'same_file' // another row in this batch is the same person
  | 'existing_application' // an hr_job_applications row has this email
  | 'existing_candidate'; // an hr_recruitment_candidates row has this email or phone

export interface IntakeDuplicate {
  kind: IntakeDuplicateKind;
  /** Row id (same_file) or record id (existing_*) the duplicate points at. */
  ref_id: string | null;
  note: string | null;
}

export interface IntakeProposal {
  action: IntakeAction;
  job_id: string | null;
  job_title: string | null;
  institution_id: string | null;
  confidence: IntakeConfidence;
  /** Plain-English reasons shown on the card, most important first. */
  reasons: string[];
  /** Set when a learned rule produced this proposal; the card credits its author. */
  rule_id: string | null;
  rule_author_name: string | null;
}

export interface IntakeDecision {
  action: IntakeAction;
  job_id: string | null;
  decided_by: string;
  decided_by_name: string | null;
  decided_at: string;
  /** True when the person chose something other than the proposal. */
  corrected: boolean;
}

export interface IntakeApplied {
  application_id: string | null;
  applied_at: string;
  error: string | null;
}

export interface IntakeRow {
  id: string;
  batch_id: string;
  row_index: number;
  candidate: IntakeCandidate;
  resume: IntakeResume;
  duplicate: IntakeDuplicate;
  proposal: IntakeProposal;
  decision: IntakeDecision | null;
  applied: IntakeApplied | null;
}

/**
 * A learned match: "a CVViZ job titled like this goes to this MyJKKN job".
 * Born from a person's correction; credited to them on every card it shapes.
 */
export interface IntakeMatchRule {
  id: string;
  /** Lower-cased, punctuation-stripped CVViZ job title, e.g. "assistant professor history". */
  cvviz_job_title_norm: string;
  job_id: string;
  job_title: string | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  times_used: number;
}

/** An open MyJKKN job, as the matcher sees it. */
export interface IntakeOpenJob {
  id: string;
  title: string;
  institution_id: string | null;
  institution_name: string | null;
  department_name: string | null;
}

// ---------------------------------------------------------------------------
// API contract (routes under /api/hr/recruitment/intake)
// ---------------------------------------------------------------------------
// POST   /batches                 multipart: `export` (one .csv/.xlsx/.tsv), `resumes` (0..n PDF/DOC/DOCX, or one .zip)
//                                 → 201 { batch: IntakeBatch }
// GET    /batches                 → { batches: IntakeBatch[] }            (newest first, own + same-scope)
// GET    /batches/:id             → { batch: IntakeBatch, rows: IntakeRow[], open_jobs: IntakeOpenJob[] }
// POST   /rows/:id/decide         { action: IntakeAction, job_id?: string | null } → { row: IntakeRow }
// POST   /batches/:id/accept-high { } → { decided: number }   (accepts every undecided HIGH-confidence proposal)
// POST   /batches/:id/apply       { row_ids?: string[] } → { results: { row_id: string; ok: boolean; application_id: string | null; error: string | null }[] }
// GET    /rules                   → { rules: IntakeMatchRule[] }
// DELETE /rules/:id               → { ok: true }
//
// Errors: { error: string } with a status code, never a silent empty list (rule #27).
// Gate: hr.recruitment.create, scoped like the applications screen.

export interface IntakeApiError {
  error: string;
}

export interface DecideRequest {
  action: IntakeAction;
  job_id?: string | null;
}

export interface ApplyResult {
  row_id: string;
  ok: boolean;
  application_id: string | null;
  error: string | null;
}

/** The AI reader, injected so the service runs (and tests) without a model. */
export type ResumeExtractor = (input: {
  fileName: string;
  bytes: Uint8Array;
  mimeType: string;
}) => Promise<ResumeExtract | null>;
