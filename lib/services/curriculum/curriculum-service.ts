// lib/services/curriculum/curriculum-service.ts
// Curriculum-aware class poll — Phase 1 client wrappers over the curriculum RPCs.
// The class poll knows the COURSE (from the attendance blob) but not the TOPIC taught.
// These RPCs let a teacher name today's topic (a lightweight published lesson) and link
// it to the (timetable,date,period) class, so the poll can ask about the real lesson.
//   · fn_curriculum_class_poll_seed  — the poll-wire seam (topic + Q1/Q2 prompts)
//   · fn_curriculum_lesson_upsert    — create/edit a lesson (typed topic = the minimal case)
//   · fn_curriculum_link_lesson      — link/re-link a class session to a lesson (#29/#30)
//   · fn_curriculum_my_topics_for_course — the teacher's own past topics (#32 remembered)
//   · fn_curriculum_lessons_for_course   — the shared per-course spine (+ per-teacher next #36)
//   · fn_bos_clos_for_course         — the BoS CLO connector (the ~13% path)
//   · fn_curriculum_topic_for_learner    — the learner "today's topic" surface (#35)
// See 20260731040000_curriculum_aware_class_poll_phase1.sql. Nothing here touches the
// live poll write path — curriculum questions are just extra entries the poll builder
// seeds when a published topic is linked.
import { createClientSupabaseClient } from '@/lib/supabase/client';

const getSupabase = (): any => createClientSupabaseClient();

export type FinkDimension =
  | 'foundational' | 'application' | 'integration' | 'human' | 'caring' | 'learning_to_learn';

/** The class grain — same key the class poll uses. */
export interface ClassKey { attendanceDate: string; timetableId: string; periodId: string }

/** What the poll builder needs to go curriculum-aware for a class. */
export interface CurriculumSeed {
  has_topic: boolean;
  course_id: string | null;
  lesson_id?: string;
  lesson_title?: string;
  primary_fink_dimension?: FinkDimension;
  co_refs?: string[];
  q1_prompt?: string;
  q2_prompt?: string;
  q2_min_label?: string;
  q2_max_label?: string;
}

export interface MyTopic {
  id: string; title: string; primary_fink_dimension: FinkDimension | null; created_at: string;
}

export interface BosClo { clo_number: number; description: string; k_values: string[] }

/** One outcome statement on a lesson (Fink/Bloom/co_ref tagged). */
export interface LessonOutcome {
  text: string;
  fink_dimension?: FinkDimension | string;
  bloom_level?: string;   // K1..K6
  co_ref?: string;        // CLO number this outcome maps to
  ltl_phase?: string;
}

/** A Phase-2 AI draft artefact (lesson / brief) awaiting faculty review. */
export interface DraftArtifact {
  id: string;
  artifact_kind: 'lesson' | 'concept_brief' | 'capstone_brief';
  title: string;
  unit_label: string | null;
  sequence_no: number | null;
  learning_outcomes: LessonOutcome[];
  primary_fink_dimension: FinkDimension | null;
  // BoS-fixed taxonomy this lesson's PRIMARY tag follows. 'blooms' → primary_bloom_level is
  // the lesson's primary axis; 'finks' (or null = legacy) → primary_fink_dimension is.
  primary_taxonomy: 'finks' | 'blooms' | 'jkkn_advanced' | null;
  primary_bloom_level: string | null;   // K1..K6, when primary_taxonomy = 'blooms'
  co_refs: string[];
  source: 'bos_ai' | 'title_ai';
  bos_syllabus_id: string | null;
  created_at: string;
}

/** A course that has AI draft lessons pending faculty approval (review inbox). */
export interface CourseWithPendingDrafts {
  course_id: string;
  course_code: string;
  course_name: string;
  institution_id: string;
  draft_count: number;
}

export const BLOOM_OPTIONS: { value: string; label: string }[] = [
  { value: 'K1', label: 'K1 · Remember' },
  { value: 'K2', label: 'K2 · Understand' },
  { value: 'K3', label: 'K3 · Apply' },
  { value: 'K4', label: 'K4 · Analyze' },
  { value: 'K5', label: 'K5 · Evaluate' },
  { value: 'K6', label: 'K6 · Create' },
];

