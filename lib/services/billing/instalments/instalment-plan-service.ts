import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';

// ============================================
// INSTALMENT PLAN SERVICE
// ============================================
// Created: 2026-08-13
// Purpose: Config-driven splitting of a yearly fee into instalment bills.
//   - The split ARITHMETIC's single runtime source of truth is the SQL engine
//     `billing_instalment_split_for_learner` (migration 20260825013000), which
//     BOTH bill-generation paths consume — the account-transition RPC directly,
//     and the TypeScript bulk-generate path via the guarded wrapper RPC
//     `billing_get_instalment_split`. Two paths, one engine: a learner's
//     schedule can never differ by path.
//   - This file holds (a) the consumption side for the TS path — fetch,
//     verify, expand — and (b) plan CRUD + authoring-time validation for the
//     (future) admin surface. `computeInstalmentAmounts` here is the
//     documented TS REFERENCE MIRROR of the engine arithmetic, used for
//     authoring previews and unit tests; it is NOT what generates bills.
//
// DORMANCY CONTRACT (load-bearing): with zero plans configured — or before
// migration 20260825013000 is applied at all — every function on the read path
// degrades to "no split": `fetchInstalmentSplit` returns null on ANY error
// (including the RPC not existing yet) and `expandBillsWithInstalmentPlans`
// then returns its input untouched, so bill generation behaves exactly as
// today, byte for byte. Never let an error escape onto the generation path.
// ============================================

// ─── Types ────────────────────────────────────────────────────────────────────

/** One computed instalment row, as returned by the split RPC. */
export interface InstalmentSplitRow {
  instalment_no: number;
  instalment_count: number;
  instalment_amount: number;
  instalment_due_date: string; // ISO date (yyyy-mm-dd)
}

/** Authoring shape of one plan line (mirrors billing_instalment_plan_lines). */
export interface InstalmentPlanLineInput {
  sequence_no: number;
  /** Exactly one of share_percent / fixed_amount must be set. */
  share_percent?: number | null;
  fixed_amount?: number | null;
  /** Exactly one of due_date / due_offset_days must be set. */
  due_date?: string | null; // ISO date
  due_offset_days?: number | null; // days from the bill-generation date
}

export interface InstalmentPlanInput {
  institution_id: string;
  program_id: string;
  item_category_id: string;
  academic_year_id: string;
  notes?: string | null;
  lines: InstalmentPlanLineInput[];
}

/** The subset of a billing_student_bills insert row the expander touches. */
export interface ExpandableBillRow {
  item_category_id?: string | null;
  bill_description?: string | null;
  due_date?: string;
  unit_amount?: number;
  total_amount?: number;
  final_amount?: number;
  balance_amount?: number;
  remarks?: string | null;
  [key: string]: unknown;
}

/** Minimal client surface the read path needs — keeps tests honest and free of
 *  module mocking. The real Supabase client satisfies it structurally. */
export interface SupabaseRpcClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: unknown }>;
}

// ─── Money helper ─────────────────────────────────────────────────────────────

/** Work in integer paise to keep sums exact — 2dp floats drift. */
function toPaise(amount: number): number {
  return Math.round(amount * 100);
}

// ─── Reference mirror of the SQL engine arithmetic ───────────────────────────

/**
 * Splits `totalAmount` across `lines` (ordered by sequence_no):
 *   - lines 1..n-1 take their own size — fixed_amount, or share_percent of the
 *     total rounded to 2dp;
 *   - the LAST line absorbs rounding: total minus the sum of the earlier
 *     lines — so the instalments always sum EXACTLY to the total.
 * Returns null (meaning: do not split) when the plan has fewer than 2 lines or
 * any computed amount is not strictly positive.
 *
 * MIRROR NOTE: this is the TS reference implementation of the arithmetic in
 * `billing_instalment_split_for_learner` (migration 20260825013000). The SQL
 * engine is what generates bills at runtime; keep the two in step when either
 * changes. Used for authoring-time previews/validation and unit tests.
 */
export function computeInstalmentAmounts(
  totalAmount: number,
  lines: Pick<InstalmentPlanLineInput, 'share_percent' | 'fixed_amount'>[]
): number[] | null {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return null;
  const n = lines.length;
  if (n < 2) return null;

  const totalPaise = toPaise(totalAmount);
  const amountsPaise: number[] = [];
  let sumPrev = 0;

  for (let i = 0; i < n; i++) {
    let paise: number;
    if (i < n - 1) {
      const line = lines[i];
      if (line.fixed_amount != null) {
        paise = toPaise(line.fixed_amount);
      } else if (line.share_percent != null) {
        // round(total * pct / 100, 2) — computed in paise
        paise = Math.round((totalPaise * line.share_percent) / 100);
      } else {
        return null; // malformed line
      }
    } else {
      paise = totalPaise - sumPrev; // last absorbs rounding
    }
    if (!Number.isFinite(paise) || paise <= 0) return null;
    sumPrev += paise;
    amountsPaise.push(paise);
  }

  return amountsPaise.map((p) => p / 100);
}

