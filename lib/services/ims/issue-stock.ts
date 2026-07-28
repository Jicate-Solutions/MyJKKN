// lib/services/ims/issue-stock.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';

const supabase = () => createClientSupabaseClient() as any;

export interface IssueStockToDepartmentParams {
  item_id: string;
  unit_id: string;
  quantity: number;
  department_id: string;
  issued_by: string;
  /** Set when the issue originates from an approved indent; null for direct issues. */
  indent_id?: string | null;
  notes?: string | null;
  store_id?: string | null;
  institution_id?: string | null;
}

/**
 * Issue number for ims_stock_issues. Format: ISS-YYMMDD-XXXXX.
 * There is no atomic-counter RPC for this table (unlike ims_next_indent_number),
 * so this uses the same timestamp-based fallback as generateIndentNumber().
 */
export function generateIssueNumber(): string {
  const yymmdd = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `ISS-${yymmdd}-${String(Date.now()).slice(-5)}`;
}

/**
 * Move `quantity` of an item out of store stock and into a department.
 *
 * Decrements ims_stock_summary (what the Items page reads) and writes the
 * ims_stock_issues audit row (what the Department Stock page reads via
 * ims_department_stock_summary). Both writes are required — updating only one
 * is what caused department stock to sit permanently empty.
 *
 * Shared by the indent issue flow (ImsIndentService.issueItem) and the direct
 * department issue (ImsDepartmentService.issueItemToDepartment) so the two can
 * never drift apart.
 *
 * Throws before writing anything if there is no stock row or insufficient
 * available quantity, so an issue can't drive store stock negative.
 */
export async function issueStockToDepartment(
  params: IssueStockToDepartmentParams
): Promise<void> {
  const db = supabase();

  // Scope by store_id when available, else institution_id — matches the rest of IMS.
  let stockQuery = db
    .from('ims_stock_summary')
    .select('id, current_quantity, available_quantity')
    .eq('item_id', params.item_id);
  stockQuery = params.store_id
    ? stockQuery.eq('store_id', params.store_id)
    : stockQuery.eq('institution_id', params.institution_id);

  const { data: stock, error: stockFetchError } = await stockQuery.maybeSingle();
  if (stockFetchError) throw stockFetchError;
  if (!stock) {
    throw new Error(
      'Cannot issue item: no stock record found for this item at this store'
    );
  }
  if (params.quantity > stock.available_quantity) {
    throw new Error(
      `Cannot issue ${params.quantity} units. Only ${stock.available_quantity} available in stock`
    );
  }

  const { error: stockUpdateError } = await db
    .from('ims_stock_summary')
    .update({
      current_quantity: stock.current_quantity - params.quantity,
      available_quantity: stock.available_quantity - params.quantity,
      updated_at: new Date().toISOString(),
    })
    .eq('id', stock.id);
  if (stockUpdateError) throw stockUpdateError;

  const { error: issueLogError } = await db.from('ims_stock_issues').insert({
    issue_number: generateIssueNumber(),
    indent_id: params.indent_id ?? null,
    item_id: params.item_id,
    quantity: params.quantity,
    unit_id: params.unit_id,
    department_id: params.department_id,
    issued_by: params.issued_by,
    notes: params.notes ?? null,
    institution_id: params.institution_id ?? null,
    store_id: params.store_id ?? null,
  });
  if (issueLogError) throw issueLogError;
}
