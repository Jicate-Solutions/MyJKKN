// types/bos.ts
// Board of Studies (BoS) module — TypeScript interfaces and types
// All BoS data lives in the COE database, accessed via proxy API routes.

// ── Enums & Union Types ──────────────────────────────────────────────────────

export type BosExpertCategory =
  | 'university_nominee'
  | 'subject_expert'
  | 'academic_expert'
  | 'industry_expert'
  | 'alumni'
  | 'startup'
  | 'student'
  // Faculty / Chairman can also be sourced from the external-expert directory
  // (a faculty member or chairman brought in from another institution), so both
  // are valid expert categories in addition to being member types.
  | 'faculty_member'
  | 'chairman';

export type BosMemberType =
  | 'chairman'
  | 'internal_member'
  | 'faculty_member'
  | 'university_nominee'
  | 'subject_expert'
  | 'academic_expert'
  | 'industry_expert'
  | 'alumni'
  | 'startup'
  | 'hod'
  | 'facilitator'
  | 'principal'
  | 'member_secretary'
  | 'student';

export type BosMeetingStatus =
  | 'draft'
  | 'principal_approved'
  | 'noticed'
  | 'expert_invited'
  | 'completed'
  | 'minutes_drafted'
  | 'minutes_approved'
  | 'ratified';

export type BosMeetingType = 'regular' | 'special' | 'emergency' | 'online' | 'hybrid' | 'academic_council' | 'governing_body';

export type BosAttendanceStatus = 'present' | 'absent' | 'leave_of_absence';

/**
 * How a member attended — the dimension the SOP's sitting charges are quoted
 * against (20260805120000). Recorded PER ATTENDEE, not per meeting: the
 * `online`/`hybrid` values on BosMeetingType describe the meeting's format but
 * can't coexist with `academic_council`/`governing_body`, and a hybrid meeting
 * has attendees on both sides regardless. Online attendance always pays zero
 * travel allowance.
 */
export type BosAttendanceMode = 'offline' | 'online';

export const BOS_ATTENDANCE_MODE_LABELS: Record<BosAttendanceMode, string> = {
  offline: 'Offline',
  online: 'Online',
};

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
  academic_expert: 'Academic Expert',
  industry_expert: 'Industry Expert',
  alumni: 'Alumni',
  startup: 'Startup',
  student: 'Student',
  faculty_member: 'Faculty Member',
  chairman: 'Chairman',
};

export const BOS_MEMBER_TYPE_LABELS: Record<BosMemberType, string> = {
  chairman: 'Chairman',
  internal_member: 'Member',
  faculty_member: 'Faculty Member',
  university_nominee: 'University Nominee',
  subject_expert: 'Subject Expert',
  academic_expert: 'Academic Expert',
  industry_expert: 'Industry Expert',
  alumni: 'Alumni',
  startup: 'Startup',
  hod: 'Head of Department',
  facilitator: 'Facilitator',
  principal: 'Principal',
  member_secretary: 'Member Secretary',
  student: 'Student',
};

/**
 * Display label for a member_type value. Catalog-driven rows store the
 * bos_member_types.name verbatim — shown as-is; legacy enum values map
 * through BOS_MEMBER_TYPE_LABELS.
 */
export function bosMemberTypeLabel(memberType: string | null | undefined): string {
  if (!memberType) return '';
  return (BOS_MEMBER_TYPE_LABELS as Record<string, string>)[memberType] ?? memberType;
}

/**
 * Is this bos_members row a chairman seat? Mirrors the DB predicate in the
 * 20260710150000 helper functions: legacy literal 'chairman' (case-insensitive,
 * covering catalog rows named "Chairman" whose FK was later nulled) OR a
 * linked catalog type whose base_type is 'chairman'.
 */
export function isBosChairmanRow(m: {
  member_type?: string | null;
  member_type_rec?: { base_type?: BosMemberType | string | null } | null;
}): boolean {
  return (
    (m.member_type ?? '').toLowerCase() === 'chairman' ||
    m.member_type_rec?.base_type === 'chairman'
  );
}

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
  academic_council: 'Academic Council',
  governing_body: 'Governing Body',
};

