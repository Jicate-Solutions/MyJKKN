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

  static async list(institutionId: string): Promise<CollaborationRow[]> {
    const { data, error } = await (this.supabase as any)
      .from('institution_collaborations')
      .select('*')
      .eq('institution_id', institutionId)
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

  static async delete(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('institution_collaborations')
      .delete()
      .eq('id', id);
    if (error) throw error;
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
