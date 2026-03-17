// lib/services/admission/marketing-leads-database-service.ts
// Service layer for marketing leads database bulk upload and retrieval

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  MarketingLeadDatabase,
  MarketingLeadDatabaseFilters,
  MarketingLeadDatabaseListResponse,
  BulkLeadUploadResult,
  UploadBatch,
} from '@/types/admission';
import {
  normalizeGender,
  cleanMobileNumber,
  cleanPincode,
} from '@/lib/utils/mappings/marketing-leads-excel-mappings';

const supabase = createClientSupabaseClient();

export class MarketingLeadsDatabaseService {
  /**
   * Get paginated list of marketing leads with filtering.
   */
  static async getLeads(
    filters: MarketingLeadDatabaseFilters = {}
  ): Promise<MarketingLeadDatabaseListResponse> {
    const {
      search,
      institution_id,
      district,
      gender,
      school_name,
      upload_batch_id,
      page = 1,
      limit = 50,
      sort_by = 'created_at',
      sort_order = 'desc',
    } = filters;

    let query = (supabase as any)
      .from('marketing_leads_database')
      .select('*', { count: 'exact' });

    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }

    if (search) {
      query = query.or(
        `student_name.ilike.%${search}%,father_name.ilike.%${search}%,mobile_number.ilike.%${search}%,school_name.ilike.%${search}%,district.ilike.%${search}%`
      );
    }

    if (district) {
      query = query.eq('district', district);
    }

    if (gender) {
      query = query.eq('gender', gender);
    }

    if (school_name) {
      query = query.ilike('school_name', `%${school_name}%`);
    }

    if (upload_batch_id) {
      query = query.eq('upload_batch_id', upload_batch_id);
    }