/**
 * Download / attachment filename for a per-member call-letter PDF.
 * Prefix follows meeting_type so GB/AC notices are not labelled "bos-".
 * e.g. governing-body-call-letter-Mrs-O-Isvarya-Lakshmi.pdf
 */
export function bosCallLetterFilename(
  meetingType: string | null | undefined,
  displayName: string,
): string {
  const prefix =
    meetingType === 'governing_body'
      ? 'governing-body-call-letter'
      : meetingType === 'academic_council'
        ? 'academic-council-call-letter'
        : 'bos-call-letter';
  const safeName =
    displayName.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'member';
  return `${prefix}-${safeName}.pdf`;
}

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

// ── Council-family meeting types ─────────────────────────────────────────────
// Institution-level bodies convened by the principal — Academic Council and
// Governing Body. They are modelled identically ("all as same"): the same
// shorter status machine, the same principal-driven authorization, and the same
// board-less composition. They are distinguished ONLY for listing, preparation,
// and labels. Use this predicate anywhere a meeting could be either one.
export const COUNCIL_MEETING_TYPES: BosMeetingType[] = ['academic_council', 'governing_body'];
export function isCouncilMeetingType(t: string | null | undefined): boolean {
  return t === 'academic_council' || t === 'governing_body';
}

// ── Academic Council / Governing Body meeting state machine ──────────────────
// Council meetings (meeting_type = 'academic_council' | 'governing_body') are
// convened by the principal, so there is NO 'principal_approved' hop (the
// principal is the scheduler) and NO 'ratified' terminal state (the council is
// itself the ratifying body). Call letters are sent at 'noticed'; there is no
// separate 'expert_invited' step.
//
//   draft → noticed → completed → minutes_drafted → minutes_approved
//
// The status route and stepper pick this map when meeting_type is
// 'academic_council'; BoS meetings continue to use BOS_MEETING_NEXT_STATUS.
export const AC_MEETING_STATUS_ORDER: BosMeetingStatus[] = [
  'draft',
  'noticed',
  'minutes_drafted',
  'minutes_approved',
];

export const AC_MEETING_NEXT_STATUS: Partial<Record<BosMeetingStatus, BosMeetingStatus | null>> = {
  draft: 'noticed',
  noticed: 'completed',
  completed: 'minutes_drafted',
  minutes_drafted: 'minutes_approved',
  minutes_approved: null,
};

/**
 * Returns the correct transition map for a meeting given its type.
 * Use this instead of referencing BOS_MEETING_NEXT_STATUS directly wherever a
 * meeting could be an Academic Council meeting.
 */
export function meetingNextStatusMap(
  meetingType: string | null | undefined
): Partial<Record<BosMeetingStatus, BosMeetingStatus | null>> {
  return isCouncilMeetingType(meetingType)
    ? AC_MEETING_NEXT_STATUS
    : BOS_MEETING_NEXT_STATUS;
}

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

// ── Institution-level master PO/PSO (bos_master_pos / bos_master_psos /
// bos_board_psos, migration 20260710170000). Different axis from the
// regulation-scoped BosProgrammeOutcome above — see /bos/po-pso.

export interface BosMasterPo {
  id: string;
  institutions_id: string;
  regulation_id: string;
  po_code: string;           // PO1, PO2, …
  description?: string | null;
  sort_order: number;
  created_by?: string;
  created_at: string;
  updated_by?: string;
  updated_at: string;
}

export interface BosMasterPso {
  id: string;
  institutions_id: string;
  regulation_id: string;
  pso_code: string;          // PSO1, PSO2, …
  description?: string | null;
  sort_order: number;
  created_by?: string;
  created_at: string;
  updated_by?: string;
  updated_at: string;
}

