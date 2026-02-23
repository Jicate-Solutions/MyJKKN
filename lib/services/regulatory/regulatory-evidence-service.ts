// ============================================================================
// Regulatory Evidence Service
// Handles evidence documents and version management for regulatory metrics
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client'

export interface EvidenceFilters {
  metric_id?: string
  criteria_id?: string
  institution_id?: string
  academic_year?: string
  is_deleted?: boolean
  page?: number
  limit?: number
}

export interface UploadEvidenceData {
  metric_id?: string
  criteria_id?: string
  institution_id: string
  academic_year: string
  framework_id: string
  file_name: string
  file_url: string
  file_type?: string
  file_size?: number
  title: string
  description?: string | null
}

export interface AddEvidenceVersionData {
  evidence_id: string
  file_name: string
  file_url: string
  file_type?: string
  file_size?: number
  change_notes?: string | null
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
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id)
      }
      if (filters.academic_year) {
        query = query.eq('academic_year', filters.academic_year)
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
   * Upload/create evidence record
   * Note: The actual file upload to Supabase Storage is handled separately.
   * This creates the database record pointing to the uploaded file.
   */
  static async uploadEvidence(data: UploadEvidenceData) {
    try {
      this.validateId(data.institution_id, 'institution ID')
      this.validateId(data.framework_id, 'framework ID')
      if (data.metric_id) {
        this.validateId(data.metric_id, 'metric ID')
      }
      if (data.criteria_id) {
        this.validateId(data.criteria_id, 'criteria ID')
      }

      // Get current user
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const insertPayload = {
        metric_id: data.metric_id || null,
        criteria_id: data.criteria_id || null,
        institution_id: data.institution_id,
        academic_year: data.academic_year,
        framework_id: data.framework_id,
        file_name: data.file_name,
        file_url: data.file_url,
        file_type: data.file_type || null,
        file_size: data.file_size || null,
        title: data.title,
        description: data.description || null,
        uploaded_by: user.id,
        is_deleted: false,
        version: 1
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
   */
  static async softDeleteEvidence(id: string) {
    try {
      this.validateId(id, 'evidence ID')

      // Get current user
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const { data, error } = await (this.getSupabase() as any)
        .from('regulatory_evidence')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: user.id,
          updated_at: new Date().toISOString()
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
        .order('version', { ascending: false })

      if (error) throw error

      return data || []
    } catch (error) {
      console.error('[RegulatoryEvidenceService] Error fetching evidence versions:', this.formatError(error))
      throw error
    }
  }

  /**
   * Add a new version to an existing evidence record
   * Increments the version number and stores the new file info
   */
  static async addEvidenceVersion(data: AddEvidenceVersionData) {
    try {
      this.validateId(data.evidence_id, 'evidence ID')

      // Get current user
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      // Get the current evidence to determine next version number
      const { data: currentEvidence, error: fetchError } = await (this.getSupabase() as any)
        .from('regulatory_evidence')
        .select('id, version, file_name, file_url')
        .eq('id', data.evidence_id)
        .maybeSingle()

      if (fetchError) throw fetchError
      if (!currentEvidence) {
        throw new Error('Evidence record not found.')
      }

      const nextVersion = (currentEvidence.version || 1) + 1

      // Insert version record (stores the old version snapshot)
      const versionPayload = {
        evidence_id: data.evidence_id,
        version: currentEvidence.version || 1,
        file_name: currentEvidence.file_name,
        file_url: currentEvidence.file_url,
        uploaded_by: user.id,
        change_notes: data.change_notes || null
      }

      const { error: versionError } = await (this.getSupabase() as any)
        .from('regulatory_evidence_versions')
        .insert([versionPayload])

      if (versionError) throw versionError

      // Update the main evidence record with new file info
      const { data: updatedEvidence, error: updateError } = await (this.getSupabase() as any)
        .from('regulatory_evidence')
        .update({
          file_name: data.file_name,
          file_url: data.file_url,
          file_type: data.file_type || null,
          file_size: data.file_size || null,
          version: nextVersion,
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
