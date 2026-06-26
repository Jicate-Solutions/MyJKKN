// lib/services/health/wellness-programs-service.ts
// Service for the Health → Wellness Programs feature.
// Programs + daily content + per-person participation + config (policy) reads + impact.
// Spec: specs/health-wellness-programs-2026-06-15.md
// Created: 2026-06-15
//
// NOTE: new tables aren't in types/supabase.ts yet → (supabase as any) casts,
// matching the existing health-service.ts pattern (avoids TS2589 on untyped tables).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  HealthProgram,
  HealthProgramDay,
  HealthProgramParticipation,
  HealthProgramWithDays,
  WellnessProgramConfig,
  ProgramImpact,
  ProgramResponseData,
  ProgramResponseRow,
  FormSpec,
  FormResponses,
} from '@/types/health-programs';
import { WELLNESS_CONFIG_DEFAULTS } from '@/types/health-programs';

const supabase = createClientSupabaseClient();

export class WellnessProgramsService {
  // --------------------------------------------------------------------------
  // Config (director-editable policies) — read from platform_policies at runtime
  // --------------------------------------------------------------------------

  static async getConfig(): Promise<WellnessProgramConfig> {
    const { data } = await (supabase as any)
      .from('platform_policies')
      .select('policy_key, value')
      .like('policy_key', 'health.programs.%')
      .eq('scope_type', 'global')
      .eq('is_active', true);

    const cfg: WellnessProgramConfig = { ...WELLNESS_CONFIG_DEFAULTS };
    for (const row of data || []) {
      const key = (row.policy_key as string).replace('health.programs.', '');
      const v = row.value; // JSONB already parsed
      switch (key) {
        case 'completion_rule': cfg.completion_rule = v; break;
        case 'quiz_pass_pct': cfg.quiz_pass_pct = Number(v); break;
        case 'streak_grace_hours': cfg.streak_grace_hours = Number(v); break;
        case 'adoption_window_days': cfg.adoption_window_days = Number(v); break;
        case 'realtime_refresh': cfg.realtime_refresh = Boolean(v); break;
        case 'refresh_interval_seconds': cfg.refresh_interval_seconds = Number(v); break;
        case 'useful_prompt': cfg.useful_prompt = String(v); break;
        case 'digest_roles': cfg.digest_roles = Array.isArray(v) ? v : cfg.digest_roles; break;
      }
    }
    return cfg;
  }

  // --------------------------------------------------------------------------
  // Programs (read)
  // --------------------------------------------------------------------------

  static async getActivePrograms(): Promise<HealthProgram[]> {
    // A program is "active" for learners only while it is still within its run
    // window. Filtering on status alone left ended programs (whose status was
    // never flipped to 'completed') showing as live indefinitely — e.g.
    // MindSmile, end_date 2026-06-24, still surfaced days later. Drop any
    // program whose end_date has already passed; keep open-ended ones (no
    // end_date) and those ending today or later.
    const today = new Date().toISOString().split('T')[0];
    const { data } = await (supabase as any)
      .from('health_programs')
      .select('*')
      .in('status', ['active', 'scheduled'])
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order('start_date', { ascending: true });
    return data || [];
  }

  static async getProgramBySlug(slug: string): Promise<HealthProgramWithDays | null> {
    const { data: program } = await (supabase as any)
      .from('health_programs')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (!program) return null;

    const { data: days } = await (supabase as any)
      .from('health_program_days')
      .select('*')
      .eq('program_id', program.id)
      .order('day_number', { ascending: true });

    return { ...program, days: days || [] };
  }

  // --------------------------------------------------------------------------
  // Participation (the FACTS that feed impact). user_id = current profiles.id.
  // RLS enforces user_id = auth.uid() on write.
  // --------------------------------------------------------------------------

  static async getMyParticipation(
    programId: string,
    userId: string
  ): Promise<HealthProgramParticipation[]> {
    const { data } = await (supabase as any)
      .from('health_program_participation')
      .select('*')
      .eq('program_id', programId)
      .eq('user_id', userId);
    return data || [];
  }