/** Board-level PSO override row. board_id is a COE board UUID (no local FK). */
export interface BosBoardPso {
  id: string;
  board_id: string;
  institutions_id: string;
  regulation_id: string;
  board_code?: string | null;
  board_name?: string | null;
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
  /** Period marker "theory+tutorial" (e.g. "6+6"); engineering/CET syllabi. */
  hours?: string;
  // ── Nursing (inc_nursing) per-unit outline columns ──────────────────
  // Optional; populated only for nursing syllabi. Engineering/CAS renderers
  // ignore them, so existing rows are unaffected.
  /** Nursing "Learning Outcomes" column for this unit. */
  learning_outcomes?: string[];
  /** Nursing "Teaching/Learning Activities" column for this unit. */
  teaching_activities?: string[];
  /** Nursing "Assessment Methods" column for this unit. */
  assessment_methods?: string[];
  /** Nursing hour-type marker for the unit, e.g. "3 (T)" → 'theory'. */
  hour_type?: 'theory' | 'practical';
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
  /**
   * PDF/exports: whether to print the inline experiment number (e.g. "1. Zener
   * diode …") on each practical sub-topic and heading. Defaults to ON when
   * absent so existing syllabi keep their current numbered output; unchecking
   * the "Number experiments" toggle in the Content tab stores `false` and the
   * exports drop the inline prefix (the S.No column still numbers the rows).
   */
  number_practical_topics?: boolean;
  // Project-mode: group-based project work rules and guidelines
  is_project?: boolean;
  project_units?: BosProjectUnit[];
  instruction?: string;
  /** Course total periods "theory+tutorial" (e.g. "30+30"); engineering/CET. */
  total_hours?: string;
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
  assessment_structure?: BosAssessmentStructure;
  concept_applications?: BosConceptApplicationsData;
  assessment_pattern?: BosAssessmentPatternData;
  capstone_project?: BosCapstoneProjectData;
  capstone_rubric?: BosCapstoneRubricData;
  llc_conference?: BosLlcConferenceData;
}

// ── Assessment Structure (v1.2) ──────────────────────────────────────────────
// One row of the "Assessment Structure (Total 100)" table.
export interface BosAssessmentComponent {
  id?: string;
  sno?: number;
  component: string;
  marks: number;
}

// A single Principal-Agent Public Exhibition capstone option.
export interface BosCapstone {
  id?: string;
  title: string;
  subject?: string;
  artifacts?: string;
  give_back?: string;
}

// Full assessment block stored as one JSONB column on bos_course_syllabi.
export interface BosAssessmentStructure {
  components?: BosAssessmentComponent[];
  concept_applications_note?: string;
  exhibition_note?: string;
  capstones?: BosCapstone[];
}

// ── Fink's Formative + Capstone blocks (v3.5) ────────────────────────────────
// Five dedicated JSONB columns on bos_course_syllabi (20260709 migration),
// separating what v1.2 crammed into assessment_structure.

// One formative activity row of "Concept Applications (Formative Learning
// Activities)" — anchored to a unit/lab task, shaped by a Fink's dimension.
export interface BosConceptApplication {
  id?: string;
  sno?: number;
  unit: string;              // e.g. "Word Tasks 1-2"
  finks_dimension: string;   // e.g. "Foundational Knowledge", "Caring"
  task: string;
  deliverable_notes: string; // deliverable + 3-4 sentence reflection prompt
}

export interface BosConceptApplicationsData {
  intro_note?: string;
  activities?: BosConceptApplication[];
}

// One internal-component row of the "Assessment Pattern" table.
export interface BosAssessmentPatternComponent {
  id?: string;
  sno?: number;
  component: string; // e.g. "CIA I, CIA II & Model Examination"
  marks: number;
}

export interface BosAssessmentPatternData {
  internal_marks?: number;  // e.g. 30
  external_marks?: number;  // e.g. 70
  components?: BosAssessmentPatternComponent[];
  activities_note?: string; // "* Activities: Assignment / Case study / …"
  note?: string;            // formative-vs-summative footnote
}

