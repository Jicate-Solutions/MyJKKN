// ============================================================================
// Regulatory Submission Service
// Handles submission lifecycle: draft -> in_review -> submitted -> graded
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client'

export interface SubmissionFilters {
  framework_id?: string
  institution_id?: string
  academic_year?: string
  status?: string
  search?: string
  page?: number
  limit?: number
}

export interface CreateSubmissionData {
  framework_id: string
  institution_id: string
  academic_year: string
  title?: string
  notes?: string | null
}

export type SubmissionStatus = 'draft' | 'in_progress' | 'in_review' | 'submitted' | 'graded' | 'archived'

export class RegulatorySubmissionService {
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
      console.error(`[RegulatorySubmissionService] Invalid ${fieldName}: ${actualValue}`)
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
   * Get submissions with filters and pagination
   */
  static async getSubmissions(filters: SubmissionFilters = {}) {
    try {
      if (filters.framework_id !== undefined) {
        this.validateId(filters.framework_id, 'framework_id filter')
      }
      if (filters.institution_id !== undefined) {
        this.validateId(filters.institution_id, 'institution_id filter')
      }

      let query = (this.getSupabase() as any)
        .from('regulatory_submissions')
        .select(`
          *,
          framework:regulatory_frameworks(id, body_name, version_year, description),
          institution:institutions(id, name),
          created_by_profile:profiles!created_by(id, full_name, email)
        `, { count: 'exact' })

      // Apply filters
      if (filters.framework_id) {
        query = query.eq('framework_id', filters.framework_id)
      }
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id)
      }
      if (filters.academic_year) {
        query = query.eq('academic_year', filters.academic_year)
      }
      if (filters.status) {
        query = query.eq('status', filters.status)
      }
      if (filters.search) {
        query = query.or(
          `title.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`
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
      console.error('[RegulatorySubmissionService] Error fetching submissions:', this.formatError(error))
      throw error
    }
  }

  /**
   * Get single submission by ID with completeness stats
   */
  static async getSubmissionById(id: string) {
    try {
      this.validateId(id, 'submission ID')

      const { data, error } = await (this.getSupabase() as any)
        .from('regulatory_submissions')
        .select(`
          *,
          framework:regulatory_frameworks(id, body_name, version_year, description, status),
          institution:institutions(id, name),
          created_by_profile:profiles!created_by(id, full_name, email),
          reviewed_by_profile:profiles!reviewed_by(id, full_name, email)
        `)
        .eq('id', id)
        .maybeSingle()

      if (error) throw error

      if (!data) {
        throw new Error('Submission not found or you do not have permission to view it.')
      }

      // Calculate completeness if we have framework_id and institution_id
      if (data.framework_id && data.institution_id) {
        try {
          // Count total metrics for the framework
          const { data: criteria } = await (this.getSupabase() as any)
            .from('regulatory_criteria')
            .select('id')
            .eq('framework_id', data.framework_id)

          const criteriaIds = (criteria || []).map((c: any) => c.id)

          if (criteriaIds.length > 0) {
            const { count: totalMetrics } = await (this.getSupabase() as any)
              .from('regulatory_metrics')
              .select('id', { count: 'exact', head: true })
              .in('criteria_id', criteriaIds)

            let valuesQuery = (this.getSupabase() as any)
              .from('regulatory_metric_values')
              .select('metric_id', { count: 'exact', head: true })
              .eq('framework_id', data.framework_id)
              .eq('institution_id', data.institution_id)

            if (data.academic_year) {
              valuesQuery = valuesQuery.eq('academic_year', data.academic_year)
            }

            const { count: populatedMetrics } = await valuesQuery

            data._completeness = {
              total_metrics: totalMetrics || 0,
              populated_metrics: populatedMetrics || 0,
              completeness_percent: totalMetrics
                ? Math.round(((populatedMetrics || 0) / totalMetrics) * 100)
                : 0
            }
          }
        } catch (completenessError) {
          // Don't fail the whole request if completeness calc fails
          console.warn('[RegulatorySubmissionService] Completeness calc failed:', this.formatError(completenessError))
          data._completeness = null
        }
      }

      return data
    } catch (error) {
      console.error('[RegulatorySubmissionService] Error fetching submission:', this.formatError(error))
      throw error
    }
  }

