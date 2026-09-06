// lib/services/foundation/foundation-service.ts
// Foundation & Competitive-Exam Programme — client-side service.
//
// School-grade foundation + govt/competitive-exam coaching built on the fp_*
// substrate (exam_definitions / fp_cohorts / fp_students / fp_items /
// fp_assessments / fp_attempts / fp_responses / fp_student_weakness /
// fp_revision_plans). Mirrors the InductionService / SessionFeedbackService
// pattern: static methods over the browser (RLS-scoped) supabase client, all
// privileged scoring/plan writes flow through the SECURITY DEFINER RPCs
// (anon-revoked, auth + fn_fp_* helper gated internally).
//
// RPCs used: fn_fp_record_attempt, fn_fp_recompute_weakness,
// fn_fp_generate_revision_plan, fn_fp_student_progress.
//
// Table reads/writes for cohorts, rosters, item authoring and assessment
// building go through the browser anon client and are governed by the fp_*
// RLS policies (faculty scope by cohort/school; guardians by relationship).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const LOG = 'foundation/service';
const getSupabase = (): any => createClientSupabaseClient();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExamLevel = 'school' | 'college';
export type AssessmentKind = 'diagnostic' | 'practice' | 'mock';

export interface ExamDefinition {
  id: string;
  config_key: string;
  display_name: string;
  exam_family: string | null;
  level: ExamLevel;
  cdc_training_type_id: string | null;
  is_active: boolean;
  sort_order: number | null;
}

export interface SyllabusTopic {
  id: string;
  config_key: string;
  display_name: string;
  is_shared: boolean;
  is_active: boolean;
  sort_order: number | null;
}

export interface FoundationCohort {
  id: string;
  school_id: string | null;
  exam_definition_id: string;
  institution_id: string | null;
  term: string | null;
  resource_person_id: string | null;
  is_active: boolean;
  created_at?: string;
  // Embedded
  exam_definition?: Pick<
    ExamDefinition,
    'id' | 'display_name' | 'exam_family' | 'level'
  > | null;
  resource_person?: { id: string; full_name: string | null } | null;
  enrolled_count?: number;
}

export interface FoundationStudent {
  id: string;
  school_id: string | null;
  institution_id: string | null;
  profile_id: string | null;
  parent_profile_id: string | null;
  learner_profile_id: string | null;
  full_name: string | null;
  grade: string | null;
  parental_consent_at: string | null;
  status: string | null;
}

export interface RosterEntry {
  enrollment_id: string;
  status: string | null;
  enrolled_at: string | null;
  student: FoundationStudent | null;
}

export interface FoundationEnrollment {
  id: string;
  student_id: string;
  cohort_id: string;
  status: string | null;
  enrolled_at: string | null;
}

/**
 * Creating a learner on the programme.
 *
 * `profile_id` and `learner_profile_id` are BOTH optional and are NOT
 * interchangeable: `profile_id` is a `profiles.id` (a platform login),
 * `learner_profile_id` is a `learners_profiles.id` (an enrolled learner
 * record). Foundation deliberately admits a child who has neither — see the
 * note above the roster-write methods.
 */
export interface CreateStudentInput {
  full_name: string;
  school_id?: string | null;
  institution_id?: string | null;
  profile_id?: string | null;
  parent_profile_id?: string | null;
  learner_profile_id?: string | null;
  grade?: string | null;
  parental_consent_at?: string | null;
  status?: string | null;
}

export interface AddLearnerToCohortInput extends CreateStudentInput {
  cohort_id: string;
}