// One "choose ONE of FIVE" capstone option card.
export interface BosCapstoneOption {
  id?: string;
  option_no?: number;
  title: string;    // e.g. "The Document Kit for a Real Event"
  primary?: string; // PRIMARY (AI-proof) deliverable
  support?: string; // ~400-word reflection brief
  llc?: string;     // what is demonstrated live at the LLC
}

export interface BosCapstoneProjectData {
  intro_note?: string;
  options?: BosCapstoneOption[];
}

// One criterion row of the common capstone rubric.
export interface BosCapstoneRubricCriterion {
  id?: string;
  sno?: number;
  criterion: string;
  marks: number;
}

export interface BosCapstoneRubricData {
  total_marks?: number; // e.g. 10
  note?: string;        // "10 marks · common to all 5 options"
  criteria?: BosCapstoneRubricCriterion[];
}

// End-of-course Learners Led Conference description block.
export interface BosLlcConferenceData {
  title?: string;
  subtitle?: string;   // "cohort audience · faculty + Senior Learner facilitate…"
  description?: string;
}

// ── Academic model discriminator (multi-institution BoS) ─────────────
// Distinguishes the structurally-different syllabus shapes BoS now carries.
//   anna_univ  — engineering (CET) / arts-science (CAS): semester, CO-PO-PSO,
//                Bloom's/Fink's taxonomy. The original model.
//   mgr_ahs    — Allied Health Sciences (Dr. MGR Medical Univ): year/paper,
//                exam-scheme + internship, no CO-PO.
//   mgr_pharmd — Pharm.D (Dr. MGR Medical Univ): reuses the mgr_ahs shape
//                (year → subject → lecture-topic tree, exam-scheme, internship).
//   pci_pharm  — B.Pharm (Pharmacy Council of India, CBCS): semester + credits
//                + coded courses + Unit I–V content, but NO CO-PO-PSO/Bloom.
//   inc_nursing — B.Sc Nursing (Indian Nursing Council reg, TNMGRMU exam):
//                semester + credits + coded courses, Theory/Lab/Clinical workload
//                split, per-unit outline, a PARALLEL clinical outline, and CO →
//                10 INC core-competency mapping INSTEAD of CO-PO-PSO/Bloom.
export type AcademicModel = 'anna_univ' | 'mgr_ahs' | 'mgr_pharmd' | 'pci_pharm' | 'inc_nursing' | 'mgr_bds';

// ── Exam scheme (PCI / Dr. MGR) ──────────────────────────────────────
// Replaces the Anna CO-PO/Bloom assessment blocks for pharmacy/AHS models.
export interface BosExamSchemeComponent {
  name: string;                 // "Internal Assessment", "End Semester (Theory)", "Practical", "Oral / Viva"
  max?: number | null;          // maximum marks (null when the source omits it)
  min?: number | null;          // pass minimum (null when the source omits it)
  duration_hours?: number | null;
  sub?: { name: string; max?: number | null }[]; // e.g. IA → Continuous + Sessional
}

export interface BosExamQuestionSection {
  name: string;                 // "MCQ/Objective", "Long Answers (2 of 3)", ...
  marks?: number | null;
}

export interface BosExamQuestionPattern {
  variant?: string;             // "75" | "50" | "35" (PCI paper variant)
  duration_hours?: number | null;
  sections?: BosExamQuestionSection[];
  total_marks?: number | null;
}

export interface BosExamScheme {
  components?: BosExamSchemeComponent[];
  total_marks?: number | null;
  pass_pct?: number | null;
  distinction_pct?: number | null;
  question_pattern?: BosExamQuestionPattern;   // PCI theory blueprint (B.Pharm)
  notes?: string;
}

// ── Internship / Residency postings (Pharm.D 6th year, AHS internships) ──
export interface BosInternshipPosting {
  area: string;                 // "General Medicine", "Specialty department"
  duration?: string;            // "6 months", "2 months"
  repeat?: number;              // e.g. 3 (× three specialty departments)
  skills?: string[];            // optional in-service skill checklist
}

