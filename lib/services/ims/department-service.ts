// lib/services/ims/department-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ImsDepartmentStock,
  ImsDepartmentSummary,
  ImsDepartmentStockMovement,
  ImsDepartmentStockFilters,
} from '@/types/ims';

export interface ImsDepartmentOption {
  id: string;
  department_name: string;
  department_code: string;
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
}
