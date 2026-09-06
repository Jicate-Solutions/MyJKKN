// lib/services/accreditation/collaboration-service.ts
// ============================================================================
// CRUD for institution_collaborations — the MoU / Grants register (C6).
// Rows with status <> 'draft' auto-emit quality_evidence_mappings evidence via
// DB trigger (mou/industry_collaboration → NAAC 7.9, grant → NAAC 9.1), so this
// service is plain CRUD: the evidence spine wiring lives entirely in the DB
// (migration 20260726100000_institution_collaborations_evidence_register.sql).
//
// Permission scope: reads need 'accreditation.collaborations.view', writes need
// 'accreditation.collaborations.manage' — both enforced by RLS; the page
// mirrors them for UX. Modeled on grievance-category-service.ts.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

export type CollaborationKind = 'mou' | 'grant' | 'industry_collaboration';
export type CollaborationScope = 'national' | 'international';
export type CollaborationStatus = 'draft' | 'active' | 'expired' | 'terminated';

export interface CollaborationRow {
  id: string;
  kind: CollaborationKind;
  institution_id: string;
  title: string;
  partner_name: string;
  /**
   * The other signatory WHEN IT IS A JKKN COLLEGE. Null for every external
   * partner, who is named in `partner_name` and has no row in `institutions`
   * (whose id is the multi-tenant RLS key). Set ALONGSIDE `partner_name`, never
   * instead of it — the form copies the chosen college's name into
   * `partner_name`, so the NOT NULL column and every existing reader are
   * unaffected. Migration 20260921040000.
   */
  partner_institution_id: string | null;
  scope: CollaborationScope | null;
  signed_on: string;
  valid_till: string | null;
  amount_inr: number | null;
  status: CollaborationStatus;
  document_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CollaborationInput {
  kind: CollaborationKind;
  institution_id: string;
  title: string;
  partner_name: string;
  /** A JKKN college on the other side, or null for an external partner. */
  partner_institution_id?: string | null;
  scope?: CollaborationScope | null;
  signed_on: string;
  valid_till?: string | null;
  amount_inr?: number | null;
  status?: CollaborationStatus;
  document_url?: string | null;
  notes?: string | null;
}

export const COLLABORATION_KIND_LABELS: Record<CollaborationKind, string> = {
  mou: 'MoU',
  grant: 'Grant',
  industry_collaboration: 'Industry Collaboration',
};

export const COLLABORATION_STATUS_LABELS: Record<CollaborationStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  expired: 'Expired',
  terminated: 'Terminated',
};

export class CollaborationService {
  private static supabase = createClientSupabaseClient();

  /**
   * Every record this institution is a party to — the ones it FILED, and the
   * ones another JKKN college filed naming it as the partner.
   *
   * BOTH SIDES, deliberately (Director ruling, 2026-09-21): one agreement, one
   * record, visible to both signatories. Widening the RLS policy alone would
   * not have done it — this query filtered on `institution_id` only, so the
   * partner college was permitted to read a row the page never asked for.
   */
  static async list(institutionId: string): Promise<CollaborationRow[]> {
    const { data, error } = await (this.supabase as any)
      .from('institution_collaborations')
      .select('*')
      .or(`institution_id.eq.${institutionId},partner_institution_id.eq.${institutionId}`)
      .order('signed_on', { ascending: false });
    if (error) throw error;
    return (data ?? []) as CollaborationRow[];
  }

  static async create(input: CollaborationInput): Promise<CollaborationRow> {
    const { data, error } = await (this.supabase as any)
      .from('institution_collaborations')
      .insert({
        kind: input.kind,
        institution_id: input.institution_id,
        title: input.title,
        partner_name: input.partner_name,
        partner_institution_id: input.partner_institution_id ?? null,
        scope: input.scope ?? null,
        signed_on: input.signed_on,
        valid_till: input.valid_till ?? null,
        amount_inr: input.amount_inr ?? null,
        status: input.status ?? 'active',
        document_url: input.document_url ?? null,
        notes: input.notes ?? null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as CollaborationRow;
  }

  static async update(id: string, input: Partial<CollaborationInput>): Promise<CollaborationRow> {
    const { data, error } = await (this.supabase as any)
      .from('institution_collaborations')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as CollaborationRow;
  }

  /**
   * Deleting stays with the FILING college — `ic_delete` was deliberately not
   * widened to the partner (migration 20260921040000). RLS refuses by matching
   * zero rows rather than by raising, and a bare `.delete()` reports no error
   * on zero rows, so without the `.select()` below a partner college would be
   * told a record was deleted that is still there. Say no out loud instead.
   */
  static async delete(id: string): Promise<void> {
    const { data, error } = await (this.supabase as any)
      .from('institution_collaborations')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(
        'Nothing was deleted. A record filed by the partner college can be viewed and edited here, but only the college that filed it can delete it.',
      );
    }
  }

  static async bulkDelete(ids: string[]): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const id of ids) {
      try {
        await this.delete(id);
        success.push(id);
      } catch (err) {
        failed.push({ id, error: (err as Error).message });
      }
    }
    return { success, failed };
  }
}
