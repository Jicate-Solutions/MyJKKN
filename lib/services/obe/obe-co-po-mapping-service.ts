import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { CoPoMapping, CoPsoMapping, CoPoMappingBulkDto, CorrelationLevel } from '@/types/obe';

export class ObeCoPoMappingService {
  private static supabase = createClientSupabaseClient();

  // ── CO-PO Mapping ──────────────────────────────────────────────────────

  static async getCoPoMappings(coId: string): Promise<CoPoMapping[]> {
    try {
      const { data, error } = await this.supabase
        .from('obe_co_po_mapping')
        .select('*')
        .eq('co_id', coId);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('obe/mapping', 'Error fetching CO-PO mappings', error);
      throw error;
    }
  }

  static async getCoPpoMappingsByProgram(programId: string): Promise<CoPoMapping[]> {
    try {
      const { data, error } = await this.supabase
        .from('obe_co_po_mapping')
        .select(`
          id,
          institution_id,
          co_id,
          po_id,
          correlation_level,
          created_at
        `)
        .eq('po_id', (
          await this.supabase
            .from('obe_program_outcomes')
            .select('id')
            .eq('program_id', programId)
        ).data?.map(p => p.id)[0]);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('obe/mapping', 'Error fetching program CO-PO mappings', error);
      throw error;
    }
  }

  static async upsertCoPoMapping(
    coId: string,
    poId: string,
    correlationLevel: CorrelationLevel,
    institutionId: string
  ): Promise<CoPoMapping> {
    try {
      // Delete if level is 0 (no mapping), otherwise upsert
      if (correlationLevel === 0) {
        await this.supabase
          .from('obe_co_po_mapping')
          .delete()
          .eq('co_id', coId)
          .eq('po_id', poId);

        return {
          id: '',
          institution_id: institutionId,
          co_id: coId,
          po_id: poId,
          correlation_level: 0,
          created_at: new Date().toISOString(),
        };
      }

      const { data, error } = await this.supabase
        .from('obe_co_po_mapping')
        .upsert(
          [
            {
              co_id: coId,
              po_id: poId,
              correlation_level: correlationLevel,
              institution_id: institutionId,
            },
          ],
          {
            onConflict: 'co_id,po_id',
          }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('obe/mapping', 'Error upserting CO-PO mapping', error);
      throw error;
    }
  }

  static async bulkUpsertCoPoMappings(
    mappings: Array<CoPoMappingBulkDto & { institution_id: string }>
  ): Promise<CoPoMapping[]> {
    try {
      const { data, error } = await this.supabase
        .from('obe_co_po_mapping')
        .upsert(mappings, {
          onConflict: 'co_id,po_id',
        })
        .select();

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('obe/mapping', 'Error bulk upserting CO-PO mappings', error);
      throw error;
    }
  }

  // ── CO-PSO Mapping ─────────────────────────────────────────────────────

  static async getCoPsoMappings(coId: string): Promise<CoPsoMapping[]> {
    try {
      const { data, error } = await this.supabase
        .from('obe_co_pso_mapping')
        .select('*')
        .eq('co_id', coId);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('obe/mapping', 'Error fetching CO-PSO mappings', error);
      throw error;
    }
  }

  static async upsertCoPsoMapping(
    coId: string,
    psoId: string,
    correlationLevel: CorrelationLevel,
    institutionId: string
  ): Promise<CoPsoMapping> {
    try {
      if (correlationLevel === 0) {
        await this.supabase
          .from('obe_co_pso_mapping')
          .delete()
          .eq('co_id', coId)
          .eq('pso_id', psoId);

        return {
          id: '',
          institution_id: institutionId,
          co_id: coId,
          pso_id: psoId,
          correlation_level: 0,
          created_at: new Date().toISOString(),
        };
      }

      const { data, error } = await this.supabase
        .from('obe_co_pso_mapping')
        .upsert(
          [
            {
              co_id: coId,
              pso_id: psoId,
              correlation_level: correlationLevel,
              institution_id: institutionId,
            },
          ],
          {
            onConflict: 'co_id,pso_id',
          }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('obe/mapping', 'Error upserting CO-PSO mapping', error);
      throw error;
    }
  }

  static async deleteCoPoMapping(coId: string, poId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('obe_co_po_mapping')
        .delete()
        .eq('co_id', coId)
        .eq('po_id', poId);

      if (error) throw error;
    } catch (error) {
      logger.error('obe/mapping', 'Error deleting CO-PO mapping', error);
      throw error;
    }
  }

  static async deleteCoPsoMapping(coId: string, psoId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('obe_co_pso_mapping')
        .delete()
        .eq('co_id', coId)
        .eq('pso_id', psoId);

      if (error) throw error;
    } catch (error) {
      logger.error('obe/mapping', 'Error deleting CO-PSO mapping', error);
      throw error;
    }
  }
}
