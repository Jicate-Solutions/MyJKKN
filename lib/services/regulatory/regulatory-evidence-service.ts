// ============================================================================
// Regulatory Evidence Service
// Handles evidence documents and version management for regulatory metrics
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client'

/**
 * DDL: regulatory_evidence columns:
 *   id, metric_id, criteria_id, submission_id, institution_id, academic_year,
 *   file_url, file_name, file_type, file_size_bytes (bigint),
 *   description, evidence_type, uploaded_by, is_deleted, deleted_at,
 *   created_at, updated_at, metadata
 *   CHECK (metric_id IS NOT NULL OR criteria_id IS NOT NULL)
 */

export interface EvidenceFilters {
  metric_id?: string
  criteria_id?: string
  submission_id?: string
  institution_id?: string
  academic_year?: string
  evidence_type?: string
  is_deleted?: boolean
  page?: number
  limit?: number
}

export interface UploadEvidenceData {
  metric_id?: string
  criteria_id?: string
  submission_id?: string
  institution_id: string
  academic_year: string
  file_name: string
  file_url: string
  file_type?: string
  file_size_bytes?: number
  description?: string | null
  evidence_type?: string   // supporting | primary | certificate | screenshot
  metadata?: Record<string, any>
}

/**
 * DDL: regulatory_evidence_versions columns:
 *   id, evidence_id, version_number, file_url, file_name, file_type,
 *   file_size_bytes, change_summary, uploaded_by, created_at
 *   UNIQUE(evidence_id, version_number)
 */
export interface AddEvidenceVersionData {
  evidence_id: string
  file_name: string
  file_url: string
  file_type?: string
  file_size_bytes?: number
  change_summary?: string | null
}

export class RegulatoryEvidenceService {
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
      console.error(`[RegulatoryEvidenceService] Invalid ${fieldName}: ${actualValue}`)
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
   * Get evidence with filters and pagination
   * Can filter by metric_id or criteria_id (or both)
   */
  static async getEvidence(filters: EvidenceFilters = {}) {
    try {
      if (filters.metric_id !== undefined) {
        this.validateId(filters.metric_id, 'metric_id filter')
      }
      if (filters.criteria_id !== undefined) {
        this.validateId(filters.criteria_id, 'criteria_id filter')
      }
      if (filters.institution_id !== undefined) {
        this.validateId(filters.institution_id, 'institution_id filter')
      }
      if (filters.submission_id !== undefined) {
        this.validateId(filters.submission_id, 'submission_id filter')
      }

      let query = (this.getSupabase() as any)
        .from('regulatory_evidence')
        .select(`
          *,
          uploaded_by_profile:profiles!uploaded_by(id, full_name, email)
        `, { count: 'exact' })

      // Apply filters
      if (filters.metric_id) {
        query = query.eq('metric_id', filters.metric_id)
      }
      if (filters.criteria_id) {
        query = query.eq('criteria_id', filters.criteria_id)
      }
      if (filters.submission_id) {
        query = query.eq('submission_id', filters.submission_id)
      }
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id)
      }
      if (filters.academic_year) {
        query = query.eq('academic_year', filters.academic_year)
      }
      if (filters.evidence_type) {
        query = query.eq('evidence_type', filters.evidence_type)
      }

