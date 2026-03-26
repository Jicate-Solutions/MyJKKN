// lib/services/admission/marketing-leads-database-service.ts
// Service layer for marketing leads database bulk upload and retrieval.
// All heavy queries route through server-side API routes that use the service role
// client, bypassing RLS and avoiding the 8-second PostgREST statement timeout.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  MarketingLeadDatabase,
  MarketingLeadDatabaseFilters,
  MarketingLeadDatabaseListResponse,
  BulkLeadUploadResult,
  UploadBatch,
} from '@/types/admission';

const supabase = createClientSupabaseClient();

// Helper: call the server-side marketing leads API route
async function fetchLeadsAPI(params: Record<string, string>): Promise<Response> {
  const url = new URL('/api/admission/marketing/leads', window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  const response = await fetch(url.toString());
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `API request failed: ${response.status}`);
  }
  return response;
}

export class MarketingLeadsDatabaseService {
  /**
   * Get paginated list of marketing leads with filtering.
   * Routes through server-side API to bypass RLS timeout.
   */
  static async getLeads(
    filters: MarketingLeadDatabaseFilters = {}
  ): Promise<MarketingLeadDatabaseListResponse> {
    const {
      search,
      institution_id,
      district,
      gender,
      page = 1,
      limit = 50,
      sort_by = 'created_at',
      sort_order = 'desc',
    } = filters;

    const params: Record<string, string> = {
      action: 'leads',
      institution_id: institution_id || '',
      page: String(page),
      limit: String(limit),
      sort_by,
      sort_order,
    };
    if (search) params.search = search;
    if (district) params.district = district;
    if (gender) params.gender = gender;

    const response = await fetchLeadsAPI(params);
    return response.json();
  }

  /**
   * Get a single lead by ID.
   * Single-row lookup is fast — keep client-side.
   */
  static async getLeadById(id: string): Promise<MarketingLeadDatabase | null> {
    const { data, error } = await (supabase as any)
      .from('marketing_leads_database')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('[admission/marketing-leads-db] Error fetching lead:', error);
      throw error;
    }

    return data as MarketingLeadDatabase;
  }

  /**
   * Bulk insert parsed lead data from Excel upload.
   * Delegates to server-side API route using the service role client.
   */
  static async bulkInsertLeads(
    leads: Array<Record<string, string>>,
    batchId: string,
    institutionId: string,
    fileName: string,
    userId?: string
  ): Promise<BulkLeadUploadResult> {
    if (!institutionId) {
      throw new Error('Institution ID is required for bulk upload');
    }

    const response = await fetch('/api/admission/marketing/leads/bulk-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads, batchId, institutionId, fileName, userId }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `Upload failed with status ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get distinct districts for filter dropdown.
   * Routes through server-side API to bypass RLS timeout.
   */
  static async getDistinctDistricts(institutionId: string): Promise<string[]> {
    const response = await fetchLeadsAPI({
      action: 'districts',
      institution_id: institutionId,
    });
    return response.json();
  }

  /**
   * Get upload batch history.
   * Routes through server-side API to bypass RLS timeout.
   */
  static async getUploadBatches(institutionId: string): Promise<UploadBatch[]> {
    const response = await fetchLeadsAPI({
      action: 'batches',
      institution_id: institutionId,
    });
    return response.json();
  }

  /**
   * Delete all leads from a specific upload batch.
   */
  static async deleteUploadBatch(batchId: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('marketing_leads_database')
      .delete()
      .eq('upload_batch_id', batchId);

    if (error) {
      console.error('[admission/marketing-leads-db] Error deleting batch:', error);
      throw error;
    }
  }

  /**
   * Get total count of leads for an institution.
   */
  static async getTotalCount(institutionId: string): Promise<number> {
    const { count, error } = await (supabase as any)
      .from('marketing_leads_database')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[admission/marketing-leads-db] Error fetching count:', error);
      return 0;
    }

    return count || 0;
  }

  /**
   * Get statistics for the leads database dashboard.
   * Routes through server-side API to bypass RLS timeout.
   */
  static async getStats(institutionId: string): Promise<{
    totalLeads: number;
    totalDistricts: number;
    totalSchools: number;
    genderBreakdown: { male: number; female: number; other: number };
    totalUploads: number;
  }> {
    const empty = { totalLeads: 0, totalDistricts: 0, totalSchools: 0, genderBreakdown: { male: 0, female: 0, other: 0 }, totalUploads: 0 };

    if (!institutionId) return empty;

    try {
      const response = await fetchLeadsAPI({
        action: 'stats',
        institution_id: institutionId,
      });
      return response.json();
    } catch (error) {
      console.error('[admission/marketing-leads-db] Error fetching stats:', error);
      return empty;
    }
  }
}