  /**
   * Create a new draft submission
   */
  static async createSubmission(data: CreateSubmissionData) {
    try {
      this.validateId(data.framework_id, 'framework ID')
      this.validateId(data.institution_id, 'institution ID')

      // Get current user
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const insertPayload = {
        framework_id: data.framework_id,
        institution_id: data.institution_id,
        academic_year: data.academic_year,
        title: data.title || null,
        notes: data.notes || null,
        status: 'draft' as SubmissionStatus,
        created_by: user.id,
        total_score: null,
        grade: null
      }

      const { data: result, error } = await (this.getSupabase() as any)
        .from('regulatory_submissions')
        .insert([insertPayload])
        .select()
        .single()

      if (error) {
        console.error('[RegulatorySubmissionService] Create error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        throw error
      }

      return result
    } catch (error) {
      console.error('[RegulatorySubmissionService] Error creating submission:', this.formatError(error))
      throw error
    }
  }

  /**
   * Update submission status with workflow transitions
   * Valid transitions: draft -> in_progress -> in_review -> submitted -> graded
   */
  static async updateSubmissionStatus(id: string, status: SubmissionStatus) {
    try {
      this.validateId(id, 'submission ID')

      // Get current user
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const updatePayload: Record<string, any> = {
        status,
        updated_at: new Date().toISOString()
      }

      // Track reviewer and submission dates
      if (status === 'in_review') {
        updatePayload.reviewed_by = user.id
      }
      if (status === 'submitted') {
        updatePayload.submitted_at = new Date().toISOString()
        updatePayload.submitted_by = user.id
      }

      const { data, error } = await (this.getSupabase() as any)
        .from('regulatory_submissions')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      return data
    } catch (error) {
      console.error('[RegulatorySubmissionService] Error updating submission status:', this.formatError(error))
      throw error
    }
  }

  /**
   * Calculate total submission score from metric values
   * Sums (metric_value * metric_weight) for all metrics in the framework
   */
  static async calculateSubmissionScore(id: string) {
    try {
      this.validateId(id, 'submission ID')

      // Get the submission details
      const { data: submission, error: subError } = await (this.getSupabase() as any)
        .from('regulatory_submissions')
        .select('id, framework_id, institution_id, academic_year')
        .eq('id', id)
        .maybeSingle()

      if (subError) throw subError
      if (!submission) throw new Error('Submission not found.')

      // Get all criteria for this framework
      const { data: criteria, error: criteriaError } = await (this.getSupabase() as any)
        .from('regulatory_criteria')
        .select('id')
        .eq('framework_id', submission.framework_id)

      if (criteriaError) throw criteriaError

      const criteriaIds = (criteria || []).map((c: any) => c.id)
      if (criteriaIds.length === 0) {
        return { total_score: 0, max_possible_score: 0, grade: null }
      }

      // Get all metrics with their weights and max scores
      const { data: metrics, error: metricsError } = await (this.getSupabase() as any)
        .from('regulatory_metrics')
        .select('id, weight, max_score')
        .in('criteria_id', criteriaIds)

      if (metricsError) throw metricsError

      if (!metrics || metrics.length === 0) {
        return { total_score: 0, max_possible_score: 0, grade: null }
      }

      // Get all metric values for this submission
      let valuesQuery = (this.getSupabase() as any)
        .from('regulatory_metric_values')
        .select('metric_id, numeric_value')
        .eq('framework_id', submission.framework_id)
        .eq('institution_id', submission.institution_id)

      if (submission.academic_year) {
        valuesQuery = valuesQuery.eq('academic_year', submission.academic_year)
      }

      const { data: values, error: valuesError } = await valuesQuery

      if (valuesError) throw valuesError

      // Build a map of metric_id -> numeric_value
      const valueMap = new Map<string, number>()
      for (const v of (values || [])) {
        if (v.numeric_value !== null && v.numeric_value !== undefined) {
          valueMap.set(v.metric_id, v.numeric_value)
        }
      }

      // Calculate weighted score
      let totalScore = 0
      let maxPossibleScore = 0

      for (const metric of metrics) {
        const weight = metric.weight || 1
        const maxScore = metric.max_score || 0
        maxPossibleScore += maxScore * weight

        const value = valueMap.get(metric.id)
        if (value !== undefined) {
          totalScore += value * weight
        }
      }

      // Round to 2 decimal places
      totalScore = Math.round(totalScore * 100) / 100
      maxPossibleScore = Math.round(maxPossibleScore * 100) / 100

      // Determine grade (NAAC-style: A++, A+, A, B++, B+, B, C, D)
      const percentage = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0
      let grade: string | null = null
      if (percentage >= 91) grade = 'A++'
      else if (percentage >= 81) grade = 'A+'
      else if (percentage >= 71) grade = 'A'
      else if (percentage >= 61) grade = 'B++'
      else if (percentage >= 56) grade = 'B+'
      else if (percentage >= 51) grade = 'B'
      else if (percentage >= 41) grade = 'C'
      else if (percentage > 0) grade = 'D'

      // Update submission with calculated score
      const { error: updateError } = await (this.getSupabase() as any)
        .from('regulatory_submissions')
        .update({
          total_score: totalScore,
          max_possible_score: maxPossibleScore,
          grade,
          score_calculated_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)

      if (updateError) throw updateError

      return {
        total_score: totalScore,
        max_possible_score: maxPossibleScore,
        percentage: Math.round(percentage * 100) / 100,
        grade
      }
    } catch (error) {
      console.error('[RegulatorySubmissionService] Error calculating score:', this.formatError(error))
      throw error
    }
  }
}
