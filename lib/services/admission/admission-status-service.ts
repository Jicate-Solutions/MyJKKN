// File: lib/services/admission/admission-status-service.ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import type { AdmissionStatus, AdmissionStatusFormInput, AdmissionStatusScope } from '@/types/admission-status';

export class AdmissionStatusService {
  private static supabase = createClientSupabaseClient();

  static async list(
    scope: AdmissionStatusScope,
    { activeOnly = true }: { activeOnly?: boolean } = {}
  ): Promise<AdmissionStatus[]> {
    let q = this.supabase
      .from('admission_statuses')
      .select('*')
      .eq('scope', scope)
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true });
    if (activeOnly) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw new Error(getErrorMessage(error));
    return data as AdmissionStatus[];
  }

  static async listAll(): Promise<AdmissionStatus[]> {
    const { data, error } = await this.supabase
      .from('admission_statuses')
      .select('*')
      .order('scope', { ascending: true })
      .order('sort_order', { ascending: true });
    if (error) throw new Error(getErrorMessage(error));
    return data as AdmissionStatus[];
  }

  static async get(id: string): Promise<AdmissionStatus | null> {
    const { data, error } = await this.supabase
      .from('admission_statuses').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(getErrorMessage(error));
    return (data as AdmissionStatus) ?? null;
  }

  static async create(input: AdmissionStatusFormInput): Promise<AdmissionStatus> {
    const { data, error } = await this.supabase
      .from('admission_statuses')
      .insert([input])
      .select()
      .single();
    if (error) throw new Error(getErrorMessage(error));
    return data as AdmissionStatus;
  }

  static async update(id: string, patch: Partial<AdmissionStatusFormInput>): Promise<AdmissionStatus> {
    const { data, error } = await this.supabase
      .from('admission_statuses')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(getErrorMessage(error));
    return data as AdmissionStatus;
  }

  /** Soft delete via is_active=false. Hard delete reserved for super_admin via DB. */
  static async archive(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('admission_statuses')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw new Error(getErrorMessage(error));
  }

  static async restore(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('admission_statuses')
      .update({ is_active: true })
      .eq('id', id);
    if (error) throw new Error(getErrorMessage(error));
  }

  static async reorder(scope: AdmissionStatusScope, orderedIds: string[]): Promise<void> {
    const updates = orderedIds.map((id, idx) =>
      this.supabase.from('admission_statuses').update({ sort_order: idx + 1 }).eq('id', id).eq('scope', scope)
    );
    const results = await Promise.all(updates);
    const firstErr = results.find((r) => r.error);
    if (firstErr?.error) throw new Error(getErrorMessage(firstErr.error));
  }
}
