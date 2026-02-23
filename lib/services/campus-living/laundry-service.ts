import { createClientSupabaseClient } from '@/lib/supabase/client'
import { logger } from '@/lib/utils/enhanced-logger'
import type {
  HostelLaundryConfig,
  CreateLaundryConfigDTO,
  LaundryConfigFilters,
  HostelLaundryOrder,
  CreateLaundryOrderDTO,
  LaundryOrderFilters,
  LaundryItem,
} from '@/types/campus-living'

export class LaundryService {
  // ── List laundry configs ────────────────────────────────────────────
  static async getConfigs(
    institutionId: string,
    filters?: LaundryConfigFilters
  ) {
    try {
      const supabase = createClientSupabaseClient()
      let query = (supabase as any)
        .from('hostel_laundry_configs')
        .select('*, block:hostel_blocks(name, code)')
        .eq('institution_id', institutionId)

      if (filters?.block_id) query = query.eq('block_id', filters.block_id)
      if (filters?.service_type) query = query.eq('service_type', filters.service_type)
      if (filters?.is_active !== undefined) query = query.eq('is_active', filters.is_active)

      query = query.order('created_at', { ascending: false })

      const { data, error } = await query
      if (error) {
        logger.error('campus-living/laundry', 'Failed to fetch laundry configs', error)
        throw error
      }
      return data as HostelLaundryConfig[]
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in getConfigs', error)
      throw error
    }
  }

