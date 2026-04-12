// lib/services/pde-service.ts
// PDE Phase 1 Service — follows VACService pattern from lib/services/vac-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  PDEAssessment, PDEAssessmentQuestion, PDESubmission, PDECertificate,
  PDEEngagementEvent, PDEEngagementDaily, PDEAtRiskLearner,
  CreateAssessmentInput, CreateQuestionInput,
  LogEngagementInput, GenerateCertificateInput,
  AssessmentWithQuestions, EngagementSummary,
  SubmissionAnswer, MCQOption,
  // Phase 2 types
  PDEQuest, PDEQuestEnrollment, PDEQuestSubmission,
  PDECapability, PDELearnerCapability,
  PDEBuildSession, PDEChannel, PDEMessage,
  PDEReputation, PDEBadge, PDELearnerBadge,
  CreateQuestInput, UpdateQuestInput, CreateQuestSubmissionInput,
  CreateCapabilityInput, DemonstrateCapabilityInput,
  StartBuildSessionInput, EndBuildSessionInput, LogAIInteractionInput,
  CreateChannelInput, PostMessageInput,
  AddReputationPointsInput, AwardBadgeInput,
  QuestFilters, AIInteraction, ReputationLevel,
  // Phase 3 types
  PDECoachConversation, CoachMessage, CoachMessageResponse, CoachingStyle,
  PDEAgencyIndex, AgencyLevel, CoachContextType,
} from '@/types/pde';

// Helper to get untyped supabase client for PDE tables (not yet in generated types)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = (): any => createClientSupabaseClient();

export class PDEService {

  // ============================================
  // ASSESSMENT OPERATIONS
  // ============================================

  static async getAssessmentsByLesson(lessonId: string): Promise<PDEAssessment[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_assessments')
      .select('*')
      .eq('lesson_id', lessonId)
      .eq('is_active', true)
      .order('created_at');
    if (error) throw new Error(`Failed to get assessments: ${error.message}`);
    return data || [];
  }

  static async getAssessmentsByCourse(courseId: string): Promise<PDEAssessment[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_assessments')
      .select('*')
      .eq('course_id', courseId)
      .eq('is_active', true)
      .order('created_at');
    if (error) throw new Error(`Failed to get assessments: ${error.message}`);
    return data || [];
  }

  static async getAssessmentWithQuestions(assessmentId: string): Promise<AssessmentWithQuestions | null> {
    const supabase = getSupabase();
    const { data: assessment, error: aErr } = await supabase
      .from('pde_assessments')
      .select('*')
      .eq('id', assessmentId)
      .maybeSingle();
    if (aErr || !assessment) return null;

    const { data: questions, error: qErr } = await supabase
      .from('pde_assessment_questions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('order_index');
    if (qErr) throw new Error(`Failed to get questions: ${qErr.message}`);

    return { ...assessment, questions: questions || [] };
  }

  static async createAssessment(input: CreateAssessmentInput): Promise<PDEAssessment> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_assessments')
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(`Failed to create assessment: ${error.message}`);
    return data;
  }

