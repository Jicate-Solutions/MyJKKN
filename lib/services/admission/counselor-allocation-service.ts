// lib/services/admission/counselor-allocation-service.ts
//
// Diff-based upsert helpers for the counselor↔institution and counselor↔source
// junction tables that drive Tier-1 / Tier-2 routing in
// fn_auto_assign_counselor_v2.
//
// SCHEMA NOTE: admission_counselor_sources stores source_id (FK to
// admission_lead_sources_master.id), NOT a string source enum. This service
// accepts source_id arrays accordingly. The string enum form on
// admission_leads.source is matched to master rows via slm.key in the routing
// function, not here.
//
// AUTHZ: these methods use the standard client (RLS-enforced). Page-level
// permission gates are the caller's responsibility — every consumer today
// renders inside /admission/counselors/team which already gates on
// isSuperAdmin || isAdmissionGlobalUser.
//
// ATOMICITY: each setX runs delete + insert as separate queries. Sets are
// small (typically <30 rows per counselor). On partial failure the caller
// surfaces an error via the mutation hook and the user retries; no transaction
// wrapper because Supabase JS client doesn't expose multi-statement
// transactions and the no-op-on-success-equal property of diffing means a
// retry of the same set after partial success is still safe.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export class CounselorAllocationService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * Replace the institution allocation set for a counselor.
   * - Deletes rows for institutions removed from the set
   * - Inserts rows for institutions added
   * - No-op for institutions already mapped
   *
   * Idempotent: re-running with the same institutionIds is a no-op.
   */
  static async setCounselorInstitutions(
    counselorId: string,
    institutionIds: string[]
  ): Promise<void> {
    const supabase = this.supabase;

    const { data: existingRows, error: readErr } = await (supabase as any)
      .from('admission_counselor_institutions')
      .select('institution_id')
      .eq('counselor_id', counselorId);

    if (readErr) {
      logger.error(
        'admissions',
        'Error reading existing counselor institutions',
        readErr
      );
      throw new Error(readErr.message);
    }

    const existing = new Set<string>(
      ((existingRows ?? []) as { institution_id: string }[]).map(
        (r) => r.institution_id
      )
    );
    const desired = new Set<string>(institutionIds);

    const toInsert = institutionIds.filter((id) => !existing.has(id));
    const toDelete = Array.from(existing).filter((id) => !desired.has(id));

    if (toDelete.length > 0) {
      const { error: delErr } = await (supabase as any)
        .from('admission_counselor_institutions')
        .delete()
        .eq('counselor_id', counselorId)
        .in('institution_id', toDelete);
      if (delErr) {
        logger.error(
          'admissions',
          'Error deleting counselor institution rows',
          delErr
        );
        throw new Error(delErr.message);
      }
    }

    if (toInsert.length > 0) {
      const payload = toInsert.map((institution_id) => ({
        counselor_id: counselorId,
        institution_id,
      }));
      const { error: insErr } = await (supabase as any)
        .from('admission_counselor_institutions')
        .insert(payload);
      if (insErr) {
        logger.error(
          'admissions',
          'Error inserting counselor institution rows',
          insErr
        );
        throw new Error(insErr.message);
      }
    }
  }

  /**
   * Replace the source-master allocation set for a counselor.
   * Accepts an array of admission_lead_sources_master.id values (NOT enum
   * strings — see schema note at top of file).
   *
   * - Deletes rows for source_ids removed from the set
   * - Inserts rows for source_ids added (with priority_weight=1.0,
   *   max_leads_per_day=NULL, is_paused=FALSE — the standard "active" defaults
   *   used by the existing CounselorSourceService.bulkAttach)
   * - No-op for source_ids already mapped
   *
   * Idempotent: re-running with the same sourceIds is a no-op.
   */
  static async setCounselorSources(
    counselorId: string,
    sourceIds: string[]
  ): Promise<void> {
    const supabase = this.supabase;

    const { data: existingRows, error: readErr } = await (supabase as any)
      .from('admission_counselor_sources')
      .select('source_id')
      .eq('counselor_id', counselorId);

    if (readErr) {
      logger.error(
        'admissions',
        'Error reading existing counselor sources',
        readErr
      );
      throw new Error(readErr.message);
    }

    const existing = new Set<string>(
      ((existingRows ?? []) as { source_id: string }[]).map((r) => r.source_id)
    );
    const desired = new Set<string>(sourceIds);

    const toInsert = sourceIds.filter((id) => !existing.has(id));
    const toDelete = Array.from(existing).filter((id) => !desired.has(id));

    if (toDelete.length > 0) {
      const { error: delErr } = await (supabase as any)
        .from('admission_counselor_sources')
        .delete()
        .eq('counselor_id', counselorId)
        .in('source_id', toDelete);
      if (delErr) {
        logger.error(
          'admissions',
          'Error deleting counselor source rows',
          delErr
        );
        throw new Error(delErr.message);
      }
    }

    if (toInsert.length > 0) {
      const payload = toInsert.map((source_id) => ({
        counselor_id: counselorId,
        source_id,
        priority_weight: 1.0,
        max_leads_per_day: null,
        is_paused: false,
      }));
      const { error: insErr } = await (supabase as any)
        .from('admission_counselor_sources')
        .insert(payload);
      if (insErr) {
        logger.error(
          'admissions',
          'Error inserting counselor source rows',
          insErr
        );
        throw new Error(insErr.message);
      }
    }
  }
}
