// lib/services/ims/department-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { issueStockToDepartment } from './issue-stock';
import type {
  ImsDepartmentStock,
  ImsDepartmentSummary,
  ImsDepartmentStockMovement,
  ImsDepartmentStockFilters,
  CreateImsDepartmentIssueDto,
  CreateImsDepartmentConsumptionDto,
} from '@/types/ims';

export interface ImsDepartmentOption {
  id: string;
  department_name: string;
  department_code: string;
}

/** An item with stock on hand, for the "issue to department" picker. */
export interface ImsIssuableItem {
  item_id: string;
  item_name: string;
  item_code: string;
  available_quantity: number;
  unit_abbreviation: string | null;
}

/**
 * IMS-scoped department reader.
 *
 * Reads directly from the local Supabase `departments` table so IMS dropdowns
 * (indents, transfers, etc.) keep working when the JKKN upstream API is
 * unreachable or its key is missing. The global `DepartmentService.getDepartments`
 * remains JKKN-backed for academic/billing modules that need the canonical list.
 */
export class ImsDepartmentService {
  private static get supabase() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /**
   * Active departments for a select/dropdown, scoped to one institution when
   * provided. Returns an empty array (not throw) on no-rows; throws on real
   * Supabase errors so React Query surfaces an `isError` state.
   */
  static async getDepartmentsForSelect(
    institutionId?: string | null
  ): Promise<ImsDepartmentOption[]> {
    let query = this.supabase
      .from('departments')
      .select('id, department_name, department_code')
      .eq('is_active', true)
      .order('department_order', { ascending: true })
      .order('department_name', { ascending: true });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;

    if (error) {
      console.error(
        '[ImsDepartmentService] getDepartmentsForSelect failed',
        error
      );
      throw error;
    }

    return (data ?? []) as ImsDepartmentOption[];
  }

  /**
   * Per-(department, item) stock balance rows backing the Department Stock
   * table. Sourced from the `ims_department_stock_summary` view which
   * full-outer-joins ims_stock_issues + ims_department_consumption.
   *
   * Filter rules: store_id is the primary scope (matches the rest of IMS),
   * institution_id is the fallback when no store is selected. department_id
   * and search are optional narrowing filters applied server-side.
   */
  static async getDepartmentStock(
    filters: ImsDepartmentStockFilters
  ): Promise<ImsDepartmentStock[]> {
    let query = this.supabase
      .from('ims_department_stock_summary')
      .select(
        'department_id, department_name, item_id, item_name, total_issued, total_consumed, balance'
      );

    if (filters.store_id) {
      query = query.eq('store_id', filters.store_id);
    } else if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    if (filters.department_id && filters.department_id !== 'all') {
      query = query.eq('department_id', filters.department_id);
    }

    if (filters.search) {
      query = query.or(
        `item_name.ilike.%${filters.search}%,department_name.ilike.%${filters.search}%`
      );
    }

    const { data, error } = await query
      .order('department_name', { ascending: true })
      .order('item_name', { ascending: true });

    if (error) {
      console.error('[ImsDepartmentService] getDepartmentStock failed', error);
      throw error;
    }

    return (data ?? []) as ImsDepartmentStock[];
  }

  /**
   * Per-department rollups for the 4 summary cards at the top of the page.
   * Aggregates the same view used by getDepartmentStock — kept as a separate
   * call (and a separate query key) so the cards can refetch independently of
   * the table when filters change. Aggregation is done in JS rather than SQL
   * because row volume is bounded (departments × items per institution) and
   * adding a second view for this would duplicate logic.
   */
  static async getDepartmentSummaries(filters: {
    store_id?: string | null;
    institution_id?: string;
  }): Promise<ImsDepartmentSummary[]> {
    let query = this.supabase
      .from('ims_department_stock_summary')
      .select(
        'department_id, department_name, item_id, item_cost_price, balance'
      );

    if (filters.store_id) {
      query = query.eq('store_id', filters.store_id);
    } else if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error(
        '[ImsDepartmentService] getDepartmentSummaries failed',
        error
      );
      throw error;
    }

    type Row = {
      department_id: string;
      department_name: string;
      item_id: string;
      item_cost_price: number | null;
      balance: number | null;
    };

    const rollup = new Map<string, ImsDepartmentSummary>();
    for (const row of (data ?? []) as Row[]) {
      const balance = Number(row.balance ?? 0);
      if (balance <= 0) continue;
      const cost = Number(row.item_cost_price ?? 0);
      const existing = rollup.get(row.department_id);
      if (existing) {
        existing.total_items += 1;
        existing.total_value += cost * balance;
      } else {
        rollup.set(row.department_id, {
          department_id: row.department_id,
          department_name: row.department_name,
          total_items: 1,
          total_value: cost * balance,
        });
      }
    }

