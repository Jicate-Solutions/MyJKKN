// types/bos.ts
// Board of Studies (BoS) module — TypeScript interfaces and types
// All BoS data lives in the COE database, accessed via proxy API routes.

// ── Enums & Union Types ──────────────────────────────────────────────────────

export type BosExpertCategory =
  | 'university_nominee'
  | 'subject_expert'
  | 'industry_expert'
  | 'alumni'
  | 'startup';

export type BosMemberType =
  | 'chairman'
  | 'internal_member'
  | 'university_nominee'
  | 'subject_expert'
  | 'industry_expert'
  | 'alumni'
  | 'startup'
  | 'hod'
  | 'facilitator'
  | 'principal';

export type BosMeetingStatus =
  | 'draft'
  | 'principal_approved'
  | 'noticed'
  | 'expert_invited'
  | 'completed'
  | 'minutes_drafted'
  | 'minutes_approved'
  | 'ratified';

export type BosMeetingType = 'regular' | 'special' | 'emergency' | 'online' | 'hybrid';

export type BosAttendanceStatus = 'present' | 'absent' | 'leave_of_absence';

export type BosResolutionStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'deferred'
  | 'not_applicable';

export type BosCourseReviewAction =
  | 'approved'
  | 'approved_with_changes'
  | 'rejected'
  | 'deferred'
  | 'noted';

export type BosDocumentType =
  | 'meeting_notice'
  | 'call_letter'
  | 'minutes_of_meeting'
  | 'composition_certificate'
  | 'syllabus_approval_certificate'
  | 'ta_da_bill'
  | 'action_taken_report';

export type BosClaimStatus = 'draft' | 'submitted' | 'approved' | 'paid';

// ── Label Maps ───────────────────────────────────────────────────────────────
// UI display labels — internal JKKN UI uses standard academic terms here
// (official documents use standard terms too; JKKN terms appear only in UI labels)

export const BOS_EXPERT_CATEGORY_LABELS: Record<BosExpertCategory, string> = {
  university_nominee: 'University Nominee',
  subject_expert: 'Subject Expert',
  industry_expert: 'Industry Expert',
  alumni: 'Alumni',
  startup: 'Startup',
};

export const BOS_MEMBER_TYPE_LABELS: Record<BosMemberType, string> = {
  chairman: 'Chairman',
  internal_member: 'Member',
  university_nominee: 'University Nominee',
  subject_expert: 'Subject Expert',
  industry_expert: 'Industry Expert',
  alumni: 'Alumni',
  startup: 'Startup',
  hod: 'Head of Department',
  facilitator: 'Facilitator',
  principal: 'Principal',
};

export const BOS_MEETING_STATUS_LABELS: Record<BosMeetingStatus, string> = {
  draft: 'Draft',
  principal_approved: 'Principal Approval',
  noticed: 'Notice Sent',
  expert_invited: 'Experts Invited',
  completed: 'Meeting Completed',
  minutes_drafted: 'Minutes Drafted',
  minutes_approved: 'Minutes Approved',
  ratified: 'Ratified',
};

export const BOS_MEETING_TYPE_LABELS: Record<BosMeetingType, string> = {
  regular: 'Regular',
  special: 'Special',
  emergency: 'Emergency',
  online: 'Online',
  hybrid: 'Hybrid',
};

export const BOS_COURSE_REVIEW_ACTION_LABELS: Record<BosCourseReviewAction, string> = {
  approved: 'Approved',
  approved_with_changes: 'Approved with Changes',
  rejected: 'Rejected',
  deferred: 'Deferred',
  noted: 'Noted',
};

export const BOS_DOCUMENT_TYPE_LABELS: Record<BosDocumentType, string> = {
  meeting_notice: 'Meeting Notice',
  call_letter: 'Call Letter',
  minutes_of_meeting: 'Minutes of Meeting',
  composition_certificate: 'Composition Certificate',
  syllabus_approval_certificate: 'Syllabus Approval Certificate',
  ta_da_bill: 'TA/DA Bill',
  action_taken_report: 'Action Taken Report',
};