      // By default, exclude soft-deleted evidence
      if (filters.is_deleted === true) {
        query = query.eq('is_deleted', true)
      } else {
        query = query.eq('is_deleted', false)
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
      console.error('[RegulatoryEvidenceService] Error fetching evidence:', this.formatError(error))
      throw error
    }
  }

  /**
   * Search evidence using full-text search via the search_vector tsvector column.
   * Falls back to ilike if the FTS query fails (e.g., malformed input).
   *
   * DDL: search_vector tsvector GENERATED ALWAYS AS (
   *   to_tsvector('english', coalesce(file_name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(evidence_type, ''))
   * ) STORED;
   */
  static async searchEvidence(
    searchTerm: string,
    institutionId?: string,
    academicYear?: string,
    limit: number = 20
  ) {
    try {
      if (institutionId !== undefined) {
        this.validateId(institutionId, 'institution ID')
      }

      if (!searchTerm || searchTerm.trim().length === 0) {
        return []
      }

      // Try full-text search first using the search_vector column
      const tsQuery = searchTerm.trim().split(/\s+/).join(' & ')

      let query = (this.getSupabase() as any)
        .from('regulatory_evidence')
        .select(`
          *,
          uploaded_by_profile:profiles!uploaded_by(id, full_name, email)
        `)
        .eq('is_deleted', false)
        .textSearch('search_vector', tsQuery, { type: 'plain', config: 'english' })

      if (institutionId) {
        query = query.eq('institution_id', institutionId)
      }
      if (academicYear) {
        query = query.eq('academic_year', academicYear)
      }

      query = query
        .limit(limit)
        .order('created_at', { ascending: false })

      const { data, error } = await query

      // If FTS fails (e.g., bad tsquery syntax), fall back to ilike
      if (error) {
        console.warn('[RegulatoryEvidenceService] FTS failed, falling back to ilike:', this.formatError(error))
        return this.searchEvidenceFallback(searchTerm, institutionId, academicYear, limit)
      }

      return data || []
    } catch (error) {
      console.error('[RegulatoryEvidenceService] Error searching evidence:', this.formatError(error))
      throw error
    }
  }

  /**
   * Fallback search using ilike (when full-text search is unavailable or fails)
   */
  private static async searchEvidenceFallback(
    searchTerm: string,
    institutionId?: string,
    academicYear?: string,
    limit: number = 20
  ) {
    let query = (this.getSupabase() as any)
      .from('regulatory_evidence')
      .select(`
        *,
        uploaded_by_profile:profiles!uploaded_by(id, full_name, email)
      `)
      .eq('is_deleted', false)
      .or(
        `file_name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`
      )

    if (institutionId) {
      query = query.eq('institution_id', institutionId)
    }
    if (academicYear) {
      query = query.eq('academic_year', academicYear)
    }

    query = query
      .limit(limit)
      .order('created_at', { ascending: false })

    const { data, error } = await query

    if (error) throw error

    return data || []
  }

  /**
   * Upload/create evidence record
   * Note: The actual file upload to Supabase Storage is handled separately.
   * This creates the database record pointing to the uploaded file.
   *
   * DDL constraint: CHECK (metric_id IS NOT NULL OR criteria_id IS NOT NULL)
   */
  static async uploadEvidence(data: UploadEvidenceData) {
    try {
      this.validateId(data.institution_id, 'institution ID')
      if (data.metric_id) {
        this.validateId(data.metric_id, 'metric ID')
      }
      if (data.criteria_id) {
        this.validateId(data.criteria_id, 'criteria ID')
      }
      if (data.submission_id) {
        this.validateId(data.submission_id, 'submission ID')
      }

      // Enforce DDL CHECK constraint client-side
      if (!data.metric_id && !data.criteria_id) {
        throw new Error('Evidence must be linked to at least a metric or a criteria.')
      }

      // Get current user
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const insertPayload = {
        metric_id: data.metric_id || null,
        criteria_id: data.criteria_id || null,
        submission_id: data.submission_id || null,
        institution_id: data.institution_id,
        academic_year: data.academic_year,
        file_name: data.file_name,
        file_url: data.file_url,
        file_type: data.file_type || null,
        file_size_bytes: data.file_size_bytes || null,
        description: data.description || null,
        evidence_type: data.evidence_type || 'supporting',
        uploaded_by: user.id,
        is_deleted: false,
        metadata: data.metadata || {}
      }

      const { data: result, error } = await (this.getSupabase() as any)
        .from('regulatory_evidence')
        .insert([insertPayload])
        .select()
        .single()

      if (error) {
        console.error('[RegulatoryEvidenceService] Upload error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        throw error
      }

      return result
    } catch (error) {
      console.error('[RegulatoryEvidenceService] Error uploading evidence:', this.formatError(error))
      throw error
    }
  }

  /**
   * Soft delete evidence: sets is_deleted = true and deleted_at = now()
   * DDL has no deleted_by column, so we only set is_deleted and deleted_at.
   */
  static async softDeleteEvidence(id: string) {
    try {
      this.validateId(id, 'evidence ID')

      const { data, error } = await (this.getSupabase() as any)
        .from('regulatory_evidence')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      return data
    } catch (error) {
      console.error('[RegulatoryEvidenceService] Error soft-deleting evidence:', this.formatError(error))
      throw error
    }
  }

  /**
   * Get version history for a specific evidence record
   *
   * DDL: regulatory_evidence_versions columns:
   *   id, evidence_id, version_number, file_url, file_name, file_type,
   *   file_size_bytes, change_summary, uploaded_by, created_at
   */
  static async getEvidenceVersions(evidenceId: string) {
    try {
      this.validateId(evidenceId, 'evidence ID')

      const { data, error } = await (this.getSupabase() as any)
        .from('regulatory_evidence_versions')
        .select(`
          *,
          uploaded_by_profile:profiles!uploaded_by(id, full_name, email)
        `)
        .eq('evidence_id', evidenceId)
        .order('version_number', { ascending: false })

      if (error) throw error

      return data || []
    } catch (error) {
      console.error('[RegulatoryEvidenceService] Error fetching evidence versions:', this.formatError(error))
      throw error
    }
  }

  /**
   * Add a new version to an existing evidence record
   * Inserts a snapshot of the CURRENT file into evidence_versions,
   * then updates the main evidence record with the new file info.
   *
   * NOTE: regulatory_evidence does NOT have a "version" column.
   * Version tracking lives entirely in evidence_versions.
   */
  static async addEvidenceVersion(data: AddEvidenceVersionData) {
    try {
      this.validateId(data.evidence_id, 'evidence ID')

      // Get current user
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      // Get the current evidence to snapshot the old file
      const { data: currentEvidence, error: fetchError } = await (this.getSupabase() as any)
        .from('regulatory_evidence')
        .select('id, file_name, file_url, file_type, file_size_bytes')
        .eq('id', data.evidence_id)
        .maybeSingle()

      if (fetchError) throw fetchError
      if (!currentEvidence) {
        throw new Error('Evidence record not found.')
      }

      // Determine the next version_number
      const { data: latestVersion } = await (this.getSupabase() as any)
        .from('regulatory_evidence_versions')
        .select('version_number')
        .eq('evidence_id', data.evidence_id)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextVersionNumber = (latestVersion?.version_number || 0) + 1

      // Insert version record (snapshot of the OLD file before updating)
      const versionPayload = {
        evidence_id: data.evidence_id,
        version_number: nextVersionNumber,
        file_name: currentEvidence.file_name,
        file_url: currentEvidence.file_url,
        file_type: currentEvidence.file_type || null,
        file_size_bytes: currentEvidence.file_size_bytes || null,
        change_summary: data.change_summary || null,
        uploaded_by: user.id
      }

      const { error: versionError } = await (this.getSupabase() as any)
        .from('regulatory_evidence_versions')
        .insert([versionPayload])

      if (versionError) throw versionError

      // Update the main evidence record with the new file info
      const { data: updatedEvidence, error: updateError } = await (this.getSupabase() as any)
        .from('regulatory_evidence')
        .update({
          file_name: data.file_name,
          file_url: data.file_url,
          file_type: data.file_type || null,
          file_size_bytes: data.file_size_bytes || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', data.evidence_id)
        .select()
        .single()

      if (updateError) throw updateError

      return updatedEvidence
    } catch (error) {
      console.error('[RegulatoryEvidenceService] Error adding evidence version:', this.formatError(error))
      throw error
    }
  }
}