    return Array.from(rollup.values()).sort((a, b) =>
      a.department_name.localeCompare(b.department_name)
    );
  }

  /**
   * Chronological movement events for one (department, item) pair. Used by
   * the "View History" dialog. Joins the `ims_department_item_movements` view
   * (UNION of stock issues + consumption rows) with `profiles` for the
   * cashier/issuer name.
   */
  static async getDepartmentItemMovements(
    departmentId: string,
    itemId: string,
    filters: { store_id?: string | null; institution_id?: string }
  ): Promise<ImsDepartmentStockMovement[]> {
    let query = this.supabase
      .from('ims_department_item_movements')
      .select(
        `id, type, quantity, notes, created_at,
         created_by:profiles!created_by_id(full_name)`
      )
      .eq('department_id', departmentId)
      .eq('item_id', itemId);

    if (filters.store_id) {
      query = query.eq('store_id', filters.store_id);
    } else if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    const { data, error } = await query.order('created_at', {
      ascending: false,
    });

    if (error) {
      console.error(
        '[ImsDepartmentService] getDepartmentItemMovements failed',
        error
      );
      throw error;
    }

    return (data ?? []) as ImsDepartmentStockMovement[];
  }

  /**
   * Items that can actually be issued right now: active catalog items with
   * stock on hand at this store, plus how much is available.
   *
   * Driven off ims_stock_summary rather than ims_items so the dropdown can show
   * live availability and hide items with nothing left — you can't issue what
   * the store doesn't have. Unpaginated on purpose: it backs a select, and the
   * row count is bounded by the store's catalog.
   */
  static async getIssuableItems(filters: {
    store_id?: string | null;
    institution_id?: string;
  }): Promise<ImsIssuableItem[]> {
    let query = this.supabase
      .from('ims_stock_summary')
      .select(
        `item_id, available_quantity,
         item:ims_items!inner(id, name, code, is_active,
           base_unit:ims_units!ims_items_base_unit_id_fkey(abbreviation))`
      )
      .gt('available_quantity', 0)
      .eq('item.is_active', true);

    if (filters.store_id) {
      query = query.eq('store_id', filters.store_id);
    } else if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ImsDepartmentService] getIssuableItems failed', error);
      throw error;
    }

    return ((data ?? []) as any[])
      .map((row) => ({
        item_id: row.item_id,
        item_name: row.item?.name ?? '',
        item_code: row.item?.code ?? '',
        available_quantity: Number(row.available_quantity ?? 0),
        unit_abbreviation: row.item?.base_unit?.abbreviation ?? null,
      }))
      .sort((a, b) => a.item_name.localeCompare(b.item_name));
  }

  /**
   * Issue an item straight from store stock to a department, without going
   * through the indent request/approve cycle.
   *
   * Same effect as issuing an approved indent item: store stock goes down,
   * department balance goes up. Delegates to the shared issueStockToDepartment
   * helper, which enforces the "never issue more than is available" guard.
   */
  static async issueItemToDepartment(
    data: CreateImsDepartmentIssueDto,
    userId: string
  ): Promise<void> {
    try {
      // ims_stock_issues.unit_id is NOT NULL — fall back to the item's base
      // unit, since a direct issue has no indent line to inherit a unit from.
      const { data: item, error: itemError } = await this.supabase
        .from('ims_items')
        .select('base_unit_id')
        .eq('id', data.item_id)
        .single();

      if (itemError || !item) throw itemError || new Error('Item not found');
      if (!item.base_unit_id) {
        throw new Error('Cannot issue item: item has no base unit configured');
      }

      await issueStockToDepartment({
        item_id: data.item_id,
        unit_id: item.base_unit_id,
        quantity: data.quantity,
        department_id: data.department_id,
        issued_by: userId,
        indent_id: null,
        notes: data.notes || null,
        store_id: data.store_id,
        institution_id: data.institution_id,
      });
    } catch (error) {
      console.error(
        '[ImsDepartmentService] issueItemToDepartment failed',
        error
      );
      throw error;
    }
  }

  /**
   * Record that a department used up some of the stock it holds.
   *
   * Writes to ims_department_consumption, which drives the Total Consumed
   * column (balance = total_issued - total_consumed). Deliberately does NOT
   * touch ims_stock_summary: the stock already left the store when it was
   * issued, so decrementing again would double-count it.
   */
  static async recordConsumption(
    data: CreateImsDepartmentConsumptionDto,
    userId: string
  ): Promise<void> {
    try {
      // Guard against consuming more than the department currently holds —
      // the summary view is the authority on that balance.
      let balanceQuery = this.supabase
        .from('ims_department_stock_summary')
        .select('balance')
        .eq('department_id', data.department_id)
        .eq('item_id', data.item_id);
      balanceQuery = data.store_id
        ? balanceQuery.eq('store_id', data.store_id)
        : balanceQuery.eq('institution_id', data.institution_id);

      const { data: row, error: balanceError } = await balanceQuery.maybeSingle();
      if (balanceError) throw balanceError;

      const balance = Number(row?.balance ?? 0);
      if (data.quantity > balance) {
        throw new Error(
          `Cannot record ${data.quantity} used. Department only holds ${balance}`
        );
      }

      // ims_department_consumption.value is NOT NULL — price the usage at the
      // item's current cost so the summary cards' total_value stays meaningful.
      const { data: item, error: itemError } = await this.supabase
        .from('ims_items')
        .select('cost_price')
        .eq('id', data.item_id)
        .single();
      if (itemError) throw itemError;

      const today = new Date().toISOString().split('T')[0];
      const { error } = await this.supabase
        .from('ims_department_consumption')
        .insert({
          department_id: data.department_id,
          item_id: data.item_id,
          quantity: data.quantity,
          value: Number(item?.cost_price ?? 0) * data.quantity,
          // A UI-entered usage record covers a single day, unlike the batch
          // reporting rows this table was originally designed for.
          period_start: today,
          period_end: today,
          notes: data.notes || null,
          created_by: userId,
          institution_id: data.institution_id ?? null,
          store_id: data.store_id ?? null,
        });

      if (error) throw error;
    } catch (error) {
      console.error('[ImsDepartmentService] recordConsumption failed', error);
      throw error;
    }
  }
}
