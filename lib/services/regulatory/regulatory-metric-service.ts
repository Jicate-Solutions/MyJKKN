// ============================================================================
// Regulatory Metric Service
// Handles CRUD operations for regulatory metrics and their values
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client'

export interface RegulatoryMetricFilters {
  criteria_id?: string
  framework_id?: string   // resolved by joining through criteria
  institution_id?: string // used only for metric values
  academic_year?: string
  search?: string
  page?: number
  limit?: number
}

/**
 * DDL: regulatory_metric_values columns:
 *   id, metric_id, institution_id, academic_year, value (text),
 *   numeric_value, is_auto_calculated, is_manually_overridden,
 *   override_reason, source_record_count, source_snapshot,
 *   calculated_at, entered_by, verified_by, verified_at, notes,
 *   created_at, updated_at
 *
 * UNIQUE(metric_id, institution_id, academic_year)
 * NOTE: NO framework_id column on this table!
 */
export interface UpsertMetricValueData {
  metric_id: string
  institution_id: string
  academic_year: string
  value?: string | null          // text column
  numeric_value?: number | null  // numeric column
  notes?: string | null
  is_manually_overridden?: boolean
  override_reason?: string | null
}

export class RegulatoryMetricService {
  // Get fresh client for each request to ensure auth token is current
  private static getSupabase() {
    return createClientSupabaseClient()
  }