export interface BosInternshipPostings {
  total_duration?: string;      // "12 months"
  postings?: BosInternshipPosting[];
  notes?: string;
}

// ── AHS / Pharm.D content tree (year → subject → flat lecture topics) ──
// Deliberately distinct from BosCourseContentData (Unit I–V) so neither
// renderer has to guess which shape it is looking at.
export interface BosAhsSubject {
  subject_no?: string;          // "1.1", "2.5" (source numbering; no course code)
  title: string;                // "Human Anatomy and Physiology"
  lecture_hours?: number | null;
  mode?: 'flat' | 'units';
  topics?: string[];            // flat "LECTURE WISE PROGRAM" topic list
  units?: { unit_no: string; topics: string[] }[];
  reference_books?: string[];
}

export interface BosAhsContent {
  intro?: string;               // "INTRODUCTION/OBJECTIVES" paragraph
  academic_year?: number;       // 1..5 (Pharm.D)
  subjects?: BosAhsSubject[];
}

// ── Nursing (INC / TNMGRMU) content shapes ───────────────────────────
// Distinct from the Anna CO-PO/Bloom model. A nursing course carries a
// Theory / Lab-Skill-Lab / Clinical workload split, a per-unit theory outline
// (the extra optional fields on BosUnit below), a PARALLEL clinical outline,
// and CO → 10 INC core-competency mapping instead of CO-PO-PSO.

/** Theory / Lab-Skill-Lab / Clinical credits + contact hours (+ clinical weeks). */
export interface BosNursingWorkloadPart {
  credits?: number | null;
  hours?: number | null;        // contact hours (per semester, may exceed 40)
  weeks?: number | null;        // clinical only — placement duration in weeks
}
export interface BosNursingWorkload {
  theory?: BosNursingWorkloadPart;
  practical?: BosNursingWorkloadPart;   // Lab / Skill-Lab
  clinical?: BosNursingWorkloadPart;
}

/** One row of the parallel clinical outline table. */
export interface BosClinicalOutlineUnit {
  clinical_unit?: string;              // "1", "2" (or a heading)
  duration_weeks?: number | null;
  learning_outcomes?: string[];
  procedural_competencies?: string[];  // Procedural Competencies / Clinical Skills
  clinical_requirements?: string[];
  assessment_methods?: string[];
}
/** One skill-lab / practicum competency (pre-clinical simulation training). */
export interface BosPracticumSkill {
  sno?: string;
  competency: string;
  mode?: string;              // "Role Play", "Simulator/Standardized patient", …
}
export interface BosClinicalOutlineData {
  units?: BosClinicalOutlineUnit[];
  /** Skill-lab practicum competencies (the practical/skill-lab hours). */
  practicum_skills?: BosPracticumSkill[];
  notes?: string;
}

/** CO → 10 INC core-competency mapping (replaces po_mappings for nursing). */
export interface BosCoreCompetency {
  id: number;                          // 1..10
  label: string;                       // "Patient centered care", …
}
export interface BosCompetencyMapping {
  co_id: string;                       // "C1", "CO1"
  competencies: number[];              // core-competency ids this CO maps to
}
export interface BosCompetencyMappingsData {
  core_competencies?: BosCoreCompetency[];
  mappings?: BosCompetencyMapping[];
}

