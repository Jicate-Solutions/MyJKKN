import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MessBillingPeriod,
  MessStudentBilling,
  MessBillingStatus,
  PaymentStatus,
} from '@/types/campus-living';

export class MessBillingService {
  // ── List billing periods ──────────────────────────────────────────
  static async getBillingPeriods(
    institutionId: string,
    filters?: { caterer_id?: string; status?: MessBillingStatus },
    page = 1,
    pageSize = 20
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_billing_periods')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (filters?.caterer_id) query = query.eq('caterer_id', filters.caterer_id);
      if (filters?.status) query = query.eq('status', filters.status);

      const from = (page - 1) * pageSize;
      query = query.order('start_date', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/mess-billing', 'Failed to fetch billing periods', error);
        throw error;
      }
      return { data: data as MessBillingPeriod[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/mess-billing', 'Unexpected error in getBillingPeriods', error);
      throw error;
    }
  }

  // ── Single billing period ─────────────────────────────────────────
  static async getBillingPeriod(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_billing_periods')
        .select('*, mess_student_billing(*)')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/mess-billing', 'Failed to fetch billing period', error);
        throw error;
      }
      return data as MessBillingPeriod & { mess_student_billing: MessStudentBilling[] };
    } catch (error) {
      logger.error('campus-living/mess-billing', 'Unexpected error in getBillingPeriod', error);
      throw error;
    }
  }

  // ── Create billing period ─────────────────────────────────────────
  static async createBillingPeriod(payload: Omit<MessBillingPeriod, 'id' | 'created_at'>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_billing_periods')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/mess-billing', 'Failed to create billing period', error);
        throw error;
      }
      return data as MessBillingPeriod;
    } catch (error) {
      logger.error('campus-living/mess-billing', 'Unexpected error in createBillingPeriod', error);
      throw error;
    }
  }

  // ── Update billing period ─────────────────────────────────────────
  static async updateBillingPeriod(id: string, payload: Partial<MessBillingPeriod>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_billing_periods')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/mess-billing', 'Failed to update billing period', error);
        throw error;
      }
      return data as MessBillingPeriod;
    } catch (error) {
      logger.error('campus-living/mess-billing', 'Unexpected error in updateBillingPeriod', error);
      throw error;
    }
  }

  // ── Close billing period ──────────────────────────────────────────
  static async closeBillingPeriod(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_billing_periods')
        .update({ status: 'closed' as MessBillingStatus })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/mess-billing', 'Failed to close billing period', error);
        throw error;
      }
      return data as MessBillingPeriod;
    } catch (error) {
      logger.error('campus-living/mess-billing', 'Unexpected error in closeBillingPeriod', error);
      throw error;
    }
  }

  // ── Delete billing period ─────────────────────────────────────────
  static async deleteBillingPeriod(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('mess_billing_periods')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/mess-billing', 'Failed to delete billing period', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/mess-billing', 'Unexpected error in deleteBillingPeriod', error);
      throw error;
    }
  }

  // ── Student billing records for a period ──────────────────────────
  static async getStudentBillings(
    billingPeriodId: string,
    filters?: { payment_status?: PaymentStatus; learner_id?: string },
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_student_billing')
        .select('*', { count: 'exact' })
        .eq('billing_period_id', billingPeriodId);

      if (filters?.payment_status) query = query.eq('payment_status', filters.payment_status);
      if (filters?.learner_id) query = query.eq('learner_id', filters.learner_id);

      const from = (page - 1) * pageSize;
      query = query.order('net_amount', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/mess-billing', 'Failed to fetch student billings', error);
        throw error;
      }
      return { data: data as MessStudentBilling[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/mess-billing', 'Unexpected error in getStudentBillings', error);
      throw error;
    }
  }

  // ── Get billing for a specific learner ────────────────────────────
  static async getLearnerBilling(learnerId: string, billingPeriodId?: string) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_student_billing')
        .select('*, mess_billing_periods(*)')
        .eq('learner_id', learnerId);

      if (billingPeriodId) query = query.eq('billing_period_id', billingPeriodId);
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/mess-billing', 'Failed to fetch learner billing', error);
        throw error;
      }
      return data as (MessStudentBilling & { mess_billing_periods: MessBillingPeriod })[];
    } catch (error) {
      logger.error('campus-living/mess-billing', 'Unexpected error in getLearnerBilling', error);
      throw error;
    }
  }

  // ── Generate student billing for a period ─────────────────────────
  static async generateStudentBilling(
    billingPeriodId: string,
    billings: Omit<MessStudentBilling, 'id' | 'created_at'>[]
  ) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_student_billing')
        .insert(billings)
        .select();

      if (error) {
        logger.error('campus-living/mess-billing', 'Failed to generate student billing', error);
        throw error;
      }
      return data as MessStudentBilling[];
    } catch (error) {
      logger.error('campus-living/mess-billing', 'Unexpected error in generateStudentBilling', error);
      throw error;
    }
  }

  // ── Update student billing ────────────────────────────────────────
  static async updateStudentBilling(id: string, payload: Partial<MessStudentBilling>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_student_billing')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/mess-billing', 'Failed to update student billing', error);
        throw error;
      }
      return data as MessStudentBilling;
    } catch (error) {
      logger.error('campus-living/mess-billing', 'Unexpected error in updateStudentBilling', error);
      throw error;
    }
  }

  // ── Calculate rebate for a learner ────────────────────────────────
  static async calculateRebate(
    learnerId: string,
    billingPeriodId: string,
    baseRatePerDay: number,
    minAbsentDaysForRebate = 3
  ) {
    try {
      const supabase = createClientSupabaseClient();

      // Get billing period dates
      const { data: period, error: periodError } = await supabase
        .from('mess_billing_periods')
        .select('start_date, end_date, total_days')
        .eq('id', billingPeriodId)
        .single();

      if (periodError) throw periodError;

      // Count meal records for the learner in the period
      const { count: mealCount, error: mealError } = await supabase
        .from('mess_meal_records')
        .select('*', { count: 'exact', head: true })
        .eq('learner_id', learnerId)
        .gte('date', period.start_date)
        .lte('date', period.end_date)
        .eq('consumed', true);

      if (mealError) throw mealError;

      const presentDays = mealCount ?? 0;
      const absentDays = period.total_days - presentDays;
      const rebateEligibleDays = Math.max(0, absentDays - minAbsentDaysForRebate);
      const grossAmount = period.total_days * baseRatePerDay;
      const rebateAmount = rebateEligibleDays * baseRatePerDay;
      const netAmount = grossAmount - rebateAmount;

      return {
        total_days: period.total_days,
        present_days: presentDays,
        absent_days: absentDays,
        rebate_eligible_days: rebateEligibleDays,
        gross_amount: grossAmount,
        rebate_amount: rebateAmount,
        net_amount: netAmount,
      };
    } catch (error) {
      logger.error('campus-living/mess-billing', 'Unexpected error in calculateRebate', error);
      throw error;
    }
  }

  // ── Billing summary for a period ──────────────────────────────────
  static async getBillingSummary(billingPeriodId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_student_billing')
        .select('net_amount, rebate_amount, extra_meal_charges, payment_status')
        .eq('billing_period_id', billingPeriodId);

      if (error) {
        logger.error('campus-living/mess-billing', 'Failed to fetch billing summary', error);
        throw error;
      }

      const records = data ?? [];
      return {
        total_students: records.length,
        total_billed: records.reduce((s, r) => s + r.net_amount, 0),
        total_rebate: records.reduce((s, r) => s + r.rebate_amount, 0),
        total_extras: records.reduce((s, r) => s + r.extra_meal_charges, 0),
        paid: records.filter((r) => r.payment_status === 'paid').length,
        pending: records.filter((r) => r.payment_status === 'pending').length,
        partial: records.filter((r) => r.payment_status === 'partial').length,
        overdue: records.filter((r) => r.payment_status === 'overdue').length,
      };
    } catch (error) {
      logger.error('campus-living/mess-billing', 'Unexpected error in getBillingSummary', error);
      throw error;
    }
  }
}
