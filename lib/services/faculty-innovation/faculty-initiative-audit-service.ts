// lib/services/faculty-innovation/faculty-initiative-audit-service.ts
// Writes + reads for faculty_initiative_audit_log.
// NOTE: The trigger faculty_initiatives_audit_trigger auto-populates rows on
// INSERT/UPDATE for the interesting columns. This service is used only for:
//   1. Manually writing reason-annotated audit rows (e.g. "rejected: out of scope")
//   2. Reading audit history in the UI timeline
//
// Per spec §12 A8 the table is immutable — no UPDATE/DELETE methods exposed.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { FacultyInitiativeAuditEntry } from '@/types/faculty-innovation';

export class FacultyInitiativeAuditService {
  private static supabase = createClientSupabaseClient();

  /**
   * Append a reason-annotated audit entry (e.g., a Director's reject reason
   * or a withdrawal note). The DB trigger already logs state changes without
   * reasons — this augments those with human context.
   */
  static async logAction(params: {
    initiative_id: string;
    action: FacultyInitiativeAuditEntry['action'];
    reason?: string;
    before_state?: Record<string, unknown>;
    after_state?: Record<string, unknown>;
  }): Promise<FacultyInitiativeAuditEntry> {
    const { data: authData } = await (this.supabase as any).auth.getUser();
    const actor_id = authData?.user?.id ?? null;

    const payload = {
      initiative_id: params.initiative_id,
      action: params.action,
      actor_id,
      before_state: params.before_state ?? null,
      after_state: params.after_state ?? null,
      reason: params.reason ?? null,
    };

    const { data, error } = await (this.supabase as any)
      .from('faculty_initiative_audit_log')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;
    return data as FacultyInitiativeAuditEntry;
  }

  /**
   * Get audit history for an initiative, newest first.
   */
  static async getAuditTrail(
    initiative_id: string,
    limit = 50
  ): Promise<FacultyInitiativeAuditEntry[]> {
    const { data, error } = await (this.supabase as any)
      .from('faculty_initiative_audit_log')
      .select('*')
      .eq('initiative_id', initiative_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data as FacultyInitiativeAuditEntry[]) ?? [];
  }
}
