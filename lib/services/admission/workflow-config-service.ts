// lib/services/admission/workflow-config-service.ts
// CRUD for institution-specific admission workflow configurations

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { AdmissionWorkflowConfig } from '@/types/admission-workflow-config';

export class WorkflowConfigService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get the active workflow config for an institution + academic year
   */
  static async getActiveConfig(
    institutionId: string,
    academicYear?: string
  ): Promise<AdmissionWorkflowConfig | null> {
    if (!institutionId) return null;

    let query = (this.supabase as any)
      .from('admission_workflow_configs')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('is_active', true);

    if (academicYear) {
      query = query.eq('academic_year', academicYear);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[admission/workflow] Failed to get config:', error);
      return null;
    }

    return data as AdmissionWorkflowConfig | null;
  }

  /**
   * List all configs for an institution
   */
  static async listConfigs(institutionId: string): Promise<AdmissionWorkflowConfig[]> {
    if (!institutionId) return [];

    const { data, error } = await (this.supabase as any)
      .from('admission_workflow_configs')
      .select('*')
      .eq('institution_id', institutionId)
      .order('academic_year', { ascending: false });

    if (error) {
      console.error('[admission/workflow] Failed to list configs:', error);
      return [];
    }

    return (data || []) as AdmissionWorkflowConfig[];
  }

  /**
   * Create or update a workflow config.
   * Uses upsert on (institution_id, config_name) unique constraint —
   * prevents duplicate rows and works for both first-save and re-save flows.
   */
  static async upsertConfig(
    config: Partial<AdmissionWorkflowConfig> & {
      institution_id: string;
      academic_year: string;
      config_name: string;
    }
  ): Promise<AdmissionWorkflowConfig> {
    const payload = {
      ...config,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await (this.supabase as any)
      .from('admission_workflow_configs')
      .upsert(payload, { onConflict: 'institution_id,config_name' })
      .select()
      .single();

    if (error) throw error;
    return data as AdmissionWorkflowConfig;
  }

  /**
   * Delete a workflow config
   */
  static async deleteConfig(configId: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('admission_workflow_configs')
      .delete()
      .eq('id', configId);

    if (error) throw error;
  }
}
