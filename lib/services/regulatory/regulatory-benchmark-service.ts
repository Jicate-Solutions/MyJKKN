// ============================================================================
// Regulatory Benchmark Service
// Handles peer institution benchmarking for accreditation (NAAC 6.5.3 etc.)
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client'

/**
 * DDL: regulatory_peer_benchmarks columns:
 *   id, institution_id (NOT NULL), framework_id (NOT NULL),
 *   academic_year (NOT NULL), peer_institution_name (NOT NULL),
 *   peer_institution_nirf_rank, peer_institution_naac_grade,
 *   metric_code (NOT NULL), our_value, peer_value,
 *   gap (GENERATED ALWAYS AS our_value - peer_value STORED),
 *   data_source, notes, created_by, created_at, updated_at
 *
 * UNIQUE(institution_id, framework_id, academic_year, peer_institution_name, metric_code)
 *
 * NOTE: gap is a GENERATED column -- do NOT set it.
 */

export interface BenchmarkFilters {
  institution_id?: string
  framework_id?: string
  academic_year?: string
  peer_institution_name?: string
  metric_code?: string
  search?: string
  page?: number
  limit?: number
}

export interface CreateBenchmarkData {
  institution_id: string
  framework_id: string
  academic_year: string
  peer_institution_name: string
  peer_institution_nirf_rank?: number | null
  peer_institution_naac_grade?: string | null
  metric_code: string
  our_value?: number | null
  peer_value?: number | null
  data_source?: string | null
  notes?: string | null
}

export interface UpdateBenchmarkData {
  peer_institution_nirf_rank?: number | null
  peer_institution_naac_grade?: string | null
  our_value?: number | null
  peer_value?: number | null
  data_source?: string | null
  notes?: string | null
}

export class RegulatoryBenchmarkService {
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
      console.error(`[RegulatoryBenchmarkService] Invalid ${fieldName}: ${actualValue}`)
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
   * Get benchmarks with filters and pagination
   */
  static async getBenchmarks(filters: BenchmarkFilters = {}) {
    try {
      if (filters.institution_id !== undefined) {
        this.validateId(filters.institution_id, 'institution_id filter')
      }
      if (filters.framework_id !== undefined) {
        this.validateId(filters.framework_id, 'framework_id filter')
      }

      let query = (this.getSupabase() as any)
        .from('regulatory_peer_benchmarks')
        .select(`
          *,
          institution:institutions(id, name),
          framework:regulatory_frameworks(id, name, body, version),
          created_by_profile:profiles!created_by(id, full_name, email)
        `, { count: 'exact' })

      // Apply filters
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id)
      }
      if (filters.framework_id) {
        query = query.eq('framework_id', filters.framework_id)
      }
      if (filters.academic_year) {
        query = query.eq('academic_year', filters.academic_year)
      }
      if (filters.peer_institution_name) {
        query = query.eq('peer_institution_name', filters.peer_institution_name)
      }
      if (filters.metric_code) {
        query = query.eq('metric_code', filters.metric_code)
      }
      if (filters.search) {
        const safe = this.sanitizeSearch(filters.search)
        if (safe) {
          query = query.or(
            `peer_institution_name.ilike.%${safe}%,metric_code.ilike.%${safe}%,notes.ilike.%${safe}%`
          )
        }
      }

