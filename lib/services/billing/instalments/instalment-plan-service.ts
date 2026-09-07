import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { toPaise } from './instalment-arithmetic';

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
//     verify, attach — and (b) plan CRUD + authoring-time validation for the
//     (future) admin surface. `computeInstalmentAmounts` here is the
//     documented TS REFERENCE MIRROR of the engine arithmetic, used for
//     authoring previews and unit tests; it is NOT what generates bills.
//
// ONE BILL PER FEE (2026-08-22): a schedule no longer becomes N sibling bills.
// `attachInstalmentSchedules` returns one row per fee, carrying its tranches in
// `__instalments` for the caller to write to billing_bill_instalments once the
// bill has an id. The previous expander is why three fee items produced five
// bills.
//
// DORMANCY CONTRACT (load-bearing): with nothing configured — or before the
// engine migration is applied at all — every function on the read path degrades
// to "no schedule": `fetchInstalmentSplit` returns null on ANY error (including
// the RPC not existing yet) and `attachInstalmentSchedules` then returns its
// input untouched, so bill generation behaves exactly as before, byte for byte.
// Never let an error escape onto the generation path.
// ============================================

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * One computed schedule row, as returned by the split RPC.
 *
 * `instalment_count === 1` is NOT a split — it means the engine resolved a
 * DUE DATE for an unsplit fee item from its fee structure, and the caller must
 * emit one bill on that date WITHOUT stamping an instalment group
 * (chk_bsb_instalment_triplet forbids a group of one).
 */
export interface InstalmentSplitRow {
  instalment_no: number;
  instalment_count: number;
  instalment_amount: number;
  instalment_due_date: string; // ISO date (yyyy-mm-dd)
  /** Lifecycle status settling THIS instalment promotes to. null = no rule. */
  promotes_to_status_code?: string | null;
  /** Which config source matched: item schedule, unsplit item, or legacy plan. */
  matched_source?: 'item_schedule' | 'item_single' | 'plan' | null;
  /**
   * The matched row's id. A fee-structure ITEM id for the two `item_*` sources,
   * but a PLAN id for `plan` — writing the latter into
   * billing_student_bills.fee_structure_item_id would violate its FK, so always
   * discriminate on matched_source before using it.
   */
  matched_ref_id?: string | null;
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
  /** Set by the caller from fee_items; drives schedule lookup and status rules. */
  fee_structure_item_id?: string | null;
  [key: string]: unknown;
}

/** One tranche to write to billing_bill_instalments once the bill has an id. */
export interface PendingInstalment {
  sequence_no: number;
  amount: number;
  due_date: string;
  promotes_to_status_code: string | null;
}

/**
 * A bill row plus the schedule that belongs INSIDE it.
 *
 * The tranches ride on the row rather than being returned separately because
 * the caller inserts bills in a batch and needs to know which schedule belongs
 * to which row without threading a parallel array through and hoping the
 * indexes stay aligned. The key is `__` prefixed as a reminder that it is not a
 * billing_student_bills column and must be stripped before the insert.
 */
export interface ScheduledBillRow extends ExpandableBillRow {
  __instalments?: PendingInstalment[];
}

/** Minimal client surface the read path needs — keeps tests honest and free of
 *  module mocking. The real Supabase client satisfies it structurally. */
export interface SupabaseRpcClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: unknown }>;
}

