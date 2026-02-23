import { createClientSupabaseClient } from '@/lib/supabase/client'
import { logger } from '@/lib/utils/enhanced-logger'
import type {
  HostelAmcContract,
  CreateAmcContractDTO,
  AmcContractFilters,
} from '@/types/campus-living'

export class AmcService {
  // ── List AMC contracts with filters ─────────────────────────────────
  static async getContracts(
    institutionId: string,
    filters?: AmcContractFilters
  ) {
    try {
      const supabase = createClientSupabaseClient()
      let query = (supabase as any)
        .from('hostel_amc_contracts')
        .select('*, hostel_blocks(name, code)', { count: 'exact' })
        .eq('institution_id', institutionId)

      if (filters?.block_id) query = query.eq('block_id', filters.block_id)
      if (filters?.status) query = query.eq('status', filters.status)
      if (filters?.category) query = query.eq('category', filters.category)

      query = query.order('end_date', { ascending: true })

      const { data, error, count } = await query
      if (error) {
        logger.error('campus-living/amc', 'Failed to fetch contracts', error)
        throw error
      }
      return { data: data as HostelAmcContract[], count: count ?? 0 }
    } catch (error) {
      logger.error('campus-living/amc', 'Unexpected error in getContracts', error)
      throw error
    }
  }

  // ── Single contract ─────────────────────────────────────────────────
  static async getContract(id: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_amc_contracts')
        .select('*, hostel_blocks(name, code)')
        .eq('id', id)
        .single()

      if (error) {
        logger.error('campus-living/amc', 'Failed to fetch contract', error)
        throw error
      }
      return data as HostelAmcContract & Record<string, unknown>
    } catch (error) {
      logger.error('campus-living/amc', 'Unexpected error in getContract', error)
      throw error
    }
  }

  // ── Create contract ─────────────────────────────────────────────────
  static async createContract(payload: CreateAmcContractDTO) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_amc_contracts')
        .insert(payload)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/amc', 'Failed to create contract', error)
        throw error
      }
      return data as HostelAmcContract
    } catch (error) {
      logger.error('campus-living/amc', 'Unexpected error in createContract', error)
      throw error
    }
  }

  // ── Update contract ─────────────────────────────────────────────────
  static async updateContract(
    id: string,
    payload: Partial<CreateAmcContractDTO> & { status?: string }
  ) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_amc_contracts')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/amc', 'Failed to update contract', error)
        throw error
      }
      return data as HostelAmcContract
    } catch (error) {
      logger.error('campus-living/amc', 'Unexpected error in updateContract', error)
      throw error
    }
  }

  // ── Delete contract ─────────────────────────────────────────────────
  static async deleteContract(id: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { error } = await (supabase as any)
        .from('hostel_amc_contracts')
        .delete()
        .eq('id', id)

      if (error) {
        logger.error('campus-living/amc', 'Failed to delete contract', error)
        throw error
      }
    } catch (error) {
      logger.error('campus-living/amc', 'Unexpected error in deleteContract', error)
      throw error
    }
  }

  // ── Get contracts expiring within N days ────────────────────────────
  static async getExpiringContracts(
    institutionId: string,
    withinDays: number = 30
  ) {
    try {
      const supabase = createClientSupabaseClient()
      const today = new Date().toISOString().split('T')[0]
      const future = new Date()
      future.setDate(future.getDate() + withinDays)
      const futureDate = future.toISOString().split('T')[0]

      const { data, error } = await (supabase as any)
        .from('hostel_amc_contracts')
        .select('*, hostel_blocks(name, code)')
        .eq('institution_id', institutionId)
        .eq('status', 'active')
        .gte('end_date', today)
        .lte('end_date', futureDate)
        .order('end_date', { ascending: true })

      if (error) {
        logger.error('campus-living/amc', 'Failed to fetch expiring contracts', error)
        throw error
      }
      return data as HostelAmcContract[]
    } catch (error) {
      logger.error('campus-living/amc', 'Unexpected error in getExpiringContracts', error)
      throw error
    }
  }

  // ── Renew a contract ────────────────────────────────────────────────
  static async renewContract(
    id: string,
    newEndDate: string,
    newCost?: number
  ) {
    try {
      const supabase = createClientSupabaseClient()
      const today = new Date().toISOString().split('T')[0]

      const updatePayload: Record<string, unknown> = {
        end_date: newEndDate,
        status: 'renewed',
        last_service_date: today,
      }

      if (newCost !== undefined) {
        updatePayload.annual_cost = newCost
      }

      const { data, error } = await (supabase as any)
        .from('hostel_amc_contracts')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/amc', 'Failed to renew contract', error)
        throw error
      }
      return data as HostelAmcContract
    } catch (error) {
      logger.error('campus-living/amc', 'Unexpected error in renewContract', error)
      throw error
    }
  }

  // ── Get AMC stats for institution ───────────────────────────────────
  static async getStats(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient()
      const today = new Date().toISOString().split('T')[0]
      const future = new Date()
      future.setDate(future.getDate() + 30)
      const futureDate = future.toISOString().split('T')[0]

      // Fetch all contracts for institution
      const { data: contracts, error } = await (supabase as any)
        .from('hostel_amc_contracts')
        .select('status, end_date, annual_cost')
        .eq('institution_id', institutionId)

      if (error) {
        logger.error('campus-living/amc', 'Failed to fetch stats', error)
        throw error
      }

      const all = (contracts ?? []) as Array<{
        status: string
        end_date: string
        annual_cost: number | null
      }>

      const total = all.length
      const active = all.filter((c) => c.status === 'active').length
      const expired = all.filter((c) => c.status === 'expired').length
      const expiring_soon = all.filter(
        (c) =>
          c.status === 'active' &&
          c.end_date >= today &&
          c.end_date <= futureDate
      ).length
      const total_annual_cost = all
        .filter((c) => c.status === 'active')
        .reduce((sum, c) => sum + (c.annual_cost ?? 0), 0)

      return { total, active, expiring_soon, expired, total_annual_cost }
    } catch (error) {
      logger.error('campus-living/amc', 'Unexpected error in getStats', error)
      throw error
    }
  }
}
