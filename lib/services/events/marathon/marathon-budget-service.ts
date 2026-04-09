// lib/services/events/marathon/marathon-budget-service.ts
// Budget income and expense tracking service for marathon events.
// Created: 2026-04-07

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MarathonBudgetItem,
  CreateMarathonBudgetItemDto,
} from '@/types/events-marathon';

// ============================================================================
// Types
// ============================================================================

export interface BudgetSummary {
  total_estimated_income: number;
  total_actual_income: number;
  total_estimated_expense: number;
  total_actual_expense: number;
  estimated_balance: number;
  actual_balance: number;
  by_category: {
    category: string;
    type: string;
    estimated: number;
    actual: number;
  }[];
}

// ============================================================================
// Service
// ============================================================================

export class MarathonBudgetService {
  private static supabase = createClientSupabaseClient();

  // --------------------------------------------------------------------------
  // CRUD
  // --------------------------------------------------------------------------

  /**
   * List all budget items for an event, ordered by type then category.
   */
  static async getBudgetItems(eventId: string): Promise<MarathonBudgetItem[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_budget_items')
        .select('*')
        .eq('event_id', eventId)
        .order('type', { ascending: true })
        .order('category', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('events/marathon-budget', 'Failed to fetch budget items', error);
        throw error;
      }

      return (data as unknown as MarathonBudgetItem[]) ?? [];
    } catch (error) {
      logger.error('events/marathon-budget', 'Unexpected error in getBudgetItems', error);
      throw error;
    }
  }

  /**
   * Create a new budget item.
   */
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
        .from('marathon_budget_items')
        .insert([insertPayload])
        .select('*')
        .single();

      if (error) {
        logger.error('events/marathon-budget', 'Failed to create budget item', error);
        throw error;
      }

      logger.info('events/marathon-budget', 'Budget item created', {
        eventId: dto.event_id,
        category: dto.category,
        type: dto.type,
      });

      return data as unknown as MarathonBudgetItem;
    } catch (error) {
      logger.error('events/marathon-budget', 'Unexpected error in createBudgetItem', error);
      throw error;
    }
  }

  /**
   * Update an existing budget item.
   */
  static async updateBudgetItem(
    id: string,
    dto: Partial<MarathonBudgetItem>
  ): Promise<MarathonBudgetItem> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_budget_items')
        .update(dto)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        logger.error('events/marathon-budget', 'Failed to update budget item', { id, error });
        throw error;
      }

      return data as unknown as MarathonBudgetItem;
    } catch (error) {
      logger.error('events/marathon-budget', 'Unexpected error in updateBudgetItem', error);
      throw error;
    }
  }

  /**
   * Delete a budget item.
   */
  static async deleteBudgetItem(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('marathon_budget_items')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('events/marathon-budget', 'Failed to delete budget item', { id, error });
        throw error;
      }

      logger.info('events/marathon-budget', 'Budget item deleted', { id });
    } catch (error) {
      logger.error('events/marathon-budget', 'Unexpected error in deleteBudgetItem', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------

  /**
   * Compute aggregated budget summary — totals by type and per-category breakdown.
   */
  static async getBudgetSummary(eventId: string): Promise<BudgetSummary> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('marathon_budget_items')
        .select('category, type, estimated_amount, actual_amount, status')
        .eq('event_id', eventId);

      if (error) {
        logger.error('events/marathon-budget', 'Failed to fetch items for summary', error);
        throw error;
      }

      const rows = (data ?? []) as {
        category: string;
        type: string;
        estimated_amount: number;
        actual_amount: number;
        status: string;
      }[];

      // Aggregate totals
      let total_estimated_income = 0;
      let total_actual_income = 0;
      let total_estimated_expense = 0;
      let total_actual_expense = 0;

      // Per-category map: key = `${category}||${type}`
      const categoryMap = new Map<
        string,
        { category: string; type: string; estimated: number; actual: number }
      >();

      for (const row of rows) {
        // Skip cancelled items from summary totals
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
          categoryMap.set(key, {
            category: row.category,
            type: row.type,
            estimated,
            actual,
          });
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
      logger.error('events/marathon-budget', 'Unexpected error in getBudgetSummary', error);
      throw error;
    }
  }
}
