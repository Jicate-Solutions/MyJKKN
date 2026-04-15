import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  AntiRaggingAffidavit,
  CreateAntiRaggingAffidavitDTO,
  AffidavitStatus,
} from '@/types/campus-living';

export class AntiRaggingService {
  // ── List affidavits ───────────────────────────────────────────────
  static async getAffidavits(
    institutionId: string,
    filters?: {
      academic_year_id?: string;
      status?: AffidavitStatus;
      learner_id?: string;
    },
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('anti_ragging_affidavits')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.academic_year_id) query = query.eq('academic_year_id', filters.academic_year_id);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.learner_id) query = query.eq('learner_id', filters.learner_id);

      const from = (page - 1) * pageSize;
      query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/anti-ragging', 'Failed to fetch affidavits', error);
        throw error;
      }
      return { data: data as AntiRaggingAffidavit[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/anti-ragging', 'Unexpected error in getAffidavits', error);
      throw error;
    }
  }

  // ── Single affidavit ──────────────────────────────────────────────
  static async getAffidavit(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('anti_ragging_affidavits')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/anti-ragging', 'Failed to fetch affidavit', error);
        throw error;
      }
      return data as AntiRaggingAffidavit;
    } catch (error) {
      logger.error('campus-living/anti-ragging', 'Unexpected error in getAffidavit', error);
      throw error;
    }
  }

  // ── Get affidavit by learner ──────────────────────────────────────
  static async getAffidavitByLearner(learnerId: string, academicYearId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('anti_ragging_affidavits')
        .select('*')
        .eq('learner_id', learnerId)
        .eq('academic_year_id', academicYearId)
        .maybeSingle();

      if (error) {
        logger.error('campus-living/anti-ragging', 'Failed to fetch affidavit by learner', error);
        throw error;
      }
      return data as AntiRaggingAffidavit | null;
    } catch (error) {
      logger.error('campus-living/anti-ragging', 'Unexpected error in getAffidavitByLearner', error);
      throw error;
    }
  }

  // ── Create affidavit record ───────────────────────────────────────
  static async createAffidavit(payload: CreateAntiRaggingAffidavitDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('anti_ragging_affidavits')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/anti-ragging', 'Failed to create affidavit', error);
        throw error;
      }
      return data as AntiRaggingAffidavit;
    } catch (error) {
      logger.error('campus-living/anti-ragging', 'Unexpected error in createAffidavit', error);
      throw error;
    }
  }

  // ── Bulk create affidavit records ─────────────────────────────────
  static async bulkCreateAffidavits(affidavits: CreateAntiRaggingAffidavitDTO[]) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('anti_ragging_affidavits')
        .insert(affidavits)
        .select();

      if (error) {
        logger.error('campus-living/anti-ragging', 'Failed to bulk create affidavits', error);
        throw error;
      }
      return data as AntiRaggingAffidavit[];
    } catch (error) {
      logger.error('campus-living/anti-ragging', 'Unexpected error in bulkCreateAffidavits', error);
      throw error;
    }
  }

  // ── Update affidavit ──────────────────────────────────────────────
  static async updateAffidavit(id: string, payload: Partial<AntiRaggingAffidavit>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('anti_ragging_affidavits')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/anti-ragging', 'Failed to update affidavit', error);
        throw error;
      }
      return data as AntiRaggingAffidavit;
    } catch (error) {
      logger.error('campus-living/anti-ragging', 'Unexpected error in updateAffidavit', error);
      throw error;
    }
  }

  // ── Delete affidavit ──────────────────────────────────────────────
  static async deleteAffidavit(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('anti_ragging_affidavits')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/anti-ragging', 'Failed to delete affidavit', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/anti-ragging', 'Unexpected error in deleteAffidavit', error);
      throw error;
    }
  }

  // ── Submit student affidavit ──────────────────────────────────────
  static async submitStudentAffidavit(id: string, affidavitUrl: string) {
    try {
      const supabase = createClientSupabaseClient();

      // Determine new status based on parent affidavit
      const { data: current } = await supabase
        .from('anti_ragging_affidavits')
        .select('parent_affidavit_submitted')
        .eq('id', id)
        .single();

      const newStatus: AffidavitStatus = current?.parent_affidavit_submitted ? 'complete' : 'partial';

      const { data, error } = await supabase
        .from('anti_ragging_affidavits')
        .update({
          student_affidavit_submitted: true,
          student_affidavit_date: new Date().toISOString().split('T')[0],
          student_affidavit_url: affidavitUrl,
          status: newStatus,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/anti-ragging', 'Failed to submit student affidavit', error);
        throw error;
      }
      return data as AntiRaggingAffidavit;
    } catch (error) {
      logger.error('campus-living/anti-ragging', 'Unexpected error in submitStudentAffidavit', error);
      throw error;
    }
  }

  // ── Submit parent affidavit ───────────────────────────────────────
  static async submitParentAffidavit(id: string, affidavitUrl: string) {
    try {
      const supabase = createClientSupabaseClient();

      const { data: current } = await supabase
        .from('anti_ragging_affidavits')
        .select('student_affidavit_submitted')
        .eq('id', id)
        .single();

      const newStatus: AffidavitStatus = current?.student_affidavit_submitted ? 'complete' : 'partial';

      const { data, error } = await supabase
        .from('anti_ragging_affidavits')
        .update({
          parent_affidavit_submitted: true,
          parent_affidavit_date: new Date().toISOString().split('T')[0],
          parent_affidavit_url: affidavitUrl,
          status: newStatus,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/anti-ragging', 'Failed to submit parent affidavit', error);
        throw error;
      }
      return data as AntiRaggingAffidavit;
    } catch (error) {
      logger.error('campus-living/anti-ragging', 'Unexpected error in submitParentAffidavit', error);
      throw error;
    }
  }

  // ── Verify affidavit ──────────────────────────────────────────────
  static async verifyAffidavit(id: string, verifiedBy: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('anti_ragging_affidavits')
        .update({
          verified_by: verifiedBy,
          verified_at: new Date().toISOString(),
          status: 'verified' as AffidavitStatus,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/anti-ragging', 'Failed to verify affidavit', error);
        throw error;
      }
      return data as AntiRaggingAffidavit;
    } catch (error) {
      logger.error('campus-living/anti-ragging', 'Unexpected error in verifyAffidavit', error);
      throw error;
    }
  }

  // ── Bulk verify ───────────────────────────────────────────────────
  static async bulkVerify(ids: string[], verifiedBy: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('anti_ragging_affidavits')
        .update({
          verified_by: verifiedBy,
          verified_at: new Date().toISOString(),
          status: 'verified' as AffidavitStatus,
        })
        .in('id', ids)
        .select();

      if (error) {
        logger.error('campus-living/anti-ragging', 'Failed to bulk verify', error);
        throw error;
      }
      return data as AntiRaggingAffidavit[];
    } catch (error) {
      logger.error('campus-living/anti-ragging', 'Unexpected error in bulkVerify', error);
      throw error;
    }
  }

  // ── Compliance status summary ─────────────────────────────────────
  static async getComplianceStatus(institutionId: string, academicYearId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('anti_ragging_affidavits')
        .select('status, student_affidavit_submitted, parent_affidavit_submitted')
        .eq('institution_id', institutionId)
        .eq('academic_year_id', academicYearId);

      if (error) {
        logger.error('campus-living/anti-ragging', 'Failed to fetch compliance status', error);
        throw error;
      }

      const records = data ?? [];
      return {
        total: records.length,
        pending: records.filter((r) => r.status === 'pending').length,
        partial: records.filter((r) => r.status === 'partial').length,
        complete: records.filter((r) => r.status === 'complete').length,
        verified: records.filter((r) => r.status === 'verified').length,
        student_submitted: records.filter((r) => r.student_affidavit_submitted).length,
        parent_submitted: records.filter((r) => r.parent_affidavit_submitted).length,
        compliance_percentage:
          records.length > 0
            ? Math.round(
                (records.filter((r) => r.status === 'verified' || r.status === 'complete').length / records.length) * 100
              )
            : 0,
      };
    } catch (error) {
      logger.error('campus-living/anti-ragging', 'Unexpected error in getComplianceStatus', error);
      throw error;
    }
  }
}
