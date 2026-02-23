// ============================================================================
// Regulatory Framework Service
// Handles CRUD operations for regulatory frameworks (NAAC, NBA, NIRF, etc.)
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client'

export interface RegulatoryFrameworkFilters {
  institution_id?: string
  body?: string        // DDL column: "body" (e.g., NAAC, NIRF, NBA)
  status?: string
  version?: string     // DDL column: "version" (e.g., "2022-rev", "2025")
  framework_type?: string  // accreditation | ranking | compliance | reporting
  search?: string
  page?: number
  limit?: number
}

export class RegulatoryFrameworkService {
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
      console.error(`[RegulatoryFrameworkService] Invalid ${fieldName}: ${actualValue}`)
      throw new Error(`Invalid ${fieldName}: ${actualValue}. Expected a valid UUID.`)
    }
  }

  /**
   * Sanitize a search term for safe use in PostgREST .or() filter strings.
   * Escapes commas and parentheses that could break the filter syntax.
   */
  private static sanitizeSearch(term: string): string {
    // Remove characters that could break PostgREST .or() filter parsing
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
   * Get all frameworks with filters and pagination
   *
   * DDL columns: id, institution_id, name, body, framework_type, institution_type,
   *   version, effective_from, effective_to, year_type, status, total_max_score,
   *   description, submission_portal_url, submission_deadline, code, metadata,
   *   created_by, created_at, updated_at
   */
  static async getFrameworks(filters: RegulatoryFrameworkFilters = {}) {
    try {
      if (filters.institution_id !== undefined) {
        this.validateId(filters.institution_id, 'institution_id filter')
      }

      let query = (this.getSupabase() as any)
        .from('regulatory_frameworks')
        .select('*', { count: 'exact' })

      // Apply filters -- super_admin passes no institution_id to see all
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id)
      }
      if (filters.body) {
        query = query.eq('body', filters.body)
      }
      if (filters.status) {
        query = query.eq('status', filters.status)
      }
      if (filters.version) {
        query = query.eq('version', filters.version)
      }
      if (filters.framework_type) {
        query = query.eq('framework_type', filters.framework_type)
      }
      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,body.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
        )
      }

      // Pagination
      const page = filters.page || 1
      const limit = filters.limit || 20
      const from = (page - 1) * limit
      query = query
        .range(from, from + limit - 1)
        .order('created_at', { ascending: false })

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
      console.error('[RegulatoryFrameworkService] Error fetching frameworks:', this.formatError(error))
      throw error
    }
  }

  /**
   * Get single framework by ID with criteria count
   */
  static async getFrameworkById(id: string) {
    try {
      this.validateId(id, 'framework ID')

      const { data, error } = await (this.getSupabase() as any)
        .from('regulatory_frameworks')
        .select(`
          *,
          criteria:regulatory_criteria(count)
        `)
        .eq('id', id)
        .maybeSingle()

      if (error) throw error

      if (!data) {
        throw new Error('Framework not found or you do not have permission to view it.')
      }

      return data
    } catch (error) {
      console.error('[RegulatoryFrameworkService] Error fetching framework:', this.formatError(error))
      throw error
    }
  }

  /**
   * Get full framework tree: framework + criteria + metrics hierarchy (for tree view)
   */
  static async getFrameworkTree(id: string) {
    try {
      this.validateId(id, 'framework ID')

      // Fetch framework
      const { data: framework, error: frameworkError } = await (this.getSupabase() as any)
        .from('regulatory_frameworks')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (frameworkError) throw frameworkError
      if (!framework) {
        throw new Error('Framework not found or you do not have permission to view it.')
      }

      // Fetch all criteria for this framework
      const { data: criteria, error: criteriaError } = await (this.getSupabase() as any)
        .from('regulatory_criteria')
        .select('*')
        .eq('framework_id', id)
        .order('sort_order', { ascending: true })
        .order('code', { ascending: true })

      if (criteriaError) throw criteriaError

      // Fetch all metrics for these criteria
      const criteriaIds = (criteria || []).map((c: any) => c.id)
      let metrics: any[] = []

      if (criteriaIds.length > 0) {
        const { data: metricsData, error: metricsError } = await (this.getSupabase() as any)
          .from('regulatory_metrics')
          .select('*')
          .in('criteria_id', criteriaIds)
          .order('sort_order', { ascending: true })
          .order('code', { ascending: true })

        if (metricsError) throw metricsError
        metrics = metricsData || []
      }

      // Build tree: attach metrics to their criteria
      const criteriaWithMetrics = (criteria || []).map((criterion: any) => ({
        ...criterion,
        metrics: metrics.filter((m: any) => m.criteria_id === criterion.id)
      }))

      // Build hierarchy: criteria can have parent_criteria_id
      const topLevelCriteria = criteriaWithMetrics.filter((c: any) => !c.parent_criteria_id)
      const childCriteria = criteriaWithMetrics.filter((c: any) => c.parent_criteria_id)

      const attachChildren = (parent: any): any => ({
        ...parent,
        children: childCriteria
          .filter((c: any) => c.parent_criteria_id === parent.id)
          .map(attachChildren)
      })

      const tree = topLevelCriteria.map(attachChildren)

      return {
        ...framework,
        criteria: tree
      }
    } catch (error) {
      console.error('[RegulatoryFrameworkService] Error fetching framework tree:', this.formatError(error))
      throw error
    }
  }

  /**
   * Get framework completeness: % of metrics that have values populated
   *
   * NOTE: regulatory_metric_values does NOT have a framework_id column.
   * We must join through criteria -> metrics -> metric_values.
   */
  static async getFrameworkCompleteness(
    frameworkId: string,
    institutionId?: string,
    academicYear?: string
  ) {
    try {
      this.validateId(frameworkId, 'framework ID')
      if (institutionId !== undefined) {
        this.validateId(institutionId, 'institution ID')
      }

      // Get all criteria for this framework
      const { data: criteria, error: criteriaError } = await (this.getSupabase() as any)
        .from('regulatory_criteria')
        .select('id')
        .eq('framework_id', frameworkId)

      if (criteriaError) throw criteriaError

      const criteriaIds = (criteria || []).map((c: any) => c.id)
      if (criteriaIds.length === 0) {
        return { total_metrics: 0, populated_metrics: 0, completeness_percent: 0 }
      }

      // Get all metric IDs for these criteria
      const { data: metrics, error: metricsError } = await (this.getSupabase() as any)
        .from('regulatory_metrics')
        .select('id')
        .in('criteria_id', criteriaIds)

      if (metricsError) throw metricsError

      const metricIds = (metrics || []).map((m: any) => m.id)
      const totalMetrics = metricIds.length

      if (totalMetrics === 0) {
        return { total_metrics: 0, populated_metrics: 0, completeness_percent: 0 }
      }

      // Count metrics that have values (metric_values has metric_id, institution_id, academic_year)
      let valuesQuery = (this.getSupabase() as any)
        .from('regulatory_metric_values')
        .select('metric_id', { count: 'exact', head: true })
        .in('metric_id', metricIds)

      if (institutionId) {
        valuesQuery = valuesQuery.eq('institution_id', institutionId)
      }
      if (academicYear) {
        valuesQuery = valuesQuery.eq('academic_year', academicYear)
      }

      const { count: populatedMetrics, error: valuesError } = await valuesQuery

      if (valuesError) throw valuesError

      const populated = populatedMetrics || 0
      const completenessPercent = Math.round((populated / totalMetrics) * 100)

      return {
        total_metrics: totalMetrics,
        populated_metrics: populated,
        completeness_percent: completenessPercent
      }
    } catch (error) {
      console.error('[RegulatoryFrameworkService] Error calculating completeness:', this.formatError(error))
      throw error
    }
  }
}