  private static async upsertParticipation(
    row: Partial<HealthProgramParticipation> & {
      program_id: string;
      day_id: string;
      user_id: string;
    }
  ): Promise<HealthProgramParticipation> {
    const { data, error } = await (supabase as any)
      .from('health_program_participation')
      .upsert(
        { ...row, updated_at: new Date().toISOString() },
        { onConflict: 'day_id,user_id' }
      )
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async markWatched(args: {
    programId: string;
    dayId: string;
    userId: string;
    learnerId?: string | null;
    completed?: boolean;
  }): Promise<HealthProgramParticipation> {
    return this.upsertParticipation({
      program_id: args.programId,
      day_id: args.dayId,
      user_id: args.userId,
      learner_id: args.learnerId ?? null,
      watched_at: new Date().toISOString(),
      watch_completed: args.completed ?? true,
    });
  }

  static async submitForm(args: {
    programId: string;
    dayId: string;
    userId: string;
    learnerId?: string | null;
    /** Percent of graded fields correct, or null for a pure (ungraded) survey. */
    score: number | null;
    responses: FormResponses;
  }): Promise<HealthProgramParticipation> {
    return this.upsertParticipation({
      program_id: args.programId,
      day_id: args.dayId,
      user_id: args.userId,
      learner_id: args.learnerId ?? null,
      quiz_score: args.score,
      form_responses: args.responses,
    });
  }

  static async rateUsefulness(args: {
    programId: string;
    dayId: string;
    userId: string;
    learnerId?: string | null;
    rating: number;
    reflection?: string | null;
  }): Promise<HealthProgramParticipation> {
    return this.upsertParticipation({
      program_id: args.programId,
      day_id: args.dayId,
      user_id: args.userId,
      learner_id: args.learnerId ?? null,
      usefulness_rating: args.rating,
      reflection_text: args.reflection ?? null,
    });
  }

  // --------------------------------------------------------------------------
  // Impact (manager-only; RPC enforces the permission gate)
  // --------------------------------------------------------------------------

  static async getImpact(programId: string): Promise<ProgramImpact> {
    const { data, error } = await (supabase as any).rpc('fn_health_program_impact', {
      p_program_id: programId,
    });
    if (error) throw error;
    return data as ProgramImpact;
  }

  // --------------------------------------------------------------------------
  // Response-viewer (manager-only via hpp_select). Reads the raw per-field
  // answers + each day's form spec + participant identity. Read-only; touches
  // nothing that feeds quiz_score / impact.
  // --------------------------------------------------------------------------

  static async getProgramResponseData(
    programId: string
  ): Promise<ProgramResponseData> {
    const [programRes, daysRes, responsesRes] = await Promise.all([
      (supabase as any)
        .from('health_programs')
        .select('*')
        .eq('id', programId)
        .maybeSingle(),
      (supabase as any)
        .from('health_program_days')
        .select('*')
        .eq('program_id', programId)
        .order('day_number', { ascending: true }),
      // Left embed on profiles (profile:user_id) — a profile the manager can't
      // read comes back null without dropping the participation row.
      (supabase as any)
        .from('health_program_participation')
        .select(
          'id,user_id,day_id,quiz_score,form_responses,created_at,updated_at,profile:user_id(full_name,email,role)'
        )
        .eq('program_id', programId)
        .not('form_responses', 'is', null)
        .order('created_at', { ascending: false }),
    ]);

    return {
      program: programRes.data ?? null,
      days: daysRes.data ?? [],
      responses: (responsesRes.data ?? []) as ProgramResponseRow[],
    };
  }

  // --------------------------------------------------------------------------
  // Admin CRUD (RLS gates on health.programs.manage)
  // --------------------------------------------------------------------------

  static async listAllPrograms(): Promise<HealthProgram[]> {
    const { data } = await (supabase as any)
      .from('health_programs')
      .select('*')
      .order('created_at', { ascending: false });
    return data || [];
  }

  static async createProgram(input: Partial<HealthProgram>): Promise<HealthProgram> {
    const { data, error } = await (supabase as any)
      .from('health_programs')
      .insert(input)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async updateProgram(
    id: string,
    patch: Partial<HealthProgram>
  ): Promise<HealthProgram> {
    const { data, error } = await (supabase as any)
      .from('health_programs')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async upsertDay(input: Partial<HealthProgramDay> & {
    program_id: string;
    day_number: number;
    title: string;
    quiz?: FormSpec | null;
  }): Promise<HealthProgramDay> {
    const { data, error } = await (supabase as any)
      .from('health_program_days')
      .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: 'program_id,day_number' })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  static async deleteDay(id: string): Promise<void> {
    await (supabase as any).from('health_program_days').delete().eq('id', id);
  }
}
