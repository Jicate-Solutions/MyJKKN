import { createClientSupabaseClient } from '@/lib/supabase/client'
import { logger } from '@/lib/utils/enhanced-logger'
import type {
  HostelHealthCase,
  CreateHealthCaseDTO,
  HealthCaseFilters,
} from '@/types/campus-living'

export class HealthService {
  // ── List health cases with filters ──────────────────────────────────
  static async getCases(institutionId: string, filters?: HealthCaseFilters) {
    try {
      const supabase = createClientSupabaseClient()
      let query = (supabase as any)
        .from('hostel_health_cases')
        .select('*')
        .eq('institution_id', institutionId)

      if (filters?.block_id) query = query.eq('block_id', filters.block_id)
      if (filters?.status) query = query.eq('status', filters.status)
      if (filters?.severity) query = query.eq('severity', filters.severity)
      if (filters?.learner_id) query = query.eq('learner_id', filters.learner_id)
      if (filters?.date_from) query = query.gte('created_at', filters.date_from)
      if (filters?.date_to) query = query.lte('created_at', filters.date_to)

      query = query.order('created_at', { ascending: false })

      const { data, error } = await query
      if (error) {
        logger.error('campus-living/health', 'Failed to fetch cases', error)
        throw error
      }
      return data as HostelHealthCase[]
    } catch (error) {
      logger.error('campus-living/health', 'Unexpected error in getCases', error)
      throw error
    }
  }

  // ── Single case ────────────────────────────────────────────────────
  static async getCase(id: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_health_cases')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        logger.error('campus-living/health', 'Failed to fetch case', error)
        throw error
      }
      return data as HostelHealthCase
    } catch (error) {
      logger.error('campus-living/health', 'Unexpected error in getCase', error)
      throw error
    }
  }

  // ── Create case ────────────────────────────────────────────────────
  static async createCase(data: CreateHealthCaseDTO) {
    try {
      const supabase = createClientSupabaseClient()
      const caseNumber = `HC-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`

      const { data: created, error } = await (supabase as any)
        .from('hostel_health_cases')
        .insert({ ...data, case_number: caseNumber })
        .select()
        .single()

      if (error) {
        logger.error('campus-living/health', 'Failed to create case', error)
        throw error
      }
      return created as HostelHealthCase
    } catch (error) {
      logger.error('campus-living/health', 'Unexpected error in createCase', error)
      throw error
    }
  }

  // ── Update case ────────────────────────────────────────────────────
  static async updateCase(id: string, data: Partial<HostelHealthCase>) {
    try {
      const supabase = createClientSupabaseClient()
      const { data: updated, error } = await (supabase as any)
        .from('hostel_health_cases')
        .update(data)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/health', 'Failed to update case', error)
        throw error
      }
      return updated as HostelHealthCase
    } catch (error) {
      logger.error('campus-living/health', 'Unexpected error in updateCase', error)
      throw error
    }
  }

  // ── Delete case ────────────────────────────────────────────────────
  static async deleteCase(id: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { error } = await (supabase as any)
        .from('hostel_health_cases')
        .delete()
        .eq('id', id)

      if (error) {
        logger.error('campus-living/health', 'Failed to delete case', error)
        throw error
      }
    } catch (error) {
      logger.error('campus-living/health', 'Unexpected error in deleteCase', error)
      throw error
    }
  }

  // ── Record first aid ──────────────────────────────────────────────
  static async recordFirstAid(id: string, firstAidGiven: string, firstAidBy: string) {
    try {
      return await this.updateCase(id, {
        first_aid_given: firstAidGiven,
        first_aid_by: firstAidBy,
        first_aid_at: new Date().toISOString(),
        status: 'first_aid',
      } as Partial<HostelHealthCase>)
    } catch (error) {
      logger.error('campus-living/health', 'Unexpected error in recordFirstAid', error)
      throw error
    }
  }

  // ── Refer to doctor ───────────────────────────────────────────────
  static async referToDoctor(id: string, doctorName: string) {
    try {
      return await this.updateCase(id, {
        doctor_name: doctorName,
        doctor_referral_at: new Date().toISOString(),
        status: 'doctor_referred',
      } as Partial<HostelHealthCase>)
    } catch (error) {
      logger.error('campus-living/health', 'Unexpected error in referToDoctor', error)
      throw error
    }
  }

  // ── Hospitalize ───────────────────────────────────────────────────
  static async hospitalize(id: string, hospitalName: string) {
    try {
      return await this.updateCase(id, {
        hospital_name: hospitalName,
        status: 'hospitalized',
      } as Partial<HostelHealthCase>)
    } catch (error) {
      logger.error('campus-living/health', 'Unexpected error in hospitalize', error)
      throw error
    }
  }

  // ── Notify parent ─────────────────────────────────────────────────
  static async notifyParent(id: string, notifiedBy: string) {
    try {
      return await this.updateCase(id, {
        parent_notified: true,
        parent_notified_at: new Date().toISOString(),
        parent_notified_by: notifiedBy,
      } as Partial<HostelHealthCase>)
    } catch (error) {
      logger.error('campus-living/health', 'Unexpected error in notifyParent', error)
      throw error
    }
  }

  // ── Clear student ─────────────────────────────────────────────────
  static async clearStudent(id: string, clearedBy: string, recoveryNotes?: string) {
    try {
      return await this.updateCase(id, {
        cleared_by: clearedBy,
        cleared_at: new Date().toISOString(),
        recovery_notes: recoveryNotes,
        status: 'cleared',
      } as Partial<HostelHealthCase>)
    } catch (error) {
      logger.error('campus-living/health', 'Unexpected error in clearStudent', error)
      throw error
    }
  }

  // ── Close case ────────────────────────────────────────────────────
  static async closeCase(id: string) {
    try {
      return await this.updateCase(id, { status: 'closed' } as Partial<HostelHealthCase>)
    } catch (error) {
      logger.error('campus-living/health', 'Unexpected error in closeCase', error)
      throw error
    }
  }

  // ── Get active cases (not cleared or closed) ──────────────────────
  static async getActiveCases(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_health_cases')
        .select('*')
        .eq('institution_id', institutionId)
        .not('status', 'in', '("cleared","closed")')
        .order('created_at', { ascending: false })

      if (error) {
        logger.error('campus-living/health', 'Failed to fetch active cases', error)
        throw error
      }
      return data as HostelHealthCase[]
    } catch (error) {
      logger.error('campus-living/health', 'Unexpected error in getActiveCases', error)
      throw error
    }
  }

  // ── Get stats ─────────────────────────────────────────────────────
  static async getStats(institutionId: string) {
    try {
      const activeCases = await this.getActiveCases(institutionId)

      const bySeverity = {
        minor: 0,
        moderate: 0,
        serious: 0,
        emergency: 0,
      }

      let parentNotifiedCount = 0

      for (const c of activeCases) {
        const severity = (c as any).severity as string
        if (severity in bySeverity) {
          bySeverity[severity as keyof typeof bySeverity]++
        }
        if ((c as any).parent_notified) {
          parentNotifiedCount++
        }
      }

      const totalActive = activeCases.length
      const parentNotificationRate =
        totalActive > 0 ? Math.round((parentNotifiedCount / totalActive) * 100) : 0

      return {
        total_active: totalActive,
        by_severity: bySeverity,
        parent_notification_rate: parentNotificationRate,
      }
    } catch (error) {
      logger.error('campus-living/health', 'Unexpected error in getStats', error)
      throw error
    }
  }
}