// ── Meeting State Machine ────────────────────────────────────────────────────
// Ordered list of states for progress stepper component

// 'completed' is intentionally omitted: per the 2026-05-20 UX simplification,
// the "Meeting Finalized" action chains expert_invited → completed → minutes_drafted
// in a single click (see handleTransitionConfirm in the meeting detail page),
// so the intermediate Completed state isn't shown as a stepper step. The
// enum value still exists for legacy meetings and the state machine still
// permits the transition — only the visible workflow collapsed it.
export const BOS_MEETING_STATUS_ORDER: BosMeetingStatus[] = [
  'draft',
  'principal_approved',
  'noticed',
  'expert_invited',
  'minutes_drafted',
  'minutes_approved',
  'ratified',
];

// Valid transitions: what status can follow the current one
export const BOS_MEETING_NEXT_STATUS: Record<BosMeetingStatus, BosMeetingStatus | null> = {
  draft: 'principal_approved',
  principal_approved: 'noticed',
  noticed: 'expert_invited',
  expert_invited: 'completed',
  completed: 'minutes_drafted',
  minutes_drafted: 'minutes_approved',
  minutes_approved: 'ratified',
  ratified: null,
};

// ── Board Programme Mapping ──────────────────────────────────────────────────

export interface BosBoardProgramme {
  id: string;
  board_id: string;
  institutions_id: string;
  programme_code: string;    // UEN, UCM, UTA…
  programme_name?: string;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// ── Programme Outcomes ───────────────────────────────────────────────────────

export interface BosProgrammeOutcome {
  id: string;
  institutions_id: string;
  regulation_id: string;
  programme_code: string;
  po_code: string;           // PO1, PO2, …
  description?: string | null;
  sort_order: number;
  created_by?: string;
  created_at: string;
  updated_by?: string;
  updated_at: string;
}

export interface BosProgrammeSpecificOutcome {
  id: string;
  institutions_id: string;
  regulation_id: string;
  programme_code: string;
  pso_code: string;          // PSO1, PSO2, …
  description?: string | null;
  sort_order: number;
  created_by?: string;
  created_at: string;
  updated_by?: string;
  updated_at: string;
}

/** Summary row returned by GET /api/bos/taxonomy/[regulationId]/programmes */
export interface BosProgrammeSummary {
  programme_code: string;
  programme_name: string;
  board_id: string;
  board_name: string;
  po_count: number;
  pso_count: number;
  can_edit: boolean;   // true if current user is chairman for this programme (or super admin)
  can_view: boolean;   // true if current user is any board member, principal, or super admin
}

// ── Board (Reference from COE) ───────────────────────────────────────────────

export interface BosBoard {
  id: string;
  board_code: string;
  board_name: string;
  board_type?: string | null;
  institutions_id?: string;
  is_active?: boolean;
  display_name?: string | null;
  board_order?: number | null;   // COE-provided ordering; we sort ascending in selects
}

export interface BosBoardFilters {
  institutionsId?: string;
  // Note: boards endpoint doesn't support pagination or filtering
  // It returns filtered results based on authenticated user's institution scope
}

// ── Course Syllabus & Learning Outcomes ─────────────────────────────────

export interface BosCourseObjective {
  id?: string;
  number: number;
  description: string;
}

export interface BosCourseLearnOutcome {
  clo_number: number;
  description: string;
  k_values: string[]; // ['K1', 'K3', 'K5', 'K6'] from taxonomy
}

export interface BosCourseObjectivesContent {
  objectives: BosCourseObjective[];
}

export interface BosCourseLearnOutcomesContent {
  clos: BosCourseLearnOutcome[];
}

// ── Course Content: Units & Chapters ───────────────────────────────────

export interface BosChapterSubtopic {
  number: number;
  title: string;
}

export interface BosChapter {
  chapter_number: number;
  title: string;
  sections: string; // "Chapter 1: Sections 13 and 14"
  subtopics?: BosChapterSubtopic[];
}

export interface BosUnit {
  unit_id: string; // "I", "II", "III", "IV", "V"
  unit_title: string;
  chapters: BosChapter[];
  remarks?: string;
}

// Practical-paper topic: a numbered heading (e.g. "MAJOR PRACTICALS") that may
// hold child sub-topics (e.g. "Estimation of dissolved Oxygen"). Sub-topics
// are optional — rows authored before the hierarchy shipped continue to work
// as flat single-line entries because the PDF renderer falls back on
// `{ number, title }` when `subtopics` is empty or absent.
export interface BosPracticalTopic {
  number: number;
  title: string;
  subtopics?: BosChapterSubtopic[];
}

// Project-mode rule: a titled guideline with paragraph content
export interface BosProjectRule {
  unit_of_experiment: string;  // e.g., "Project Assignment & Submission"
  content: string;              // The paragraph/guideline text from the PDF
}

// Project-mode unit: contains project work rules and guidelines
export interface BosProjectUnit {
  unit_id: string;              // "I", "II", "III" (auto-generated)
  unit_title: string;           // e.g., "Timeline & Submission"
  rules: BosProjectRule[];       // Guidelines for this unit
  remarks?: string;
}

export interface BosCourseContentData {
  units: BosUnit[];
  // Practical-paper mode (e.g. lab courses): when true, `topics` is the
  // authoritative content — a numbered list of headings, each optionally
  // carrying its own sub-experiments. `units` is ignored in this mode.
  // The form toggle in components/bos/syllabus-form.tsx (toggleMode) maintains
  // the invariant that exactly one of units/topics/project_units is populated.
  is_practical?: boolean;
  topics?: BosPracticalTopic[];
  // Project-mode: group-based project work rules and guidelines
  is_project?: boolean;
  project_units?: BosProjectUnit[];
  instruction?: string;
}

// ── Textbooks & References ────────────────────────────────────────────

export interface BosTextbook {
  title: string;
  author: string;
  publication_year: number;
  publisher?: string;
}

export interface BosBooksData {
  primary: BosTextbook[];
  references: BosTextbook[];
}

// ── Web Resources ─────────────────────────────────────────────────────

export interface BosWebResource {
  title: string;
  url: string;
}

export interface BosWebResourcesData {
  resources: BosWebResource[];
}

// ── Pedagogy Methods ──────────────────────────────────────────────────

export interface BosPedagogyData {
  methods: string[]; // ["Chalk and talk", "PowerPoint", "E-content", "Group discussion", ...]
}

// ── Programme Outcome Mappings ────────────────────────────────────────

export interface BosPoMapping {
  co_id: string; // "CO1", "CO2", etc.
  pos: Record<string, 'H' | 'M' | 'L'>; // {"PO1": "H", "PO2": "M", ...}
  psos?: Record<string, 'H' | 'M' | 'L'>; // Optional PSO mappings
}

export interface BosPOMappingsData {
  mappings: BosPoMapping[];
}

// ── Complete Course Syllabus ──────────────────────────────────────────

export interface BosSyllabusContent {
  course_objectives?: BosCourseObjectivesContent;
  course_learning_outcomes?: BosCourseLearnOutcomesContent;
  course_content?: BosCourseContentData;
  textbooks?: BosBooksData;
  web_resources?: BosWebResourcesData;
  pedagogy?: BosPedagogyData;
  po_mappings?: BosPOMappingsData;
}

export interface BosCourseSyllabus {
  id: string;
  institutions_id: string;
  board_id: string;
  regulation_id?: string;
  composition_id?: string;
  course_code: string;
  course_name: string;
  course_credits?: number;
  total_hours?: number;
  contact_hours?: number;