// ─── Authoring-time validation ────────────────────────────────────────────────

/**
 * Validates a plan's lines at save time. Stricter than the engine on purpose:
 * the engine falls back silently on a malformed plan (safety), while authoring
 * must refuse to SAVE one (honesty). In particular, percent-only plans must
 * sum to exactly 100 — the engine's last-absorbs rule would silently turn
 * 30/30/30 into 30/30/40, which is never what the author meant.
 */
export function validatePlanLines(lines: InstalmentPlanLineInput[]): string[] {
  const errors: string[] = [];
  if (lines.length < 2) {
    errors.push('An instalment plan needs at least 2 instalments.');
    return errors;
  }

  const sequences = lines.map((l) => l.sequence_no);
  const expected = Array.from({ length: lines.length }, (_, i) => i + 1);
  if (JSON.stringify([...sequences].sort((a, b) => a - b)) !== JSON.stringify(expected)) {
    errors.push('Instalment sequence numbers must be contiguous starting at 1.');
  }

  let percentSum = 0;
  let hasFixed = false;
  let hasPercent = false;

  for (const line of lines) {
    const hasShare = line.share_percent != null;
    const hasAmount = line.fixed_amount != null;
    if (hasShare === hasAmount) {
      errors.push(
        `Instalment ${line.sequence_no}: set exactly one of share percent or fixed amount.`
      );
    }
    if (hasShare) {
      hasPercent = true;
      if (!(line.share_percent! > 0 && line.share_percent! <= 100)) {
        errors.push(`Instalment ${line.sequence_no}: share percent must be within (0, 100].`);
      } else {
        percentSum += line.share_percent!;
      }
    }
    if (hasAmount) {
      hasFixed = true;
      if (!(line.fixed_amount! > 0)) {
        errors.push(`Instalment ${line.sequence_no}: fixed amount must be positive.`);
      }
    }

    const hasDate = line.due_date != null && line.due_date !== '';
    const hasOffset = line.due_offset_days != null;
    if (hasDate === hasOffset) {
      errors.push(
        `Instalment ${line.sequence_no}: set exactly one of due date or offset days.`
      );
    }
    if (hasOffset && !(line.due_offset_days! >= 0)) {
      errors.push(`Instalment ${line.sequence_no}: offset days cannot be negative.`);
    }
  }

  if (hasPercent && !hasFixed && Math.abs(percentSum - 100) > 0.005) {
    errors.push(
      `Share percents must sum to exactly 100 (they sum to ${percentSum.toFixed(2)}).`
    );
  }

  return errors;
}

// ─── Consumption side (the TS bill-generation path) ──────────────────────────

/**
 * Defensive verification of RPC output before any bill row is built from it.
 * The engine already guarantees these invariants; re-checking here means a
 * drifted or partially-applied database can only ever degrade to today's
 * single-bill behaviour, never to a wrong schedule.
 */
export function verifyInstalmentSplitRows(
  totalAmount: number,
  rows: InstalmentSplitRow[]
): boolean {
  if (!Array.isArray(rows) || rows.length < 2) return false;

  let sumPaise = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.instalment_no !== i + 1) return false; // contiguous 1..N, in order
    if (row.instalment_count !== rows.length) return false;
    if (!Number.isFinite(row.instalment_amount) || row.instalment_amount <= 0) return false;
    if (typeof row.instalment_due_date !== 'string' || row.instalment_due_date === '') {
      return false;
    }
    sumPaise += toPaise(row.instalment_amount);
  }

  return sumPaise === toPaise(totalAmount); // sums EXACTLY to the yearly amount
}

/**
 * Fetches the instalment split for (learner, category, amount) via the guarded
 * wrapper RPC. Returns null — meaning "do not split" — on ANY error (missing
 * migration, missing permission, network) and on any output that fails
 * verification. Errors are intentionally swallowed: this sits on the bill
 * generation path, where the contract is single-bill passthrough, not failure.
 */
export async function fetchInstalmentSplit(
  supabase: SupabaseRpcClient,
  learnerId: string,
  categoryId: string,
  amount: number
): Promise<InstalmentSplitRow[] | null> {
  try {
    const { data, error } = await supabase.rpc('billing_get_instalment_split', {
      p_learner_id: learnerId,
      p_category_id: categoryId,
      p_amount: amount,
    });
    if (error) return null;
    const rows = (data ?? []) as InstalmentSplitRow[];
    if (!verifyInstalmentSplitRows(amount, rows)) return null;
    return rows;
  } catch {
    return null;
  }
}