  static async updateAssessment(id: string, input: Partial<CreateAssessmentInput>): Promise<PDEAssessment> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_assessments')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Failed to update assessment: ${error.message}`);
    return data;
  }

  static async deleteAssessment(id: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('pde_assessments')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw new Error(`Failed to delete assessment: ${error.message}`);
  }

  // ============================================
  // QUESTION OPERATIONS
  // ============================================

  static async addQuestion(assessmentId: string, input: CreateQuestionInput): Promise<PDEAssessmentQuestion> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_assessment_questions')
      .insert({ ...input, assessment_id: assessmentId })
      .select()
      .single();
    if (error) throw new Error(`Failed to add question: ${error.message}`);
    return data;
  }

  static async addQuestionsBulk(assessmentId: string, questions: CreateQuestionInput[]): Promise<PDEAssessmentQuestion[]> {
    const supabase = getSupabase();
    const rows = questions.map((q, idx) => ({
      ...q,
      assessment_id: assessmentId,
      order_index: q.order_index ?? idx,
    }));
    const { data, error } = await supabase
      .from('pde_assessment_questions')
      .insert(rows)
      .select();
    if (error) throw new Error(`Failed to bulk add questions: ${error.message}`);
    return data || [];
  }

  // ============================================
  // SUBMISSION OPERATIONS
  // ============================================

  static async startAttempt(assessmentId: string, learnerId: string): Promise<PDESubmission> {
    const supabase = getSupabase();
    // Count existing attempts
    const { count } = await supabase
      .from('pde_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('assessment_id', assessmentId)
      .eq('learner_id', learnerId);

    const { data, error } = await supabase
      .from('pde_submissions')
      .insert({
        assessment_id: assessmentId,
        learner_id: learnerId,
        attempt_number: (count || 0) + 1,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to start attempt: ${error.message}`);
    return data;
  }

  static async submitAnswers(
    submissionId: string,
    answers: SubmissionAnswer[],
    timeSpentSeconds: number
  ): Promise<PDESubmission> {
    const supabase = getSupabase();

    // First, get the submission to find the assessment_id
    const { data: submission } = await supabase
      .from('pde_submissions')
      .select('assessment_id')
      .eq('id', submissionId)
      .single();

    // Fetch assessment + questions to get max possible points and pass threshold
    let totalPoints = 0;
    let passThreshold = 60;
    if (submission?.assessment_id) {
      const assessment = await this.getAssessmentWithQuestions(submission.assessment_id);
      if (assessment) {
        totalPoints = assessment.questions.reduce((sum, q) => sum + (q.points || 0), 0);
        passThreshold = assessment.pass_threshold || 60;
      }
    }

    // Calculate earned points from answers
    const earnedPoints = answers.reduce((sum, a) => sum + a.points_earned, 0);
    const scorePercent = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passed = totalPoints > 0 ? (earnedPoints / totalPoints * 100) >= passThreshold : false;

    const { data, error } = await supabase
      .from('pde_submissions')
      .update({
        answers: answers,
        time_spent_seconds: timeSpentSeconds,
        completed_at: new Date().toISOString(),
        auto_score: scorePercent,
        final_score: scorePercent,
        passed: passed,
      })
      .eq('id', submissionId)
      .select()
      .single();
    if (error) throw new Error(`Failed to submit answers: ${error.message}`);

    // Trigger auto-grade via RPC if available
    try {
      await supabase.rpc('pde_auto_grade_submission', { p_submission_id: submissionId });
      // Re-fetch to get updated score
      const { data: updated } = await supabase
        .from('pde_submissions')
        .select('*')
        .eq('id', submissionId)
        .single();
      return updated || data;
    } catch {
      // RPC might not exist yet, return data as-is
      return data;
    }
  }

  static async getLearnerSubmissions(learnerId: string, assessmentId: string): Promise<PDESubmission[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_submissions')
      .select('*')
      .eq('learner_id', learnerId)
      .eq('assessment_id', assessmentId)
      .order('attempt_number', { ascending: false });
    if (error) throw new Error(`Failed to get submissions: ${error.message}`);
    return data || [];
  }

  static async getSubmissionResults(submissionId: string): Promise<PDESubmission | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_submissions')
      .select('*')
      .eq('id', submissionId)
      .single();
    if (error) return null;
    return data;
  }

  // ============================================
  // ENGAGEMENT OPERATIONS
  // ============================================

  static async logEngagement(input: LogEngagementInput): Promise<PDEEngagementEvent> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_engagement_events')
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(`Failed to log engagement: ${error.message}`);
    return data;
  }

  static async getEngagementSummary(learnerId: string, courseId?: string): Promise<EngagementSummary> {
    const supabase = getSupabase();
    let query = supabase
      .from('pde_engagement_daily')
      .select('*')
      .eq('learner_id', learnerId);
    if (courseId) query = query.eq('course_id', courseId);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to get engagement summary: ${error.message}`);

    const rows = data || [];
    const totalTime = rows.reduce((s: number, r: PDEEngagementDaily) => s + r.time_spent_minutes, 0);
    const lessonsCompleted = rows.reduce((s: number, r: PDEEngagementDaily) => s + r.lessons_completed, 0);
    const maxStreak = rows.reduce((s: number, r: PDEEngagementDaily) => Math.max(s, r.streak_days), 0);

    return {
      total_events: rows.length,
      total_time_minutes: totalTime,
      lessons_completed: lessonsCompleted,
      assessments_passed: 0, // TODO: calculate from submissions
      current_streak: maxStreak,
      engagement_score: Math.min(100, Math.round((totalTime / 60) * 10 + lessonsCompleted * 5)),
    };
  }

  static async getAtRiskLearners(courseId?: string): Promise<PDEAtRiskLearner[]> {
    const supabase = getSupabase();
    let query = supabase.from('pde_at_risk_learners').select('*');
    if (courseId) query = query.eq('course_id', courseId);
    const { data, error } = await query.order('risk_level');
    if (error) throw new Error(`Failed to get at-risk learners: ${error.message}`);
    return data || [];
  }

  // ============================================
  // CERTIFICATE OPERATIONS
  // ============================================

  static async generateCertificate(input: GenerateCertificateInput): Promise<PDECertificate> {
    const supabase = getSupabase();
    const certNumber = `JKKN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const { data, error } = await supabase
      .from('pde_certificates')
      .insert({
        learner_id: input.learner_id,
        course_id: input.course_id,
        certificate_number: certNumber,
        certificate_type: 'course_completion',
        final_score: input.final_score,
        completion_hours: input.completion_hours,
        finks_profile: input.finks_profile || null,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to generate certificate: ${error.message}`);
    return data;
  }

  static async getCertificate(certificateId: string): Promise<PDECertificate | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_certificates')
      .select('*')
      .eq('id', certificateId)
      .single();
    if (error) return null;
    return data;
  }

  static async verifyCertificate(certificateNumber: string): Promise<PDECertificate | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_certificates')
      .select('*')
      .eq('certificate_number', certificateNumber)
      .single();
    if (error) return null;
    return data;
  }

  static async getLearnerCertificates(learnerId: string): Promise<PDECertificate[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_certificates')
      .select('*')
      .eq('learner_id', learnerId)
      .order('issued_at', { ascending: false });
    if (error) throw new Error(`Failed to get certificates: ${error.message}`);
    return data || [];
  }

  /**
   * Check if a learner qualifies for a certificate and auto-generate one.
   * Conditions: all lessons completed + final assessment passed + no existing certificate.
   * Called after lesson completion or assessment submission.
   */
  static async checkAndGenerateCertificate(
    learnerId: string,
    courseId: string
  ): Promise<PDECertificate | null> {
    const supabase = getSupabase();

    // 1. Check if certificate already exists for this learner+course
    const { data: existing } = await supabase
      .from('pde_certificates')
      .select('id')
      .eq('learner_id', learnerId)
      .eq('course_id', courseId)
      .maybeSingle();

    if (existing) return null; // Already has certificate

    // 2. Check all lessons completed via vac_learner_progress
    const { count: totalLessons } = await supabase
      .from('vac_lessons')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', courseId);

    if (!totalLessons || totalLessons === 0) return null;

    const { count: completedLessons } = await supabase
      .from('vac_learner_progress')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', learnerId)
      .eq('course_id', courseId)
      .eq('status', 'completed');

    if ((completedLessons ?? 0) < totalLessons) return null; // Not all lessons done

    // 3. Check if there is a passed final assessment (course-level assessment)
    //    Look for any passed submission for a course-level assessment (lesson_id IS NULL)
    const { data: courseAssessments } = await supabase
      .from('pde_assessments')
      .select('id')
      .eq('course_id', courseId)
      .is('lesson_id', null)
      .eq('is_active', true);

    let finalScore = 0;
    let hasPassed = false;

    if (courseAssessments && courseAssessments.length > 0) {
      // Check if the learner has passed at least one course-level assessment
      for (const assessment of courseAssessments) {
        const { data: submission } = await supabase
          .from('pde_submissions')
          .select('final_score, passed')
          .eq('assessment_id', assessment.id)
          .eq('learner_id', learnerId)
          .eq('passed', true)
          .order('final_score', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (submission?.passed) {
          hasPassed = true;
          finalScore = Math.max(finalScore, submission.final_score || 0);
        }
      }

      if (!hasPassed) return null; // Has course assessment but hasn't passed
    } else {
      // No course-level assessment — completion alone qualifies
      // Calculate average score from all lesson-level submissions
      const { data: allSubmissions } = await supabase
        .from('pde_submissions')
        .select('final_score')
        .eq('learner_id', learnerId)
        .eq('passed', true)
        .not('final_score', 'is', null);

      if (allSubmissions && allSubmissions.length > 0) {
        finalScore = Math.round(
          allSubmissions.reduce((sum: number, s: { final_score: number | null }) => sum + (s.final_score || 0), 0) / allSubmissions.length
        );
      } else {
        finalScore = 100; // All lessons completed, no assessments — perfect
      }
    }

    // 4. Calculate completion hours from engagement data
    const { data: engagementRows } = await supabase
      .from('pde_engagement_daily')
      .select('time_spent_minutes')
      .eq('learner_id', learnerId)
      .eq('course_id', courseId);

    const totalMinutes = (engagementRows || []).reduce(
      (sum: number, r: { time_spent_minutes: number }) => sum + r.time_spent_minutes, 0
    );
    const completionHours = Math.max(1, Math.round(totalMinutes / 60));

    // 5. Generate the certificate
    return this.generateCertificate({
      learner_id: learnerId,
      course_id: courseId,
      final_score: finalScore,
      completion_hours: completionHours,
    });
  }

  // ============================================
  // PHASE 2: QUEST OPERATIONS
  // ============================================

  static async getQuests(filters?: QuestFilters): Promise<PDEQuest[]> {
    const supabase = getSupabase();
    let query = supabase.from('pde_quests').select('*');
    if (filters?.quest_type) query = query.eq('quest_type', filters.quest_type);
    if (filters?.difficulty) query = query.eq('difficulty', filters.difficulty);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.source_type) query = query.eq('source_type', filters.source_type);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to get quests: ${error.message}`);
    return data || [];
  }

  static async getQuestById(id: string): Promise<PDEQuest | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_quests')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  }

  static async createQuest(input: CreateQuestInput): Promise<PDEQuest> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_quests')
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(`Failed to create quest: ${error.message}`);
    return data;
  }

  static async updateQuest(id: string, input: UpdateQuestInput): Promise<PDEQuest> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_quests')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Failed to update quest: ${error.message}`);
    return data;
  }

  static async enrollInQuest(questId: string, learnerId: string, teamId?: string): Promise<PDEQuestEnrollment> {
    const supabase = getSupabase();
    // Return existing enrollment if already enrolled (idempotent)
    const { data: existing } = await supabase
      .from('pde_quest_enrollments')
      .select('*')
      .eq('quest_id', questId)
      .eq('learner_id', learnerId)
      .maybeSingle();
    if (existing) return existing;

    const { data, error } = await supabase
      .from('pde_quest_enrollments')
      .insert({
        quest_id: questId,
        learner_id: learnerId,
        team_id: teamId || null,
        role: teamId ? 'member' : 'lead',
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to enroll in quest: ${error.message}`);
    return data;
  }

  static async getQuestEnrollments(questId: string): Promise<PDEQuestEnrollment[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_quest_enrollments')
      .select('*')
      .eq('quest_id', questId)
      .order('started_at');
    if (error) throw new Error(`Failed to get enrollments: ${error.message}`);
    return data || [];
  }

  static async getLearnerQuestEnrollments(learnerId: string): Promise<PDEQuestEnrollment[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_quest_enrollments')
      .select('*')
      .eq('learner_id', learnerId)
      .order('started_at', { ascending: false });
    if (error) throw new Error(`Failed to get learner enrollments: ${error.message}`);
    return data || [];
  }

  static async updateEnrollmentStatus(enrollmentId: string, status: string, completedAt?: string): Promise<PDEQuestEnrollment> {
    const supabase = getSupabase();
    const updateData: Record<string, unknown> = { status };
    if (completedAt) updateData.completed_at = completedAt;
    const { data, error } = await supabase
      .from('pde_quest_enrollments')
      .update(updateData)
      .eq('id', enrollmentId)
      .select()
      .single();
    if (error) throw new Error(`Failed to update enrollment: ${error.message}`);
    return data;
  }

  static async submitQuestWork(input: CreateQuestSubmissionInput): Promise<PDEQuestSubmission> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_quest_submissions')
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(`Failed to submit quest work: ${error.message}`);
    return data;
  }

  static async getQuestSubmissions(questId: string): Promise<PDEQuestSubmission[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_quest_submissions')
      .select('*')
      .eq('quest_id', questId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to get quest submissions: ${error.message}`);
    return data || [];
  }

  static async getLearnerQuestSubmissions(learnerId: string, questId?: string): Promise<PDEQuestSubmission[]> {
    const supabase = getSupabase();
    let query = supabase
      .from('pde_quest_submissions')
      .select('*')
      .eq('learner_id', learnerId);
    if (questId) query = query.eq('quest_id', questId);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to get learner submissions: ${error.message}`);
    return data || [];
  }

  // ============================================
  // PHASE 2: CAPABILITY OPERATIONS
  // ============================================

  static async getCapabilities(category?: string): Promise<PDECapability[]> {
    const supabase = getSupabase();
    let query = supabase.from('pde_capabilities').select('*');
    if (category) query = query.eq('category', category);
    const { data, error } = await query.order('category').order('level');
    if (error) throw new Error(`Failed to get capabilities: ${error.message}`);
    return data || [];
  }

  static async getCapabilityById(id: string): Promise<PDECapability | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_capabilities')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  }

  static async createCapability(input: CreateCapabilityInput): Promise<PDECapability> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_capabilities')
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(`Failed to create capability: ${error.message}`);
    return data;
  }

  static async createCapabilitiesBulk(inputs: CreateCapabilityInput[]): Promise<PDECapability[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_capabilities')
      .insert(inputs)
      .select();
    if (error) throw new Error(`Failed to bulk create capabilities: ${error.message}`);
    return data || [];
  }

  static async getLearnerCapabilities(learnerId: string): Promise<PDELearnerCapability[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_learner_capabilities')
      .select('*, capability:pde_capabilities(*)')
      .eq('learner_id', learnerId)
      .order('status');
    if (error) throw new Error(`Failed to get learner capabilities: ${error.message}`);
    return data || [];
  }

  static async updateCapabilityStatus(
    learnerId: string,
    capabilityId: string,
    status: string
  ): Promise<PDELearnerCapability> {
    const supabase = getSupabase();
    // Upsert: create if not exists, update if exists
    const { data, error } = await supabase
      .from('pde_learner_capabilities')
      .upsert(
        { learner_id: learnerId, capability_id: capabilityId, status },
        { onConflict: 'learner_id,capability_id' }
      )
      .select()
      .single();
    if (error) throw new Error(`Failed to update capability status: ${error.message}`);
    return data;
  }

  static async demonstrateCapability(
    learnerId: string,
    capabilityId: string,
    evidence: DemonstrateCapabilityInput
  ): Promise<PDELearnerCapability> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_learner_capabilities')
      .upsert(
        {
          learner_id: learnerId,
          capability_id: capabilityId,
          status: 'demonstrated',
          demonstrated_at: new Date().toISOString(),
          demonstration_evidence: evidence.demonstration_evidence,
          demonstration_score: evidence.demonstration_score || null,
        },
        { onConflict: 'learner_id,capability_id' }
      )
      .select()
      .single();
    if (error) throw new Error(`Failed to demonstrate capability: ${error.message}`);
    return data;
  }

  static async getCapabilityLessons(capabilityId: string): Promise<Array<{ id: string; title: string; course_id?: string; duration_minutes?: number; order_index?: number }>> {
    const supabase = getSupabase();
    // Get the capability to find linked lesson_ids
    const { data: cap, error: capError } = await supabase
      .from('pde_capabilities')
      .select('lesson_ids')
      .eq('id', capabilityId)
      .single();
    if (capError || !cap?.lesson_ids) return [];

    const lessonIds = cap.lesson_ids as string[];
    if (lessonIds.length === 0) return [];

    const { data: lessons, error } = await supabase
      .from('vac_lessons')
      .select('id, title, course_id, duration_minutes, order_index')
      .in('id', lessonIds);
    if (error) throw new Error(`Failed to get capability lessons: ${error.message}`);
    return lessons || [];
  }

  // ============================================
  // PHASE 2: BUILD ARENA OPERATIONS
  // ============================================

  static async startBuildSession(input: StartBuildSessionInput): Promise<PDEBuildSession> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_build_sessions')
      .insert({
        learner_id: input.learner_id,
        quest_id: input.quest_id,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to start build session: ${error.message}`);
    return data;
  }

  static async endBuildSession(sessionId: string, input: EndBuildSessionInput): Promise<PDEBuildSession> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_build_sessions')
      .update({
        ended_at: new Date().toISOString(),
        artifacts: input.artifacts || null,
        notes: input.notes || null,
        duration_minutes: input.duration_minutes || null,
      })
      .eq('id', sessionId)
      .select()
      .single();
    if (error) throw new Error(`Failed to end build session: ${error.message}`);
    return data;
  }

  static async getBuildSessions(learnerId: string, questId?: string): Promise<PDEBuildSession[]> {
    const supabase = getSupabase();
    let query = supabase
      .from('pde_build_sessions')
      .select('*')
      .eq('learner_id', learnerId);
    if (questId) query = query.eq('quest_id', questId);
    const { data, error } = await query.order('started_at', { ascending: false });
    if (error) throw new Error(`Failed to get build sessions: ${error.message}`);
    return data || [];
  }

  static async logAIInteraction(
    sessionId: string,
    interaction: LogAIInteractionInput
  ): Promise<void> {
    const supabase = getSupabase();
    // Fetch current session
    const { data: session, error: fetchErr } = await supabase
      .from('pde_build_sessions')
      .select('ai_interactions, ai_prompts_count, ai_outputs_modified, ai_outputs_blind')
      .eq('id', sessionId)
      .single();
    if (fetchErr) throw new Error(`Failed to fetch session: ${fetchErr.message}`);

    const interactions: AIInteraction[] = session.ai_interactions || [];
    interactions.push({
      ...interaction,
      accepted_blind: interaction.accepted_blind ?? false,
      timestamp: new Date().toISOString(),
    });

    const { error } = await supabase
      .from('pde_build_sessions')
      .update({
        ai_interactions: interactions,
        ai_prompts_count: (session.ai_prompts_count || 0) + 1,
        ai_outputs_modified: (session.ai_outputs_modified || 0) + (interaction.modified ? 1 : 0),
        ai_outputs_blind: (session.ai_outputs_blind || 0) + (interaction.accepted_blind ? 1 : 0),
      })
      .eq('id', sessionId);
    if (error) throw new Error(`Failed to log AI interaction: ${error.message}`);
  }

  // ============================================
  // PHASE 2: CHANNEL OPERATIONS
  // ============================================

  static async getChannels(type?: string, referenceId?: string): Promise<PDEChannel[]> {
    const supabase = getSupabase();
    let query = supabase.from('pde_channels').select('*').eq('is_active', true);
    if (type) query = query.eq('channel_type', type);
    if (referenceId) query = query.eq('reference_id', referenceId);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to get channels: ${error.message}`);
    return data || [];
  }

  static async createChannel(input: CreateChannelInput): Promise<PDEChannel> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_channels')
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(`Failed to create channel: ${error.message}`);
    return data;
  }

  static async getMessages(channelId: string, limit = 50): Promise<PDEMessage[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) throw new Error(`Failed to get messages: ${error.message}`);
    return data || [];
  }

  static async postMessage(input: PostMessageInput): Promise<PDEMessage> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_messages')
      .insert({
        channel_id: input.channel_id,
        author_id: input.author_id,
        content: input.content,
        message_type: input.message_type || 'text',
        parent_id: input.parent_id || null,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to post message: ${error.message}`);
    return data;
  }

  static async toggleReaction(messageId: string, userId: string, emoji: string): Promise<void> {
    const supabase = getSupabase();
    // Fetch current reactions
    const { data: msg, error: fetchErr } = await supabase
      .from('pde_messages')
      .select('reactions')
      .eq('id', messageId)
      .single();
    if (fetchErr) throw new Error(`Failed to fetch message: ${fetchErr.message}`);

    const reactions: Record<string, string[]> = msg.reactions || {};
    if (!reactions[emoji]) reactions[emoji] = [];

    const idx = reactions[emoji].indexOf(userId);
    if (idx >= 0) {
      reactions[emoji].splice(idx, 1);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji].push(userId);
    }

    const { error } = await supabase
      .from('pde_messages')
      .update({ reactions })
      .eq('id', messageId);
    if (error) throw new Error(`Failed to toggle reaction: ${error.message}`);
  }

  static async pinMessage(messageId: string, pinned: boolean): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('pde_messages')
      .update({ is_pinned: pinned })
      .eq('id', messageId);
    if (error) throw new Error(`Failed to pin message: ${error.message}`);
  }

  static async markAsAnswer(messageId: string, isAnswer: boolean): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('pde_messages')
      .update({ is_answer: isAnswer })
      .eq('id', messageId);
    if (error) throw new Error(`Failed to mark answer: ${error.message}`);
  }

  // ============================================
  // PHASE 2: REPUTATION OPERATIONS
  // ============================================

  static async getReputation(learnerId: string): Promise<PDEReputation | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_reputation')
      .select('*')
      .eq('learner_id', learnerId)
      .maybeSingle();
    if (error) return null;
    return data;
  }

  static async addPoints(input: AddReputationPointsInput): Promise<PDEReputation> {
    const supabase = getSupabase();
    // Ensure reputation row exists (upsert)
    const { data: existing } = await supabase
      .from('pde_reputation')
      .select('*')
      .eq('learner_id', input.learner_id)
      .single();

    if (!existing) {
      // Create initial record
      const initial: Record<string, unknown> = {
        learner_id: input.learner_id,
        total_points: input.points,
        [`${input.category}_points`]: input.points,
      };
      const { data, error } = await supabase
        .from('pde_reputation')
        .insert(initial)
        .select()
        .single();
      if (error) throw new Error(`Failed to create reputation: ${error.message}`);
      return data;
    }

    // Update existing
    const newTotal = (existing.total_points || 0) + input.points;
    const categoryField = `${input.category}_points` as keyof PDEReputation;
    const newCategoryTotal = ((existing[categoryField] as number) || 0) + input.points;

    // Calculate level
    let level: ReputationLevel = 'apprentice';
    if (newTotal >= 5000) level = 'mentor';
    else if (newTotal >= 1500) level = 'principal';
    else if (newTotal >= 500) level = 'expert';
    else if (newTotal >= 100) level = 'practitioner';

    const { data, error } = await supabase
      .from('pde_reputation')
      .update({
        total_points: newTotal,
        [categoryField]: newCategoryTotal,
        level,
      })
      .eq('learner_id', input.learner_id)
      .select()
      .single();
    if (error) throw new Error(`Failed to add points: ${error.message}`);
    return data;
  }

  static async getBadges(): Promise<PDEBadge[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_badges')
      .select('*')
      .order('category')
      .order('name');
    if (error) throw new Error(`Failed to get badges: ${error.message}`);
    return data || [];
  }

  static async getLearnerBadges(learnerId: string): Promise<PDELearnerBadge[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_learner_badges')
      .select('*, badge:pde_badges(*)')
      .eq('learner_id', learnerId)
      .order('earned_at', { ascending: false });
    if (error) throw new Error(`Failed to get learner badges: ${error.message}`);
    return data || [];
  }

  static async awardBadge(input: AwardBadgeInput): Promise<PDELearnerBadge> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_learner_badges')
      .insert({
        learner_id: input.learner_id,
        badge_id: input.badge_id,
        evidence: input.evidence || null,
      })
      .select('*, badge:pde_badges(*)')
      .single();
    if (error) throw new Error(`Failed to award badge: ${error.message}`);
    return data;
  }

  static async getLeaderboard(limit = 20): Promise<PDEReputation[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_reputation')
      .select('*')
      .order('total_points', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Failed to get leaderboard: ${error.message}`);
    return data || [];
  }

  static async incrementReputationStat(
    learnerId: string,
    stat: 'quests_completed' | 'capabilities_demonstrated' | 'peer_reviews_given' | 'peer_reviews_helpful' | 'help_given_count'
  ): Promise<void> {
    const supabase = getSupabase();
    const { data: existing } = await supabase
      .from('pde_reputation')
      .select(stat)
      .eq('learner_id', learnerId)
      .single();

    if (!existing) {
      // Create record with this stat = 1
      await supabase
        .from('pde_reputation')
        .insert({ learner_id: learnerId, [stat]: 1 });
      return;
    }

    await supabase
      .from('pde_reputation')
      .update({ [stat]: ((existing[stat] as number) || 0) + 1 })
      .eq('learner_id', learnerId);
  }

  static async updateStreak(learnerId: string, currentStreak: number): Promise<void> {
    const supabase = getSupabase();
    const { data: existing } = await supabase
      .from('pde_reputation')
      .select('longest_streak')
      .eq('learner_id', learnerId)
      .single();

    const longestStreak = Math.max(currentStreak, existing?.longest_streak || 0);

    await supabase
      .from('pde_reputation')
      .upsert(
        {
          learner_id: learnerId,
          current_streak: currentStreak,
          longest_streak: longestStreak,
        },
        { onConflict: 'learner_id' }
      );
  }

  // ============================================
  // PHASE 3: AI COACH OPERATIONS
  // ============================================

  /**
   * Get an existing coach conversation for a given context.
   * Returns null if no conversation exists.
   */
  static async getCoachConversation(
    learnerId: string,
    contextType: string,
    contextId: string
  ): Promise<PDECoachConversation | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_coach_conversations')
      .select('*')
      .eq('learner_id', learnerId)
      .eq('context_type', contextType)
      .eq('context_id', contextId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to get coach conversation: ${error.message}`);
    return data || null;
  }

  /**
   * Send a message to the AI Coach. Stores the learner message,
   * generates a placeholder coach reply (actual Gemini integration is follow-up).
   * Returns the coach reply and conversation ID.
   */
  static async sendCoachMessage(
    learnerId: string,
    contextType: string,
    contextId: string,
    message: string
  ): Promise<CoachMessageResponse> {
    const supabase = getSupabase();

    // 1. Get or create conversation
    let conversation = await this.getCoachConversation(learnerId, contextType, contextId);

    // Determine coaching style from agency level
    const agencyIndex = await this.getAgencyIndex(learnerId);
    const coachingStyle = this.getCoachingStyleForLevel(agencyIndex?.level || 'dependent');

    const now = new Date().toISOString();
    const learnerMsg: CoachMessage = { role: 'learner', content: message, timestamp: now };

    // Placeholder coach reply — will be replaced by Gemini integration
    const coachReply = this.generatePlaceholderCoachReply(message, coachingStyle);
    const coachMsg: CoachMessage = { role: 'coach', content: coachReply, timestamp: now };

    if (!conversation) {
      // Create new conversation
      const { data, error } = await supabase
        .from('pde_coach_conversations')
        .insert({
          learner_id: learnerId,
          context_type: contextType,
          context_id: contextId,
          messages: [learnerMsg, coachMsg],
          coaching_style: coachingStyle,
          tokens_used: message.length + coachReply.length, // rough estimate
        })
        .select()
        .single();
      if (error) throw new Error(`Failed to create coach conversation: ${error.message}`);
      return { reply: coachReply, conversation_id: data.id };
    }

    // Append to existing conversation
    const updatedMessages = [...(conversation.messages || []), learnerMsg, coachMsg];
    const { error } = await supabase
      .from('pde_coach_conversations')
      .update({
        messages: updatedMessages,
        coaching_style: coachingStyle,
        tokens_used: (conversation.tokens_used || 0) + message.length + coachReply.length,
        updated_at: now,
      })
      .eq('id', conversation.id);
    if (error) throw new Error(`Failed to update coach conversation: ${error.message}`);

    return { reply: coachReply, conversation_id: conversation.id };
  }

  /**
   * Get coach conversation history for a learner.
   */
  static async getCoachHistory(learnerId: string, limit = 20): Promise<PDECoachConversation[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_coach_conversations')
      .select('*')
      .eq('learner_id', learnerId)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Failed to get coach history: ${error.message}`);
    return data || [];
  }

  /**
   * Map agency level to coaching style.
   */
  private static getCoachingStyleForLevel(level: AgencyLevel | string): CoachingStyle {
    const styleMap: Record<string, CoachingStyle> = {
      dependent: 'scaffolding',
      directed: 'guided',
      independent: 'challenging',
      self_directed: 'socratic',
      principal: 'peer',
    };
    return styleMap[level] || 'scaffolding';
  }

  /**
   * Generate placeholder coach reply based on coaching style.
   * Will be replaced by Gemini API integration.
   */
  private static generatePlaceholderCoachReply(message: string, style: CoachingStyle): string {
    const replies: Record<CoachingStyle, string> = {
      scaffolding: "Let's break this down step by step. What part of this do you understand already, and where do you feel stuck?",
      guided: "You're on the right track. Before I point you further, what do you think the next step should be?",
      challenging: "Interesting approach. But what would happen if the input was unexpected? Have you considered edge cases?",
      socratic: "That's one way to look at it. What would someone who disagrees with your approach say? What assumptions are you making?",
      peer: "I see where you're going. I'd push back on one aspect though — have you validated this with real data?",
    };
    return replies[style];
  }

  // ============================================
  // PHASE 3: AGENCY INDEX OPERATIONS
  // ============================================

  /**
   * Get the latest agency index for a learner, optionally for a specific course.
   */
  static async getAgencyIndex(learnerId: string, courseId?: string): Promise<PDEAgencyIndex | null> {
    const supabase = getSupabase();
    let query = supabase
      .from('pde_agency_index')
      .select('*')
      .eq('learner_id', learnerId);
    if (courseId) query = query.eq('course_id', courseId);
    const { data, error } = await query
      .order('assessment_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to get agency index: ${error.message}`);
    return data || null;
  }

  /**
   * Calculate the agency index for a learner in a specific course.
   * Reads from pde_engagement_daily and pde_build_sessions to compute all 5 dimensions.
   */
  static async calculateAgencyIndex(learnerId: string, courseId: string): Promise<PDEAgencyIndex> {
    const supabase = getSupabase();

    // 1. Fetch engagement data
    const { data: engagementRows } = await supabase
      .from('pde_engagement_daily')
      .select('*')
      .eq('learner_id', learnerId)
      .eq('course_id', courseId);
    const engagement = engagementRows || [];

    // 2. Fetch build session data for AI interaction details
    const { data: buildRows } = await supabase
      .from('pde_build_sessions')
      .select('ai_prompts_count, ai_outputs_modified, ai_outputs_blind, ai_interactions')
      .eq('learner_id', learnerId);
    const builds = buildRows || [];

    // 3. Calculate each dimension (0-100)

    // Initiative: self-started AI interactions / total interactions
    const totalAiPrompts = engagement.reduce((s: number, r: PDEEngagementDaily) => s + (r.ai_prompts_used || 0), 0);
    const totalLessonsViewed = engagement.reduce((s: number, r: PDEEngagementDaily) => s + (r.lessons_viewed || 0), 0);
    // Heuristic: if learner uses AI more than prompts-per-lesson average, they're self-starting
    const initiative = totalLessonsViewed > 0
      ? Math.min(100, Math.round((totalAiPrompts / Math.max(1, totalLessonsViewed)) * 50))
      : 0;

    // Self-direction: AI outputs modified / total AI outputs
    const totalAiModified = engagement.reduce((s: number, r: PDEEngagementDaily) => s + (r.ai_outputs_modified || 0), 0);
    const totalAiBlind = engagement.reduce((s: number, r: PDEEngagementDaily) => s + (r.ai_outputs_accepted_blind || 0), 0);
    const totalAiOutputs = totalAiModified + totalAiBlind;
    const selfDirection = totalAiOutputs > 0
      ? Math.round((totalAiModified / totalAiOutputs) * 100)
      : 50; // Neutral if no data

    // Tool mastery: prompt complexity trend (simple heuristic from build sessions)
    let toolMastery = 30; // default baseline
    if (builds.length > 0) {
      const totalBuildPrompts = builds.reduce((s: number, b: { ai_prompts_count?: number }) => s + (b.ai_prompts_count || 0), 0);
      const totalBuildModified = builds.reduce((s: number, b: { ai_outputs_modified?: number }) => s + (b.ai_outputs_modified || 0), 0);
      // More prompts and more modifications suggest growing mastery
      const modRatio = totalBuildPrompts > 0 ? totalBuildModified / totalBuildPrompts : 0;
      toolMastery = Math.min(100, Math.round(modRatio * 80 + Math.min(20, totalBuildPrompts * 2)));
    }

    // Critical evaluation: verified (modified) outputs / total outputs
    const criticalEvaluation = totalAiOutputs > 0
      ? Math.round((totalAiModified / totalAiOutputs) * 100)
      : 50;

    // Ethical judgment: bias flags / total interactions (from build session metadata)
    // Heuristic: penalize blind acceptance, reward modification
    const ethicalJudgment = totalAiOutputs > 0
      ? Math.max(0, Math.round(100 - (totalAiBlind / totalAiOutputs) * 100))
      : 50;

    // Overall: weighted average (20% each)
    const overall = Math.round(
      initiative * 0.2 +
      selfDirection * 0.2 +
      toolMastery * 0.2 +
      criticalEvaluation * 0.2 +
      ethicalJudgment * 0.2
    );

    // Determine level
    let level: AgencyLevel = 'dependent';
    if (overall >= 80) level = 'principal';
    else if (overall >= 60) level = 'self_directed';
    else if (overall >= 40) level = 'independent';
    else if (overall >= 20) level = 'directed';

    // Evidence summary
    const evidence = {
      total_ai_prompts: totalAiPrompts,
      total_ai_outputs: totalAiOutputs,
      total_ai_modified: totalAiModified,
      total_ai_blind: totalAiBlind,
      build_sessions_count: builds.length,
      engagement_days: engagement.length,
    };

    // 4. Upsert the agency index record
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('pde_agency_index')
      .upsert(
        {
          learner_id: learnerId,
          course_id: courseId,
          assessment_date: today,
          initiative,
          self_direction: selfDirection,
          tool_mastery: toolMastery,
          critical_evaluation: criticalEvaluation,
          ethical_judgment: ethicalJudgment,
          overall,
          level,
          evidence,
        },
        { onConflict: 'learner_id,course_id,assessment_date' }
      )
      .select()
      .single();
    if (error) throw new Error(`Failed to calculate agency index: ${error.message}`);
    return data;
  }

  /**
   * Get recent activity/engagement events for a learner.
   */
  static async getRecentActivity(learnerId: string, limit = 20): Promise<Record<string, unknown>[]> {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('pde_engagement_events')
      .select('*')
      .eq('learner_id', learnerId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return data || [];
  }

  /**
   * Get agency index trend for a learner (all historical assessments).
   */
  static async getAgencyTrends(learnerId: string): Promise<PDEAgencyIndex[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('pde_agency_index')
      .select('*')
      .eq('learner_id', learnerId)
      .order('assessment_date', { ascending: true });
    if (error) throw new Error(`Failed to get agency trends: ${error.message}`);
    return data || [];
  }
}