// ─── Money + split arithmetic ────────────────────────────────────────────────
// Moved to ./instalment-arithmetic (pure, no client import) so the fee-structure
// sheet resolver — a "no DB access" module — can check a spreadsheet against the
// SAME rupees the engine would bill. Re-exported so every import of
// computeInstalmentAmounts from this service keeps working.
export { computeInstalmentAmounts } from './instalment-arithmetic';

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
  // Was `< 2`: before 2026-08-21 the engine only ever spoke about splits, so a
  // single row could only be malformed output. It now also returns exactly one
  // row to mean "unsplit, but here is the due date this fee structure
  // configures" — rejecting that would silently discard the configured date and
  // fall back to +30 days, which is the whole defect this feature removes.
  // Every other invariant below holds identically for one row.
  if (!Array.isArray(rows) || rows.length < 1) return false;

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
  amount: number,
  feeStructureItemId?: string | null
): Promise<InstalmentSplitRow[] | null> {
  try {
    const { data, error } = await supabase.rpc('billing_get_instalment_split', {
      p_learner_id: learnerId,
      p_category_id: categoryId,
      p_amount: amount,
      // Passing the item id skips the engine's 8-dimension re-match. Omitted for
      // fee_items snapshots written before the id existed, where the engine
      // falls back to admission_match_fee_structure_for_learner.
      p_fee_structure_item_id: feeStructureItemId ?? null,
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
 * Attaches the fee-structure schedule to candidate bill rows.
 *
 * ONE ROW IN, ONE ROW OUT — always. This function used to EXPAND a scheduled
 * fee into N sibling bills, which is why three fee items produced five bills.
 * A fee split 30/40/30 is one debt of Rs 1,00,000 collectable in three
 * tranches, not three debts; the tranches now ride on the row in
 * `__instalments` and the caller writes them to billing_bill_instalments once
 * the bill has an id.
 *
 * Three outcomes per row, matching the engine's contract:
 *
 *   engine returns 0 rows  → pass through UNTOUCHED (the caller's own due date
 *                            stands). This is what every row does when nothing
 *                            is configured, so the output is the input,
 *                            element for element.
 *   engine returns 1 row   → same single bill, on the due date the fee
 *                            structure configures. No tranches: an unsplit fee
 *                            is not a schedule.
 *   engine returns N rows  → the same single bill for the FULL amount, dated
 *                            at its earliest tranche, carrying N tranches.
 *
 * Because there is only ever one bill per fee, billing_categories
 * .once_per_learner is satisfied naturally — the instalment_group_id machinery
 * that existed to work around it is no longer used.
 */
export async function attachInstalmentSchedules<T extends ExpandableBillRow>(
  supabase: SupabaseRpcClient,
  learnerId: string,
  rows: T[]
): Promise<Array<T & ScheduledBillRow>> {
  const out: Array<T & ScheduledBillRow> = [];

  for (const row of rows) {
    const amount = Number(row.final_amount ?? 0);
    if (!row.item_category_id || !(amount > 0)) {
      out.push(row as T & ScheduledBillRow);
      continue;
    }

    const split = await fetchInstalmentSplit(
      supabase,
      learnerId,
      row.item_category_id,
      amount,
      row.fee_structure_item_id ?? null
    );
    if (!split || split.length === 0) {
      out.push(row as T & ScheduledBillRow);
      continue;
    }

    // Only the item_* sources carry a fee-structure ITEM id; `plan` carries a
    // plan id, which would violate the FK on fee_structure_item_id.
    const head = split[0];
    const itemId =
      head.matched_source === 'item_schedule' || head.matched_source === 'item_single'
        ? (head.matched_ref_id ?? row.fee_structure_item_id ?? null)
        : (row.fee_structure_item_id ?? null);

    const isScheduled = split.length > 1;

    // Earliest tranche, not split[0]: the engine orders by sequence_no, and a
    // schedule may be authored out of chronological order. The bill's due_date
    // means "when the next money is owed", so it has to be the earliest date.
    const firstDue = isScheduled
      ? split.reduce(
          (min, p) => (p.instalment_due_date < min ? p.instalment_due_date : min),
          split[0].instalment_due_date,
        )
      : head.instalment_due_date;

    out.push({
      ...row,
      // The amount is untouched: the bill is still for the whole fee.
      due_date: firstDue,
      fee_structure_item_id: itemId,
      remarks: isScheduled
        ? `${row.remarks ?? ''} (${split.length} instalments per fee structure schedule)`.trim()
        : (row.remarks ?? null),
      ...(isScheduled
        ? {
            __instalments: split.map((p) => ({
              sequence_no: p.instalment_no,
              amount: p.instalment_amount,
              due_date: p.instalment_due_date,
              promotes_to_status_code: p.promotes_to_status_code ?? null,
            })),
          }
        : {}),
    } as T & ScheduledBillRow);
  }

  return out;
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
