// ============================================================================
// Regulatory Metric Service
// Handles CRUD operations for regulatory metrics and their values
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client'

export interface RegulatoryMetricFilters {
  criteria_id?: string
  framework_id?: string
  institution_id?: string
  academic_year?: string
  search?: string
  page?: number
  limit?: number
}

export interface UpsertMetricValueData {
  metric_id: string
  institution_id: string
  academic_year: string
  framework_id: string
  value: string | number | boolean | null
  numeric_value?: number | null
  text_value?: string | null
  remarks?: string | null
  updated_by?: string
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
   */
  static async getMetrics(filters: RegulatoryMetricFilters = {}) {
    try {
      if (filters.criteria_id !== undefined) {
        this.validateId(filters.criteria_id, 'criteria_id filter')
      }
      if (filters.framework_id !== undefined) {
        this.validateId(filters.framework_id, 'framework_id filter')
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
      if (filters.framework_id) {
        // Filter via criteria's framework_id using a join
        query = query.eq('criteria.framework_id', filters.framework_id)
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
   * Get single metric by ID with current value
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
   * Get all metric values for a framework submission (institution + academic year)
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

      let query = (this.getSupabase() as any)
        .from('regulatory_metric_values')
        .select(`
          *,
          metric:regulatory_metrics(id, code, name, data_type, max_score, weight),
          updated_by_profile:profiles!updated_by(id, full_name, email)
        `)
        .eq('framework_id', frameworkId)

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
   * Triggers history recording via DB trigger
   */
  static async upsertMetricValue(data: UpsertMetricValueData) {
    try {
      this.validateId(data.metric_id, 'metric ID')
      this.validateId(data.institution_id, 'institution ID')
      this.validateId(data.framework_id, 'framework ID')

      // Get current user
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const upsertPayload = {
        metric_id: data.metric_id,
        institution_id: data.institution_id,
        academic_year: data.academic_year,
        framework_id: data.framework_id,
        value: data.value,
        numeric_value: data.numeric_value ?? null,
        text_value: data.text_value ?? null,
        remarks: data.remarks ?? null,
        updated_by: user.id,
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

      let query = (this.getSupabase() as any)
        .from('regulatory_metric_value_history')
        .select(`
          *,
          changed_by_profile:profiles!changed_by(id, full_name, email)
        `)
        .eq('metric_id', metricId)

      if (institutionId) {
        query = query.eq('institution_id', institutionId)
      }
      if (academicYear) {
        query = query.eq('academic_year', academicYear)
      }

      query = query.order('changed_at', { ascending: false })

      const { data, error } = await query

      if (error) throw error

      return data || []
    } catch (error) {
      console.error('[RegulatoryMetricService] Error fetching metric history:', this.formatError(error))
      throw error
    }
  }
}
