// lib/services/events/shared/event-budget-service.ts
// Shared budget service (income/expense tracking + finance sign-off workflow) for ANY event type.
// Promoted from marathon-budget-service (Events Platform Promotion PR2). Reads the renamed
// event_budget_items table; the per-event finance gate lives in event_budget_approvals and is driven
// by the SECURITY DEFINER RPCs fn_submit/approve/reopen_event_budget.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  BudgetLineNode,
  EventBudgetCategory,
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

/** A budget line with no final figure yet — neither spent nor written off. */
export interface UnsettledBudgetLine {
  id: string;
  type: string;
  category: string;
  description: string;
  estimated_amount: number;
}

/** What an event cost, and what it cost per registered head. */
export interface EventBudgetOutcome {
  estimated_income: number;
  actual_income: number;
  estimated_expense: number;
  actual_expense: number;
  registrations: number;
  /** NULL when nobody registered — never 0, which would read as free. */
  estimated_per_head: number | null;
  actual_per_head: number | null;
  books_closed: boolean;
}

export interface CommitteeSpend {
  committee_id: string | null;
  committee_name: string;
  lines: number;
  estimated: number;
  actual: number;
}

export interface CategoryBenchmark {
  category_id: string;
  category_name: string;
  this_estimated: number;
  this_actual: number;
  /** How many OTHER events with closed books this average is drawn from. */
  other_events: number;
  typical_per_head: number | null;
}

export interface EventBudgetApproval {
  event_id: string;
  status: EventBudgetStatus;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  /** Who said, on the record, what this event actually cost. */
  closed_by?: string | null;
  closed_at?: string | null;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Group a flat list of budget lines into top-level lines with their sub-lines.
 *
 * The database allows exactly one level, so this is deliberately not recursive.
 * Two cases have to be handled rather than assumed away:
 *
 *  - An ORPHAN — a row whose parent_id points at a line that is not in the
 *    list. It happens whenever the caller filters (one type, one committee).
 *    Dropping it would silently lose money from the totals, so an orphan is
 *    surfaced as a top-level line instead.
 *  - A row claiming to be its own parent. The database refuses it, but this
 *    function also runs against unsaved drafts, and a self-referencing node
 *    would otherwise disappear.
 *
 * Order is preserved exactly as given, so the caller's ORDER BY is what shows.
 */
export function buildBudgetTree(items: MarathonBudgetItem[]): BudgetLineNode[] {
  const ids = new Set(items.map((i) => i.id));
  const nodes = new Map<string, BudgetLineNode>();
  const roots: BudgetLineNode[] = [];

  for (const line of items) {
    const parent = line.parent_id;
    const isChild = !!parent && parent !== line.id && ids.has(parent);
    if (!isChild) {
      const node: BudgetLineNode = { line, children: [] };
      nodes.set(line.id, node);
      roots.push(node);
    }
  }
  for (const line of items) {
    const parent = line.parent_id;
    if (!parent || parent === line.id || !ids.has(parent)) continue;
    // A parent that is itself a child cannot exist in the database, but if one
    // ever did, treating the row as a root keeps its amount in the totals.
    const node = nodes.get(parent);
    if (node) node.children.push(line);
    else roots.push({ line, children: [] });
  }
  return roots;
}

/** The fields summariseBudget actually reads. */
export interface SummarisableLine {
  id: string;
  parent_id?: string | null;
  category: string;
  type: string;
  estimated_amount: number;
  actual_amount: number;
  status: string;
}

/**
 * Total a budget WITHOUT counting the same money twice.
 *
 * Since sub-lines exist (migration 20270101090000) a parent's amount IS the sum
 * of its children, so adding every row over-states the budget by the whole
 * itemised part of it — silently, and by a plausible-looking amount.
 *
 * Only LEAVES are added: a row that is nobody's parent. A line with no
 * sub-lines is its own leaf, so a budget that has never been itemised totals
 * exactly as it always did. Leaves also give the better category breakdown —
 * "trophies 40,000" rather than the parent's "sports materials 1,52,300".
 *
 * Cancelled lines are excluded, as they always were.
 */
export function summariseBudget(rows: SummarisableLine[]): BudgetSummary {
  const parents = new Set(rows.map((r) => r.parent_id).filter((p): p is string => !!p));
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
    if (parents.has(row.id)) continue; // itemised — its children carry the money
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
        // Drill-down substrate (migration 20270101090000). All NULL on an
        // ordinary top-level line, which is exactly how every line behaved
        // before these columns existed.
        parent_id: dto.parent_id ?? null,
        quantity: dto.quantity ?? null,
        unit_rate: dto.unit_rate ?? null,
        committee_id: dto.committee_id ?? null,
        category_id: dto.category_id ?? null,
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

  // --- Categories ----------------------------------------------------------

  /**
   * The fixed list a budget line picks its category from. Free text produced
   * 33 category strings across 41 lines — five spellings of one shopping list
   * — which is why nothing could be totalled across events.
   */
  static async getCategories(): Promise<EventBudgetCategory[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_budget_categories')
        .select('*')
        .eq('is_active', true)
        .order('kind', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) {
        logger.error(MOD, 'Failed to fetch budget categories', error);
        throw error;
      }
      return (data as unknown as EventBudgetCategory[]) ?? [];
    } catch (error) {
      logger.error(MOD, 'Unexpected error in getCategories', error);
      throw error;
    }
  }

