// ============================================================================
// Regulatory Peer Visit Service
// Handles peer team visits for accreditation (NAAC/NBA peer review visits)
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client'

export interface PeerVisitFilters {
  institution_id?: string
  submission_id?: string
  status?: string
  page?: number
  limit?: number
}

export interface CreatePeerVisitData {
  institution_id: string
  submission_id?: string
  framework_id?: string
  visit_type: string
  scheduled_start_date: string
  scheduled_end_date: string
  team_lead_name?: string | null
  team_members?: PeerTeamMember[]
  notes?: string | null
}

export interface UpdatePeerVisitData {
  visit_type?: string
  scheduled_start_date?: string
  scheduled_end_date?: string
  actual_start_date?: string | null
  actual_end_date?: string | null
  team_lead_name?: string | null
  team_members?: PeerTeamMember[]
  status?: string
  findings?: string | null
  recommendations?: string | null
  action_items?: PeerVisitActionItem[]
  overall_score?: number | null
  grade?: string | null
  notes?: string | null
}

export interface PeerTeamMember {
  name: string
  designation: string
  institution: string
  specialization?: string | null
  role?: string
}

export interface PeerVisitActionItem {
  description: string
  responsible_person?: string | null
  deadline?: string | null
  status?: string
  priority?: string
}

export class RegulatoryPeerVisitService {
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
      console.error(`[RegulatoryPeerVisitService] Invalid ${fieldName}: ${actualValue}`)
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
   * Get peer visits with filters and pagination
   */
  static async getPeerVisits(filters: PeerVisitFilters = {}) {
    try {
      if (filters.institution_id !== undefined) {
        this.validateId(filters.institution_id, 'institution_id filter')
      }
      if (filters.submission_id !== undefined) {
        this.validateId(filters.submission_id, 'submission_id filter')
      }

      let query = (this.getSupabase() as any)
        .from('regulatory_peer_visits')
        .select(`
          *,
          institution:institutions(id, name),
          submission:regulatory_submissions(id, title, status, academic_year),
          framework:regulatory_frameworks(id, body_name, version_year),
          created_by_profile:profiles!created_by(id, full_name, email)
        `, { count: 'exact' })

      // Apply filters
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id)
      }
      if (filters.submission_id) {
        query = query.eq('submission_id', filters.submission_id)
      }
      if (filters.status) {
        query = query.eq('status', filters.status)
      }

      // Pagination
      const page = filters.page || 1
      const limit = filters.limit || 20
      const from = (page - 1) * limit
      query = query
        .range(from, from + limit - 1)
        .order('scheduled_start_date', { ascending: false })

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
      console.error('[RegulatoryPeerVisitService] Error fetching peer visits:', this.formatError(error))
      throw error
    }
  }

  /**
   * Schedule a new peer visit
   */
  static async createPeerVisit(data: CreatePeerVisitData) {
    try {
      this.validateId(data.institution_id, 'institution ID')
      if (data.submission_id) {
        this.validateId(data.submission_id, 'submission ID')
      }
      if (data.framework_id) {
        this.validateId(data.framework_id, 'framework ID')
      }

      // Get current user
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const insertPayload = {
        institution_id: data.institution_id,
        submission_id: data.submission_id || null,
        framework_id: data.framework_id || null,
        visit_type: data.visit_type,
        scheduled_start_date: data.scheduled_start_date,
        scheduled_end_date: data.scheduled_end_date,
        team_lead_name: data.team_lead_name || null,
        team_members: data.team_members || [],
        notes: data.notes || null,
        status: 'scheduled',
        created_by: user.id
      }

      const { data: result, error } = await (this.getSupabase() as any)
        .from('regulatory_peer_visits')
        .insert([insertPayload])
        .select()
        .single()

      if (error) {
        console.error('[RegulatoryPeerVisitService] Create error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        throw error
      }

      return result
    } catch (error) {
      console.error('[RegulatoryPeerVisitService] Error creating peer visit:', this.formatError(error))
      throw error
    }
  }

  /**
   * Update peer visit (status, findings, action items, etc.)
   */
  static async updatePeerVisit(id: string, data: UpdatePeerVisitData) {
    try {
      this.validateId(id, 'peer visit ID')

      const updatePayload: Record<string, any> = {
        updated_at: new Date().toISOString()
      }

      if (data.visit_type !== undefined) updatePayload.visit_type = data.visit_type
      if (data.scheduled_start_date !== undefined) updatePayload.scheduled_start_date = data.scheduled_start_date
      if (data.scheduled_end_date !== undefined) updatePayload.scheduled_end_date = data.scheduled_end_date
      if (data.actual_start_date !== undefined) updatePayload.actual_start_date = data.actual_start_date
      if (data.actual_end_date !== undefined) updatePayload.actual_end_date = data.actual_end_date
      if (data.team_lead_name !== undefined) updatePayload.team_lead_name = data.team_lead_name
      if (data.team_members !== undefined) updatePayload.team_members = data.team_members
      if (data.status !== undefined) updatePayload.status = data.status
      if (data.findings !== undefined) updatePayload.findings = data.findings
      if (data.recommendations !== undefined) updatePayload.recommendations = data.recommendations
      if (data.action_items !== undefined) updatePayload.action_items = data.action_items
      if (data.overall_score !== undefined) updatePayload.overall_score = data.overall_score
      if (data.grade !== undefined) updatePayload.grade = data.grade
      if (data.notes !== undefined) updatePayload.notes = data.notes

      const { data: result, error } = await (this.getSupabase() as any)
        .from('regulatory_peer_visits')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      return result
    } catch (error) {
      console.error('[RegulatoryPeerVisitService] Error updating peer visit:', this.formatError(error))
      throw error
    }
  }
}