export const FINK_OPTIONS: { value: FinkDimension; label: string }[] = [
  { value: 'foundational', label: 'Understand (foundational)' },
  { value: 'application', label: 'Apply' },
  { value: 'integration', label: 'Connect (integration)' },
  { value: 'human', label: 'Confidence (human)' },
  { value: 'caring', label: 'Motivation (caring)' },
  { value: 'learning_to_learn', label: 'Learn how to learn' },
];

export function finkLabel(dim?: string | null): string {
  return FINK_OPTIONS.find((f) => f.value === dim)?.label ?? 'Understand (foundational)';
}

/** JABT's added elements ("C + three bands", 2026-08-21). These appear in
 *  `primary_bloom_level` on converted rows (re-derived from the preserved
 *  `primary_fink_dimension` originals: human→HD, caring→AF3, learning_to_learn→L2L).
 *  They are display vocabulary only — the edit picker stays K1-K6 because the
 *  added half enters via the Fink picker, by design. */
export const JABT_ADDED_LABELS: Record<string, string> = {
  AF1: 'AF1 · Receiving',
  AF2: 'AF2 · Responding',
  AF3: 'AF3 · Valuing',
  AF4: 'AF4 · Organising',
  AF5: 'AF5 · Characterising',
  'PS-a': 'PS-a · Guided Performance',
  'PS-b': 'PS-b · Independent Performance',
  'PS-c': 'PS-c · Adaptive Performance',
  HD: 'HD · Human Dimension',
  L2L: 'L2L · Learning How to Learn',
  AIU: 'AIU · Accountable AI Use',
};

export function bloomLabel(level?: string | null): string {
  return (
    BLOOM_OPTIONS.find((b) => b.value === level)?.label ??
    (level ? JABT_ADDED_LABELS[level] : undefined) ??
    'Pick a Bloom level'
  );
}

/** A lesson is Bloom-primary when its BoS-fixed taxonomy is 'blooms' OR 'jkkn_advanced';
 *  NULL (legacy) and 'finks' read as Fink-primary. Central so the UI and service agree.
 *
 *  'jkkn_advanced' belongs on the Bloom side because JABT keeps its primary tag in
 *  `primary_bloom_level` (K1-K6 for the cognitive half, A1-A5 for the added half) —
 *  `primary_fink_dimension` is retained on converted rows only as the record of the
 *  original label, never as the value to display. Omitting it here silently showed the
 *  OLD Fink label for all 15,150 rows converted on 2026-08-16. */
export function isBloomPrimary(taxonomy?: string | null): boolean {
  return taxonomy === 'blooms' || taxonomy === 'jkkn_advanced';
}

export class CurriculumService {
  /** The poll-wire seam: returns the linked published topic + Q1/Q2 prompts, or has_topic=false. */
  static async pollSeed(k: ClassKey): Promise<CurriculumSeed> {
    const { data, error } = await getSupabase().rpc('fn_curriculum_class_poll_seed', {
      p_timetable_id: k.timetableId, p_attendance_date: k.attendanceDate, p_period_id: k.periodId,
    });
    if (error) throw error;
    return (data as CurriculumSeed) ?? { has_topic: false, course_id: null };
  }

  /** The teacher's own past typed topics for this course (reuse pick-list, #32). */
  static async myTopics(courseId: string): Promise<MyTopic[]> {
    const { data, error } = await getSupabase().rpc('fn_curriculum_my_topics_for_course', { p_course_id: courseId });
    if (error) throw error;
    return (data as MyTopic[]) ?? [];
  }

  /** Create (or edit) a lesson. A typed one-line topic is the minimal case — published on create (#31). */
  static async typeTopic(courseId: string, title: string, fink?: FinkDimension): Promise<string> {
    const { data, error } = await getSupabase().rpc('fn_curriculum_lesson_upsert', {
      p_lesson_id: null, p_course_id: courseId, p_title: title,
      p_primary_fink: fink ?? 'foundational',
    });
    if (error) throw error;
    return data as string;
  }

  /** Link (or re-link, #29) a class session to a lesson. Votes follow the corrected topic (#30). */
  static async linkLesson(k: ClassKey, lessonId: string): Promise<string> {
    const { data, error } = await getSupabase().rpc('fn_curriculum_link_lesson', {
      p_timetable_id: k.timetableId, p_attendance_date: k.attendanceDate, p_period_id: k.periodId, p_lesson_id: lessonId,
    });
    if (error) throw error;
    return data as string;
  }

