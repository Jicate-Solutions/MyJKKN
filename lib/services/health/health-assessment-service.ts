// lib/services/health/health-assessment-service.ts
// Service for PHQ-9/GAD-7 assessments + auto-escalation
// Created: 2026-04-12

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  HealthAssessment,
  AssessmentType,
  AssessmentResponse,
  HealthEscalation,
  EscalationStatus,
} from '@/types/health-mental';
import {
  scorePHQ9,
  scoreGAD7,
  ESCALATION_THRESHOLD_PHQ9,
  ESCALATION_THRESHOLD_GAD7,
} from '@/types/health-mental';

const supabase = createClientSupabaseClient();

export class HealthAssessmentService {
  // --------------------------------------------------------------------------
  // Assessments
  // --------------------------------------------------------------------------

  static async submitAssessment(
    learnerId: string,
    type: AssessmentType,
    responses: AssessmentResponse[]
  ): Promise<{ assessment: HealthAssessment; escalated: boolean }> {
    const { score, severity } = type === 'phq9' ? scorePHQ9(responses) : scoreGAD7(responses);
    const threshold = type === 'phq9' ? ESCALATION_THRESHOLD_PHQ9 : ESCALATION_THRESHOLD_GAD7;

    const { data: assessment, error } = await (supabase as any)
      .from('health_assessments')
      .insert({
        learner_id: learnerId,
        assessment_type: type,
        responses,
        total_score: score,
        severity: severity.label,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) throw error;

    // Auto-escalate if score exceeds threshold
    let escalated = false;
    if (score >= threshold) {
      await this.createEscalation(learnerId, assessment.id, type, score, severity.label);
      escalated = true;
    }

    return { assessment, escalated };
  }

  static async declineAssessment(learnerId: string, type: AssessmentType): Promise<void> {
    await (supabase as any)
      .from('health_assessments')
      .insert({
        learner_id: learnerId,
        assessment_type: type,
        responses: [],
        total_score: 0,
        severity: 'declined',
        status: 'declined',
        declined_at: new Date().toISOString(),
      });
  }

  static async getAssessmentHistory(learnerId: string): Promise<HealthAssessment[]> {
    const { data } = await (supabase as any)
      .from('health_assessments')
      .select('*')
      .eq('learner_id', learnerId)
      .order('created_at', { ascending: false })
      .limit(20);
    return data || [];
  }

  static async getLatestAssessment(learnerId: string, type: AssessmentType): Promise<HealthAssessment | null> {
    const { data } = await (supabase as any)
      .from('health_assessments')
      .select('*')
      .eq('learner_id', learnerId)
      .eq('assessment_type', type)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  }

  // --------------------------------------------------------------------------
  // Escalations
  // --------------------------------------------------------------------------

  static async createEscalation(
    learnerId: string,
    assessmentId: string,
    type: AssessmentType,
    score: number,
    severity: string
  ): Promise<void> {
    await (supabase as any)
      .from('health_escalations')
      .insert({
        learner_id: learnerId,
        assessment_id: assessmentId,
        trigger_type: type === 'phq9' ? 'phq9_high' : 'gad7_high',
        trigger_score: score,
        trigger_severity: severity,
        status: 'open',
        escalation_level: score >= 20 ? 2 : 1,
      });
  }

  static async getActiveEscalations(): Promise<HealthEscalation[]> {
    const { data } = await (supabase as any)
      .from('health_escalations')
      .select(`
        *,
        learner:learners_profiles!learner_id(first_name, last_name, student_mobile, institution_id, institutions!institution_id(name)),
        assessment:health_assessments!assessment_id(assessment_type, total_score, severity, completed_at)
      `)
      .in('status', ['open', 'contacted', 'in_session'])
      .order('created_at', { ascending: false });

    return (data || []).map((row: any) => ({
      ...row,
      learner_name: `${row.learner?.first_name || ''} ${row.learner?.last_name || ''}`.trim(),
      learner_phone: row.learner?.student_mobile || null,
      learner_institution: row.learner?.institutions?.name || null,
    }));
  }

  static async getAllEscalations(includeResolved: boolean = false): Promise<HealthEscalation[]> {
    let query = (supabase as any)
      .from('health_escalations')
      .select(`
        *,
        learner:learners_profiles!learner_id(first_name, last_name, student_mobile, institution_id, institutions!institution_id(name)),
        assessment:health_assessments!assessment_id(assessment_type, total_score, severity, completed_at)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!includeResolved) {
      query = query.in('status', ['open', 'contacted', 'in_session']);
    }

    const { data } = await query;
    return (data || []).map((row: any) => ({
      ...row,
      learner_name: `${row.learner?.first_name || ''} ${row.learner?.last_name || ''}`.trim(),
      learner_phone: row.learner?.student_mobile || null,
      learner_institution: row.learner?.institutions?.name || null,
    }));
  }

  static async updateEscalationStatus(
    id: string,
    status: EscalationStatus,
    notes?: string
  ): Promise<void> {
    const update: any = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (notes) update.counselor_notes = notes;
    if (status === 'contacted') update.contacted_at = new Date().toISOString();
    if (status === 'resolved' || status === 'false_positive') update.resolved_at = new Date().toISOString();

    const { error } = await (supabase as any)
      .from('health_escalations')
      .update(update)
      .eq('id', id);

    if (error) throw error;
  }

  // --------------------------------------------------------------------------
  // Counselor Stats
  // --------------------------------------------------------------------------

  static async getCounselorStats(): Promise<{
    open: number;
    contacted: number;
    resolved_today: number;
    total_active: number;
  }> {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await (supabase as any)
      .from('health_escalations')
      .select('status, resolved_at');

    const all = data || [];
    return {
      open: all.filter((e: any) => e.status === 'open').length,
      contacted: all.filter((e: any) => e.status === 'contacted').length,
      resolved_today: all.filter((e: any) =>
        (e.status === 'resolved' || e.status === 'false_positive') &&
        e.resolved_at?.startsWith(today)
      ).length,
      total_active: all.filter((e: any) => ['open', 'contacted', 'in_session'].includes(e.status)).length,
    };
  }
}
