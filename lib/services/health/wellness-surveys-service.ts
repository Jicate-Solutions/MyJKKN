// lib/services/health/wellness-surveys-service.ts
// Service for Health & Wellness → program-scoped scenario SURVEYS.
// Kept apart from wellness-programs-service.ts: the program flow is unchanged.
// Migration: supabase/migrations/20260928120000_health_wellness_surveys.sql
// Created: 2026-09-28
//
// New tables aren't in types/supabase.ts yet → (supabase as any) casts,
// matching wellness-programs-service.ts.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { HealthProgram } from '@/types/health-programs';
import type {
  HealthSurvey,
  HealthSurveyResponse,
  SurveyAnswers,
  SurveyLanguage,
} from '@/types/health-surveys';

const supabase = createClientSupabaseClient();

/** 22-char URL-safe token for the public (no-login) survey link. */
export function generateSurveyToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export class WellnessSurveysService {
  // --------------------------------------------------------------------------
  // Respondent side
  // --------------------------------------------------------------------------

  /** Programs that currently have at least one active survey (RLS-filtered). */
  static async getProgramsWithActiveSurveys(): Promise<
    (Pick<HealthProgram, 'id' | 'title' | 'theme'> & { surveys: HealthSurvey[] })[]
  > {
    const { data, error } = await (supabase as any)
      .from('health_surveys')
      .select('*, program:health_programs(id, title, theme)')
      .eq('status', 'active')
      .order('created_at', { ascending: true });
    if (error) throw error;

    const byProgram = new Map<
      string,
      Pick<HealthProgram, 'id' | 'title' | 'theme'> & { surveys: HealthSurvey[] }
    >();
    for (const row of data || []) {
      const { program, ...survey } = row;
      if (!program) continue;
      const entry = byProgram.get(program.id) ?? { ...program, surveys: [] };
      entry.surveys.push(survey as HealthSurvey);
      byProgram.set(program.id, entry);
    }
    return Array.from(byProgram.values()).sort((a, b) =>
      a.title.localeCompare(b.title)
    );
  }

  /** 'student' | 'staff' for the signed-in user (fn_health_survey_my_type). */
  static async getMyRespondentType(): Promise<'student' | 'staff' | null> {
    const { data, error } = await (supabase as any).rpc('fn_health_survey_my_type');
    if (error) throw error;
    return (data as 'student' | 'staff' | null) ?? null;
  }

  static async getMyResponse(
    surveyId: string,
    userId: string
  ): Promise<HealthSurveyResponse | null> {
    const { data, error } = await (supabase as any)
      .from('health_survey_responses')
      .select('*')
      .eq('survey_id', surveyId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Server scores + enforces one submission per person (fn_health_survey_submit). */
  static async submit(args: {
    surveyId: string;
    answers: SurveyAnswers;
    language: SurveyLanguage;
  }): Promise<HealthSurveyResponse> {
    const { data, error } = await (supabase as any).rpc('fn_health_survey_submit', {
      p_survey_id: args.surveyId,
      p_answers: args.answers,
      p_language: args.language,
    });
    if (error) throw new Error(error.message || 'Could not submit the survey');
    return data as HealthSurveyResponse;
  }

  // --------------------------------------------------------------------------
  // Admin side (health.programs.manage — enforced by RLS)
  // --------------------------------------------------------------------------

  static async listProgramSurveys(programId: string): Promise<HealthSurvey[]> {
    const { data, error } = await (supabase as any)
      .from('health_surveys')
      .select('*')
      .eq('program_id', programId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  static async getSurvey(surveyId: string): Promise<HealthSurvey | null> {
    const { data, error } = await (supabase as any)
      .from('health_surveys')
      .select('*')
      .eq('id', surveyId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  static async createSurvey(input: Partial<HealthSurvey> & { program_id: string; title: string }): Promise<HealthSurvey> {
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any)
      .from('health_surveys')
      .insert({
        ...input,
        public_token: input.public_token ?? generateSurveyToken(),
        created_by: auth.user?.id ?? null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async updateSurvey(id: string, patch: Partial<HealthSurvey>): Promise<HealthSurvey> {
    const { data, error } = await (supabase as any)
      .from('health_surveys')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async deleteSurvey(id: string): Promise<void> {
    const { error } = await (supabase as any).from('health_surveys').delete().eq('id', id);
    if (error) throw error;
  }

  static async listResponses(surveyId: string): Promise<HealthSurveyResponse[]> {
    // Page through in 1000-row chunks so large surveys aren't truncated.
    const all: HealthSurveyResponse[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await (supabase as any)
        .from('health_survey_responses')
        .select('*')
        .eq('survey_id', surveyId)
        .order('submitted_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return all;
  }
}
