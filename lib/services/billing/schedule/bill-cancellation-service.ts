// Reads over billing_bill_cancellations — the audit row written when an
// approved bill-cancel request voids a bill (see bill-cancel-request-service.ts
// for the request/approve flow). RLS on the table is SELECT-only, so the trail
// cannot be edited by whoever it incriminates.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { BillCancellation } from '@/types/billing-bill-cancellation';

const SELECT_COLUMNS =
  'id, bill_id, institution_id, student_id, reason_code, reason, attachments, ' +
  'bill_snapshot, amount_cancelled, cancelled_by, cancelled_by_name, ' +
  'cancelled_by_email, cancelled_by_role, cancelled_by_is_super_admin, ' +
  'cancelled_at, created_at, request_id';

export class BillCancellationService {
  private static supabase = createClientSupabaseClient();

  /** The cancellation behind one bill, or null if the bill is not cancelled. */
  static async getByBill(billId: string): Promise<BillCancellation | null> {
    const { data, error } = await (this.supabase as any)
      .from('billing_bill_cancellations')
      .select(SELECT_COLUMNS)
      .eq('bill_id', billId)
      .maybeSingle();

    if (error) {
      logger.error('billing/bill-cancel', 'Fetch by bill failed', { billId, error });
      throw new Error(error.message || 'Failed to load cancellation');
    }
    return (data as BillCancellation) ?? null;
  }

  /**
   * Every cancellation for one learner, newest first. Returned as a Map keyed
   * by bill_id so the bills table can look one up per row without an N+1.
   */
  static async getByStudent(studentId: string): Promise<Map<string, BillCancellation>> {
    const { data, error } = await (this.supabase as any)
      .from('billing_bill_cancellations')
      .select(SELECT_COLUMNS)
      .eq('student_id', studentId)
      .order('cancelled_at', { ascending: false });

    if (error) {
      logger.error('billing/bill-cancel', 'Fetch by student failed', { studentId, error });
      throw new Error(error.message || 'Failed to load cancellations');
    }

    const map = new Map<string, BillCancellation>();
    for (const row of (data ?? []) as BillCancellation[]) {
      map.set(row.bill_id, row);
    }
    return map;
  }
}
