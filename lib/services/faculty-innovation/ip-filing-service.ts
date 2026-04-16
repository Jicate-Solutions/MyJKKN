// lib/services/faculty-innovation/ip-filing-service.ts
// CRUD for ip_filings (confidential IP/patent register).
// RLS: inventor + Director ONLY. Dean/HOD cannot see.
// Follows the same static-class pattern as faculty-initiative-service.ts.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  createIpFilingSchema,
  type CreateIpFilingInput,
  type IpFiling,
  type UpdateIpFilingInput,
} from '@/types/faculty-innovation';

export class IpFilingService {
  private static supabase = createClientSupabaseClient();

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private static normalize(row: any): IpFiling {
    if (!row) throw new Error('Cannot normalize null IP filing row');
    return {
      ...row,
      coinventors: Array.isArray(row.coinventors) ? row.coinventors : [],
      attachment_urls: Array.isArray(row.attachment_urls) ? row.attachment_urls : [],
    } as IpFiling;
  }

  // --------------------------------------------------------------------------
  // LIST + GET
  // --------------------------------------------------------------------------

  /**
   * List IP filings for a specific initiative.
   * RLS ensures only inventor + Director can see these.
   */
  static async listByInitiative(
    initiative_id: string
  ): Promise<IpFiling[]> {
    if (!initiative_id) throw new Error('initiative_id required');

    const { data, error } = await (this.supabase as any)
      .from('ip_filings')
      .select('*')
      .eq('initiative_id', initiative_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return ((data as any[]) ?? []).map((r) => this.normalize(r));
  }

  /**
   * List all IP filings by the current inventor (cross-initiative).
   */
  static async listByInventor(inventor_id: string): Promise<IpFiling[]> {
    if (!inventor_id) throw new Error('inventor_id required');

    const { data, error } = await (this.supabase as any)
      .from('ip_filings')
      .select('*')
      .eq('inventor_id', inventor_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return ((data as any[]) ?? []).map((r) => this.normalize(r));
  }

  static async getById(id: string): Promise<IpFiling | null> {
    if (!id) throw new Error('IP filing id required');

    const { data, error } = await (this.supabase as any)
      .from('ip_filings')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data ? this.normalize(data) : null;
  }

  // --------------------------------------------------------------------------
  // CREATE + UPDATE
  // --------------------------------------------------------------------------

  static async create(input: CreateIpFilingInput): Promise<IpFiling> {
    const parsed = createIpFilingSchema.parse(input);

    const { data: authData } = await (this.supabase as any).auth.getUser();
    const currentUserId = authData?.user?.id ?? null;
    const inventor_id = parsed.inventor_id ?? currentUserId;
    if (!inventor_id) {
      throw new Error('Not authenticated: cannot determine inventor');
    }

    const insert = {
      initiative_id: parsed.initiative_id,
      institution_id: parsed.institution_id,
      inventor_id,
      filing_type: parsed.filing_type,
      filing_status: parsed.filing_status ?? 'draft',
      filing_number: parsed.filing_number ?? null,
      filing_date: parsed.filing_date ?? null,
      grant_date: parsed.grant_date ?? null,
      jurisdiction: parsed.jurisdiction ?? null,
      assignee: parsed.assignee ?? null,
      title: parsed.title.trim(),
      abstract: parsed.abstract ?? null,
      cost_currency: parsed.cost_currency ?? 'INR',
      cost_amount: parsed.cost_amount ?? null,
      naac_criteria: parsed.naac_criteria ?? null,
      naac_metric_code: parsed.naac_metric_code ?? null,
      naac_score_claim: parsed.naac_score_claim ?? null,
      coinventors: parsed.coinventors ?? [],
      attachment_urls: parsed.attachment_urls ?? [],
      created_by: currentUserId,
      updated_by: currentUserId,
    };

    const { data, error } = await (this.supabase as any)
      .from('ip_filings')
      .insert(insert)
      .select('*')
      .single();

    if (error) throw error;
    return this.normalize(data);
  }

  static async update(
    id: string,
    input: UpdateIpFilingInput
  ): Promise<IpFiling> {
    if (!id) throw new Error('IP filing id required');

    const { data: authData } = await (this.supabase as any).auth.getUser();
    const currentUserId = authData?.user?.id ?? null;

    const patch: Record<string, unknown> = {
      updated_by: currentUserId,
    };

    if (input.filing_type !== undefined) patch.filing_type = input.filing_type;
    if (input.filing_status !== undefined) patch.filing_status = input.filing_status;
    if (input.filing_number !== undefined) patch.filing_number = input.filing_number;
    if (input.filing_date !== undefined) patch.filing_date = input.filing_date;
    if (input.grant_date !== undefined) patch.grant_date = input.grant_date;
    if (input.jurisdiction !== undefined) patch.jurisdiction = input.jurisdiction;
    if (input.assignee !== undefined) patch.assignee = input.assignee;
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.abstract !== undefined) patch.abstract = input.abstract;
    if (input.cost_currency !== undefined) patch.cost_currency = input.cost_currency;
    if (input.cost_amount !== undefined) patch.cost_amount = input.cost_amount;
    if (input.naac_criteria !== undefined) patch.naac_criteria = input.naac_criteria;
    if (input.naac_metric_code !== undefined) patch.naac_metric_code = input.naac_metric_code;
    if (input.naac_score_claim !== undefined) patch.naac_score_claim = input.naac_score_claim;
    if (input.coinventors !== undefined) patch.coinventors = input.coinventors;
    if (input.attachment_urls !== undefined) patch.attachment_urls = input.attachment_urls;

    const { data, error } = await (this.supabase as any)
      .from('ip_filings')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return this.normalize(data);
  }

  /**
   * Soft-delete via is_active = false.
   */
  static async softDelete(id: string): Promise<void> {
    if (!id) throw new Error('IP filing id required');
    const { data: authData } = await (this.supabase as any).auth.getUser();
    const currentUserId = authData?.user?.id ?? null;

    const { error } = await (this.supabase as any)
      .from('ip_filings')
      .update({ is_active: false, updated_by: currentUserId })
      .eq('id', id);

    if (error) throw error;
  }
}
