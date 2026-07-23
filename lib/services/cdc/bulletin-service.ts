// lib/services/cdc/bulletin-service.ts
// Service layer for CDC External Opportunities Bulletin

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  CdcExternalOpportunity,
  CreateOpportunityDto,
  UpdateOpportunityDto,
  OpportunityFilters,
} from '@/types/cdc/bulletin';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => createClientSupabaseClient();

export class BulletinService {
  static async getOpportunities(filters?: OpportunityFilters): Promise<CdcExternalOpportunity[]> {
    let query = db()
      .from('cdc_external_opportunities')
      .select(`
        *,
        poster:profiles!cdc_external_opportunities_posted_by_fkey(id, full_name, email)
      `)
      .order('posted_at', { ascending: false });

    if (filters?.search) {
      query = query.or(`title.ilike.%${filters.search}%,source_organisation.ilike.%${filters.search}%`);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }

    // Status filter mapped to DB fields
    if (filters?.status === 'active') {
      query = query.eq('is_active', true).is('archived_at', null);
    } else if (filters?.status === 'expired') {
      // deadline in the past, not archived
      query = query.lt('deadline_date', new Date().toISOString().split('T')[0]).is('archived_at', null);
    } else if (filters?.status === 'archived') {
      query = query.not('archived_at', 'is', null);
    }
    // 'all' = no filter on status

    if (filters?.deadline_from) {
      query = query.gte('deadline_date', filters.deadline_from);
    }
    if (filters?.deadline_to) {
      query = query.lte('deadline_date', filters.deadline_to);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[cdc/bulletin] getOpportunities failed:', error);
      throw error;
    }

    return ((data ?? []) as CdcExternalOpportunity[]).map((opp) => ({
      ...opp,
      status: deriveStatus(opp),
    }));
  }

  static async getOpportunity(id: string): Promise<CdcExternalOpportunity | null> {
    const { data, error } = await db()
      .from('cdc_external_opportunities')
      .select(`
        *,
        poster:profiles!cdc_external_opportunities_posted_by_fkey(id, full_name, email)
      `)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.error('[cdc/bulletin] getOpportunity failed:', error);
      throw error;
    }
    if (!data) return null;
    return { ...(data as CdcExternalOpportunity), status: deriveStatus(data as CdcExternalOpportunity) };
  }

  static async createOpportunity(dto: CreateOpportunityDto): Promise<CdcExternalOpportunity> {
    const { data, error } = await db()
      .from('cdc_external_opportunities')
      .insert(dto)
      .select('*')
      .single();
    if (error) {
      console.error('[cdc/bulletin] createOpportunity failed:', error);
      throw error;
    }
    return { ...(data as CdcExternalOpportunity), status: deriveStatus(data as CdcExternalOpportunity) };
  }

  static async updateOpportunity(id: string, dto: UpdateOpportunityDto): Promise<CdcExternalOpportunity> {
    const { data, error } = await db()
      .from('cdc_external_opportunities')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      console.error('[cdc/bulletin] updateOpportunity failed:', error);
      throw error;
    }
    return { ...(data as CdcExternalOpportunity), status: deriveStatus(data as CdcExternalOpportunity) };
  }

  static async archiveOpportunity(id: string): Promise<void> {
    const { error } = await db()
      .from('cdc_external_opportunities')
      .update({ archived_at: new Date().toISOString(), is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error('[cdc/bulletin] archiveOpportunity failed:', error);
      throw error;
    }
  }
}

// Derive a frontend-friendly status from DB fields
function deriveStatus(opp: CdcExternalOpportunity): 'draft' | 'published' | 'expired' {
  if (opp.archived_at) return 'expired';
  if (!opp.is_active) return 'draft';
  if (opp.deadline_date && opp.deadline_date < new Date().toISOString().split('T')[0]) return 'expired';
  return 'published';
}