  // --- Summary -------------------------------------------------------------

  static async getBudgetSummary(eventId: string): Promise<BudgetSummary> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('event_budget_items')
        // id and parent_id are what tell a total apart from its own itemisation.
        .select('id, parent_id, category, type, estimated_amount, actual_amount, status')
        .eq('event_id', eventId);
      if (error) {
        logger.error(MOD, 'Failed to fetch items for summary', error);
        throw error;
      }
      return summariseBudget((data ?? []) as SummarisableLine[]);
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
    fn:
      | 'fn_submit_event_budget'
      | 'fn_approve_event_budget'
      | 'fn_reopen_event_budget'
      | 'fn_close_event_budget',
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

  // --- Closing the books ----------------------------------------------------

  /**
   * Lines with no final figure yet. The books cannot be closed while any
   * remain, and the same function decides both the button's label and the
   * refusal, so the two cannot disagree.
   */
  static async getUnsettledLines(eventId: string): Promise<UnsettledBudgetLine[]> {
    const { data, error } = await (this.supabase as any).rpc('fn_event_budget_unsettled', {
      p_event_id: eventId,
    });
    if (error) {
      logger.error(MOD, 'Failed to fetch unsettled budget lines', { eventId, error });
      throw error;
    }
    return (data ?? []) as UnsettledBudgetLine[];
  }

  /**
   * Record what a line really cost, or that nothing was spent on it.
   * Either way the line is answered and stops blocking the close.
   */
  static async settleLine(
    itemId: string,
    actual: number,
    nothingSpent = false
  ): Promise<MarathonBudgetItem> {
    const { data, error } = await (this.supabase as any).rpc('fn_settle_event_budget_line', {
      p_item_id: itemId,
      p_actual: nothingSpent ? 0 : actual,
      p_nothing_spent: nothingSpent,
    });
    if (error) {
      logger.error(MOD, 'Failed to settle budget line', { itemId, error });
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    return row as MarathonBudgetItem;
  }

  /** Close the books. Refuses, by name, while any line is unanswered. */
  static closeBudget(eventId: string) {
    return this.callApprovalRpc('fn_close_event_budget', eventId);
  }

  // --- Measuring the spend against what it bought ---------------------------

  /** Totals, registrations, and cost per head — planned against actual. */
  static async getOutcome(eventId: string): Promise<EventBudgetOutcome | null> {
    const { data, error } = await (this.supabase as any).rpc('fn_event_budget_outcome', {
      p_event_id: eventId,
    });
    if (error) {
      logger.error(MOD, 'Failed to fetch budget outcome', { eventId, error });
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    return (row as EventBudgetOutcome) ?? null;
  }

  /** What each committee is answerable for. */
  static async getSpendByCommittee(eventId: string): Promise<CommitteeSpend[]> {
    const { data, error } = await (this.supabase as any).rpc('fn_event_budget_by_committee', {
      p_event_id: eventId,
    });
    if (error) {
      logger.error(MOD, 'Failed to fetch spend by committee', { eventId, error });
      throw error;
    }
    return (data ?? []) as CommitteeSpend[];
  }

  /**
   * What each category on this event typically costs per head elsewhere.
   * Drawn only from events whose books are closed, so it is a real figure or
   * it is absent — never an average dragged toward zero by open events.
   */
  static async getCategoryBenchmark(eventId: string): Promise<CategoryBenchmark[]> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_event_budget_category_benchmark',
      { p_event_id: eventId }
    );
    if (error) {
      logger.error(MOD, 'Failed to fetch category benchmark', { eventId, error });
      throw error;
    }
    return (data ?? []) as CategoryBenchmark[];
  }
}