/**
 * Expands candidate bill rows through the instalment plans: a row whose
 * (learner, category) has an active matching plan becomes N rows — amounts
 * from the plan summing exactly to the original amount, each with its own due
 * date, otherwise identical. Rows with no plan (or no category, or any error)
 * pass through UNTOUCHED, so with zero plans configured the output array is
 * the input array, element for element.
 */
export async function expandBillsWithInstalmentPlans<T extends ExpandableBillRow>(
  supabase: SupabaseRpcClient,
  learnerId: string,
  rows: T[]
): Promise<T[]> {
  const expanded: T[] = [];

  for (const row of rows) {
    const amount = Number(row.final_amount ?? 0);
    if (!row.item_category_id || !(amount > 0)) {
      expanded.push(row);
      continue;
    }

    const split = await fetchInstalmentSplit(
      supabase,
      learnerId,
      row.item_category_id,
      amount
    );
    if (!split) {
      expanded.push(row);
      continue;
    }

    for (const part of split) {
      expanded.push({
        ...row,
        bill_description: `${row.bill_description ?? 'Fee'} — Instalment ${part.instalment_no}/${part.instalment_count}`,
        due_date: part.instalment_due_date,
        unit_amount: part.instalment_amount,
        total_amount: part.instalment_amount,
        final_amount: part.instalment_amount,
        balance_amount: part.instalment_amount,
        remarks: `${row.remarks ?? ''} (instalment ${part.instalment_no}/${part.instalment_count} per instalment plan)`.trim(),
      });
    }
  }

  return expanded;
}

// ─── Plan CRUD (admin surface — no UI yet; see PR body) ──────────────────────

export class InstalmentPlanService {
  // Lazy — a static initializer would construct the browser client at import
  // time, which breaks any consumer (or test) importing the pure helpers above.
  private static _supabase: ReturnType<typeof createClientSupabaseClient> | null = null;
  private static get supabase() {
    if (!this._supabase) this._supabase = createClientSupabaseClient();
    return this._supabase;
  }

  /** Lists plans (RLS-gated: billing.instalment_plans.view / admin). */
  static async listPlans(filters: {
    institution_id?: string;
    program_id?: string;
    item_category_id?: string;
    academic_year_id?: string;
    include_inactive?: boolean;
  } = {}) {
    const supabase = this.supabase as any;
    let query = supabase
      .from('billing_instalment_plans')
      .select('*, lines:billing_instalment_plan_lines(*)')
      .order('created_at', { ascending: false });

    if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
    if (filters.program_id) query = query.eq('program_id', filters.program_id);
    if (filters.item_category_id) query = query.eq('item_category_id', filters.item_category_id);
    if (filters.academic_year_id) query = query.eq('academic_year_id', filters.academic_year_id);
    if (!filters.include_inactive) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw new Error(getErrorMessage(error));
    return data ?? [];
  }

  /**
   * Creates a plan with its ordered lines. Validates lines first (see
   * validatePlanLines) — a plan that would make the engine fall back silently
   * is refused at save time instead.
   */
  static async createPlan(input: InstalmentPlanInput) {
    const errors = validatePlanLines(input.lines);
    if (errors.length > 0) {
      throw new Error(`Invalid instalment plan: ${errors.join(' ')}`);
    }

    const supabase = this.supabase as any;
    const { data: userData } = await supabase.auth.getUser();
    const currentUserId = userData?.user?.id ?? null;

    const { data: plan, error: planError } = await supabase
      .from('billing_instalment_plans')
      .insert({
        institution_id: input.institution_id,
        program_id: input.program_id,
        item_category_id: input.item_category_id,
        academic_year_id: input.academic_year_id,
        notes: input.notes ?? null,
        created_by: currentUserId,
        updated_by: currentUserId,
      })
      .select('id')
      .single();
    if (planError) throw new Error(getErrorMessage(planError));

    const { error: linesError } = await supabase
      .from('billing_instalment_plan_lines')
      .insert(
        input.lines.map((line) => ({
          plan_id: plan.id,
          sequence_no: line.sequence_no,
          share_percent: line.share_percent ?? null,
          fixed_amount: line.fixed_amount ?? null,
          due_date: line.due_date ?? null,
          due_offset_days: line.due_offset_days ?? null,
        }))
      );
    if (linesError) {
      // Best-effort cleanup so a half-created plan never sits active.
      await supabase.from('billing_instalment_plans').delete().eq('id', plan.id);
      throw new Error(getErrorMessage(linesError));
    }

    return plan.id as string;
  }

  /** Deactivates a plan (kept as history; the unique active-grain slot frees up). */
  static async deactivatePlan(planId: string) {
    const supabase = this.supabase as any;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('billing_instalment_plans')
      .update({ is_active: false, updated_by: userData?.user?.id ?? null })
      .eq('id', planId);
    if (error) throw new Error(getErrorMessage(error));
  }
}
