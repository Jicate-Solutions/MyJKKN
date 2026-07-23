import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  ProgramOutcome,
  ProgramSpecificOutcome,
  CreateProgramOutcomeDto,
  UpdateProgramOutcomeDto,
  CreateProgramSpecificOutcomeDto,
  UpdateProgramSpecificOutcomeDto,
} from '@/types/obe';

export class ObeOutcomesService {
  private static supabase = createClientSupabaseClient();

  // ── Program Outcomes (POs) ──────────────────────────────────────────────

  static async getProgramOutcomes(programId: string): Promise<ProgramOutcome[]> {
    try {
      const { data, error } = await this.supabase
        .from('obe_program_outcomes')
        .select('*')
        .eq('program_id', programId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('obe/outcomes', 'Error fetching program outcomes', error);
      throw error;
    }
  }

  static async getProgramOutcomeById(id: string): Promise<ProgramOutcome | null> {
    try {
      const { data, error } = await this.supabase
        .from('obe_program_outcomes')
        .select('*')
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      logger.error('obe/outcomes', 'Error fetching PO', error);
      throw error;
    }
  }

  static async createProgramOutcome(
    data: CreateProgramOutcomeDto
  ): Promise<ProgramOutcome> {
    try {
      const { data: po, error } = await this.supabase
        .from('obe_program_outcomes')
        .insert([data])
        .select()
        .single();

      if (error) {
        logger.error('obe/outcomes', 'Database error creating PO', error);
        const enhanced: any = new Error(error.message || 'Failed to create PO');
        enhanced.code = error.code;
        throw enhanced;
      }

      return po;
    } catch (error) {
      logger.error('obe/outcomes', 'Error creating program outcome', error);
      throw error;
    }
  }

  static async updateProgramOutcome(
    id: string,
    updates: UpdateProgramOutcomeDto
  ): Promise<ProgramOutcome> {
    try {
      const { data, error } = await this.supabase
        .from('obe_program_outcomes')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('obe/outcomes', 'Error updating PO', error);
      throw error;
    }
  }

  static async deleteProgramOutcome(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('obe_program_outcomes')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      logger.error('obe/outcomes', 'Error deleting PO', error);
      throw error;
    }
  }

  // ── Program Specific Outcomes (PSOs) ────────────────────────────────────

  static async getProgramSpecificOutcomes(programId: string): Promise<ProgramSpecificOutcome[]> {
    try {
      const { data, error } = await this.supabase
        .from('obe_program_specific_outcomes')
        .select('*')
        .eq('program_id', programId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('obe/outcomes', 'Error fetching program specific outcomes', error);
      throw error;
    }
  }

  static async getProgramSpecificOutcomeById(
    id: string
  ): Promise<ProgramSpecificOutcome | null> {
    try {
      const { data, error } = await this.supabase
        .from('obe_program_specific_outcomes')
        .select('*')
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      logger.error('obe/outcomes', 'Error fetching PSO', error);
      throw error;
    }
  }

  static async createProgramSpecificOutcome(
    data: CreateProgramSpecificOutcomeDto
  ): Promise<ProgramSpecificOutcome> {
    try {
      const { data: pso, error } = await this.supabase
        .from('obe_program_specific_outcomes')
        .insert([data])
        .select()
        .single();

      if (error) {
        logger.error('obe/outcomes', 'Database error creating PSO', error);
        const enhanced: any = new Error(error.message || 'Failed to create PSO');
        enhanced.code = error.code;
        throw enhanced;
      }

      return pso;
    } catch (error) {
      logger.error('obe/outcomes', 'Error creating program specific outcome', error);
      throw error;
    }
  }

  static async updateProgramSpecificOutcome(
    id: string,
    updates: UpdateProgramSpecificOutcomeDto
  ): Promise<ProgramSpecificOutcome> {
    try {
      const { data, error } = await this.supabase
        .from('obe_program_specific_outcomes')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('obe/outcomes', 'Error updating PSO', error);
      throw error;
    }
  }

  static async deleteProgramSpecificOutcome(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('obe_program_specific_outcomes')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      logger.error('obe/outcomes', 'Error deleting PSO', error);
      throw error;
    }
  }
}
