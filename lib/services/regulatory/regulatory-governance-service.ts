// ============================================================================
// Regulatory Governance Service
// Handles governing bodies, meetings, and compliance governance records
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client'

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
  description?: string | null
  mandate?: string | null
  formation_date?: string | null
  members?: GoverningBodyMember[]
}

export interface UpdateGoverningBodyData {
  name?: string
  body_type?: string
  description?: string | null
  mandate?: string | null
  is_active?: boolean
  members?: GoverningBodyMember[]
}

export interface GoverningBodyMember {
  name: string
  designation: string
  role_in_body: string
  email?: string | null
  phone?: string | null
  is_external?: boolean
}

export interface MeetingFilters {
  body_id?: string
  academic_year?: string
  status?: string
  page?: number
  limit?: number
}

export interface CreateMeetingData {
  body_id: string
  institution_id: string
  title: string
  meeting_date: string
  venue?: string | null
  agenda?: string | null
  academic_year?: string
}

export interface UpdateMeetingData {
  title?: string
  meeting_date?: string
  venue?: string | null
  agenda?: string | null
  minutes?: string | null
  resolutions?: MeetingResolution[]
  attendees?: string[]
  status?: string
}

export interface MeetingResolution {
  resolution_number: string
  description: string
  responsible_person?: string | null
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
   */
  static async createGoverningBody(data: CreateGoverningBodyData) {
    try {
      this.validateId(data.institution_id, 'institution ID')

      // Get current user
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const insertPayload = {
        institution_id: data.institution_id,
        name: data.name,
        body_type: data.body_type,
        description: data.description || null,
        mandate: data.mandate || null,
        formation_date: data.formation_date || null,
        members: data.members || [],
        is_active: true,
        created_by: user.id
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
      if (data.description !== undefined) updatePayload.description = data.description
      if (data.mandate !== undefined) updatePayload.mandate = data.mandate
      if (data.is_active !== undefined) updatePayload.is_active = data.is_active
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
  // Meetings
  // ===========================

  /**
   * Get meetings with filters
   */
  static async getMeetings(filters: MeetingFilters = {}) {
    try {
      if (filters.body_id !== undefined) {
        this.validateId(filters.body_id, 'body_id filter')
      }

      let query = (this.getSupabase() as any)
        .from('regulatory_meetings')
        .select(`
          *,
          body:regulatory_governing_bodies(id, name, body_type),
          created_by_profile:profiles!created_by(id, full_name, email)
        `, { count: 'exact' })

      if (filters.body_id) {
        query = query.eq('body_id', filters.body_id)
      }
      if (filters.academic_year) {
        query = query.eq('academic_year', filters.academic_year)
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
   */
  static async createMeeting(data: CreateMeetingData) {
    try {
      this.validateId(data.body_id, 'governing body ID')
      this.validateId(data.institution_id, 'institution ID')

      // Get current user
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const insertPayload = {
        body_id: data.body_id,
        institution_id: data.institution_id,
        title: data.title,
        meeting_date: data.meeting_date,
        venue: data.venue || null,
        agenda: data.agenda || null,
        academic_year: data.academic_year || null,
        status: 'scheduled',
        created_by: user.id
      }

      const { data: result, error } = await (this.getSupabase() as any)
        .from('regulatory_meetings')
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
   * Update a meeting (minutes, resolutions, status, etc.)
   */
  static async updateMeeting(id: string, data: UpdateMeetingData) {
    try {
      this.validateId(id, 'meeting ID')

      const updatePayload: Record<string, any> = {
        updated_at: new Date().toISOString()
      }

      if (data.title !== undefined) updatePayload.title = data.title
      if (data.meeting_date !== undefined) updatePayload.meeting_date = data.meeting_date
      if (data.venue !== undefined) updatePayload.venue = data.venue
      if (data.agenda !== undefined) updatePayload.agenda = data.agenda
      if (data.minutes !== undefined) updatePayload.minutes = data.minutes
      if (data.resolutions !== undefined) updatePayload.resolutions = data.resolutions
      if (data.attendees !== undefined) updatePayload.attendees = data.attendees
      if (data.status !== undefined) updatePayload.status = data.status

      const { data: result, error } = await (this.getSupabase() as any)
        .from('regulatory_meetings')
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
}
