// lib/services/events/shared/event-budget-service.ts
// Shared budget service (income/expense tracking + finance sign-off workflow) for ANY event type.
// Promoted from marathon-budget-service (Events Platform Promotion PR2). Reads the renamed
// event_budget_items table; the per-event finance gate lives in event_budget_approvals and is driven
// by the SECURITY DEFINER RPCs fn_submit/approve/reopen_event_budget.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MarathonBudgetItem,
  CreateMarathonBudgetItemDto,
} from '@/types/events-marathon';

const MOD = 'events/budget';

export interface BudgetSummary {
  total_estimated_income: number;
  total_actual_income: number;
  total_estimated_expense: number;
  total_actual_expense: number;
  estimated_balance: number;
  actual_balance: number;
  by_category: { category: string; type: string; estimated: number; actual: number }[];
}

export type EventBudgetStatus = 'draft' | 'submitted' | 'approved' | 'locked';

export interface EventBudgetApproval {
  event_id: string;
  status: EventBudgetStatus;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
}

export class EventBudgetService {
  private static supabase = createClientSupabaseClient();

  // --- Line items ----------------------------------------------------------

  static async getBudgetItems(eventId: string): Promise<MarathonBudgetItem[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_budget_items')
        .select('*')
        .eq('event_id', eventId)
        .order('type', { ascending: true })
        .order('category', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) {
        logger.error(MOD, 'Failed to fetch budget items', error);
        throw error;
      }
      return (data as unknown as MarathonBudgetItem[]) ?? [];
    } catch (error) {
      logger.error(MOD, 'Unexpected error in getBudgetItems', error);
      throw error;
    }
  }

  static async createBudgetItem(dto: CreateMarathonBudgetItemDto): Promise<MarathonBudgetItem> {
    try {
      const insertPayload = {
        event_id: dto.event_id,
        category: dto.category,
        description: dto.description,
        type: dto.type,
        estimated_amount: dto.estimated_amount,
        actual_amount: 0,
        status: 'planned',
        vendor: dto.vendor ?? null,
        notes: dto.notes ?? null,
        approved_by: null,
        receipt_url: null,
      };
      const { data, error } = await (this.supabase as any)
        .from('event_budget_items')
        .insert([insertPayload])
        .select('*')
        .single();
      if (error) {
        logger.error(MOD, 'Failed to create budget item', error);
        throw error;
      }
      logger.info(MOD, 'Budget item created', { eventId: dto.event_id, category: dto.category });
      return data as unknown as MarathonBudgetItem;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in createBudgetItem', error);
      throw error;
    }
  }

  static async updateBudgetItem(
    id: string,
    dto: Partial<MarathonBudgetItem>
  ): Promise<MarathonBudgetItem> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_budget_items')
        .update(dto)
        .eq('id', id)
        .select('*')
        .single();
      if (error) {
        logger.error(MOD, 'Failed to update budget item', { id, error });
        throw error;
      }
      return data as unknown as MarathonBudgetItem;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in updateBudgetItem', error);
      throw error;
    }
  }

  static async deleteBudgetItem(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('event_budget_items')
        .delete()
        .eq('id', id);
      if (error) {
        logger.error(MOD, 'Failed to delete budget item', { id, error });
        throw error;
      }
      logger.info(MOD, 'Budget item deleted', { id });
    } catch (error) {
      logger.error(MOD, 'Unexpected error in deleteBudgetItem', error);
      throw error;
    }
  }

  // --- Summary -------------------------------------------------------------

  static async getBudgetSummary(eventId: string): Promise<BudgetSummary> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_budget_items')
        .select('category, type, estimated_amount, actual_amount, status')
        .eq('event_id', eventId);
      if (error) {
        logger.error(MOD, 'Failed to fetch items for summary', error);
        throw error;
      }
      const rows = (data ?? []) as {
        category: string;
        type: string;
        estimated_amount: number;
        actual_amount: number;
        status: string;
      }[];

      let total_estimated_income = 0;
      let total_actual_income = 0;
      let total_estimated_expense = 0;
      let total_actual_expense = 0;
      const categoryMap = new Map<
        string,
        { category: string; type: string; estimated: number; actual: number }
      >();

      for (const row of rows) {
        if (row.status === 'cancelled') continue;
        const estimated = Number(row.estimated_amount) || 0;
        const actual = Number(row.actual_amount) || 0;
        if (row.type === 'income') {
          total_estimated_income += estimated;
          total_actual_income += actual;
        } else {
          total_estimated_expense += estimated;
          total_actual_expense += actual;
        }
        const key = `${row.category}||${row.type}`;
        const existing = categoryMap.get(key);
        if (existing) {
          existing.estimated += estimated;
          existing.actual += actual;
        } else {
          categoryMap.set(key, { category: row.category, type: row.type, estimated, actual });
        }
      }

      return {
        total_estimated_income,
        total_actual_income,
        total_estimated_expense,
        total_actual_expense,
        estimated_balance: total_estimated_income - total_estimated_expense,
        actual_balance: total_actual_income - total_actual_expense,
        by_category: Array.from(categoryMap.values()),
      };
    } catch (error) {
      logger.error(MOD, 'Unexpected error in getBudgetSummary', error);
      throw error;
    }
  }

  // --- Finance sign-off workflow (decision #7) -----------------------------

  /** Read the per-event approval state (null if never submitted — treat as 'draft'). */
  static async getApproval(eventId: string): Promise<EventBudgetApproval | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_budget_approvals')
        .select('*')
        .eq('event_id', eventId)
        .maybeSingle();
      if (error) {
        logger.error(MOD, 'Failed to fetch budget approval', { eventId, error });
        throw error;
      }
      return (data as EventBudgetApproval | null) ?? null;
    } catch (error) {
      logger.error(MOD, 'Unexpected error in getApproval', error);
      throw error;
    }
  }

  private static async callApprovalRpc(
    fn: 'fn_submit_event_budget' | 'fn_approve_event_budget' | 'fn_reopen_event_budget',
    eventId: string
  ): Promise<EventBudgetApproval> {
    const { data, error } = await (this.supabase as any).rpc(fn, { p_event_id: eventId });
    if (error) {
      logger.error(MOD, `Failed: ${fn}`, { eventId, error });
      throw error;
    }
    // RPC returns the row (or an array with one row depending on PostgREST)
    const row = Array.isArray(data) ? data[0] : data;
    return row as EventBudgetApproval;
  }

  /** Organizer submits the budget for finance sign-off. */
  static submitBudget(eventId: string) {
    return this.callApprovalRpc('fn_submit_event_budget', eventId);
  }

  /** Finance-approved person signs off (locks the budget). */
  static approveBudget(eventId: string) {
    return this.callApprovalRpc('fn_approve_event_budget', eventId);
  }

  /** Approver reopens an approved budget so the organizer can edit again. */
  static reopenBudget(eventId: string) {
    return this.callApprovalRpc('fn_reopen_event_budget', eventId);
  }
}
