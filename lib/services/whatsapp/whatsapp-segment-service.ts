// WhatsApp Segment Service
// Audience segmentation for WhatsApp campaigns
// Gap 6 — Builds dynamic queries against admission_leads

import { createClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface SegmentCriterion {
  field: string;
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'greater_than'
    | 'less_than'
    | 'in'
    | 'not_in'
    | 'is_null'
    | 'is_not_null'
    | 'older_than_days'
    | 'newer_than_days';
  value: unknown;
}

export interface Segment {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  criteria: SegmentCriterion[];
  logic: 'AND' | 'OR';
  cached_count: number | null;
  cached_at: string | null;
  last_used_at: string | null;
  use_count: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SegmentPreviewResult {
  count: number;
  sample: Array<{
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
    funnel_stage: string;
    wa_opt_in: boolean;
  }>;
}

export interface ResolvedLead {
  id: string;
  phone: string;
  full_name: string;
}

export interface CreateSegmentParams {
  institution_id: string;
  name: string;
  description?: string;
  criteria: SegmentCriterion[];
  logic?: 'AND' | 'OR';
  created_by: string;
}

export interface UpdateSegmentParams {
  name?: string;
  description?: string;
  criteria?: SegmentCriterion[];
  logic?: 'AND' | 'OR';
  is_active?: boolean;
}

// =============================================================================
// Service
// =============================================================================

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Allowed fields to prevent injection via arbitrary column names
const ALLOWED_FIELDS = new Set([
  'full_name',
  'email',
  'phone',
  'funnel_stage',
  'score',
  'engagement_score',
  'source',
  'interested_programs',
  'last_contacted_at',
  'created_at',
  'wa_opt_in',
  'tags',
  'counselor_id',
]);

export class WhatsAppSegmentService {
  /**
   * Get all segments for an institution
   */
  static async getSegments(institutionId: string, isActive?: boolean): Promise<Segment[]> {
    const supabase = getServiceClient();
    let query = supabase
      .from('wa_audience_segments')
      .select('*')
      .eq('institution_id', institutionId)
      .order('last_used_at', { ascending: false, nullsFirst: false });

    if (isActive !== undefined) {
      query = query.eq('is_active', isActive);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch segments: ${error.message}`);
    return data || [];
  }

  /**
   * Get a single segment by ID
   */
  static async getSegment(segmentId: string): Promise<Segment | null> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('wa_audience_segments')
      .select('*')
      .eq('id', segmentId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch segment: ${error.message}`);
    }
    return data;
  }

  /**
   * Create a new segment
   */
  static async createSegment(params: CreateSegmentParams): Promise<Segment> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('wa_audience_segments')
      .insert({
        institution_id: params.institution_id,
        name: params.name,
        description: params.description || null,
        criteria: params.criteria,
        logic: params.logic || 'AND',
        created_by: params.created_by,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create segment: ${error.message}`);
    return data;
  }

  /**
   * Update a segment
   */
  static async updateSegment(segmentId: string, params: UpdateSegmentParams): Promise<Segment> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('wa_audience_segments')
      .update({
        ...params,
        updated_at: new Date().toISOString(),
      })
      .eq('id', segmentId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update segment: ${error.message}`);
    return data;
  }

  /**
   * Delete a segment
   */
  static async deleteSegment(segmentId: string): Promise<void> {
    const supabase = getServiceClient();
    const { error } = await supabase
      .from('wa_audience_segments')
      .delete()
      .eq('id', segmentId);

    if (error) throw new Error(`Failed to delete segment: ${error.message}`);
  }

  /**
   * Preview a segment — returns count + sample of 10 matching leads
   * ALWAYS includes wa_opt_in = true filter (compliance)
   */
  static async previewSegment(
    institutionId: string,
    criteria: SegmentCriterion[],
    logic: 'AND' | 'OR'
  ): Promise<SegmentPreviewResult> {
    const supabase = getServiceClient();

    // Build count query
    let countQuery = supabase
      .from('admission_leads')
      .select('id', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .eq('wa_opt_in', true);

    countQuery = this.buildQueryFromCriteria(countQuery, criteria, logic);
    const { count, error: countError } = await countQuery;
    if (countError) throw new Error(`Failed to preview segment: ${countError.message}`);

    // Build sample query (first 10)
    let sampleQuery = supabase
      .from('admission_leads')
      .select('id, full_name, phone, email, funnel_stage, wa_opt_in')
      .eq('institution_id', institutionId)
      .eq('wa_opt_in', true)
      .limit(10);

    sampleQuery = this.buildQueryFromCriteria(sampleQuery, criteria, logic);
    const { data: sample, error: sampleError } = await sampleQuery;
    if (sampleError) throw new Error(`Failed to get segment sample: ${sampleError.message}`);

    return {
      count: count || 0,
      sample: sample || [],
    };
  }

  /**
   * Resolve a segment — returns ALL matching lead IDs + phones
   * Updates cached_count, cached_at, use_count, last_used_at
   */
  static async resolveSegment(segmentId: string): Promise<{ leads: ResolvedLead[]; total: number }> {
    const supabase = getServiceClient();

    // Fetch segment definition
    const segment = await this.getSegment(segmentId);
    if (!segment) throw new Error('Segment not found');

    // Build query for all matching leads
    let query = supabase
      .from('admission_leads')
      .select('id, phone, full_name')
      .eq('institution_id', segment.institution_id)
      .eq('wa_opt_in', true);

    query = this.buildQueryFromCriteria(
      query,
      segment.criteria as SegmentCriterion[],
      segment.logic as 'AND' | 'OR'
    );

    const { data: leads, error } = await query;
    if (error) throw new Error(`Failed to resolve segment: ${error.message}`);

    const resolvedLeads = (leads || []).filter((l: ResolvedLead) => l.phone);

    // Update segment usage stats
    await supabase
      .from('wa_audience_segments')
      .update({
        cached_count: resolvedLeads.length,
        cached_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
        use_count: (segment.use_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', segmentId);

    return {
      leads: resolvedLeads,
      total: resolvedLeads.length,
    };
  }

  /**
   * Build Supabase query filters from segment criteria
   * For AND: chain filters directly
   * For OR: build .or() filter string
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static buildQueryFromCriteria(baseQuery: any, criteria: SegmentCriterion[], logic: 'AND' | 'OR'): any {
    if (!criteria || criteria.length === 0) return baseQuery;

    // Validate all fields are allowed
    for (const c of criteria) {
      if (!ALLOWED_FIELDS.has(c.field)) {
        throw new Error(`Invalid field: ${c.field}`);
      }
    }

    if (logic === 'OR') {
      // Build OR filter string for Supabase
      const orParts: string[] = [];
      for (const c of criteria) {
        const part = this.criterionToFilterString(c);
        if (part) orParts.push(part);
      }
      if (orParts.length > 0) {
        baseQuery = baseQuery.or(orParts.join(','));
      }
      return baseQuery;
    }

    // AND logic: chain filters
    for (const c of criteria) {
      baseQuery = this.applyCriterion(baseQuery, c);
    }
    return baseQuery;
  }

  /**
   * Apply a single criterion to a Supabase query (AND chaining)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static applyCriterion(query: any, c: SegmentCriterion): any {
    const now = Date.now();

    switch (c.operator) {
      case 'equals':
        return query.eq(c.field, c.value);
      case 'not_equals':
        return query.neq(c.field, c.value);
      case 'contains':
        return query.ilike(c.field, `%${c.value}%`);
      case 'greater_than':
        return query.gt(c.field, c.value);
      case 'less_than':
        return query.lt(c.field, c.value);
      case 'in':
        return query.in(c.field, c.value as unknown[]);
      case 'not_in':
        return query.not(c.field, 'in', `(${(c.value as unknown[]).join(',')})`);
      case 'is_null':
        return query.is(c.field, null);
      case 'is_not_null':
        return query.not(c.field, 'is', null);
      case 'older_than_days': {
        const cutoff = new Date(now - (c.value as number) * 86400000).toISOString();
        return query.lt(c.field, cutoff);
      }
      case 'newer_than_days': {
        const cutoff = new Date(now - (c.value as number) * 86400000).toISOString();
        return query.gt(c.field, cutoff);
      }
      default:
        return query;
    }
  }

  /**
   * Convert a criterion to a PostgREST filter string for OR logic.
   * Values are sanitized to prevent breaking the comma-separated OR filter.
   */
  private static criterionToFilterString(c: SegmentCriterion): string | null {
    const now = Date.now();
    // Sanitize string values: PostgREST uses commas to separate OR parts,
    // so encode commas in values to prevent filter string injection
    const sanitize = (v: unknown): string => String(v).replace(/,/g, '%2C');

    switch (c.operator) {
      case 'equals':
        return `${c.field}.eq.${sanitize(c.value)}`;
      case 'not_equals':
        return `${c.field}.neq.${sanitize(c.value)}`;
      case 'contains':
        return `${c.field}.ilike.%${sanitize(c.value)}%`;
      case 'greater_than':
        return `${c.field}.gt.${sanitize(c.value)}`;
      case 'less_than':
        return `${c.field}.lt.${sanitize(c.value)}`;
      case 'in':
        return `${c.field}.in.(${(c.value as unknown[]).map(sanitize).join(',')})`;
      case 'not_in':
        return `${c.field}.not.in.(${(c.value as unknown[]).map(sanitize).join(',')})`;
      case 'is_null':
        return `${c.field}.is.null`;
      case 'is_not_null':
        return `${c.field}.not.is.null`;
      case 'older_than_days': {
        const cutoff = new Date(now - (c.value as number) * 86400000).toISOString();
        return `${c.field}.lt.${cutoff}`;
      }
      case 'newer_than_days': {
        const cutoff = new Date(now - (c.value as number) * 86400000).toISOString();
        return `${c.field}.gt.${cutoff}`;
      }
      default:
        return null;
    }
  }
}
