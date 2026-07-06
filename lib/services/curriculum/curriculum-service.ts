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
}
