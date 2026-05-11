// lib/services/admission/routing-errors-service.ts
// Counselor routing-errors observability service.
//
// Reads from `counselor_routing_errors` (created by migration
// 20260506234138_create_counselor_routing_errors.sql) and from the
// SECURITY DEFINER reader fn `fn_routing_errors_recent`.
//
// Writes are scoped to super_admin "resolve" action only — the routing
// fn itself will write here once the follow-up PR rewrites
// `fn_auto_assign_counselor_v2` with named exception capture.

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface RoutingError {
  id: string;
  occurred_at: string;
  lead_id: string | null;
  institution_id: string | null;
  tier_order: number | null;
  sqlstate: string | null;
  error_message: string;
  context: Record<string, unknown>;
  resulted_in_unassigned: boolean;
  resolved_at: string | null;
  resolved_by?: string | null;
  resolution_notes?: string | null;
}

export class RoutingErrorsService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static supabase: any = createClientSupabaseClient();

  /**
   * Fetch recent routing errors via the SECURITY DEFINER reader fn.
   * `institutionId` undefined ⇒ all institutions (super_admin scope; RLS
   * still scopes institution-bound viewers via the underlying policy).
   */
  static async getRecentErrors(
    institutionId?: string,
    hours: number = 24,
    limit: number = 100
  ): Promise<RoutingError[]> {
    const { data, error } = await this.supabase.rpc('fn_routing_errors_recent', {
      p_institution_id: institutionId ?? null,
      p_hours: hours,
      p_limit: limit,
    });

    if (error) {
      console.error('[admission/routing-errors] Failed to fetch recent errors:', error);
      throw new Error('Failed to fetch routing errors');
    }

    return (data ?? []) as RoutingError[];
  }

  /**
   * Mark a routing error as resolved. RLS enforces super_admin only.
   */
  static async markResolved(errorId: string, notes: string): Promise<void> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();

    const { error } = await this.supabase
      .from('counselor_routing_errors')
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id ?? null,
        resolution_notes: notes,
      })
      .eq('id', errorId);

    if (error) {
      console.error('[admission/routing-errors] Failed to mark resolved:', error);
      throw new Error('Failed to mark routing error as resolved');
    }
  }
}