      // Pagination
      const page = filters.page || 1
      const limit = filters.limit || 50
      const from = (page - 1) * limit
      query = query
        .range(from, from + limit - 1)
        .order('peer_institution_name', { ascending: true })
        .order('metric_code', { ascending: true })

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
      console.error('[RegulatoryBenchmarkService] Error fetching benchmarks:', this.formatError(error))
      throw error
    }
  }

  /**
   * Get single benchmark by ID
   */
  static async getBenchmarkById(id: string) {
    try {
      this.validateId(id, 'benchmark ID')

      const { data, error } = await (this.getSupabase() as any)
        .from('regulatory_peer_benchmarks')
        .select(`
          *,
          institution:institutions(id, name),
          framework:regulatory_frameworks(id, name, body, version),
          created_by_profile:profiles!created_by(id, full_name, email)
        `)
        .eq('id', id)
        .maybeSingle()

      if (error) throw error

      if (!data) {
        throw new Error('Benchmark not found or you do not have permission to view it.')
      }

      return data
    } catch (error) {
      console.error('[RegulatoryBenchmarkService] Error fetching benchmark:', this.formatError(error))
      throw error
    }
  }

  /**
   * Get all distinct peer institutions for a framework/year combo
   * Useful for building a comparison table.
   */
  static async getPeerInstitutions(
    institutionId: string,
    frameworkId: string,
    academicYear: string
  ) {
    try {
      this.validateId(institutionId, 'institution ID')
      this.validateId(frameworkId, 'framework ID')

      const { data, error } = await (this.getSupabase() as any)
        .from('regulatory_peer_benchmarks')
        .select('peer_institution_name, peer_institution_nirf_rank, peer_institution_naac_grade')
        .eq('institution_id', institutionId)
        .eq('framework_id', frameworkId)
        .eq('academic_year', academicYear)
        .order('peer_institution_name', { ascending: true })

      if (error) throw error

      // Deduplicate by peer_institution_name
      const seen = new Set<string>()
      const uniquePeers = (data || []).filter((d: any) => {
        if (seen.has(d.peer_institution_name)) return false
        seen.add(d.peer_institution_name)
        return true
      })

      return uniquePeers
    } catch (error) {
      console.error('[RegulatoryBenchmarkService] Error fetching peer institutions:', this.formatError(error))
      throw error
    }
  }

  /**
   * Create a new benchmark record
   *
   * NOTE: gap is a GENERATED column (our_value - peer_value) -- do NOT set it.
   */
  static async createBenchmark(data: CreateBenchmarkData) {
    try {
      this.validateId(data.institution_id, 'institution ID')
      this.validateId(data.framework_id, 'framework ID')

      // Get current user
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const insertPayload = {
        institution_id: data.institution_id,
        framework_id: data.framework_id,
        academic_year: data.academic_year,
        peer_institution_name: data.peer_institution_name,
        peer_institution_nirf_rank: data.peer_institution_nirf_rank ?? null,
        peer_institution_naac_grade: data.peer_institution_naac_grade || null,
        metric_code: data.metric_code,
        our_value: data.our_value ?? null,
        peer_value: data.peer_value ?? null,
        data_source: data.data_source || null,
        notes: data.notes || null,
        created_by: user.id
      }

      const { data: result, error } = await (this.getSupabase() as any)
        .from('regulatory_peer_benchmarks')
        .insert([insertPayload])
        .select()
        .single()

      if (error) {
        console.error('[RegulatoryBenchmarkService] Create error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        throw error
      }

      return result
    } catch (error) {
      console.error('[RegulatoryBenchmarkService] Error creating benchmark:', this.formatError(error))
      throw error
    }
  }

  /**
   * Upsert a benchmark (create or update based on unique key)
   * Unique key: institution_id, framework_id, academic_year, peer_institution_name, metric_code
   *
   * NOTE: gap is a GENERATED column -- do NOT set it.
   */
  static async upsertBenchmark(data: CreateBenchmarkData) {
    try {
      this.validateId(data.institution_id, 'institution ID')
      this.validateId(data.framework_id, 'framework ID')

      // Get current user
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const upsertPayload = {
        institution_id: data.institution_id,
        framework_id: data.framework_id,
        academic_year: data.academic_year,
        peer_institution_name: data.peer_institution_name,
        peer_institution_nirf_rank: data.peer_institution_nirf_rank ?? null,
        peer_institution_naac_grade: data.peer_institution_naac_grade || null,
        metric_code: data.metric_code,
        our_value: data.our_value ?? null,
        peer_value: data.peer_value ?? null,
        data_source: data.data_source || null,
        notes: data.notes || null,
        created_by: user.id
      }

      const { data: result, error } = await (this.getSupabase() as any)
        .from('regulatory_peer_benchmarks')
        .upsert(upsertPayload, {
          onConflict: 'institution_id,framework_id,academic_year,peer_institution_name,metric_code'
        })
        .select()
        .single()

      if (error) {
        console.error('[RegulatoryBenchmarkService] Upsert error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        throw error
      }

      return result
    } catch (error) {
      console.error('[RegulatoryBenchmarkService] Error upserting benchmark:', this.formatError(error))
      throw error
    }
  }

  /**
   * Update a benchmark record by ID
   *
   * NOTE: gap is a GENERATED column -- do NOT set it.
   */
  static async updateBenchmark(id: string, data: UpdateBenchmarkData) {
    try {
      this.validateId(id, 'benchmark ID')

      // Verify user is authenticated
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const updatePayload: Record<string, any> = {
        updated_at: new Date().toISOString()
      }

      if (data.peer_institution_nirf_rank !== undefined) updatePayload.peer_institution_nirf_rank = data.peer_institution_nirf_rank
      if (data.peer_institution_naac_grade !== undefined) updatePayload.peer_institution_naac_grade = data.peer_institution_naac_grade
      if (data.our_value !== undefined) updatePayload.our_value = data.our_value
      if (data.peer_value !== undefined) updatePayload.peer_value = data.peer_value
      if (data.data_source !== undefined) updatePayload.data_source = data.data_source
      if (data.notes !== undefined) updatePayload.notes = data.notes

      const { data: result, error } = await (this.getSupabase() as any)
        .from('regulatory_peer_benchmarks')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      return result
    } catch (error) {
      console.error('[RegulatoryBenchmarkService] Error updating benchmark:', this.formatError(error))
      throw error
    }
  }

  /**
   * Delete a benchmark record by ID
   * (DDL allows DELETE via RLS for super_admin, institution_admin, iqac_coordinator)
   */
  static async deleteBenchmark(id: string) {
    try {
      this.validateId(id, 'benchmark ID')

      // Verify user is authenticated
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const { error } = await (this.getSupabase() as any)
        .from('regulatory_peer_benchmarks')
        .delete()
        .eq('id', id)

      if (error) throw error

      return true
    } catch (error) {
      console.error('[RegulatoryBenchmarkService] Error deleting benchmark:', this.formatError(error))
      throw error
    }
  }

  /**
   * Get benchmark comparison summary:
   * For a given framework/year, returns a matrix of metrics vs. peer institutions
   * showing our_value, peer_value, and gap for each.
   */
  static async getBenchmarkComparison(
    institutionId: string,
    frameworkId: string,
    academicYear: string
  ) {
    try {
      this.validateId(institutionId, 'institution ID')
      this.validateId(frameworkId, 'framework ID')

      const { data, error } = await (this.getSupabase() as any)
        .from('regulatory_peer_benchmarks')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('framework_id', frameworkId)
        .eq('academic_year', academicYear)
        .order('metric_code', { ascending: true })
        .order('peer_institution_name', { ascending: true })

      if (error) throw error

      // Group by metric_code for comparison view
      const byMetric = new Map<string, any[]>()
      for (const row of (data || [])) {
        const list = byMetric.get(row.metric_code) || []
        list.push({
          peer_institution_name: row.peer_institution_name,
          peer_institution_nirf_rank: row.peer_institution_nirf_rank,
          peer_institution_naac_grade: row.peer_institution_naac_grade,
          our_value: row.our_value,
          peer_value: row.peer_value,
          gap: row.gap,
          data_source: row.data_source
        })
        byMetric.set(row.metric_code, list)
      }

      // Convert to array format
      const comparison = Array.from(byMetric.entries()).map(([metricCode, peers]) => ({
        metric_code: metricCode,
        peers
      }))

      return comparison
    } catch (error) {
      console.error('[RegulatoryBenchmarkService] Error fetching benchmark comparison:', this.formatError(error))
      throw error
    }
  }
}
