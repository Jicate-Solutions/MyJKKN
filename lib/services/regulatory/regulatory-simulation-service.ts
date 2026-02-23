// ============================================================================
// Regulatory Simulation Service
// Handles what-if scenario analysis for regulatory scores
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client'

export interface SimulationFilters {
  framework_id?: string
  institution_id?: string
  page?: number
  limit?: number
}

export interface CreateSimulationData {
  framework_id: string
  institution_id: string
  academic_year: string
  title: string
  description?: string | null
  overrides: SimulationOverride[]
}

export interface SimulationOverride {
  metric_id: string
  original_value: number | null
  simulated_value: number
}

export class RegulatorySimulationService {
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
      console.error(`[RegulatorySimulationService] Invalid ${fieldName}: ${actualValue}`)
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
   * Get simulations for a framework and institution
   */
  static async getSimulations(filters: SimulationFilters = {}) {
    try {
      if (filters.framework_id !== undefined) {
        this.validateId(filters.framework_id, 'framework_id filter')
      }
      if (filters.institution_id !== undefined) {
        this.validateId(filters.institution_id, 'institution_id filter')
      }

      let query = (this.getSupabase() as any)
        .from('regulatory_simulations')
        .select(`
          *,
          framework:regulatory_frameworks(id, body_name, version_year),
          created_by_profile:profiles!created_by(id, full_name, email)
        `, { count: 'exact' })

      if (filters.framework_id) {
        query = query.eq('framework_id', filters.framework_id)
      }
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id)
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
      console.error('[RegulatorySimulationService] Error fetching simulations:', this.formatError(error))
      throw error
    }
  }

  /**
   * Create a what-if simulation with overrides and calculate score delta
   * 1. Fetches current metric values
   * 2. Applies overrides to calculate simulated score
   * 3. Stores the simulation with both original and simulated scores
   */
  static async createSimulation(data: CreateSimulationData) {
    try {
      this.validateId(data.framework_id, 'framework ID')
      this.validateId(data.institution_id, 'institution ID')
      for (const override of data.overrides) {
        this.validateId(override.metric_id, 'override metric ID')
      }

      // Get current user
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      // Get all criteria for the framework
      const { data: criteria, error: criteriaError } = await (this.getSupabase() as any)
        .from('regulatory_criteria')
        .select('id')
        .eq('framework_id', data.framework_id)

      if (criteriaError) throw criteriaError

      const criteriaIds = (criteria || []).map((c: any) => c.id)

      // Get all metrics with weights
      let metrics: any[] = []
      if (criteriaIds.length > 0) {
        const { data: metricsData, error: metricsError } = await (this.getSupabase() as any)
          .from('regulatory_metrics')
          .select('id, weight, max_score')
          .in('criteria_id', criteriaIds)

        if (metricsError) throw metricsError
        metrics = metricsData || []
      }

      // Get current metric values
      const { data: currentValues, error: valuesError } = await (this.getSupabase() as any)
        .from('regulatory_metric_values')
        .select('metric_id, numeric_value')
        .eq('framework_id', data.framework_id)
        .eq('institution_id', data.institution_id)
        .eq('academic_year', data.academic_year)

      if (valuesError) throw valuesError

      // Build value maps
      const currentValueMap = new Map<string, number>()
      for (const v of (currentValues || [])) {
        if (v.numeric_value !== null) {
          currentValueMap.set(v.metric_id, v.numeric_value)
        }
      }

      // Build override map
      const overrideMap = new Map<string, number>()
      for (const override of data.overrides) {
        overrideMap.set(override.metric_id, override.simulated_value)
      }

      // Calculate original score and simulated score
      let originalScore = 0
      let simulatedScore = 0
      let maxPossibleScore = 0

      for (const metric of metrics) {
        const weight = metric.weight || 1
        const maxScore = metric.max_score || 0
        maxPossibleScore += maxScore * weight

        const currentVal = currentValueMap.get(metric.id) || 0
        originalScore += currentVal * weight

        // Use override if available, otherwise use current value
        const simVal = overrideMap.has(metric.id)
          ? overrideMap.get(metric.id)!
          : currentVal
        simulatedScore += simVal * weight
      }

      originalScore = Math.round(originalScore * 100) / 100
      simulatedScore = Math.round(simulatedScore * 100) / 100
      maxPossibleScore = Math.round(maxPossibleScore * 100) / 100
      const scoreDelta = Math.round((simulatedScore - originalScore) * 100) / 100

      // Store the simulation
      const insertPayload = {
        framework_id: data.framework_id,
        institution_id: data.institution_id,
        academic_year: data.academic_year,
        title: data.title,
        description: data.description || null,
        overrides: data.overrides,
        original_score: originalScore,
        simulated_score: simulatedScore,
        max_possible_score: maxPossibleScore,
        score_delta: scoreDelta,
        created_by: user.id
      }

      const { data: result, error } = await (this.getSupabase() as any)
        .from('regulatory_simulations')
        .insert([insertPayload])
        .select()
        .single()

      if (error) {
        console.error('[RegulatorySimulationService] Create error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        throw error
      }

      return result
    } catch (error) {
      console.error('[RegulatorySimulationService] Error creating simulation:', this.formatError(error))
      throw error
    }
  }
}