    query = query.order(sort_by, { ascending: sort_order === 'asc' });

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[admission/marketing-leads-db] Error fetching leads:', error);
      throw error;
    }

    return {
      data: (data || []) as MarketingLeadDatabase[],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Get a single lead by ID.
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
   */
  static async bulkInsertLeads(
    leads: Array<Record<string, string>>,
    batchId: string,
    institutionId: string,
    fileName: string,
    userId?: string
  ): Promise<BulkLeadUploadResult> {
    const errors: Array<{ row: number; field?: string; message: string }> = [];
    let inserted = 0;

    if (!institutionId) {
      throw new Error('Institution ID is required for bulk upload');
    }

    // Prepare rows with normalization
    const rows = leads.map((lead, index) => ({
      institution_id: institutionId,
      district: lead.district?.trim() || null,
      sub_district: lead.sub_district?.trim() || null,
      student_name: lead.student_name?.trim() || '',
      father_name: lead.father_name?.trim() || null,
      gender: normalizeGender(lead.gender),
      community: lead.community?.trim() || null,
      mobile_number: cleanMobileNumber(lead.mobile_number) || null,
      group_detail: lead.group_detail?.trim() || null,
      address: lead.address?.trim() || null,
      pincode: cleanPincode(lead.pincode) || null,
      school_name: lead.school_name?.trim() || null,
      upload_batch_id: batchId,
      uploaded_by: userId && userId.length > 0 ? userId : null,
      upload_file_name: fileName,
      created_by: userId && userId.length > 0 ? userId : null,
    }));

    // Insert in batches of 500 to avoid payload limits
    const BATCH_SIZE = 500;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { data, error } = await (supabase as any)
        .from('marketing_leads_database')
        .insert(batch)
        .select('id');

      if (error) {
        console.error(
          `[admission/marketing-leads-db] Batch insert error (rows ${i + 1}-${i + batch.length}):`,
          error
        );
        // Track which rows failed
        for (let j = 0; j < batch.length; j++) {
          errors.push({
            row: i + j + 1,
            message: error.message || 'Database insert failed',
          });
        }
      } else {
        inserted += data?.length || batch.length;
      }
    }

    return {
      success: errors.length === 0,
      total_rows: leads.length,
      valid_rows: leads.length,
      invalid_rows: 0,
      inserted,
      failed: errors.length,
      errors,
      upload_batch_id: batchId,
    };
  }

  /**
   * Get distinct districts for filter dropdown.
   */
  static async getDistinctDistricts(institutionId: string): Promise<string[]> {
    const { data, error } = await (supabase as any)
      .from('marketing_leads_database')
      .select('district')
      .eq('institution_id', institutionId)
      .not('district', 'is', null)
      .order('district');

    if (error) {
      console.error('[admission/marketing-leads-db] Error fetching districts:', error);
      return [];
    }

    const unique = [...new Set((data || []).map((d: any) => d.district).filter(Boolean))];
    return unique as string[];
  }

  /**
   * Get upload batch history.
   */
  static async getUploadBatches(institutionId: string): Promise<UploadBatch[]> {
    const { data, error } = await (supabase as any)
      .rpc('get_marketing_lead_upload_batches', { p_institution_id: institutionId });

    // Fallback if RPC doesn't exist: manual query
    if (error) {
      const { data: rawData, error: rawError } = await (supabase as any)
        .from('marketing_leads_database')
        .select('upload_batch_id, upload_file_name, uploaded_by, created_at')
        .eq('institution_id', institutionId)
        .order('created_at', { ascending: false });

      if (rawError) {
        console.error('[admission/marketing-leads-db] Error fetching batches:', rawError);
        return [];
      }

      // Group by batch
      const batchMap = new Map<string, UploadBatch>();
      for (const row of rawData || []) {
        if (!batchMap.has(row.upload_batch_id)) {
          batchMap.set(row.upload_batch_id, {
            upload_batch_id: row.upload_batch_id,
            upload_file_name: row.upload_file_name,
            uploaded_by: row.uploaded_by,
            created_at: row.created_at,
            total_records: 0,
          });
        }
        const batch = batchMap.get(row.upload_batch_id)!;
        batch.total_records += 1;
      }

      return Array.from(batchMap.values());
    }

    return (data || []) as UploadBatch[];
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
   */
  static async getStats(institutionId: string): Promise<{
    totalLeads: number;
    totalDistricts: number;
    totalSchools: number;
    genderBreakdown: { male: number; female: number; other: number };
    totalUploads: number;
  }> {
    if (!institutionId) {
      return { totalLeads: 0, totalDistricts: 0, totalSchools: 0, genderBreakdown: { male: 0, female: 0, other: 0 }, totalUploads: 0 };
    }

    // Run queries in parallel
    const [countRes, districtRes, schoolRes, genderRes, batchRes] = await Promise.all([
      // Total leads
      (supabase as any)
        .from('marketing_leads_database')
        .select('id', { count: 'exact', head: true })
        .eq('institution_id', institutionId),
      // Distinct districts
      (supabase as any)
        .from('marketing_leads_database')
        .select('district')
        .eq('institution_id', institutionId)
        .not('district', 'is', null),
      // Distinct schools
      (supabase as any)
        .from('marketing_leads_database')
        .select('school_name')
        .eq('institution_id', institutionId)
        .not('school_name', 'is', null),
      // Gender breakdown
      (supabase as any)
        .from('marketing_leads_database')
        .select('gender')
        .eq('institution_id', institutionId)
        .not('gender', 'is', null),
      // Distinct batches
      (supabase as any)
        .from('marketing_leads_database')
        .select('upload_batch_id')
        .eq('institution_id', institutionId),
    ]);

    const totalLeads = countRes.count || 0;

    const uniqueDistricts = new Set((districtRes.data || []).map((d: any) => d.district).filter(Boolean));
    const uniqueSchools = new Set((schoolRes.data || []).map((d: any) => d.school_name).filter(Boolean));
    const uniqueBatches = new Set((batchRes.data || []).map((d: any) => d.upload_batch_id).filter(Boolean));

    const genderData = (genderRes.data || []) as Array<{ gender: string }>;
    const genderBreakdown = {
      male: genderData.filter((g) => g.gender === 'Male').length,
      female: genderData.filter((g) => g.gender === 'Female').length,
      other: genderData.filter((g) => g.gender === 'Other').length,
    };

    return {
      totalLeads,
      totalDistricts: uniqueDistricts.size,
      totalSchools: uniqueSchools.size,
      genderBreakdown,
      totalUploads: uniqueBatches.size,
    };
  }
}