export interface BosCourseSyllabus {
  id: string;
  institutions_id: string;
  board_id: string;
  regulation_id?: string;
  composition_id?: string;
  /**
   * Discriminator for the syllabus shape. Defaults to 'anna_univ' so every
   * pre-existing engineering/CAS row is unaffected. Persisted on the row at
   * creation (resolved from the selected BoS board) — never re-derived on read.
   */
  academic_model?: AcademicModel;
  /** B.Pharm 1..8 (semester model). Null for year-based models. */
  semester?: number;
  /** Pharm.D 1..5 (year model). Null for semester-based models. */
  academic_year?: number;
  /** B.Pharm "Scope" paragraph (a course-level scope statement). */
  scope?: string;
  /** PCI / Dr. MGR exam scheme — replaces CO-PO/Bloom assessment for pharmacy. */
  exam_scheme?: BosExamScheme;
  /** Pharm.D internship/residency postings (6th year). */
  internship_postings?: BosInternshipPostings;
  /** Pharm.D year → subject → lecture-topic tree (mgr_pharmd / mgr_ahs). */
  ahs_content?: BosAhsContent;
  // ── Nursing (inc_nursing) ───────────────────────────────────────────
  /** Nursing DESCRIPTION paragraph. */
  course_description?: string;
  /** Nursing Theory / Lab / Clinical credits+hours (+clinical weeks). */
  nursing_workload?: BosNursingWorkload;
  /** Nursing parallel clinical outline (coexists with course_content). */
  clinical_outline?: BosClinicalOutlineData;
  /** Nursing CO → 10 INC core-competency mapping (replaces po_mappings). */
  competency_mappings?: BosCompetencyMappingsData;
  /**
   * Stable COE course id (BosCourseMaster.id) — the canonical link to the COE
   * course. course_code/course_name below are fallback display snapshots that
   * COE may rename; prefer resolving the live values from COE by course_id.
   */
  course_id?: string;
  course_code: string;
  course_name: string;
  course_credits?: number;
  total_hours?: number;
  contact_hours?: number;

