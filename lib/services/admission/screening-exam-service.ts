// lib/services/admission/screening-exam-service.ts
// Service for screening_exams table

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface ScreeningExamRow {
  id: string;
  institution_id: string;
  application_id: string;
  exam_type: 'online' | 'offline' | 'third_party';
  exam_name: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'no_show' | 'cancelled' | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  raw_score: number | null;
  max_score: number | null;
  percentage: number | null;
  percentile: number | null;
  cutoff_score: number | null;
  cutoff_met: boolean | null;
  score_breakdown: Record<string, unknown> | null;
  duration_minutes: number | null;
  external_exam_name: string | null;
  external_roll_number: string | null;
  external_score_verified: boolean | null;
  suggested_programs: string[] | null;
  created_at: string | null;
  updated_at: string | null;
  // Joined fields
  admission_applications?: {
    id: string;
    application_number: string | null;
    program_id: string;
    lead_id: string;
    form_data: Record<string, unknown> | null;
    status: string | null;
  } | null;
}

export interface CreateScreeningExamInput {
  institution_id: string;
  application_id: string;
  exam_type: 'online' | 'offline' | 'third_party';
  exam_name?: string;
  scheduled_at?: string;
  max_score?: number;
  cutoff_score?: number;
  duration_minutes?: number;
}

export interface UpdateScreeningExamInput {
  status?: 'scheduled' | 'in_progress' | 'completed' | 'no_show' | 'cancelled';
  raw_score?: number;
  max_score?: number;
  percentage?: number;
  percentile?: number;
  cutoff_score?: number;
  cutoff_met?: boolean;
  score_breakdown?: Record<string, unknown>;
  started_at?: string;
  completed_at?: string;
  external_exam_name?: string;
  external_roll_number?: string;
  external_score_verified?: boolean;
  suggested_programs?: string[];
}

export interface ScreeningExamFilters {
  exam_type?: string;
  status?: string;
  exam_name?: string;
  cutoff_met?: boolean;
}

export class ScreeningExamService {
  private static supabase: any = createClientSupabaseClient();

  /**
   * Fetch all screening exams for an institution
   */
  static async getExams(institutionId: string, filters?: ScreeningExamFilters): Promise<ScreeningExamRow[]> {
    let query = this.supabase
      .from('screening_exams')
      .select(`
        *,
        admission_applications (
          id,
          application_number,
          program_id,
          lead_id,
          form_data,
          status
        )
      `)
      .eq('institution_id', institutionId)
      .order('scheduled_at', { ascending: false });

    if (filters?.exam_type) {
      query = query.eq('exam_type', filters.exam_type);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.exam_name) {
      query = query.eq('exam_name', filters.exam_name);
    }
    if (filters?.cutoff_met !== undefined) {
      query = query.eq('cutoff_met', filters.cutoff_met);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as unknown as ScreeningExamRow[];
  }

  /**
   * Fetch a single screening exam by ID
   */
  static async getExam(examId: string): Promise<ScreeningExamRow | null> {
    const { data, error } = await this.supabase
      .from('screening_exams')
      .select(`
        *,
        admission_applications (
          id,
          application_number,
          program_id,
          lead_id,
          form_data,
          status
        )
      `)
      .eq('id', examId)
      .single();

    if (error) throw error;
    return data as unknown as ScreeningExamRow | null;
  }

  /**
   * Create a new screening exam
   */
  static async createExam(input: CreateScreeningExamInput): Promise<ScreeningExamRow> {
    const { data, error } = await this.supabase
      .from('screening_exams')
      .insert({
        institution_id: input.institution_id,
        application_id: input.application_id,
        exam_type: input.exam_type,
        exam_name: input.exam_name,
        scheduled_at: input.scheduled_at,
        max_score: input.max_score,
        cutoff_score: input.cutoff_score,
        duration_minutes: input.duration_minutes,
        status: 'scheduled',
      })
      .select()
      .single();

    if (error) throw error;
    return data as unknown as ScreeningExamRow;
  }

  /**
   * Update a screening exam
   */
  static async updateExam(examId: string, updates: UpdateScreeningExamInput): Promise<ScreeningExamRow> {
    const { data, error } = await this.supabase
      .from('screening_exams')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', examId)
      .select()
      .single();

    if (error) throw error;
    return data as unknown as ScreeningExamRow;
  }

  /**
   * Get distinct exam names for filtering
   */
  static async getExamNames(institutionId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('screening_exams')
      .select('exam_name')
      .eq('institution_id', institutionId)
      .not('exam_name', 'is', null)
      .order('exam_name');

    if (error) throw error;
    const names = [...new Set((data || []).map(d => d.exam_name).filter(Boolean))] as string[];
    return names;
  }

  /**
   * Get stats for screening exams
   */
  static async getStats(institutionId: string, examName?: string) {
    let query = this.supabase
      .from('screening_exams')
      .select('id, status, raw_score, max_score, percentage, cutoff_met')
      .eq('institution_id', institutionId);

    if (examName) {
      query = query.eq('exam_name', examName);
    }

    const { data, error } = await query;
    if (error) throw error;

    const exams = data || [];
    const completed = exams.filter(e => e.status === 'completed');
    const inProgress = exams.filter(e => e.status === 'in_progress');
    const qualified = exams.filter(e => e.cutoff_met === true);
    const avgScore = completed.length > 0
      ? completed.reduce((sum, e) => sum + (e.percentage || 0), 0) / completed.length
      : 0;

    return {
      total: exams.length,
      completed: completed.length,
      inProgress: inProgress.length,
      qualified: qualified.length,
      avgScore,
    };
  }
}