  // ── Single laundry config ───────────────────────────────────────────
  static async getConfig(id: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_laundry_configs')
        .select('*, block:hostel_blocks(name, code)')
        .eq('id', id)
        .single()

      if (error) {
        logger.error('campus-living/laundry', 'Failed to fetch laundry config', error)
        throw error
      }
      return data as HostelLaundryConfig
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in getConfig', error)
      throw error
    }
  }

  // ── Create laundry config ───────────────────────────────────────────
  static async createConfig(payload: CreateLaundryConfigDTO) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_laundry_configs')
        .insert(payload)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/laundry', 'Failed to create laundry config', error)
        throw error
      }
      return data as HostelLaundryConfig
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in createConfig', error)
      throw error
    }
  }

  // ── Update laundry config ───────────────────────────────────────────
  static async updateConfig(id: string, payload: Partial<HostelLaundryConfig>) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_laundry_configs')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/laundry', 'Failed to update laundry config', error)
        throw error
      }
      return data as HostelLaundryConfig
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in updateConfig', error)
      throw error
    }
  }

  // ── List laundry orders ─────────────────────────────────────────────
  static async getOrders(
    institutionId: string,
    filters?: LaundryOrderFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient()
      let query = (supabase as any)
        .from('hostel_laundry_orders')
        .select(
          '*, block:hostel_blocks(name, code), learner:profiles!hostel_laundry_orders_learner_id_fkey(full_name, email, phone)',
          { count: 'exact' }
        )
        .eq('institution_id', institutionId)

      if (filters?.block_id) query = query.eq('block_id', filters.block_id)
      if (filters?.status) query = query.eq('status', filters.status)
      if (filters?.learner_id) query = query.eq('learner_id', filters.learner_id)
      if (filters?.date_from) query = query.gte('created_at', filters.date_from)
      if (filters?.date_to) query = query.lte('created_at', filters.date_to)

      const from = (page - 1) * pageSize
      query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1)

      const { data, error, count } = await query
      if (error) {
        logger.error('campus-living/laundry', 'Failed to fetch laundry orders', error)
        throw error
      }
      return { data: data as HostelLaundryOrder[], count: count ?? 0 }
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in getOrders', error)
      throw error
    }
  }

  // ── Single laundry order ────────────────────────────────────────────
  static async getOrder(id: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_laundry_orders')
        .select(
          '*, block:hostel_blocks(name, code), learner:profiles!hostel_laundry_orders_learner_id_fkey(full_name, email, phone)'
        )
        .eq('id', id)
        .single()

      if (error) {
        logger.error('campus-living/laundry', 'Failed to fetch laundry order', error)
        throw error
      }
      return data as HostelLaundryOrder
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in getOrder', error)
      throw error
    }
  }

  // ── Create laundry order ────────────────────────────────────────────
  static async createOrder(payload: CreateLaundryOrderDTO) {
    try {
      const supabase = createClientSupabaseClient()
      const orderNumber = `LO-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`

      const { data, error } = await (supabase as any)
        .from('hostel_laundry_orders')
        .insert({
          ...payload,
          order_number: orderNumber,
          status: 'submitted',
          total_returned: 0,
          total_damaged: 0,
          total_missing: 0,
          student_confirmed: false,
        })
        .select()
        .single()

      if (error) {
        logger.error('campus-living/laundry', 'Failed to create laundry order', error)
        throw error
      }
      return data as HostelLaundryOrder
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in createOrder', error)
      throw error
    }
  }

  // ── Collect order ───────────────────────────────────────────────────
  static async collectOrder(id: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_laundry_orders')
        .update({
          status: 'collected',
          collected_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/laundry', 'Failed to collect order', error)
        throw error
      }
      return data as HostelLaundryOrder
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in collectOrder', error)
      throw error
    }
  }

  // ── Mark order ready ────────────────────────────────────────────────
  static async markReady(id: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_laundry_orders')
        .update({
          status: 'ready',
          ready_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/laundry', 'Failed to mark order ready', error)
        throw error
      }
      return data as HostelLaundryOrder
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in markReady', error)
      throw error
    }
  }

  // ── Deliver order ───────────────────────────────────────────────────
  static async deliverOrder(id: string, returnedItems: LaundryItem[]) {
    try {
      const supabase = createClientSupabaseClient()

      // Calculate totals from returned items
      let totalReturned = 0
      let totalDamaged = 0
      let totalItems = 0

      for (const item of returnedItems) {
        totalReturned += item.returned
        totalDamaged += item.damaged
        totalItems += item.quantity
      }

      const totalMissing = totalItems - totalReturned - totalDamaged

      const { data, error } = await (supabase as any)
        .from('hostel_laundry_orders')
        .update({
          items: returnedItems,
          total_returned: totalReturned,
          total_damaged: totalDamaged,
          total_missing: Math.max(0, totalMissing),
          status: 'delivered',
          delivered_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/laundry', 'Failed to deliver order', error)
        throw error
      }
      return data as HostelLaundryOrder
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in deliverOrder', error)
      throw error
    }
  }

  // ── Confirm delivery (by student) ───────────────────────────────────
  static async confirmDelivery(id: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_laundry_orders')
        .update({ student_confirmed: true })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/laundry', 'Failed to confirm delivery', error)
        throw error
      }
      return data as HostelLaundryOrder
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in confirmDelivery', error)
      throw error
    }
  }

  // ── Raise dispute ───────────────────────────────────────────────────
  static async raiseDispute(id: string, reason: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_laundry_orders')
        .update({
          status: 'disputed',
          dispute_reason: reason,
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/laundry', 'Failed to raise dispute', error)
        throw error
      }
      return data as HostelLaundryOrder
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in raiseDispute', error)
      throw error
    }
  }

  // ── Student order history ───────────────────────────────────────────
  static async getStudentHistory(learnerId: string, page = 1, pageSize = 20) {
    try {
      const supabase = createClientSupabaseClient()
      const from = (page - 1) * pageSize

      const { data, error, count } = await (supabase as any)
        .from('hostel_laundry_orders')
        .select('*', { count: 'exact' })
        .eq('learner_id', learnerId)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1)

      if (error) {
        logger.error('campus-living/laundry', 'Failed to fetch student history', error)
        throw error
      }
      return { data: data as HostelLaundryOrder[], count: count ?? 0 }
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in getStudentHistory', error)
      throw error
    }
  }

  // ── Daily schedule (collections & deliveries for a day) ─────────────
  static async getDailySchedule(
    institutionId: string,
    dayOfWeek: number
  ): Promise<{ collections: HostelLaundryConfig[]; deliveries: HostelLaundryConfig[] }> {
    try {
      const supabase = createClientSupabaseClient()

      const { data, error } = await (supabase as any)
        .from('hostel_laundry_configs')
        .select('*, block:hostel_blocks(name, code)')
        .eq('institution_id', institutionId)
        .eq('is_active', true)

      if (error) {
        logger.error('campus-living/laundry', 'Failed to fetch daily schedule', error)
        throw error
      }

      const configs = (data ?? []) as (HostelLaundryConfig & { block: unknown })[]

      const collections = configs.filter(
        (c) => c.collection_days && c.collection_days.includes(dayOfWeek)
      )
      const deliveries = configs.filter(
        (c) => c.delivery_days && c.delivery_days.includes(dayOfWeek)
      )

      return {
        collections: collections as HostelLaundryConfig[],
        deliveries: deliveries as HostelLaundryConfig[],
      }
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in getDailySchedule', error)
      throw error
    }
  }

  // ── Laundry stats ───────────────────────────────────────────────────
  static async getStats(
    institutionId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<{
    total: number
    by_status: Record<string, number>
    avg_turnaround_hours: number
    dispute_rate: number
  }> {
    try {
      const supabase = createClientSupabaseClient()
      let query = (supabase as any)
        .from('hostel_laundry_orders')
        .select('status, collected_at, delivered_at')
        .eq('institution_id', institutionId)

      if (dateFrom) query = query.gte('created_at', dateFrom)
      if (dateTo) query = query.lte('created_at', dateTo)

      const { data, error } = await query
      if (error) {
        logger.error('campus-living/laundry', 'Failed to fetch laundry stats', error)
        throw error
      }

      const orders = (data ?? []) as {
        status: string
        collected_at: string | null
        delivered_at: string | null
      }[]

      const total = orders.length
      if (total === 0) {
        return { total: 0, by_status: {}, avg_turnaround_hours: 0, dispute_rate: 0 }
      }

      // Count by status
      const byStatus: Record<string, number> = {}
      for (const order of orders) {
        byStatus[order.status] = (byStatus[order.status] ?? 0) + 1
      }

      // Average turnaround: delivered_at - collected_at (only for completed orders)
      const turnaroundMs: number[] = []
      for (const order of orders) {
        if (order.collected_at && order.delivered_at) {
          const diff =
            new Date(order.delivered_at).getTime() - new Date(order.collected_at).getTime()
          if (diff > 0) turnaroundMs.push(diff)
        }
      }

      const avgTurnaroundHours =
        turnaroundMs.length > 0
          ? Math.round(
              (turnaroundMs.reduce((sum, v) => sum + v, 0) /
                turnaroundMs.length /
                (1000 * 60 * 60)) *
                10
            ) / 10
          : 0

      // Dispute rate
      const disputeCount = byStatus['disputed'] ?? 0
      const disputeRate = Math.round((disputeCount / total) * 10000) / 100

      return {
        total,
        by_status: byStatus,
        avg_turnaround_hours: avgTurnaroundHours,
        dispute_rate: disputeRate,
      }
    } catch (error) {
      logger.error('campus-living/laundry', 'Unexpected error in getStats', error)
      throw error
    }
  }
}