export interface FoundationItem {
  id: string;
  exam_definition_id: string;
  topic_id: string | null;
  difficulty: number | null;
  q_type: string | null;
  stem: string;
  options: any;
  answer: any;
  explanation: string | null;
  source: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface FoundationAssessment {
  id: string;
  exam_definition_id: string;
  cohort_id: string | null;
  title: string;
  kind: AssessmentKind;
  config: any;
  is_active: boolean;
  created_at?: string;
  item_count?: number;
}

export interface WeaknessRow {
  id: string;
  student_id: string;
  exam_definition_id: string;
  topic_id: string | null;
  mastery_score: number | null;
  attempts_count: number | null;
  topic?: Pick<SyllabusTopic, 'id' | 'display_name' | 'config_key'> | null;
}

export interface RevisionPlan {
  id: string;
  student_id: string;
  exam_definition_id: string;
  generated_at: string | null;
  plan: any;
  status: string | null;
}

/** Shape returned by fn_fp_student_progress (defensive — treat as partial). */
export interface StudentProgress {
  attempts?: number;
  assessments_taken?: number;
  avg_score?: number | null;
  last_attempt_at?: string | null;
  topics_tracked?: number;
  topics_weak?: number;
  mastery_avg?: number | null;
  [key: string]: any;
}

export interface CreateItemInput {
  exam_definition_id: string;
  topic_id: string | null;
  difficulty: number;
  q_type: string;
  stem: string;
  options: any;
  answer: any;
  explanation?: string | null;
  source?: string | null;
}

export interface CreateAssessmentInput {
  exam_definition_id: string;
  cohort_id: string | null;
  title: string;
  kind: AssessmentKind;
  config?: any;
  item_ids?: string[];
}

export interface RecordAttemptResponse {
  item_id: string;
  chosen: any;
  time_ms?: number;
}

/**
 * A raised concern about one question. `open` suppresses the question from
 * mastery scoring (fn_fp_recompute_weakness skips it); `dismissed` and `fixed`
 * both restore it on the next recompute. Nothing is ever deleted — the row is
 * the record that the question was looked at.
 */
export type ItemFlagStatus = 'open' | 'dismissed' | 'fixed';
/** The two ways a reviewer may close a report. */
export type ItemFlagResolution = Exclude<ItemFlagStatus, 'open'>;

export interface ItemFlag {
  id: string;
  item_id: string;
  flagged_by: string | null;
  reason: string | null;
  status: ItemFlagStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at?: string;
  updated_at?: string;
  item?: Pick<
    FoundationItem,
    'id' | 'exam_definition_id' | 'topic_id' | 'difficulty' | 'stem' | 'is_active'
  > | null;
}

export interface ListItemFlagsFilters {
  status?: ItemFlagStatus;
  examDefinitionId?: string;
  itemId?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class FoundationService {
  // =========================================================================
  // Reference data
  // =========================================================================

  static async listExamDefinitions(
    level?: ExamLevel,
  ): Promise<ExamDefinition[]> {
    let query = getSupabase()
      .from('exam_definitions')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('display_name', { ascending: true });

    if (level) query = query.eq('level', level);

    const { data, error } = await query;
    if (error) {
      logger.error(LOG, 'listExamDefinitions failed', error);
      throw error;
    }
    return (data ?? []) as ExamDefinition[];
  }

  static async listTopics(): Promise<SyllabusTopic[]> {
    const { data, error } = await getSupabase()
      .from('cdc_exam_syllabus_topics')
      .select('id, config_key, display_name, is_shared, is_active, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('display_name', { ascending: true });

    if (error) {
      logger.error(LOG, 'listTopics failed', error);
      throw error;
    }
    return (data ?? []) as SyllabusTopic[];
  }

  // =========================================================================
  // Cohorts + roster
  // =========================================================================

  static async listCohorts(): Promise<FoundationCohort[]> {
    // NOTE: fp_cohorts has three FKs to profiles (resource_person_id,
    // created_by, updated_by) — the resource-person embed MUST name the
    // constraint to disambiguate, else PostgREST 300s.
    const { data, error } = await getSupabase()
      .from('fp_cohorts')
      .select(
        `id, school_id, exam_definition_id, institution_id, term,
         resource_person_id, is_active, created_at,
         exam_definition:exam_definitions!fp_cohorts_exam_definition_id_fkey(id, display_name, exam_family, level),
         resource_person:profiles!fp_cohorts_resource_person_id_fkey(id, full_name),
         fp_enrollments(count)`,
      )
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error(LOG, 'listCohorts failed', error);
      throw error;
    }
    return (data ?? []).map((row: any) => ({
      ...row,
      enrolled_count: Array.isArray(row.fp_enrollments)
        ? row.fp_enrollments[0]?.count ?? 0
        : 0,
    })) as FoundationCohort[];
  }

  static async getRoster(cohortId: string): Promise<RosterEntry[]> {
    const { data, error } = await getSupabase()
      .from('fp_enrollments')
      .select(
        `id, status, enrolled_at,
         student:fp_students!fp_enrollments_student_id_fkey(
           id, school_id, institution_id, profile_id, parent_profile_id,
           learner_profile_id, full_name, grade, parental_consent_at, status)`,
      )
      .eq('cohort_id', cohortId)
      .order('enrolled_at', { ascending: true });

    if (error) {
      logger.error(LOG, 'getRoster failed', error);
      throw error;
    }
    return (data ?? []).map((row: any) => ({
      enrollment_id: row.id,
      status: row.status,
      enrolled_at: row.enrolled_at,
      student: row.student ?? null,
    })) as RosterEntry[];
  }

  // =========================================================================
  // Roster writes — putting a learner on the programme
  //
  // Every layer under this already existed: the fp_students / fp_enrollments /
  // fp_cohorts tables, their RLS write policies (fp_students_insert,
  // fp_enrollments_write, fp_cohorts_write — each gated on
  // foundation.students.manage or foundation.cohorts.manage), the permission
  // keys themselves, and both screens that READ a roster. What did not exist
  // was any path that could CREATE one. Before this, every reference to these
  // three tables anywhere in the codebase was a read, so the only rows that had
  // ever reached production were three `[PILOT]` fixtures inserted by hand —
  // every one of them with a NULL identity.
  //
  // `profile_id` stays NULLABLE on purpose, and that is a design decision, not
  // an oversight: Foundation is aimed at school children who mostly hold no
  // account here, so a learner exists on the programme without a login and the
  // cohort's resource person runs the session for them. Linking a platform
  // identity is therefore OPTIONAL.
  //
  // The two identity columns are carried separately and are NOT
  // interchangeable — `profile_id` is a `profiles.id`, `learner_profile_id` is
  // a `learners_profiles.id`. Conflating those two id spaces has silently
  // broken features in this codebase before.
  // =========================================================================

  static async createStudent(
    input: CreateStudentInput,
  ): Promise<FoundationStudent> {
    const { data, error } = await getSupabase()
      .from('fp_students')
      .insert({
        full_name: input.full_name,
        school_id: input.school_id ?? null,
        institution_id: input.institution_id ?? null,
        profile_id: input.profile_id ?? null,
        parent_profile_id: input.parent_profile_id ?? null,
        learner_profile_id: input.learner_profile_id ?? null,
        grade: input.grade ?? null,
        parental_consent_at: input.parental_consent_at ?? null,
        status: input.status ?? 'active',
      })
      .select(
        `id, school_id, institution_id, profile_id, parent_profile_id,
         learner_profile_id, full_name, grade, parental_consent_at, status`,
      )
      .single();

    if (error) {
      logger.error(LOG, 'createStudent failed', error);
      throw error;
    }
    logger.dev(LOG, 'student created', { id: data?.id });
    return data as FoundationStudent;
  }

  static async enrollStudent(
    studentId: string,
    cohortId: string,
  ): Promise<FoundationEnrollment> {
    const { data, error } = await getSupabase()
      .from('fp_enrollments')
      .insert({
        student_id: studentId,
        cohort_id: cohortId,
        status: 'active',
        enrolled_at: new Date().toISOString(),
      })
      .select('id, student_id, cohort_id, status, enrolled_at')
      .single();

    if (error) {
      logger.error(LOG, 'enrollStudent failed', error);
      throw error;
    }
    return data as FoundationEnrollment;
  }

  /**
   * Create a learner AND put them in a cohort.
   *
   * There is no transaction available from the browser client, so if the
   * enrolment fails the just-created student would otherwise be left orphaned —
   * invisible on every roster and impossible to find again. We attempt to undo
   * it and, either way, the thrown error NAMES the student id so the row can be
   * recovered by hand rather than silently stranded.
   */
  static async addLearnerToCohort(
    input: AddLearnerToCohortInput,
  ): Promise<{ student: FoundationStudent; enrollment: FoundationEnrollment }> {
    const { cohort_id, ...learnerInput } = input;
    const learner = await FoundationService.createStudent(learnerInput);

    try {
      const enrollment = await FoundationService.enrollStudent(
        learner.id,
        cohort_id,
      );
      return { student: learner, enrollment };
    } catch (enrollError) {
      // Compensating delete. If it also fails the row survives with no
      // enrolment, which is harmless but invisible — so we say the id out loud.
      const { error: cleanupError } = await getSupabase()
        .from('fp_students')
        .delete()
        .eq('id', learner.id);

      if (cleanupError) {
        logger.error(LOG, 'addLearnerToCohort: cleanup failed too', {
          learnerId: learner.id,
          cleanupError,
        });
        throw new Error(
          `${learner.full_name ?? 'The learner'} was created (id ${learner.id}) ` +
            `but could not be enrolled, and could not be removed either. ` +
            `Enrol or delete that row by hand.`,
        );
      }
      throw enrollError;
    }
  }

  /**
   * Assign a cohort's resource person.
   *
   * A cohort whose `resource_person_id` is NULL is invisible to the whole
   * facilitation flow: /api/foundation/practice/facilitate scopes its query to
   * `resource_person_id = the caller`, so nobody can ever open it. The one
   * cohort in production was in exactly that state — active, with a school and
   * an exam, and unreachable by every screen built to run it.
   */
  static async setCohortResourcePerson(
    cohortId: string,
    resourcePersonId: string | null,
  ): Promise<FoundationCohort> {
    const { data, error } = await getSupabase()
      .from('fp_cohorts')
      .update({ resource_person_id: resourcePersonId })
      .eq('id', cohortId)
      .select()
      .single();

    if (error) {
      logger.error(LOG, 'setCohortResourcePerson failed', error);
      throw error;
    }
    logger.dev(LOG, 'cohort resource person set', {
      cohortId,
      resourcePersonId,
    });
    return data as FoundationCohort;
  }

  static async getStudent(studentId: string): Promise<FoundationStudent | null> {
    const { data, error } = await getSupabase()
      .from('fp_students')
      .select(
        `id, school_id, institution_id, profile_id, parent_profile_id,
         learner_profile_id, full_name, grade, parental_consent_at, status`,
      )
      .eq('id', studentId)
      .maybeSingle();

    if (error) {
      logger.error(LOG, 'getStudent failed', error);
      throw error;
    }
    return (data ?? null) as FoundationStudent | null;
  }

  /**
   * The distinct exam definitions a student is enrolled in (via their cohorts).
   * Drives the exam selector on the diagnostic view so a student is only ever
   * scored against exams they actually study.
   */
  static async getStudentExams(studentId: string): Promise<ExamDefinition[]> {
    const { data, error } = await getSupabase()
      .from('fp_enrollments')
      .select(
        `cohort:fp_cohorts!fp_enrollments_cohort_id_fkey(
           exam_definition:exam_definitions!fp_cohorts_exam_definition_id_fkey(
             id, config_key, display_name, exam_family, level,
             cdc_training_type_id, is_active, sort_order))`,
      )
      .eq('student_id', studentId);

    if (error) {
      logger.error(LOG, 'getStudentExams failed', error);
      throw error;
    }

    const byId = new Map<string, ExamDefinition>();
    for (const row of (data ?? []) as any[]) {
      const exam = row?.cohort?.exam_definition;
      if (exam?.id && !byId.has(exam.id)) byId.set(exam.id, exam);
    }
    return Array.from(byId.values());
  }

  // =========================================================================
  // Item authoring (question bank)
  // =========================================================================

  static async listItems(examDefinitionId: string): Promise<FoundationItem[]> {
    const { data, error } = await getSupabase()
      .from('fp_items')
      .select(
        `id, exam_definition_id, topic_id, difficulty, q_type, stem, options,
         answer, explanation, source, is_active, created_at`,
      )
      .eq('exam_definition_id', examDefinitionId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error(LOG, 'listItems failed', error);
      throw error;
    }
    return (data ?? []) as FoundationItem[];
  }

  static async createItem(input: CreateItemInput): Promise<FoundationItem> {
    const { data, error } = await getSupabase()
      .from('fp_items')
      .insert({
        exam_definition_id: input.exam_definition_id,
        topic_id: input.topic_id,
        difficulty: input.difficulty,
        q_type: input.q_type,
        stem: input.stem,
        options: input.options,
        answer: input.answer,
        explanation: input.explanation ?? null,
        source: input.source ?? null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      logger.error(LOG, 'createItem failed', error);
      throw error;
    }
    logger.dev(LOG, 'item authored', { id: data?.id });
    return data as FoundationItem;
  }

  // =========================================================================
  // Assessment building
  // =========================================================================

  static async listAssessments(
    cohortId: string,
  ): Promise<FoundationAssessment[]> {
    const { data, error } = await getSupabase()
      .from('fp_assessments')
      .select(
        `id, exam_definition_id, cohort_id, title, kind, config, is_active,
         created_at, fp_assessment_items(count)`,
      )
      .eq('cohort_id', cohortId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error(LOG, 'listAssessments failed', error);
      throw error;
    }
    return (data ?? []).map((row: any) => ({
      ...row,
      item_count: Array.isArray(row.fp_assessment_items)
        ? row.fp_assessment_items[0]?.count ?? 0
        : 0,
    })) as FoundationAssessment[];
  }

  static async createAssessment(
    input: CreateAssessmentInput,
  ): Promise<FoundationAssessment> {
    const supabase = getSupabase();
    const { data: assessment, error } = await supabase
      .from('fp_assessments')
      .insert({
        exam_definition_id: input.exam_definition_id,
        cohort_id: input.cohort_id,
        title: input.title,
        kind: input.kind,
        config: input.config ?? {},
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      logger.error(LOG, 'createAssessment failed', error);
      throw error;
    }

    const itemIds = input.item_ids ?? [];
    if (itemIds.length > 0) {
      const rows = itemIds.map((item_id, idx) => ({
        assessment_id: assessment.id,
        item_id,
        position: idx + 1,
      }));
      const { error: linkErr } = await supabase
        .from('fp_assessment_items')
        .insert(rows);
      if (linkErr) {
        logger.error(LOG, 'createAssessment: linking items failed', linkErr);
        throw linkErr;
      }
    }

    logger.dev(LOG, 'assessment built', {
      id: assessment?.id,
      items: itemIds.length,
    });
    return { ...assessment, item_count: itemIds.length } as FoundationAssessment;
  }

  // =========================================================================
  // Diagnostic: weakness map, revision plans, progress
  // =========================================================================

  static async getWeaknessMap(
    studentId: string,
    examDefinitionId: string,
  ): Promise<WeaknessRow[]> {
    const { data, error } = await getSupabase()
      .from('fp_student_weakness')
      .select(
        `id, student_id, exam_definition_id, topic_id, mastery_score,
         attempts_count,
         topic:cdc_exam_syllabus_topics!fp_student_weakness_topic_id_fkey(id, display_name, config_key)`,
      )
      .eq('student_id', studentId)
      .eq('exam_definition_id', examDefinitionId)
      .order('mastery_score', { ascending: true, nullsFirst: true });

    if (error) {
      logger.error(LOG, 'getWeaknessMap failed', error);
      throw error;
    }
    return (data ?? []) as WeaknessRow[];
  }

  static async getRevisionPlans(
    studentId: string,
    examDefinitionId: string,
  ): Promise<RevisionPlan[]> {
    const { data, error } = await getSupabase()
      .from('fp_revision_plans')
      .select(
        `id, student_id, exam_definition_id, generated_at, plan, status`,
      )
      .eq('student_id', studentId)
      .eq('exam_definition_id', examDefinitionId)
      .order('generated_at', { ascending: false });

    if (error) {
      logger.error(LOG, 'getRevisionPlans failed', error);
      throw error;
    }
    return (data ?? []) as RevisionPlan[];
  }

  static async getProgress(
    studentId: string,
    examDefinitionId: string,
  ): Promise<StudentProgress | null> {
    // Param names reconciled to the DB section's applied signatures, which use
    // the p_ prefix (p_student_id / p_exam_definition_id / p_assessment_id /
    // p_responses). Supabase .rpc() maps object keys 1:1 to SQL param names.
    const { data, error } = await getSupabase().rpc('fn_fp_student_progress', {
      p_student_id: studentId,
      p_exam_definition_id: examDefinitionId,
    });

    if (error) {
      logger.error(LOG, 'getProgress failed', error);
      throw error;
    }
    // RPC may return a single JSON object, a one-row set, or null.
    if (Array.isArray(data)) return (data[0] ?? null) as StudentProgress | null;
    return (data ?? null) as StudentProgress | null;
  }

  // =========================================================================
  // Privileged RPCs (SECURITY DEFINER, permission-gated internally)
  // =========================================================================

  static async recordAttempt(
    assessmentId: string,
    studentId: string,
    responses: RecordAttemptResponse[],
  ): Promise<any> {
    const { data, error } = await getSupabase().rpc('fn_fp_record_attempt', {
      p_assessment_id: assessmentId,
      p_student_id: studentId,
      p_responses: responses,
    });
    if (error) {
      logger.error(LOG, 'recordAttempt failed', error);
      throw error;
    }
    return data;
  }

  static async recomputeWeakness(
    studentId: string,
    examDefinitionId: string,
  ): Promise<any> {
    const { data, error } = await getSupabase().rpc('fn_fp_recompute_weakness', {
      p_student_id: studentId,
      p_exam_definition_id: examDefinitionId,
    });
    if (error) {
      logger.error(LOG, 'recomputeWeakness failed', error);
      throw error;
    }
    return data;
  }

  static async generateRevisionPlan(
    studentId: string,
    examDefinitionId: string,
  ): Promise<any> {
    const { data, error } = await getSupabase().rpc(
      'fn_fp_generate_revision_plan',
      {
        p_student_id: studentId,
        p_exam_definition_id: examDefinitionId,
      },
    );
    if (error) {
      logger.error(LOG, 'generateRevisionPlan failed', error);
      throw error;
    }
    return data;
  }

  // =========================================================================
  // Reported questions (fp_item_flags)
  // =========================================================================
  // Unlike the rest of this file these go through /api/foundation/item-flags
  // rather than the browser client. Raising a report is open to anyone signed
  // in while closing one needs foundation.items.manage, and a route is where
  // that asymmetry produces an explicit, readable 403 instead of an empty
  // result set. The database policies enforce it either way.

  static async listItemFlags(
    filters: ListItemFlagsFilters = {},
  ): Promise<ItemFlag[]> {
    const qs = new URLSearchParams();
    if (filters.status) qs.set('status', filters.status);
    if (filters.examDefinitionId)
      qs.set('examDefinitionId', filters.examDefinitionId);
    if (filters.itemId) qs.set('itemId', filters.itemId);

    const res = await fetch(`/api/foundation/item-flags?${qs.toString()}`, {
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.error(LOG, 'listItemFlags failed', json);
      throw new Error(json?.error ?? 'Could not load reported questions');
    }
    return (json?.data ?? []) as ItemFlag[];
  }

  static async raiseItemFlag(
    itemId: string,
    reason?: string | null,
  ): Promise<ItemFlag> {
    const res = await fetch('/api/foundation/item-flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, reason: reason ?? null }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.error(LOG, 'raiseItemFlag failed', json);
      throw new Error(json?.error ?? 'Could not record the report');
    }
    logger.dev(LOG, 'question reported', { itemId });
    return json.data as ItemFlag;
  }

  static async resolveItemFlag(
    flagId: string,
    status: ItemFlagResolution,
  ): Promise<ItemFlag> {
    const res = await fetch(`/api/foundation/item-flags/${flagId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.error(LOG, 'resolveItemFlag failed', json);
      throw new Error(json?.error ?? 'Could not close the report');
    }
    return json.data as ItemFlag;
  }
}
