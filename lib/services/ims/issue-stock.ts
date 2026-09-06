// lib/services/ims/issue-stock.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/utils/supabase-error';

const supabase = () => createClientSupabaseClient() as any;

export interface IssueStockToDepartmentParams {
  item_id: string;
  unit_id: string;
  quantity: number;
  department_id: string;
  /**
   * Kept for the existing call sites. The server now stamps the issuer from
   * auth.uid() instead of trusting this, so it can no longer disagree with who
   * was actually signed in.
   */
  issued_by?: string;
  /** Set when the issue originates from an approved indent; null for direct issues. */
  indent_id?: string | null;
  notes?: string | null;
  store_id?: string | null;
  institution_id?: string | null;
}

export interface IssueStockResult {
  issue_id: string;
  issue_number: string;
  item_id: string;
  store_id: string | null;
  quantity_issued: number;
  current_quantity: number;
  available_quantity: number;
}

/**
 * Issue number for ims_stock_issues. Format: ISS-YYMMDD-XXXXX.
 *
 * The number is now generated server-side inside ims_issue_stock_to_department,
 * where it shares the insert's transaction. This is kept only for callers that
 * still want to show a provisional number; it is not what gets stored.
 *
 * @deprecated Read `issue_number` off the result of issueStockToDepartment.
 */
export function generateIssueNumber(): string {
  const yymmdd = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `ISS-${yymmdd}-${String(Date.now()).slice(-5)}`;
}

/**
 * Move `quantity` of an item out of store stock and into a department.
 *
 * Delegates to the ims_issue_stock_to_department RPC, which locks the stock row,
 * decrements it under a guard and writes the ims_stock_issues audit row in ONE
 * transaction.
 *
 * This used to be done from here as a read-modify-write plus a separate insert,
 * which had a failure mode that produced exactly the bug this replaces: a
 * PostgREST update matching zero rows (an RLS-filtered row, say) returns success
 * with no error, so the decrement silently did nothing while the audit row was
 * still written. The issue showed up in history, stock never moved, and nothing
 * surfaced to the user. Two people issuing the same item concurrently also lost
 * one of the two decrements. Both are now impossible server-side.
 *
 * Throws with the server's message on shortfall, a missing stock row, an
 * ambiguous store, or no access — it never returns having done nothing.
 *
 * Shared by the indent issue flow (ImsIndentService.issueItem) and the direct
 * department issue (ImsDepartmentService.issueItemToDepartment) so the two can
 * never drift apart.
 */
export async function issueStockToDepartment(
  params: IssueStockToDepartmentParams
): Promise<IssueStockResult> {
  const db = supabase();

  const { data, error } = await db.rpc('ims_issue_stock_to_department', {
    p_item_id: params.item_id,
    p_unit_id: params.unit_id,
    p_quantity: params.quantity,
    p_department_id: params.department_id,
    p_indent_id: params.indent_id ?? null,
    p_notes: params.notes ?? null,
    p_store_id: params.store_id ?? null,
    p_institution_id: params.institution_id ?? null,
  });

  // Postgrest errors are plain objects, not Error instances, so anything that
  // tests `e instanceof Error` upstream would swallow this one — normalise the
  // message here rather than rethrowing the raw object.
  if (error) {
    throw new Error(errorMessage(error, 'Could not issue this item. Please try again.'));
  }

  // A successful RPC always returns the issue payload. Treat a missing one as a
  // failure rather than assuming the stock moved.
  if (!data || typeof data !== 'object' || !(data as any).issue_id) {
    throw new Error('Could not issue this item: the stock update did not complete.');
  }

  return data as IssueStockResult;
}