  // NAAC-2024 coverage tags
  /** NAAC metric 1.4 — skill/apprenticeship-focused course */
  is_skill_based?: boolean;
  /** NAAC metric 1.6 — contains Indian Knowledge System content */
  is_iks?: boolean;

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
  assessment_structure?: BosAssessmentStructure;
  concept_applications?: BosConceptApplicationsData;
  assessment_pattern?: BosAssessmentPatternData;
  capstone_project?: BosCapstoneProjectData;
  capstone_rubric?: BosCapstoneRubricData;
  llc_conference?: BosLlcConferenceData;

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
  // COE board id (nullable, no FK). NULL = regulation-wide default that applies to
  // any board lacking its own override; a non-null value scopes the framework to a
  // specific board. Resolution is board-first then NULL fallback.
  board_id?: string | null;
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
  /** Primary board (= board_ids[0]). Kept for back-compat; meetings/PDF use it. */
  board_id: string;
  /** All boards governed by this composition (multi-board). board_id is the primary. */
  board_ids?: string[];
  /** Enriched board list on GET responses — names per board in board_ids. */
  boards?: { id: string; board_code: string; board_name: string; board_type?: string | null }[];
  /**
   * Academic level of the board (e.g. 'PG', 'UG'), denormalized from COE
   * /api/public/boards.board_type at composition-create time. Used to render
   * "Meeting of the {board_type} {board_name} Board of Studies" on call letters.
   * Nullable for legacy rows created before 20260521_add_board_type_to_bos_compositions_meetings.
   */
  board_type?: string | null;
  composition_title: string;
  /**
   * True when this composition represents the institution-level Academic
   * Council rather than a subject-level Board of Studies. AC bodies have no
   * board_id and their members are the BoS chairmen (auto-snapshotted at create
   * time) plus principal-added members. See 20260706b_bos_academic_council.sql.
   */
  is_academic_council?: boolean;
  /**
   * True when this composition represents the institution-level Governing Body.
   * Modelled identically to is_academic_council (board-less, principal-driven);
   * distinguished only for listing, preparation, and labels.
   * See 20260724120000_bos_governing_body.sql.
   */
  is_governing_body?: boolean;
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
  'id' | 'created_at' | 'updated_at' | 'created_by' | 'board' | 'boards' | 'members' | 'member_count'
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
// Per-composition committees (Curriculum Development Cell, Exam Committee, …). A
// composition's members are grouped by committee via bos_members.committee_id.
// Managed inline on the composition detail page (20260706 re-parented these from
// institution-owned to composition-owned).

export interface BosCommittee {
  id: string;
  /** Owning composition. Each composition has its own committee set. */
  composition_id?: string | null;
  /** Denormalised RLS anchor (role_has_institution_access gates on it). */
  institutions_id: string;
  name: string;
  short_code?: string | null;
  /** Display order within the composition (committees list + member grouping). */
  sort_order: number;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Enriched on the paginated master-list GET only: the owning composition's
   * title (null for unassigned template rows). Lets the /bos/committees "All"
   * view distinguish otherwise-identical committee instances across
   * compositions. Not a stored column.
   */
  composition_title?: string | null;
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
  /**
   * The SELECTED member type. For catalog-driven rows this is the
   * bos_member_types.name verbatim (e.g. 'Nominated by the Governing Body');
   * legacy rows (member_type_id NULL) carry the old BosMemberType enum value.
   * Behaviour (chairman auth, staff-vs-expert, TA/DA) derives from the
   * catalog row's base_type via member_type_id — NOT from this string.
   * The static DB CHECK was dropped by 20260710150000.
   */
  member_type: string;
  /**
   * FK to bos_member_types (institution-wise, table-driven). NULL on rows
   * created before the table existed and not backfilled.
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
  /**
   * Display rank across the WHOLE composition (1..n, contiguous). Meeting
   * notices, minutes and attendance sheets ORDER BY this.
   */
  sort_order: number;
  /**
   * Serial number WITHIN this member's type group in its committee — restarts
   * at 1 per group (Faculty Members 1,2,3,4; Chairman 1). This is the number
   * the roster card shows and the per-category S.No a report prints.
   *
   * Both ranks are maintained server-side by the `bos_renumber_member_order`
   * DB function, which the member API calls after every insert/update/delete/
   * reorder. Never write either column directly from a client.
   */
  group_position?: number;
  is_active: boolean;
  joined_date?: string;
  left_date?: string;
  created_at: string;
  updated_at: string;
  // Joined
  expert?: BosExternalExpert;
  /**
   * Joined from bos_member_types via member_type_id. Display consumers show
   * this name (the type the user actually selected in Add Member) and fall
   * back to BOS_MEMBER_TYPE_LABELS[member_type] for legacy rows. NULL when
   * member_type_id is null or the reader's RLS can't see bos_member_types.
   */
  member_type_rec?: { id: string; name: string; base_type: BosMemberType } | null;
}

export type CreateBosMemberDto = Omit<
  BosMember,
  'id' | 'created_at' | 'updated_at' | 'expert' | 'member_type_rec' | 'sort_order'
> & {
  /**
   * Display rank within the composition. Omit it — POST /api/bos/members
   * appends the new member at the end (existing count + 1). Sending 0 would
   * pin every new member to the top of the roster, which is how the whole
   * table ended up unordered before the Reorder controls existed.
   */
  sort_order?: number;
};
export type UpdateBosMemberDto = Partial<CreateBosMemberDto>;

/**
 * Result of POST /api/bos/members/refresh — the manual "pull latest details
 * from staff / external-expert record" action on a composition's roster.
 *
 * The display_* columns are point-in-time snapshots on purpose (past meeting
 * notices and minutes must keep the designation the member held then), so this
 * only ever runs when an operator presses Refresh.
 */
export interface BosMemberRefreshResult {
  /** Rows whose snapshot differed from the source and were rewritten. */
  updated: number;
  /** Rows already matching their source row. */
  unchanged: number;
  /** Rows with no source link, or whose staff/expert record no longer exists. */
  skipped: number;
  /** Rows the writer was not permitted to update (RLS returned no rows). */
  failed: number;
  /** Field-level diff of everything that changed, for the summary toast. */
  changes: {
    id: string;
    display_name: string | null;
    fields: { field: string; from: string | null; to: string | null }[];
  }[];
}

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
  /**
   * Academic Council meetings only: the board the picked course belongs to.
   * Drives the cascading Board → Course pickers in the Minutes tab; regular
   * BoS meetings never set it (their courses are already board-scoped).
   * board_name is a display snapshot for exports.
   */
  board_id?: string | null;
  board_name?: string | null;
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
  /**
   * Regulation the meeting's syllabi are scoped to. Optional: there is no
   * regulation_id column on bos_meetings today, so this is undefined at runtime
   * for every meeting. The Syllabus and Minutes tabs read it to narrow the
   * syllabus picker and both guard against undefined (the filter is simply not
   * applied when it's absent). Kept on the interface so those reads type-check
   * and so the field is already correct if a regulation_id column is later
   * added to bos_meetings (the detail GET selects `*`).
   */
  regulation_id?: string | null;
  composition_id: string;
  meeting_number: number;
  academic_year: string;
  meeting_title?: string;
  meeting_type: BosMeetingType;
  /**
   * Convening council/committee of the composition (bos_committees). Each
   * council/committee carries its own TA/DA remuneration rates, and the
   * meeting's member list is drawn from this committee's members
   * (bos_members.committee_id). BoS meetings pick it in the scheduling form;
   * AC meetings auto-attach to the AC body's default 'Academic Council'
   * committee. NULL only for pre-committee legacy rows the 20260710 backfills
   * couldn't attribute unambiguously.
   */
  committee_id?: string | null;
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
  /** Embedded convening committee (via committee_id FK) — list/detail GETs. */
  committee?: { id: string; name: string } | null;
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
  | 'committee'
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
  /**
   * Offline (in person) or online. Optional on the interface because rows
   * written before 20260805120000 are read back with the column's 'offline'
   * default — treat undefined as 'offline'.
   */
  attendance_mode?: BosAttendanceMode;
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

// ── TA/DA Rate Settings ───────────────────────────────────────────────────────

/**
 * How a member type's travel allowance is computed (20260805120000):
 *   • distance — round-trip km × ta_per_km (the University Nominee's
 *     "as per the distance"; the only basis that existed before this).
 *   • flat     — travel_flat_amount regardless of distance (the external
 *     Academic/Industry members' fixed ₹1,500).
 *   • none     — sitting charge only, no travel component.
 * Online attendance pays zero under every basis.
 */
export type BosTaDaTravelBasis = 'distance' | 'flat' | 'none';

export const BOS_TA_DA_TRAVEL_BASIS_LABELS: Record<BosTaDaTravelBasis, string> = {
  distance: 'As per distance',
  flat: 'Flat amount',
  none: 'No travel',
};

/**
 * Configurable per-council / per-member-type claim rates (bos_ta_da_rates,
 * 20260710130000). Keyed by committee NAME (a council kind — every
 * composition's 'Curriculum Development Cell' shares one rate set) and the
 * member-type NAME from the institution's bos_member_types catalog (e.g.
 * 'Subject Expert', 'Controller of the Examinations'). Claim generation
 * resolves a member's catalog name via bos_members.member_type_id, falling
 * back to the coarse enum label for unlinked members; a type with no active
 * row uses the flat SOP constants in lib/utils/bos/ta-da-rates.ts.
 */
export interface BosTaDaRate {
  id: string;
  institutions_id: string;
  committee_name: string;
  member_type: string;
  /** Sitting charge when the member attends offline (in person). */
  honorarium_amount: number;
  /** Sitting charge when the member attends online. NULL = same as offline. */
  honorarium_amount_online?: number | null;
  /** Per-km rate — used only under the 'distance' travel basis. */
  ta_per_km: number;
  /**
   * How travel is computed for this member type (20260805120000). Optional on
   * the interface for reads of rows written before the migration; absent means
   * 'distance', the only basis that previously existed.
   */
  travel_basis?: BosTaDaTravelBasis | null;
  /** Fixed travel allowance under the 'flat' basis; ignored otherwise. */
  travel_flat_amount?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  /**
   * Embedded parent meeting (aliased, claims GET) — carries the convening
   * council so the printed claim form can say "Claim Form for <council> of"
   * / "Position in <council>". committee is null for pre-committee legacy
   * meetings; meeting_type distinguishes Academic Council ones.
   */
  meeting?: {
    id: string;
    meeting_type?: string | null;
    committee?: { name: string } | null;
  } | null;
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
