// lib/services/pde-service.ts
// PDE Phase 1 Service — follows VACService pattern from lib/services/vac-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  PDEAssessment, PDEAssessmentQuestion, PDESubmission, PDECertificate,
  PDEEngagementEvent, PDEEngagementDaily, PDEAtRiskLearner,
  CreateAssessmentInput, CreateQuestionInput,
  LogEngagementInput, GenerateCertificateInput,
  AssessmentWithQuestions, EngagementSummary,
  SubmissionAnswer, MCQOption
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
      .single();
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

    // Calculate score
    const totalPoints = answers.reduce((sum, a) => sum + (a.is_correct ? a.points_earned : 0) + (!a.is_correct ? 0 : 0), 0);
    const earnedPoints = answers.reduce((sum, a) => sum + a.points_earned, 0);

    // We need the max possible points from the questions themselves
    // For now auto_score = percentage based on answers
    const { data, error } = await supabase
      .from('pde_submissions')
      .update({
        answers: answers,
        time_spent_seconds: timeSpentSeconds,
        completed_at: new Date().toISOString(),
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
}
