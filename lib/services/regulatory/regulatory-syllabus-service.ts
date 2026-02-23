// ============================================================================
// Regulatory Syllabus Service
// Handles syllabus management, CO-PO mapping, and teaching completion tracking
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client'

export interface SyllabusFilters {
  institution_id?: string
  department_id?: string
  academic_year?: string
  semester?: number
  course_code?: string
  search?: string
  page?: number
  limit?: number
}

export interface UpsertSyllabusData {
  institution_id: string
  department_id?: string
  course_code: string
  course_name: string
  academic_year: string
  semester: number
  total_hours: number
  completed_hours?: number
  credits?: number
  syllabus_url?: string | null
  co_po_mapping?: COPOMapping[] | null
  course_outcomes?: CourseOutcome[] | null
  units?: SyllabusUnit[] | null
}

export interface COPOMapping {
  co_code: string
  co_description: string
  po_mappings: {
    po_code: string
    correlation_level: number  // 1 = low, 2 = medium, 3 = high
  }[]
}

export interface CourseOutcome {
  code: string
  description: string
  bloom_level?: string
}

export interface SyllabusUnit {
  unit_number: number
  title: string
  topics: string[]
  hours_allotted: number
  hours_completed?: number
}

export class RegulatorySyllabusService {
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
      console.error(`[RegulatorySyllabusService] Invalid ${fieldName}: ${actualValue}`)
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
   * Get syllabi with filters and pagination
   */
  static async getSyllabi(filters: SyllabusFilters = {}) {
    try {
      if (filters.institution_id !== undefined) {
        this.validateId(filters.institution_id, 'institution_id filter')
      }
      if (filters.department_id !== undefined) {
        this.validateId(filters.department_id, 'department_id filter')
      }

      let query = (this.getSupabase() as any)
        .from('regulatory_syllabi')
        .select(`
          *,
          institution:institutions(id, name),
          department:departments(id, department_name)
        `, { count: 'exact' })

      // Apply filters
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id)
      }
      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id)
      }
      if (filters.academic_year) {
        query = query.eq('academic_year', filters.academic_year)
      }
      if (filters.semester) {
        query = query.eq('semester', filters.semester)
      }
      if (filters.course_code) {
        query = query.eq('course_code', filters.course_code)
      }
      if (filters.search) {
        query = query.or(
          `course_name.ilike.%${filters.search}%,course_code.ilike.%${filters.search}%`
        )
      }

      // Pagination
      const page = filters.page || 1
      const limit = filters.limit || 20
      const from = (page - 1) * limit
      query = query
        .range(from, from + limit - 1)
        .order('academic_year', { ascending: false })
        .order('semester', { ascending: true })
        .order('course_code', { ascending: true })

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
      console.error('[RegulatorySyllabusService] Error fetching syllabi:', this.formatError(error))
      throw error
    }
  }

  /**
   * Get single syllabus by ID with CO-PO mapping details
   */
  static async getSyllabusById(id: string) {
    try {
      this.validateId(id, 'syllabus ID')

      const { data, error } = await (this.getSupabase() as any)
        .from('regulatory_syllabi')
        .select(`
          *,
          institution:institutions(id, name),
          department:departments(id, department_name),
          updated_by_profile:profiles!updated_by(id, full_name, email)
        `)
        .eq('id', id)
        .maybeSingle()

      if (error) throw error

      if (!data) {
        throw new Error('Syllabus not found or you do not have permission to view it.')
      }

      // Calculate completion percentage
      if (data.total_hours && data.total_hours > 0) {
        data._completion_percent = Math.round(
          ((data.completed_hours || 0) / data.total_hours) * 100
        )
      } else {
        data._completion_percent = 0
      }

      return data
    } catch (error) {
      console.error('[RegulatorySyllabusService] Error fetching syllabus:', this.formatError(error))
      throw error
    }
  }

  /**
   * Upsert syllabus (insert or update)
   * Unique key: institution_id + course_code + academic_year + semester
   */
  static async upsertSyllabus(data: UpsertSyllabusData) {
    try {
      this.validateId(data.institution_id, 'institution ID')
      if (data.department_id) {
        this.validateId(data.department_id, 'department ID')
      }

      // Get current user
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const upsertPayload = {
        institution_id: data.institution_id,
        department_id: data.department_id || null,
        course_code: data.course_code,
        course_name: data.course_name,
        academic_year: data.academic_year,
        semester: data.semester,
        total_hours: data.total_hours,
        completed_hours: data.completed_hours ?? 0,
        credits: data.credits ?? null,
        syllabus_url: data.syllabus_url || null,
        co_po_mapping: data.co_po_mapping || null,
        course_outcomes: data.course_outcomes || null,
        units: data.units || null,
        updated_by: user.id,
        updated_at: new Date().toISOString()
      }

      const { data: result, error } = await (this.getSupabase() as any)
        .from('regulatory_syllabi')
        .upsert(upsertPayload, {
          onConflict: 'institution_id,course_code,academic_year,semester'
        })
        .select()
        .single()

      if (error) {
        console.error('[RegulatorySyllabusService] Upsert error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        throw error
      }

      return result
    } catch (error) {
      console.error('[RegulatorySyllabusService] Error upserting syllabus:', this.formatError(error))
      throw error
    }
  }

  /**
   * Update syllabus completion hours (teaching progress tracking)
   */
  static async updateCompletionHours(id: string, completedHours: number) {
    try {
      this.validateId(id, 'syllabus ID')

      if (typeof completedHours !== 'number' || completedHours < 0) {
        throw new Error(`Invalid completed hours: ${completedHours}. Must be a non-negative number.`)
      }

      // Get current user
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const { data, error } = await (this.getSupabase() as any)
        .from('regulatory_syllabi')
        .update({
          completed_hours: completedHours,
          updated_by: user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // Calculate and attach completion percentage
      if (data && data.total_hours && data.total_hours > 0) {
        data._completion_percent = Math.round(
          (completedHours / data.total_hours) * 100
        )
      }

      return data
    } catch (error) {
      console.error('[RegulatorySyllabusService] Error updating completion hours:', this.formatError(error))
      throw error
    }
  }
}
