/**
 * TDS Band Service (2026-09-02)
 *
 * Substrate: 20260902100000_hr_tds_slabs_and_allowance.sql
 *
 * THE BANDS ARE GLOBAL. No institution_id: income tax is national and the group
 * runs one scheme. It also keeps the table's overlap constraint a pure range
 * exclusion, which plain GiST handles — a per-institution variant would need
 * the btree_gist extension, which this project does not have installed.
 *
 * READS ARE WIDER THAN WRITES ON PURPOSE. The register resolves these bands
 * while generating, under the generating user's own session, so anyone who can
 * see a salary or a register can read them; only hr.payroll.salary.manage edits.
 * See `list` for why that matters more than it looks.
 *
 * Static class, SupabaseClient passed in — the convention across
 * lib/services/hr/payroll/.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getErrorMessage } from '@/lib/utils';

/** One monthly-gross band. Bounds are [min, max); null max = open-ended. */
export interface HrTdsSlab {
  id: string;
  min_monthly_gross: number;
  /** null = no upper limit. Exactly one band is open-ended when any exist. */
  max_monthly_gross: number | null;
  rate_pct: number;
  label: string | null;
  created_at: string;
  updated_at: string;
}

export interface TdsSlabInput {
  minMonthlyGross: number;
  maxMonthlyGross: number | null;
  ratePct: number;
  label?: string | null;
}

const SELECT_COLS =
  'id, min_monthly_gross, max_monthly_gross, rate_pct, label, created_at, updated_at';

/** numeric(12,2) arrives from PostgREST as a STRING, so every figure is coerced. */
function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : Number(v) || 0;
}

function shape(r: any): HrTdsSlab {
  return {
    id: r.id,
    min_monthly_gross: num(r.min_monthly_gross),
    // null is meaningful here and must NOT go through num() — it is the
    // open-ended top band, and coercing it to 0 would make the highest band
    // claim every salary from zero upward.
    max_monthly_gross: r.max_monthly_gross === null ? null : num(r.max_monthly_gross),
    rate_pct: num(r.rate_pct),
    label: r.label ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/**
 * The database speaks in constraint names; people need the rule. The trigger's
 * own RAISE messages are already written for humans and pass through unchanged.
 */
function friendlyError(error: unknown): string {
  const msg = getErrorMessage(error);
  if (msg.includes('hr_tds_slabs_no_overlap')) {
    return 'That band overlaps one that already exists. Two bands cannot both claim the same salary.';
  }
  if (msg.includes('hr_tds_slabs_max_above_min')) {
    return 'A band’s upper limit must be greater than its lower limit.';
  }
  if (msg.includes('hr_tds_slabs_rate_pct_check')) {
    return 'The rate must be between 0 and 100 percent.';
  }
  return msg;
}

export class TdsSlabService {
  /**
   * Every band, lowest floor first.
   *
   * AN EMPTY RESULT IS AMBIGUOUS AND THE AMBIGUITY IS EXPENSIVE. Zero bands
   * legitimately means "TDS is switched off" — it is the state the table ships
   * in. But RLS also returns zero rows, with no error, to a caller who may not
   * read them. Those two look identical and demand opposite responses: the
   * first should generate a register with no tax, the second must not generate
   * one at all.
   *
   * So `throwOnDenied` asks user_has_permission directly rather than inferring
   * from the row count. The register passes true; the screen leaves it false,
   * because the page has already gated on the same key before it renders.
   */
  static async list(
    supabase: SupabaseClient,
    opts?: { throwOnDenied?: boolean }
  ): Promise<HrTdsSlab[]> {
    const { data, error } = await (supabase as any)
      .from('hr_tds_slabs')
      .select(SELECT_COLS)
      .order('min_monthly_gross', { ascending: true });

    if (error) {
      throw new Error(`Failed to load the TDS bands: ${getErrorMessage(error)}`);
    }

    const rows = ((data ?? []) as any[]).map(shape);

    if (rows.length === 0 && opts?.throwOnDenied) {
      const { data: canRead } = await (supabase as any).rpc('user_has_permission', {
        permission_name: 'hr.payroll.salary.view',
      });
      const { data: isSuperAdmin } = await (supabase as any).rpc('is_super_admin');
      if (!canRead && !isSuperAdmin) {
        throw new Error(
          'TDS bands are not readable with this account, so a register generated now would carry no tax. ' +
            'hr.payroll.salary.view is required.'
        );
      }
    }

    return rows;
  }

  /**
   * Add one or more bands in a SINGLE request.
   *
   * THE PLURAL IS THE POINT. "Exactly one band is open-ended" and "the bands
   * leave no gap" are properties of the whole SET, checked by a deferred
   * constraint trigger at COMMIT — so a set can be valid while none of its rows
   * is individually addable. Adding the first capped band on an empty table is
   * exactly that case: on its own it leaves the top capped and is refused, but
   * sent together with the open-ended band above it, it commits.
   *
   * supabase-js sends an array insert as one PostgREST request, which is one
   * transaction, which is one validation. A caller that loops over single
   * inserts gets one transaction each and cannot express a complete set.
   */
  static async create(
    supabase: SupabaseClient,
    input: TdsSlabInput | TdsSlabInput[]
  ): Promise<HrTdsSlab[]> {
    const rows = (Array.isArray(input) ? input : [input]).map((i) => ({
      min_monthly_gross: i.minMonthlyGross,
      max_monthly_gross: i.maxMonthlyGross,
      rate_pct: i.ratePct,
      label: i.label?.trim() || null,
    }));

    const { data, error } = await (supabase as any)
      .from('hr_tds_slabs')
      .insert(rows)
      .select(SELECT_COLS);

    if (error) throw new Error(friendlyError(error));
    return ((data ?? []) as any[]).map(shape);
  }

  static async update(
    supabase: SupabaseClient,
    id: string,
    input: TdsSlabInput
  ): Promise<HrTdsSlab> {
    const { data, error } = await (supabase as any)
      .from('hr_tds_slabs')
      .update({
        min_monthly_gross: input.minMonthlyGross,
        max_monthly_gross: input.maxMonthlyGross,
        rate_pct: input.ratePct,
        label: input.label?.trim() || null,
      })
      .eq('id', id)
      .select(SELECT_COLS)
      .single();

    if (error) throw new Error(friendlyError(error));
    return shape(data);
  }

  /**
   * Remove one band.
   *
   * Deleting the open-ended band while others remain is refused at COMMIT by
   * the set-level trigger, not here — a rule about the whole set cannot be
   * checked one row at a time. The message the user sees is the trigger's.
   */
  static async remove(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await (supabase as any).from('hr_tds_slabs').delete().eq('id', id);
    if (error) throw new Error(friendlyError(error));
  }
}