  // Versioning
  version_number: number;
  is_latest: boolean;
  is_archived: boolean;
  revised_from_syllabus_id?: string;

  // Content (as JSONB)
  course_objectives?: Record<string, unknown> | BosCourseObjectivesContent;
  course_learning_outcomes?: Record<string, unknown> | BosCourseLearnOutcomesContent;
  course_content?: BosCourseContentData;
  textbooks?: BosBooksData;
  web_resources?: BosWebResourcesData;
  pedagogy?: BosPedagogyData;
  po_mappings?: BosPOMappingsData;

  // Metadata
  created_by: string; // User ID
  created_at: string;
  last_modified_by?: string;
  last_modified_at?: string;

  // Additional
  notes?: string;
  stream?: string; // "Engineering", "Pharmacy", "Nursing", "Dental", "Arts"
}

export type CreateBosSyllabusDto = Omit<
  BosCourseSyllabus,
  'id' | 'created_at' | 'last_modified_at' | 'version_number' | 'is_latest' | 'is_archived'
>;

export type UpdateBosSyllabusDto = Partial<Omit<
  BosCourseSyllabus,
  'id' | 'created_at' | 'created_by' | 'version_number' | 'regulation_id' | 'institutions_id'
>>;

export interface BosSyllabusFilters {
  institutionsId?: string;
  boardId?: string;
  regulationId?: string;
  courseCode?: string;
  stream?: string;
  isLatest?: boolean;
  isArchived?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ── Master Taxonomy Frameworks (bos_taxonomy + bos_taxonomy_levels) ──

export interface BosTaxonomyLevel {
  id: string;
  taxonomy_id: string;
  code: string; // 'K1', 'K2', ...
  name: string; // 'Remember', 'Foundational Knowledge', ...
  description?: string | null;
  verb_examples: string[]; // [] for Fink's, ['define','list',...] for Bloom's
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BosTaxonomy {
  id: string;
  institutions_id: string;
  code: string; // 'blooms' | 'finks' | custom slug
  name: string; // 'Bloom\'s Taxonomy', 'Fink\'s Taxonomy', ...
  description?: string | null;
  is_hierarchical: boolean;
  is_system: boolean;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_by?: string | null;
  updated_at: string;
}

export interface BosTaxonomyWithLevels extends BosTaxonomy {
  levels: BosTaxonomyLevel[];
}

export interface BosTaxonomySummary extends BosTaxonomy {
  level_count: number;
  institution_name?: string;
}

export interface CreateBosTaxonomyDto {
  institutions_id?: string;
  code: string;
  name: string;
  description?: string | null;
  is_hierarchical?: boolean;
  is_active?: boolean;
  levels: Array<{
    code: string;
    name: string;
    description?: string | null;
    verb_examples?: string[];
    sort_order?: number;
  }>;
}

export type UpdateBosTaxonomyDto = Partial<Omit<CreateBosTaxonomyDto, 'institutions_id'>>;

export interface BosTaxonomyFilters {
  institutionsId?: string;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ── Regulation Taxonomy Master ────────────────────────────────────────

export interface BosRegulationTaxonomy {
  id: string;
  institutions_id: string;
  regulation_id: string;
  taxonomy_type: 'finks' | 'blooms' | string; // Framework choice
  k_values: Record<string, string>; // {"K1": "Application", "K2": "Foundational", ...}
  // Per-programme PO definitions: { "UEN": { "PO1": "...", "PO2": "..." }, "UCM": { ... } }
  // Legacy flat format { "PO1": "..." } is also accepted for backward compat.
  pos: Record<string, string> | Record<string, Record<string, string>>;
  psos?: Record<string, string> | Record<string, Record<string, string>>; // PSO definitions (optional)
  created_by: string;
  created_at: string;
  updated_by?: string;
  updated_at?: string;
}

export type CreateBosRegulationTaxonomyDto = Omit<
  BosRegulationTaxonomy,
  'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'
>;

export type UpdateBosRegulationTaxonomyDto = Partial<Omit<
  BosRegulationTaxonomy,
  'id' | 'created_at' | 'created_by' | 'institutions_id' | 'regulation_id'
>>;

// ── Syllabus Duplication & Revision ────────────────────────────────────

export interface BosSyllabusDuplicateRequest {
  source_regulation_id: string;
  target_regulation_id: string;
  course_code_mapping: Array<{
    from: string; // "24UGTA01"
    to: string;   // "25UGTA01"
  }>;
  keep_content?: boolean; // default: true
}

export interface BosSyllabusRevisionRequest {
  syllabi_id: string;
  updated_content: BosSyllabusContent;
  notes?: string; // "Updated per board feedback"
}

export interface BosSyllabusHistory {
  current: BosCourseSyllabus;
  previous?: BosCourseSyllabus;
  all_versions: BosCourseSyllabus[];
}

// ── List Response ─────────────────────────────────────────────────────

export interface BosSyllabusListResponse extends BosListResponse<BosCourseSyllabus> {
  // Inherits data, metadata from BosListResponse
}

// ── External Expert ──────────────────────────────────────────────────────────

export interface BosExternalExpert {
  id: string;
  institutions_id: string;
  name: string;
  title?: string;
  designation?: string;
  institution_name?: string;
  department_name?: string;
  address?: string;
  contact_no?: string;
  email?: string;
  category: BosExpertCategory;
  specialization?: string;
  qualifications?: string;
  is_active: boolean;
  /**
   * One-way distance in km from this expert to the institution. The runtime
   * compute step doubles it for round-trip TA (distance_km × 2 × ₹5/km).
   * NULL → no TA component on the auto-generated claim (honorarium still paid).
   * See 20260521_bos_ta_da_sop_redesign.sql.
   */
  distance_km?: number | null;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export type CreateBosExpertDto = Omit<BosExternalExpert, 'id' | 'created_at' | 'updated_at'>;
export type UpdateBosExpertDto = Partial<CreateBosExpertDto>;

export interface BosExpertFilters {
  institutionsId?: string;
  category?: BosExpertCategory;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ── Composition ──────────────────────────────────────────────────────────────

export interface BosComposition {
  id: string;
  institutions_id: string;
  board_id: string;
  /**
   * Academic level of the board (e.g. 'PG', 'UG'), denormalized from COE
   * /api/public/boards.board_type at composition-create time. Used to render
   * "Meeting of the {board_type} {board_name} Board of Studies" on call letters.
   * Nullable for legacy rows created before 20260521_add_board_type_to_bos_compositions_meetings.
   */
  board_type?: string | null;
  composition_title: string;
  term_start_date: string;
  term_end_date: string;
  academic_year: string;
  is_active: boolean;
  constituted_by?: string;
  ratified_by_gc: boolean;
  ratified_date?: string;
  notes?: string;
  // Auth user who created the row — used as a bootstrap permission gate
  // (creator can edit/delete + manage members before a chairman is appointed).
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  board?: { board_code: string; board_name: string; board_type?: string };
  members?: BosMember[];
  member_count?: number;
}

export type CreateBosCompositionDto = Omit<
  BosComposition,
  'id' | 'created_at' | 'updated_at' | 'created_by' | 'board' | 'members' | 'member_count'
>;
export type UpdateBosCompositionDto = Partial<CreateBosCompositionDto>;

export interface BosCompositionFilters {
  institutionsId?: string;
  boardId?: string;
  academicYear?: string;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ── Committee ─────────────────────────────────────────────────────────────────
// Institution-wise committees (Academic, Exam, …). A composition's members are
// grouped by committee via bos_members.committee_id. Managed on /bos/committees.

export interface BosCommittee {
  id: string;
  institutions_id: string;
  name: string;
  short_code?: string | null;
  /** Display order within the institution (committees list + member grouping). */
  sort_order: number;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateBosCommitteeDto = Omit<
  BosCommittee,
  'id' | 'created_at' | 'updated_at' | 'created_by'
>;
export type UpdateBosCommitteeDto = Partial<CreateBosCommitteeDto>;

// ── Member Type (institution-wise, table-driven) ─────────────────────────────
// Replaces the hardcoded BOS_MEMBER_TYPE_LABELS dropdown in the Add Member
// dialog. base_type maps each row to the legacy BosMemberType enum, which
// stays the behaviour key (chairman authorization, staff-vs-expert picker).
// Managed on /bos/member-types.

export interface BosMemberTypeRecord {
  id: string;
  institutions_id: string;
  name: string;
  /** Legacy behaviour key — written to bos_members.member_type on insert. */
  base_type: BosMemberType;
  /** Display order within the institution (dropdown + member grouping). */
  sort_order: number;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type CreateBosMemberTypeDto = Omit<
  BosMemberTypeRecord,
  'id' | 'created_at' | 'updated_at' | 'created_by'
>;
export type UpdateBosMemberTypeDto = Partial<CreateBosMemberTypeDto>;

// ── Member ───────────────────────────────────────────────────────────────────

export interface BosMember {
  id: string;
  institutions_id: string;
  composition_id: string;
  /**
   * Which committee (within the composition) this member sits on. NULL for
   * rows created before committees existed — rendered as the "General" group.
   */
  committee_id?: string | null;
  member_type: BosMemberType;
  /**
   * FK to bos_member_types (institution-wise, table-driven). member_type
   * stays as the behaviour key — it equals the type's base_type at insert
   * time. NULL on rows created before the table existed and not backfilled.
   */
  member_type_id?: string | null;
  staff_id?: string;
  staff_name?: string;
  staff_designation?: string;
  expert_id?: string;
  display_name: string;
  display_designation?: string;
  display_department?: string;
  display_institution?: string;
  /**
   * Distance in km for external expert members. NULL for internal (staff) members.
   * Read on the auto-claim hot path so the attendance route doesn't need
   * to join out to bos_external_experts on every save.
   */
  distance_km?: number | null;
  address?: string;
  contact_no?: string;
  email?: string;
  sort_order: number;
  is_active: boolean;
  joined_date?: string;
  left_date?: string;
  created_at: string;
  updated_at: string;
  // Joined
  expert?: BosExternalExpert;
}

export type CreateBosMemberDto = Omit<BosMember, 'id' | 'created_at' | 'updated_at' | 'expert'>;
export type UpdateBosMemberDto = Partial<CreateBosMemberDto>;

// ── Meeting Minutes (rich content) ────────────────────────────────────────────

/**
 * One row in the "changes log" table of a meeting's minutes. Each entry records
 * a specific change discussed for a specific syllabus during the meeting, with
 * optional attribution to the member who suggested it.
 *
 * Fields like syllabus_code and suggested_by_name are denormalized snapshots —
 * they're populated at save time so PDF/DOCX exports don't need to re-resolve
 * UUIDs after archiving. The *_id fields remain for navigation/audit.
 */
export interface BosMinutesChangeLogEntry {
  id: string; // client-generated UUID for stable React keys
  syllabus_id?: string | null;
  syllabus_code?: string | null;
  unit?: string | null;
  /**
   * Multi-select: a single change row can cover several related topics within
   * the picked unit. May also be a single string in legacy data (rows saved
   * with the first iteration of the editor before multi-select shipped) —
   * normalize via asTopicArray() in the UI.
   */
  topic?: string | string[] | null;
  /**
   * Multi-select: sub-topics from any of the picked topics. Same legacy-string
   * fallback applies — see topic field.
   */
  sub_topic?: string | string[] | null;
  /**
   * Multi-select: one change may be co-suggested by several members
   * (committee proposal style). Single-string form is accepted for
   * backward-compat with rows saved before multi-select shipped on
   * 2026-05-20 — normalize via the asArray helper in minutes-tab.tsx /
   * bos-pdf-generator.ts / meeting-minutes-docx.ts.
   */
  suggested_by_member_id?: string | string[] | null;
  /**
   * Denormalized member name(s) — array order matches suggested_by_member_id.
   * Snapshot at save time so PDF/DOCX exports stay readable if a member is
   * later renamed or removed from the composition.
   */
  suggested_by_name?: string | string[] | null;
  suggestion_text: string; // required — every row must describe a change
  created_at?: string;
}

/**
 * Structured rich-minutes payload stored in bos_meetings.minutes_content (JSONB).
 * - narrative_html: TipTap-rendered HTML of the free-form minutes body
 * - changes_log: list of structured per-syllabus change entries
 */
export interface BosMeetingMinutesContent {
  narrative_html?: string;
  changes_log?: BosMinutesChangeLogEntry[];
}

// ── Meeting ───────────────────────────────────────────────────────────────────

export interface BosMeeting {
  id: string;
  institutions_id: string;
  board_id: string;
  /**
   * Academic level of the board (e.g. 'PG', 'UG'), copied from the parent
   * composition at meeting-create time so the per-recipient call-letter PDF
   * render path doesn't need a COE round-trip per render. See
   * 20260521_add_board_type_to_bos_compositions_meetings.sql.
   */
  board_type?: string | null;
  composition_id: string;
  meeting_number: number;
  academic_year: string;
  meeting_title?: string;
  meeting_type: BosMeetingType;
  status: BosMeetingStatus;
  scheduled_date?: string;
  scheduled_time?: string;
  venue?: string;
  actual_date?: string;
  actual_start_time?: string;
  actual_end_time?: string;
  quorum_met?: boolean;
  submitted_for_approval_at?: string;
  principal_approved_at?: string;
  principal_approved_by?: string;
  ratified_by_ac: boolean;
  ratified_date?: string;
  agenda_text?: string;
  minutes_summary?: string;
  /**
   * Structured rich-text minutes. Optional because legacy meetings (created
   * before the 2026-05-20 minutes-editor migration) won't have it populated.
   * Migration: supabase/migrations/20260520000000_bos_meetings_minutes_content.sql
   */
  minutes_content?: BosMeetingMinutesContent;
  minutes_drafted_at?: string;
  minutes_approved_at?: string;
  minutes_approved_by?: string;
  signature_page_url?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Joined
  board?: { board_code: string; board_name: string };
  composition?: { composition_title: string };
  attendee_count?: number;
  agenda_item_count?: number;
  // Embedded via the FK constraint bos_meetings_principal_approved_by_fkey;
  // populated by GET /api/bos/meetings/[id] when the column is non-null. Used
  // to gate the post-approval transition button to the specific staff member
  // who was recorded as the approver during draft submission.
  principal_approved_by_staff?: {
    id: string;
    profile_id: string | null;
    first_name: string | null;
    last_name: string | null;
    designation: string | null;
  } | null;
}

export type CreateBosMeetingDto = Omit<
  BosMeeting,
  | 'id'
  | 'meeting_number'
  | 'created_at'
  | 'updated_at'
  | 'board'
  | 'composition'
  | 'attendee_count'
  | 'agenda_item_count'
> & {
  // Optional: chairman may override the auto-suggested next number (e.g. when
  // earlier meetings were conducted outside the system). Uniqueness per
  // composition is enforced by the API.
  meeting_number?: number;
};
export type UpdateBosMeetingDto = Partial<CreateBosMeetingDto>;

export interface BosMeetingFilters {
  institutionsId?: string;
  institutionCode?: string;
  boardId?: string;
  compositionId?: string;
  academicYear?: string;
  status?: BosMeetingStatus;
  meetingType?: BosMeetingType;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ── Meeting Attendee ──────────────────────────────────────────────────────────

export interface BosMeetingAttendee {
  id: string;
  institutions_id: string;
  meeting_id: string;
  member_id: string;
  attendance_status: BosAttendanceStatus;
  absence_reason?: string;
  ta_da_eligible: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  member?: BosMember;
}

// ── Agenda Item ───────────────────────────────────────────────────────────────

export interface BosAgendaItem {
  id: string;
  institutions_id: string;
  meeting_id: string;
  item_number: number;
  item_title: string;
  item_description?: string;
  discussion_notes?: string;
  resolution_text?: string;
  resolution_status?: BosResolutionStatus;
  responsible_person?: string;
  target_date?: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Joined
  actions?: BosResolutionAction[];
  course_reviews?: BosCourseReview[];
}

export type CreateBosAgendaItemDto = Omit<
  BosAgendaItem,
  'id' | 'created_at' | 'updated_at' | 'actions' | 'course_reviews'
>;
export type UpdateBosAgendaItemDto = Partial<CreateBosAgendaItemDto>;

// ── Resolution Action ─────────────────────────────────────────────────────────

export interface BosResolutionAction {
  id: string;
  institutions_id: string;
  agenda_item_id: string;
  action_description: string;
  action_date?: string;
  action_by?: string;
  remarks?: string;
  status: 'pending' | 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
}

// ── Course Review ─────────────────────────────────────────────────────────────

export interface BosCourseReview {
  id: string;
  institutions_id: string;
  meeting_id: string;
  agenda_item_id?: string;
  course_id: string;
  course_code: string;
  course_name: string;
  review_action: BosCourseReviewAction;
  changes_suggested?: string;
  remarks?: string;
  regulation_code?: string;
  created_at: string;
}

// ── TA/DA Claim ───────────────────────────────────────────────────────────────

export interface BosTaDaClaim {
  id: string;
  institutions_id: string;
  meeting_id: string;
  member_id: string;
  expert_id?: string | null;
  travel_mode?: string;
  travel_from?: string;
  travel_to?: string;
  travel_amount: number;
  /**
   * Renamed from da_days on 2026-05-21 per SOP redesign — kept on the
   * interface for back-compat reads of legacy rows. Auto-generated claims
   * write 1 here (units × rate = amount when units=1).
   */
  honorarium_units: number;
  /**
   * Renamed from da_rate. Auto-generated claims set this to the honorarium
   * amount (₹1,500 external / ₹1,000 internal) so rate × units = amount.
   */
  honorarium_rate: number;
  /**
   * Renamed from da_amount. The per-meeting honorarium that contributes to
   * the GENERATED total_amount. ₹1,500 external / ₹1,000 internal per SOP.
   */
  honorarium_amount: number;
  other_amount: number;
  other_description?: string;
  total_amount: number;  // GENERATED column — database computes this
  claim_status: BosClaimStatus;
  bill_number?: string;
  payment_date?: string;
  payment_reference?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Joined
  member?: BosMember;
  expert?: BosExternalExpert;
}

// ── Document ──────────────────────────────────────────────────────────────────

export interface BosDocument {
  id: string;
  institutions_id: string;
  meeting_id: string;
  document_type: BosDocumentType;
  file_name: string;
  file_url: string;
  file_format: 'pdf' | 'docx';
  recipient_member_id?: string;
  generated_at: string;
  generated_by?: string;
  is_latest: boolean;
}

// ── Report Types ──────────────────────────────────────────────────────────────

export interface BosCompositionReport {
  board_name: string;
  board_code: string;
  composition_title: string;
  term_start_date: string;
  term_end_date: string;
  members: Array<{
    sno: number;
    position: string;
    name: string;
    designation: string;
    address: string;
    contact_no: string;
    email: string;
    category: BosMemberType;
  }>;
}

export interface BosMeetingRegisterEntry {
  meeting_number: number;
  meeting_title: string;
  academic_year: string;
  scheduled_date: string;
  status: BosMeetingStatus;
  attendee_count: number;
  total_members: number;
  agenda_item_count: number;
  resolutions_count: number;
  courses_reviewed: number;
}

// ── Generic List Response ─────────────────────────────────────────────────────
// All paginated API responses use this shape

export interface BosListResponse<T> {
  data: T[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
