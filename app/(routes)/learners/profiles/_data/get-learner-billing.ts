/**
 * Server-side data fetching for Learner Billing Summary
 *
 * Queries the mv_student_billing_summary materialized view to get
 * billing overview data for a single learner profile.
 */

import { createClient } from '@/lib/supabase/server';

/**
 * Billing summary from the mv_student_billing_summary materialized view.
 * Maps directly to the view's columns.
 */
export interface LearnerBillingSummary {
  student_id: string;
  student_name: string | null;
  roll_number: string | null;
  total_bills: number;
  total_bill_amount: number;
  total_outstanding: number;
  paid_bills: number;
  unpaid_bills: number;
  partially_paid_bills: number;
  overdue_bills: number;
  total_receipts: number;
  total_receipt_amount: number;
  total_refunds: number;
  total_processed_refunds: number;
  last_payment_date: string | null;
  last_bill_update: string | null;
  summary_generated_at: string | null;
}

/**
 * Get billing summary for a specific learner by their profile ID.
 *
 * Uses the mv_student_billing_summary materialized view for fast lookups.
 * Returns null if no billing data exists for this learner.
 */
export async function getLearnerBilling(learnerId: string): Promise<LearnerBillingSummary | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('mv_student_billing_summary')
    .select('*')
    .eq('student_id', learnerId)
    .maybeSingle();

  if (error) {
    console.error('[getLearnerBilling] Error fetching billing summary:', error);
    // Don't throw - billing data is supplementary, not critical
    return null;
  }

  return data as LearnerBillingSummary | null;
}
