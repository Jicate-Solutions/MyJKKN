// ============================================================================
// Regulatory Syllabus Service
// Handles syllabus management, CO-PO mapping, and teaching completion tracking
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client'

/**
 * DDL: regulatory_course_syllabi columns:
 *   id, institution_id, program_id, department (text NOT NULL),
 *   course_code, course_name, academic_year, semester,
 *   syllabus_file_url, teaching_plan_file_url,
 *   revision_status (current | under_revision | archived),
 *   revision_date, bos_approval_date, bos_meeting_id,
 *   total_hours (integer), completed_hours (integer),
 *   completion_percentage (GENERATED ALWAYS AS ... STORED),
 *   co_mapping (jsonb), po_mapping (jsonb),
 *   innovative_methods (text), created_at, updated_at
 *
 * UNIQUE(institution_id, course_code, academic_year, semester)
 *
 * NOTE: Table name is regulatory_course_syllabi (NOT regulatory_syllabi)
 * NOTE: department is TEXT (not UUID / department_id)
 * NOTE: completion_percentage is a GENERATED column -- do not set it
 * NOTE: No credits, units, course_outcomes, updated_by, syllabus_url columns
 */

export interface SyllabusFilters {
  institution_id?: string
  department?: string          // TEXT column, not UUID
  academic_year?: string
  semester?: number
  course_code?: string
  revision_status?: string
  search?: string
  page?: number
  limit?: number
}

export interface UpsertSyllabusData {
  institution_id: string
  department: string           // TEXT, not UUID
  program_id?: string | null
  course_code: string
  course_name: string
  academic_year: string
  semester?: number | null
  total_hours?: number | null
  completed_hours?: number | null
  syllabus_file_url?: string | null
  teaching_plan_file_url?: string | null
  revision_status?: string     // current | under_revision | archived
  revision_date?: string | null
  bos_approval_date?: string | null
  bos_meeting_id?: string | null
  co_mapping?: Record<string, string> | null  // {CO1: "description", CO2: "description", ...}
  po_mapping?: COPOMapping[] | null           // [{co: "CO1", po: "PO1", level: 3}, ...]
  innovative_methods?: string | null
}

export interface COPOMapping {
  co: string
  po: string
  level: number  // 1 = low, 2 = medium, 3 = high
}

export interface CourseOutcome {
  code: string         // e.g., "CO1"
  description: string
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
   * Sanitize a search term for safe use in PostgREST .or() filter strings.
   * Escapes commas and parentheses that could break the filter syntax.
   */
  private static sanitizeSearch(term: string): string {
    // Strips: commas, parentheses, periods (PostgREST field separators),
    // backslashes, and percent signs (ilike wildcards from user input)
    return term.replace(/[,().\\%]/g, ' ').trim()
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
   * CORRECT TABLE: regulatory_course_syllabi
   */
  static async getSyllabi(filters: SyllabusFilters = {}) {
    try {
      if (filters.institution_id !== undefined) {
        this.validateId(filters.institution_id, 'institution_id filter')
      }

      let query = (this.getSupabase() as any)
        .from('regulatory_course_syllabi')
        .select(`
          *,
          institution:institutions(id, name)
        `, { count: 'exact' })

      // Apply filters
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id)
      }
      if (filters.department) {
        query = query.eq('department', filters.department)
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
      if (filters.revision_status) {
        query = query.eq('revision_status', filters.revision_status)
      }
      if (filters.search) {
        const safe = this.sanitizeSearch(filters.search)
        if (safe) {
          query = query.or(
            `course_name.ilike.%${safe}%,course_code.ilike.%${safe}%`
          )
        }
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
   * Get single syllabus by ID
   * CORRECT TABLE: regulatory_course_syllabi
   *
   * NOTE: completion_percentage is a GENERATED column in the DDL --
   * it's automatically calculated from total_hours and completed_hours.
   */
  static async getSyllabusById(id: string) {
    try {
      this.validateId(id, 'syllabus ID')

      const { data, error } = await (this.getSupabase() as any)
        .from('regulatory_course_syllabi')
        .select(`
          *,
          institution:institutions(id, name)
        `)
        .eq('id', id)
        .maybeSingle()

      if (error) throw error

      if (!data) {
        throw new Error('Syllabus not found or you do not have permission to view it.')
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
   * CORRECT TABLE: regulatory_course_syllabi
   *
   * NOTE: Do NOT set completion_percentage -- it's a GENERATED column.
   */
  static async upsertSyllabus(data: UpsertSyllabusData) {
    try {
      this.validateId(data.institution_id, 'institution ID')
      if (data.program_id) {
        this.validateId(data.program_id, 'program ID')
      }
      if (data.bos_meeting_id) {
        this.validateId(data.bos_meeting_id, 'BOS meeting ID')
      }

      // Verify user is authenticated
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const upsertPayload: Record<string, any> = {
        institution_id: data.institution_id,
        department: data.department,
        program_id: data.program_id || null,
        course_code: data.course_code,
        course_name: data.course_name,
        academic_year: data.academic_year,
        semester: data.semester ?? null,
        total_hours: data.total_hours ?? null,
        completed_hours: data.completed_hours ?? 0,
        syllabus_file_url: data.syllabus_file_url || null,
        teaching_plan_file_url: data.teaching_plan_file_url || null,
        revision_status: data.revision_status || 'current',
        revision_date: data.revision_date || null,
        bos_approval_date: data.bos_approval_date || null,
        bos_meeting_id: data.bos_meeting_id || null,
        co_mapping: data.co_mapping || {},
        po_mapping: data.po_mapping || [],
        innovative_methods: data.innovative_methods || null
      }

      const { data: result, error } = await (this.getSupabase() as any)
        .from('regulatory_course_syllabi')
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
   * CORRECT TABLE: regulatory_course_syllabi
   *
   * NOTE: completion_percentage is auto-computed by PostgreSQL GENERATED column.
   * We only update completed_hours; the DB calculates the percentage.
   */
  static async updateCompletionHours(id: string, completedHours: number) {
    try {
      this.validateId(id, 'syllabus ID')

      // Verify user is authenticated
      const { data: { user } } = await this.getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      if (typeof completedHours !== 'number' || completedHours < 0) {
        throw new Error(`Invalid completed hours: ${completedHours}. Must be a non-negative number.`)
      }

      const { data, error } = await (this.getSupabase() as any)
        .from('regulatory_course_syllabi')
        .update({
          completed_hours: completedHours
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      return data
    } catch (error) {
      console.error('[RegulatorySyllabusService] Error updating completion hours:', this.formatError(error))
      throw error
    }
  }
}
