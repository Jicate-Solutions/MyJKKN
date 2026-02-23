// ============================================================================
// Regulatory Governance Service
// Handles governing bodies, meetings, and compliance governance records
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client'

/**
 * DDL: regulatory_governing_bodies columns:
 *   id, institution_id, body_type, name, mandate, formation_date,
 *   is_active, meeting_frequency, members (jsonb), created_at, updated_at
 *
 * DDL: regulatory_body_meetings columns:
 *   id, body_id, institution_id, meeting_number, academic_year,
 *   meeting_date, quorum_met, attendees_count, agenda (jsonb),
 *   resolutions (jsonb), action_items (jsonb), minutes_file_url,
 *   approved_by, approved_at, created_at, updated_at
 *   UNIQUE(body_id, academic_year, meeting_number)
 */

export interface GoverningBodyFilters {
  institution_id?: string
  body_type?: string
  is_active?: boolean
  page?: number
  limit?: number
}

export interface CreateGoverningBodyData {
  institution_id: string
  name: string
  body_type: string
  mandate?: string | null
  formation_date?: string | null
  meeting_frequency?: string | null
  members?: GoverningBodyMember[]
}

export interface UpdateGoverningBodyData {
  name?: string
  body_type?: string
  mandate?: string | null
  is_active?: boolean
  meeting_frequency?: string | null
  members?: GoverningBodyMember[]
}

export interface GoverningBodyMember {
  name: string
  designation: string
  role_in_body: string
  affiliation?: string | null
  member_type?: string | null     // internal | external | nominee
  nominated_by?: string | null
  tenure_start?: string | null
  tenure_end?: string | null
}

export interface MeetingFilters {
  body_id?: string
  institution_id?: string
  academic_year?: string
  page?: number
  limit?: number
}

export interface CreateMeetingData {
  body_id: string
  institution_id: string
  meeting_number: number
  academic_year: string
  meeting_date: string
  quorum_met?: boolean
  attendees_count?: number | null
  agenda?: MeetingAgendaItem[]
}

export interface UpdateMeetingData {
  meeting_date?: string
  quorum_met?: boolean
  attendees_count?: number | null
  agenda?: MeetingAgendaItem[]
  resolutions?: MeetingResolution[]
  action_items?: MeetingActionItem[]
  minutes_file_url?: string | null
}

export interface MeetingAgendaItem {
  item_number: number
  topic: string
  presented_by?: string | null
}

export interface MeetingResolution {
  resolution_number: string
  text: string
  status?: string   // approved | deferred | rejected
}

export interface MeetingActionItem {
  action: string
  responsible?: string | null
  deadline?: string | null
  status?: string
}

export class RegulatoryGovernanceService {
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
      console.error(`[RegulatoryGovernanceService] Invalid ${fieldName}: ${actualValue}`)
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

  // ===========================
  // Governing Bodies
  // ===========================

