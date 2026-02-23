// ============================================================================
// Regulatory Peer Visit Service
// Handles peer team visits for accreditation (NAAC/NBA peer review visits)
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client'

/**
 * DDL: regulatory_peer_visits columns:
 *   id, submission_id (NOT NULL), institution_id (NOT NULL),
 *   visit_type (NOT NULL), status (NOT NULL DEFAULT 'scheduled'),
 *   scheduled_date, actual_start_date, actual_end_date,
 *   team_composition (jsonb), pre_visit_checklist (jsonb),
 *   visit_itinerary (jsonb), findings (jsonb),
 *   recommendations (text), action_items (jsonb),
 *   grade_awarded, report_file_url, coordinator_id,
 *   notes, created_at, updated_at
 *
 * NOTE: submission_id is NOT NULL (FK to regulatory_submissions)
 * NOTE: No framework_id column -- framework is via submission
 * NOTE: No created_by -- uses coordinator_id instead
 * NOTE: scheduled_date is a single DATE, not start/end pair
 */

export interface PeerVisitFilters {
  institution_id?: string
  submission_id?: string
  status?: string
  page?: number
  limit?: number
}

export interface CreatePeerVisitData {
  submission_id: string       // REQUIRED per DDL
  institution_id: string
  visit_type: string          // naac_peer_team | nba_evaluator | aicte_expert
  scheduled_date?: string | null
  team_composition?: PeerTeamMember[]
  pre_visit_checklist?: Record<string, boolean>
  notes?: string | null
  coordinator_id?: string | null
}

export interface UpdatePeerVisitData {
  visit_type?: string
  status?: string
  scheduled_date?: string | null
  actual_start_date?: string | null
  actual_end_date?: string | null
  team_composition?: PeerTeamMember[]
  pre_visit_checklist?: Record<string, boolean>
  visit_itinerary?: PeerVisitItineraryItem[]
  findings?: Record<string, any>
  recommendations?: string | null
  action_items?: PeerVisitActionItem[]
  grade_awarded?: string | null
  report_file_url?: string | null
  coordinator_id?: string | null
  notes?: string | null
}

export interface PeerTeamMember {
  name: string
  designation: string
  institution: string
  role?: string
}

export interface PeerVisitItineraryItem {
  day: number
  time: string
  activity: string
  location?: string
  responsible_person?: string
}

export interface PeerVisitActionItem {
  action: string
  responsible?: string | null
  deadline?: string | null
  status?: string
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
          submission:regulatory_submissions(id, status, academic_year, framework_id),
          coordinator:profiles!coordinator_id(id, full_name, email)
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
        .order('scheduled_date', { ascending: false, nullsFirst: false })

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
   * NOTE: submission_id is NOT NULL per DDL
   */
  static async createPeerVisit(data: CreatePeerVisitData) {
    try {
      this.validateId(data.submission_id, 'submission ID')
      this.validateId(data.institution_id, 'institution ID')
      if (data.coordinator_id) {
        this.validateId(data.coordinator_id, 'coordinator ID')
      }

      const insertPayload = {
        submission_id: data.submission_id,
        institution_id: data.institution_id,
        visit_type: data.visit_type,
        status: 'scheduled',
        scheduled_date: data.scheduled_date || null,
        team_composition: data.team_composition || [],
        pre_visit_checklist: data.pre_visit_checklist || {},
        notes: data.notes || null,
        coordinator_id: data.coordinator_id || null
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
      if (data.status !== undefined) updatePayload.status = data.status
      if (data.scheduled_date !== undefined) updatePayload.scheduled_date = data.scheduled_date
      if (data.actual_start_date !== undefined) updatePayload.actual_start_date = data.actual_start_date
      if (data.actual_end_date !== undefined) updatePayload.actual_end_date = data.actual_end_date
      if (data.team_composition !== undefined) updatePayload.team_composition = data.team_composition
      if (data.pre_visit_checklist !== undefined) updatePayload.pre_visit_checklist = data.pre_visit_checklist
      if (data.visit_itinerary !== undefined) updatePayload.visit_itinerary = data.visit_itinerary
      if (data.findings !== undefined) updatePayload.findings = data.findings
      if (data.recommendations !== undefined) updatePayload.recommendations = data.recommendations
      if (data.action_items !== undefined) updatePayload.action_items = data.action_items
      if (data.grade_awarded !== undefined) updatePayload.grade_awarded = data.grade_awarded
      if (data.report_file_url !== undefined) updatePayload.report_file_url = data.report_file_url
      if (data.coordinator_id !== undefined) updatePayload.coordinator_id = data.coordinator_id
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
