import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelLeaveTypeConfig,
  HostelMaintenanceSlaConfig,
  HostelFeeConfig,
  HostelCurfewException,
  HostelDeposit,
  MaintenanceCategory,
  MaintenancePriority,
  HostelLeaveType,
  RoomType,
  AcStatus,
} from '@/types/campus-living';

export class CampusLivingSettings {
  // ══════════════════════════════════════════════════════════════════
  // Leave Type Configuration
  // ══════════════════════════════════════════════════════════════════

  static async getLeaveTypeConfigs(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_leave_type_config')
        .select('*')
        .eq('institution_id', institutionId)
        .order('leave_type');

      if (error) {
        logger.error('campus-living/settings', 'Failed to fetch leave type configs', error);
        throw error;
      }
      return data as HostelLeaveTypeConfig[];
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in getLeaveTypeConfigs', error);
      throw error;
    }
  }

  static async getLeaveTypeConfig(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_leave_type_config')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/settings', 'Failed to fetch leave type config', error);
        throw error;
      }
      return data as HostelLeaveTypeConfig;
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in getLeaveTypeConfig', error);
      throw error;
    }
  }

  static async createLeaveTypeConfig(payload: Omit<HostelLeaveTypeConfig, 'id' | 'created_at' | 'updated_at'>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_leave_type_config')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/settings', 'Failed to create leave type config', error);
        throw error;
      }
      return data as HostelLeaveTypeConfig;
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in createLeaveTypeConfig', error);
      throw error;
    }
  }

  static async updateLeaveTypeConfig(id: string, payload: Partial<HostelLeaveTypeConfig>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_leave_type_config')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/settings', 'Failed to update leave type config', error);
        throw error;
      }
      return data as HostelLeaveTypeConfig;
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in updateLeaveTypeConfig', error);
      throw error;
    }
  }

  static async deleteLeaveTypeConfig(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_leave_type_config')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/settings', 'Failed to delete leave type config', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in deleteLeaveTypeConfig', error);
      throw error;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // Maintenance SLA Configuration
  // ══════════════════════════════════════════════════════════════════

  static async getSlaConfigs(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_maintenance_sla_config')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('category')
        .order('priority');

      if (error) {
        logger.error('campus-living/settings', 'Failed to fetch SLA configs', error);
        throw error;
      }
      return data as HostelMaintenanceSlaConfig[];
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in getSlaConfigs', error);
      throw error;
    }
  }

  static async getSlaConfig(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_maintenance_sla_config')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/settings', 'Failed to fetch SLA config', error);
        throw error;
      }
      return data as HostelMaintenanceSlaConfig;
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in getSlaConfig', error);
      throw error;
    }
  }

  static async createSlaConfig(payload: Omit<HostelMaintenanceSlaConfig, 'id' | 'created_at' | 'updated_at'>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_maintenance_sla_config')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/settings', 'Failed to create SLA config', error);
        throw error;
      }
      return data as HostelMaintenanceSlaConfig;
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in createSlaConfig', error);
      throw error;
    }
  }

  static async updateSlaConfig(id: string, payload: Partial<HostelMaintenanceSlaConfig>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_maintenance_sla_config')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/settings', 'Failed to update SLA config', error);
        throw error;
      }
      return data as HostelMaintenanceSlaConfig;
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in updateSlaConfig', error);
      throw error;
    }
  }

  static async deleteSlaConfig(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_maintenance_sla_config')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/settings', 'Failed to delete SLA config', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in deleteSlaConfig', error);
      throw error;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // Fee Configuration
  // ══════════════════════════════════════════════════════════════════

  static async getFeeConfigs(institutionId: string, academicYearId?: string) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_fee_config')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('is_active', true);

      if (academicYearId) query = query.eq('academic_year_id', academicYearId);
      query = query.order('room_type').order('ac_status');

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/settings', 'Failed to fetch fee configs', error);
        throw error;
      }
      return data as HostelFeeConfig[];
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in getFeeConfigs', error);
      throw error;
    }
  }

  static async getFeeConfig(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_fee_config')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/settings', 'Failed to fetch fee config', error);
        throw error;
      }
      return data as HostelFeeConfig;
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in getFeeConfig', error);
      throw error;
    }
  }

  static async createFeeConfig(payload: Omit<HostelFeeConfig, 'id' | 'created_at'>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_fee_config')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/settings', 'Failed to create fee config', error);
        throw error;
      }
      return data as HostelFeeConfig;
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in createFeeConfig', error);
      throw error;
    }
  }

  static async updateFeeConfig(id: string, payload: Partial<HostelFeeConfig>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_fee_config')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/settings', 'Failed to update fee config', error);
        throw error;
      }
      return data as HostelFeeConfig;
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in updateFeeConfig', error);
      throw error;
    }
  }

  static async deleteFeeConfig(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_fee_config')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/settings', 'Failed to delete fee config', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in deleteFeeConfig', error);
      throw error;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // Curfew Exceptions
  // ══════════════════════════════════════════════════════════════════

  static async getCurfewExceptions(institutionId: string, activeOnly = true) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_curfew_exceptions')
        .select('*, hostel_blocks(name, code)')
        .eq('institution_id', institutionId);

      if (activeOnly) query = query.eq('is_active', true);
      query = query.order('start_date', { ascending: false });

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/settings', 'Failed to fetch curfew exceptions', error);
        throw error;
      }
      return data as (HostelCurfewException & { hostel_blocks: unknown })[];
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in getCurfewExceptions', error);
      throw error;
    }
  }

  static async getCurfewException(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_curfew_exceptions')
        .select('*, hostel_blocks(name, code)')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/settings', 'Failed to fetch curfew exception', error);
        throw error;
      }
      return data as HostelCurfewException & { hostel_blocks: unknown };
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in getCurfewException', error);
      throw error;
    }
  }

  static async createCurfewException(payload: Omit<HostelCurfewException, 'id' | 'created_at' | 'updated_at'>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_curfew_exceptions')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/settings', 'Failed to create curfew exception', error);
        throw error;
      }
      return data as HostelCurfewException;
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in createCurfewException', error);
      throw error;
    }
  }

  static async updateCurfewException(id: string, payload: Partial<HostelCurfewException>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_curfew_exceptions')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/settings', 'Failed to update curfew exception', error);
        throw error;
      }
      return data as HostelCurfewException;
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in updateCurfewException', error);
      throw error;
    }
  }

  static async deleteCurfewException(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_curfew_exceptions')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/settings', 'Failed to delete curfew exception', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in deleteCurfewException', error);
      throw error;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // Deposits
  // ══════════════════════════════════════════════════════════════════

  static async getDeposits(institutionId: string, learnerId?: string) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_deposits')
        .select('*')
        .eq('institution_id', institutionId);

      if (learnerId) query = query.eq('learner_id', learnerId);
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/settings', 'Failed to fetch deposits', error);
        throw error;
      }
      return data;
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in getDeposits', error);
      throw error;
    }
  }

  static async createDeposit(payload: Omit<HostelDeposit, 'id' | 'created_at'>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_deposits')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/settings', 'Failed to create deposit', error);
        throw error;
      }
      return data;
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in createDeposit', error);
      throw error;
    }
  }

  static async updateDeposit(id: string, payload: Record<string, unknown>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_deposits')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/settings', 'Failed to update deposit', error);
        throw error;
      }
      return data;
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in updateDeposit', error);
      throw error;
    }
  }

  static async deleteDeposit(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_deposits')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/settings', 'Failed to delete deposit', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/settings', 'Unexpected error in deleteDeposit', error);
      throw error;
    }
  }
}