  /**
   * Validate UUID format to prevent "invalid input syntax for type uuid" errors
   */
  private static isValidUUID(id: string | undefined | null): boolean {
    if (!id || typeof id !== 'string' || id === 'undefined' || id === 'null' || id.trim() === '') {
      return false
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(id)
  }

  /**
   * Validate ID and throw descriptive error if invalid
   */
  private static validateId(id: string | undefined | null, fieldName: string = 'ID'): void {
    if (!this.isValidUUID(id)) {
      const actualValue = id === undefined ? 'undefined' : id === null ? 'null' : `"${id}"`
      console.error(`[RegulatoryMetricService] Invalid ${fieldName}: ${actualValue}`)
      throw new Error(`Invalid ${fieldName}: ${actualValue}. Expected a valid UUID.`)
    }
  }

  /**
   * Sanitize a search term for safe use in PostgREST .or() filter strings.
   * Escapes commas and parentheses that could break the filter syntax.
   */
  private static sanitizeSearch(term: string): string {
    return term.replace(/[,()]/g, ' ').trim()
  }

  /**
   * Format error for logging (handles Supabase PostgrestError which doesn't serialize properly)
   */
  private static formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message
    }
    if (typeof error === 'object' && error !== null) {
      const e = error as Record<string, unknown>
      if (e.message) return String(e.message)
      if (e.details) return String(e.details)
      if (e.hint) return String(e.hint)
      return JSON.stringify(error)
    }
    return String(error)
  }

  /**
   * Get metrics with filters and pagination
   *
   * DDL: regulatory_metrics has criteria_id (not framework_id).
   * To filter by framework, we join through criteria.
   */
  static async getMetrics(filters: RegulatoryMetricFilters = {}) {
    try {
      if (filters.criteria_id !== undefined) {
        this.validateId(filters.criteria_id, 'criteria_id filter')
      }
      if (filters.framework_id !== undefined) {
        this.validateId(filters.framework_id, 'framework_id filter')
      }

      // If framework_id is provided, resolve to criteria_ids first
      let criteriaIdsForFramework: string[] | null = null
      if (filters.framework_id) {
        const { data: criteriaData, error: criteriaError } = await (this.getSupabase() as any)
          .from('regulatory_criteria')
          .select('id')
          .eq('framework_id', filters.framework_id)

        if (criteriaError) throw criteriaError
        criteriaIdsForFramework = (criteriaData || []).map((c: any) => c.id)

        if (criteriaIdsForFramework!.length === 0) {
          return {
            data: [],
            metadata: {
              total: 0,
              page: filters.page || 1,
              limit: filters.limit || 50,
              totalPages: 0
            }
          }
        }
      }

      let query = (this.getSupabase() as any)
        .from('regulatory_metrics')
        .select(`
          *,
          criteria:regulatory_criteria(id, code, name, framework_id)
        `, { count: 'exact' })

      // Apply filters
      if (filters.criteria_id) {
        query = query.eq('criteria_id', filters.criteria_id)
      }
      if (criteriaIdsForFramework && criteriaIdsForFramework.length > 0) {
        query = query.in('criteria_id', criteriaIdsForFramework)
      }
      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,code.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
        )
      }

      // Pagination
      const page = filters.page || 1
      const limit = filters.limit || 50
      const from = (page - 1) * limit
      query = query
        .range(from, from + limit - 1)
        .order('sort_order', { ascending: true })
        .order('code', { ascending: true })

      const { data, error, count } = await query

      if (error) throw error

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      }
    } catch (error) {
      console.error('[RegulatoryMetricService] Error fetching metrics:', this.formatError(error))
      throw error
    }
  }

  /**
   * Get single metric by ID with criteria info
   */
  static async getMetricById(id: string) {
    try {
      this.validateId(id, 'metric ID')

      const { data, error } = await (this.getSupabase() as any)
        .from('regulatory_metrics')
        .select(`
          *,
          criteria:regulatory_criteria(id, code, name, framework_id)
        `)
        .eq('id', id)
        .maybeSingle()

      if (error) throw error

      if (!data) {
        throw new Error('Metric not found or you do not have permission to view it.')
      }

      return data
    } catch (error) {
      console.error('[RegulatoryMetricService] Error fetching metric:', this.formatError(error))
      throw error
    }
  }

  /**
   * Get all metric values for a framework (institution + academic year)
   *
   * NOTE: metric_values does NOT have framework_id. We must resolve
   * framework -> criteria -> metrics -> metric_values.
   */
  static async getMetricValues(
    frameworkId: string,
    institutionId?: string,
    academicYear?: string
  ) {
    try {
      this.validateId(frameworkId, 'framework ID')
      if (institutionId !== undefined) {
        this.validateId(institutionId, 'institution ID')
      }

      // Step 1: Get all criteria for this framework
      const { data: criteria, error: criteriaError } = await (this.getSupabase() as any)
        .from('regulatory_criteria')
        .select('id')
        .eq('framework_id', frameworkId)

      if (criteriaError) throw criteriaError

      const criteriaIds = (criteria || []).map((c: any) => c.id)
      if (criteriaIds.length === 0) return []

      // Step 2: Get all metric IDs for these criteria
      const { data: metrics, error: metricsError } = await (this.getSupabase() as any)
        .from('regulatory_metrics')
        .select('id')
        .in('criteria_id', criteriaIds)

      if (metricsError) throw metricsError

      const metricIds = (metrics || []).map((m: any) => m.id)
      if (metricIds.length === 0) return []

      // Step 3: Get values for those metrics
      let query = (this.getSupabase() as any)
        .from('regulatory_metric_values')
        .select(`
          *,
          metric:regulatory_metrics(id, code, name, data_type, sort_order),
          entered_by_profile:profiles!entered_by(id, full_name, email),
          verified_by_profile:profiles!verified_by(id, full_name, email)
        `)
        .in('metric_id', metricIds)

      if (institutionId) {
        query = query.eq('institution_id', institutionId)
      }
      if (academicYear) {
        query = query.eq('academic_year', academicYear)
      }

      query = query.order('created_at', { ascending: false })

      const { data, error } = await query

      if (error) throw error

      return data || []
    } catch (error) {
      console.error('[RegulatoryMetricService] Error fetching metric values:', this.formatError(error))
      throw error
    }
  }

  /**
   * Upsert (insert or update) a metric value
   * Uses metric_id + institution_id + academic_year as the unique key
   *
   * DDL columns: metric_id, institution_id, academic_year, value, numeric_value,
   *   is_auto_calculated, is_manually_overridden, override_reason,
   *   source_record_count, source_snapshot, calculated_at, entered_by,
   *   verified_by, verified_at, notes
   */
  static async upsertMetricValue(data: UpsertMetricValueData) {
    try {
      this.validateId(data.metric_id, 'metric ID')
      this.validateId(data.institution_id, 'institution ID')

      // Get current user
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const upsertPayload = {
        metric_id: data.metric_id,
        institution_id: data.institution_id,
        academic_year: data.academic_year,
        value: data.value ?? null,
        numeric_value: data.numeric_value ?? null,
        notes: data.notes ?? null,
        is_manually_overridden: data.is_manually_overridden ?? false,
        override_reason: data.override_reason ?? null,
        entered_by: user.id,
        updated_at: new Date().toISOString()
      }

      const { data: result, error } = await (this.getSupabase() as any)
        .from('regulatory_metric_values')
        .upsert(upsertPayload, {
          onConflict: 'metric_id,institution_id,academic_year'
        })
        .select()
        .single()

      if (error) {
        console.error('[RegulatoryMetricService] Upsert error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        throw error
      }

      return result
    } catch (error) {
      console.error('[RegulatoryMetricService] Error upserting metric value:', this.formatError(error))
      throw error
    }
  }

  /**
   * Get metric value history (audit trail) for a specific metric at an institution
   *
   * DDL: regulatory_metric_value_history columns:
   *   id, metric_value_id, old_value, new_value, change_type,
   *   changed_by, change_reason, source_snapshot, created_at
   *
   * NOTE: History references metric_value_id (not metric_id directly).
   * We need to first find the metric_value, then get its history.
   */
  static async getMetricHistory(
    metricId: string,
    institutionId?: string,
    academicYear?: string
  ) {
    try {
      this.validateId(metricId, 'metric ID')
      if (institutionId !== undefined) {
        this.validateId(institutionId, 'institution ID')
      }

      // Step 1: Find the metric_value record(s) for this metric
      let mvQuery = (this.getSupabase() as any)
        .from('regulatory_metric_values')
        .select('id')
        .eq('metric_id', metricId)

      if (institutionId) {
        mvQuery = mvQuery.eq('institution_id', institutionId)
      }
      if (academicYear) {
        mvQuery = mvQuery.eq('academic_year', academicYear)
      }

      const { data: metricValues, error: mvError } = await mvQuery

      if (mvError) throw mvError

      const metricValueIds = (metricValues || []).map((mv: any) => mv.id)
      if (metricValueIds.length === 0) return []

      // Step 2: Get history for those metric_value records
      const { data, error } = await (this.getSupabase() as any)
        .from('regulatory_metric_value_history')
        .select(`
          *,
          changed_by_profile:profiles!changed_by(id, full_name, email)
        `)
        .in('metric_value_id', metricValueIds)
        .order('created_at', { ascending: false })

      if (error) throw error

      return data || []
    } catch (error) {
      console.error('[RegulatoryMetricService] Error fetching metric history:', this.formatError(error))
      throw error
    }
  }
}
