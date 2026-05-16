import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  ObeRegulationConfig,
  CreateObeRegulationConfigDto,
  UpdateObeRegulationConfigDto,
} from '@/types/obe';

export class ObeRegulationConfigService {
  private static supabase = createClientSupabaseClient();

  static async getByRegulationId(regulationId: string): Promise<ObeRegulationConfig | null> {
    try {
      const { data, error } = await this.supabase
        .from('obe_regulation_config')
        .select('*')
        .eq('regulation_id', regulationId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      logger.error('obe/regulation-config', 'Error fetching config', error);
      throw error;
    }
  }

  static async getByInstitutionAndRegulation(
    institutionId: string,
    regulationId: string
  ): Promise<ObeRegulationConfig | null> {
    try {
      const { data, error } = await this.supabase
        .from('obe_regulation_config')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('regulation_id', regulationId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      logger.error('obe/regulation-config', 'Error fetching config', error);
      throw error;
    }
  }

  static async createOrUpdate(
    regulationId: string,
    data: CreateObeRegulationConfigDto
  ): Promise<ObeRegulationConfig> {
    try {
      // Try to insert, if unique constraint fails, update instead
      const { data: result, error } = await this.supabase
        .from('obe_regulation_config')
        .upsert([{ ...data, regulation_id: regulationId }], {
          onConflict: 'regulation_id',
        })
        .select()
        .single();

      if (error) {
        logger.error('obe/regulation-config', 'Database error upserting config', error);
        const enhanced: any = new Error(error.message || 'Failed to save config');
        enhanced.code = error.code;
        throw enhanced;
      }

      return result;
    } catch (error) {
      logger.error('obe/regulation-config', 'Error saving regulation config', error);
      throw error;
    }
  }

  static async update(
    id: string,
    updates: UpdateObeRegulationConfigDto
  ): Promise<ObeRegulationConfig> {
    try {
      const { data, error } = await this.supabase
        .from('obe_regulation_config')
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
      logger.error('obe/regulation-config', 'Error updating config', error);
      throw error;
    }
  }
}