  /** The shared per-course spine (published + own drafts) with the caller's suggest-next (#36). */
  static async lessonsForCourse(courseId: string): Promise<{
    course_id: string; suggested_next_lesson_id: string | null;
    lessons: { id: string; title: string; unit_label: string | null; sequence_no: number | null;
               primary_fink_dimension: FinkDimension | null; status: string; source: string; co_refs: string[] }[];
  } | null> {
    const { data, error } = await getSupabase().rpc('fn_curriculum_lessons_for_course', { p_course_id: courseId });
    if (error) throw error;
    return data ?? null;
  }

  /** The BoS CLOs for a course (by course_code), or [] for the ~87% with no syllabus. */
  static async bosClos(courseId: string): Promise<BosClo[]> {
    const { data, error } = await getSupabase().rpc('fn_bos_clos_for_course', { p_course_id: courseId });
    if (error) throw error;
    return (data as BosClo[]) ?? [];
  }

  /** The learner "today's topic" surface — published topics for the classes they attend today (#35). */
  static async topicForLearner(): Promise<{
    lesson_id: string; title: string; primary_fink_dimension: FinkDimension | null;
    sessions: { period_id: string; attendance_date: string }[];
  }[]> {
    const { data, error } = await getSupabase().rpc('fn_curriculum_topic_for_learner');
    if (error) throw error;
    return (data as any[]) ?? [];
  }

  // ── Phase 2: AI lesson-spine review + approve (drafts-gated) ────────────────

  /** Courses that have AI draft lessons pending this reviewer's approval (#Phase2). */
  static async coursesWithPendingDrafts(): Promise<CourseWithPendingDrafts[]> {
    const { data, error } = await getSupabase().rpc('fn_curriculum_courses_with_pending_ai_drafts');
    if (error) throw error;
    return ((data as any[]) ?? []).map((r) => ({
      course_id: r.course_id,
      course_code: r.course_code,
      course_name: r.course_name,
      institution_id: r.institution_id,
      draft_count: Number(r.draft_count ?? 0),
    }));
  }

  /** The AI draft spine (lessons + briefs) for one course, awaiting review. */
  static async draftsForCourse(courseId: string): Promise<DraftArtifact[]> {
    const { data, error } = await getSupabase().rpc('fn_curriculum_lesson_drafts_for_course', {
      p_course_id: courseId,
    });
    if (error) throw error;
    return (data as DraftArtifact[]) ?? [];
  }

  /**
   * Approve an AI draft lesson (draft → published). Optional edits let the faculty
   * re-word the title / re-tag outcomes (Fink/Bloom/co_ref) before publishing.
   * This is the faculty-AUTHORITY action — AI drafts, faculty ratifies.
   */
  static async approveDraft(
    lessonId: string,
    edits?: {
      title?: string;
      unitLabel?: string;
      sequenceNo?: number;
      learningOutcomes?: LessonOutcome[];
      primaryFink?: FinkDimension;
      primaryBloom?: string;
      primaryTaxonomy?: 'finks' | 'blooms' | 'jkkn_advanced';
      coRefs?: string[];
    },
  ): Promise<string> {
    const { data, error } = await getSupabase().rpc('fn_curriculum_lesson_ai_approve', {
      p_lesson_id: lessonId,
      p_title: edits?.title ?? null,
      p_unit_label: edits?.unitLabel ?? null,
      p_sequence_no: edits?.sequenceNo ?? null,
      p_learning_outcomes: edits?.learningOutcomes ?? null,
      p_primary_fink: edits?.primaryFink ?? null,
      p_primary_bloom_level: edits?.primaryBloom ?? null,
      p_primary_taxonomy: edits?.primaryTaxonomy ?? null,
      p_co_refs: edits?.coRefs ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  /** Reject an AI draft lesson (draft → archived). Never reaches students. */
  static async rejectDraft(lessonId: string): Promise<void> {
    const { error } = await getSupabase().rpc('fn_curriculum_lesson_ai_reject', {
      p_lesson_id: lessonId,
    });
    if (error) throw error;
  }
}
