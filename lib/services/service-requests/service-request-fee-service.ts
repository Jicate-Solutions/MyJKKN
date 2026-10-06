/**
 * Service Request Fee Service
 *
 * A FEE step is an approval step with fee_category_id + fee_amount. Reaching it
 * raises a bill for the requester; the step completes by itself once that bill
 * is paid — online from My Bills or in cash at the receipt counter — and the
 * request moves to the next step. Nobody approves a fee step.
 *
 * All of that is one idempotent reconciliation in Postgres
 * (service_request_sync_fee, migration 20261021000000). This file only calls
 * it. It runs with the service-role client because neither the previous
 * approver nor the requester holds a bill-insert lane; callers authorise the
 * user BEFORE calling in.
 *
 * Nothing here writes to the billing tables directly, and no existing billing
 * function is involved: payment is taken by the ordinary receipt flows.
 *
 * @module services/service-requests/service-request-fee-service
 */

import { createServiceRoleClient } from '@/lib/supabase/server';

export interface ServiceRequestFeeState {
  /** false = this request has no fee step in play and no bill. */
  applicable: boolean;
  /** The request is parked on its fee step, waiting for payment. */
  on_fee_step?: boolean;
  bill_id?: string | null;
  category_name?: string | null;
  amount?: number | null;
  balance?: number | null;
  /** billing_student_bills.status, or 'not_raised' when the bill could not be created. */
  bill_status?: string | null;
  paid_at?: string | null;
  reason?: string | null;
  /** This call raised the bill. */
  raised?: boolean;
  /** This call found the bill paid and moved the request on. */
  advanced?: boolean;
}

export class ServiceRequestFeeService {
  /**
   * Reconcile one request: raise the bill if its fee step has none, move the
   * request on if the bill is paid, otherwise just report. Safe to call
   * repeatedly.
   */
  static async sync(requestId: string, actorId?: string | null): Promise<ServiceRequestFeeState> {
    const db = createServiceRoleClient() as any;
    const { data, error } = await db.rpc('service_request_sync_fee', {
      p_request_id: requestId,
      p_actor: actorId ?? null,
    });
    if (error) {
      throw new Error(`Fee sync failed: ${error.message}`);
    }
    return (data ?? { applicable: false }) as ServiceRequestFeeState;
  }

  /**
   * Same, but never throws — for the approval / submit paths, where the status
   * change has already committed and the fee card self-heals on the next view.
   */
  static async syncQuietly(requestId: string, actorId?: string | null): Promise<void> {
    try {
      await this.sync(requestId, actorId);
    } catch (err) {
      console.error('[service-requests/fee] sync failed:', err);
    }
  }

  /**
   * Move on every request whose fee bill has been paid without anyone opening
   * the request (a cash receipt at the counter). Called before the approvals
   * inbox is read so the next person finds them waiting. Never throws.
   */
  static async sweepPaid(): Promise<void> {
    try {
      const db = createServiceRoleClient() as any;
      const { error } = await db.rpc('service_requests_sync_paid_fees');
      if (error) console.error('[service-requests/fee] sweep failed:', error);
    } catch (err) {
      console.error('[service-requests/fee] sweep failed:', err);
    }
  }
}