  /**
   * Get governing bodies with filters
   */
  static async getGoverningBodies(filters: GoverningBodyFilters = {}) {
    try {
      if (filters.institution_id !== undefined) {
        this.validateId(filters.institution_id, 'institution_id filter')
      }

      let query = (this.getSupabase() as any)
        .from('regulatory_governing_bodies')
        .select(`
          *,
          institution:institutions(id, name)
        `, { count: 'exact' })

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id)
      }
      if (filters.body_type) {
        query = query.eq('body_type', filters.body_type)
      }
      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active)
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
      console.error('[RegulatoryGovernanceService] Error fetching governing bodies:', this.formatError(error))
      throw error
    }
  }

  /**
   * Create a new governing body
   * NOTE: DDL has no created_by column on governing_bodies.
   */
  static async createGoverningBody(data: CreateGoverningBodyData) {
    try {
      this.validateId(data.institution_id, 'institution ID')

      const insertPayload = {
        institution_id: data.institution_id,
        name: data.name,
        body_type: data.body_type,
        mandate: data.mandate || null,
        formation_date: data.formation_date || null,
        meeting_frequency: data.meeting_frequency || null,
        members: data.members || [],
        is_active: true
      }

      const { data: result, error } = await (this.getSupabase() as any)
        .from('regulatory_governing_bodies')
        .insert([insertPayload])
        .select()
        .single()

      if (error) {
        console.error('[RegulatoryGovernanceService] Create body error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        throw error
      }

      return result
    } catch (error) {
      console.error('[RegulatoryGovernanceService] Error creating governing body:', this.formatError(error))
      throw error
    }
  }

  /**
   * Update an existing governing body
   */
  static async updateGoverningBody(id: string, data: UpdateGoverningBodyData) {
    try {
      this.validateId(id, 'governing body ID')

      const updatePayload: Record<string, any> = {
        updated_at: new Date().toISOString()
      }

      if (data.name !== undefined) updatePayload.name = data.name
      if (data.body_type !== undefined) updatePayload.body_type = data.body_type
      if (data.mandate !== undefined) updatePayload.mandate = data.mandate
      if (data.is_active !== undefined) updatePayload.is_active = data.is_active
      if (data.meeting_frequency !== undefined) updatePayload.meeting_frequency = data.meeting_frequency
      if (data.members !== undefined) updatePayload.members = data.members

      const { data: result, error } = await (this.getSupabase() as any)
        .from('regulatory_governing_bodies')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      return result
    } catch (error) {
      console.error('[RegulatoryGovernanceService] Error updating governing body:', this.formatError(error))
      throw error
    }
  }

  // ===========================
  // Meetings (regulatory_body_meetings)
  // ===========================

  /**
   * Get meetings with filters
   * CORRECT TABLE: regulatory_body_meetings (NOT regulatory_meetings)
   */
  static async getMeetings(filters: MeetingFilters = {}) {
    try {
      if (filters.body_id !== undefined) {
        this.validateId(filters.body_id, 'body_id filter')
      }
      if (filters.institution_id !== undefined) {
        this.validateId(filters.institution_id, 'institution_id filter')
      }

      let query = (this.getSupabase() as any)
        .from('regulatory_body_meetings')
        .select(`
          *,
          body:regulatory_governing_bodies(id, name, body_type),
          approved_by_profile:profiles!approved_by(id, full_name, email)
        `, { count: 'exact' })

      if (filters.body_id) {
        query = query.eq('body_id', filters.body_id)
      }
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id)
      }
      if (filters.academic_year) {
        query = query.eq('academic_year', filters.academic_year)
      }

      // Pagination
      const page = filters.page || 1
      const limit = filters.limit || 20
      const from = (page - 1) * limit
      query = query
        .range(from, from + limit - 1)
        .order('meeting_date', { ascending: false })

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
      console.error('[RegulatoryGovernanceService] Error fetching meetings:', this.formatError(error))
      throw error
    }
  }

  /**
   * Create a new meeting record
   * CORRECT TABLE: regulatory_body_meetings
   * DDL columns: body_id, institution_id, meeting_number, academic_year,
   *   meeting_date, quorum_met, attendees_count, agenda, resolutions,
   *   action_items, minutes_file_url, approved_by, approved_at
   */
  static async createMeeting(data: CreateMeetingData) {
    try {
      this.validateId(data.body_id, 'governing body ID')
      this.validateId(data.institution_id, 'institution ID')

      const insertPayload = {
        body_id: data.body_id,
        institution_id: data.institution_id,
        meeting_number: data.meeting_number,
        academic_year: data.academic_year,
        meeting_date: data.meeting_date,
        quorum_met: data.quorum_met ?? true,
        attendees_count: data.attendees_count || null,
        agenda: data.agenda || []
      }

      const { data: result, error } = await (this.getSupabase() as any)
        .from('regulatory_body_meetings')
        .insert([insertPayload])
        .select()
        .single()

      if (error) {
        console.error('[RegulatoryGovernanceService] Create meeting error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        throw error
      }

      return result
    } catch (error) {
      console.error('[RegulatoryGovernanceService] Error creating meeting:', this.formatError(error))
      throw error
    }
  }

  /**
   * Update a meeting (minutes, resolutions, action items, etc.)
   * CORRECT TABLE: regulatory_body_meetings
   */
  static async updateMeeting(id: string, data: UpdateMeetingData) {
    try {
      this.validateId(id, 'meeting ID')

      const updatePayload: Record<string, any> = {
        updated_at: new Date().toISOString()
      }

      if (data.meeting_date !== undefined) updatePayload.meeting_date = data.meeting_date
      if (data.quorum_met !== undefined) updatePayload.quorum_met = data.quorum_met
      if (data.attendees_count !== undefined) updatePayload.attendees_count = data.attendees_count
      if (data.agenda !== undefined) updatePayload.agenda = data.agenda
      if (data.resolutions !== undefined) updatePayload.resolutions = data.resolutions
      if (data.action_items !== undefined) updatePayload.action_items = data.action_items
      if (data.minutes_file_url !== undefined) updatePayload.minutes_file_url = data.minutes_file_url

      const { data: result, error } = await (this.getSupabase() as any)
        .from('regulatory_body_meetings')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      return result
    } catch (error) {
      console.error('[RegulatoryGovernanceService] Error updating meeting:', this.formatError(error))
      throw error
    }
  }

  /**
   * Approve meeting minutes
   * Sets approved_by and approved_at on the meeting record.
   */
  static async approveMeeting(id: string) {
    try {
      this.validateId(id, 'meeting ID')

      // Get current user
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const { data: result, error } = await (this.getSupabase() as any)
        .from('regulatory_body_meetings')
        .update({
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      return result
    } catch (error) {
      console.error('[RegulatoryGovernanceService] Error approving meeting:', this.formatError(error))
      throw error
    }
  }
}
