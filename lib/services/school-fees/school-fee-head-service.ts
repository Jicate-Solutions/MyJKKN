// lib/services/school-fees/school-fee-head-service.ts
//
// Fee heads are NOT school-owned rows. They live in the GLOBAL
// billing_categories table (collapsed to global in 20260428000001) so that
// bills, receipts, apportionment and analytics all join to the same catalogue.
//
// The `applies_to text[]` column (20260813100009) is what keeps the two worlds
// apart: every pre-existing category defaults to '{college}', and the six
// seeded school heads carry '{school}'. EVERY school-side read must filter on
// it — without the filter the grid offers "4 Year Tuition Fee", "Hostel Fee"
// and "University Fee" alongside the school heads.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { SchoolFeeHead } from '@/types/school-fees';

const HEAD_COLUMNS = 'id, category_name, kind, frequency, applies_to, description, is_active';

export class SchoolFeeHeadService {
  /**
   * Fee heads a school may put on a plan.
   *
   * `.contains('applies_to', ['school'])` compiles to the PostgREST `cs`
   * operator (`applies_to=cs.{school}`), which matches both '{school}' and
   * '{college,school}' — so a head shared with college is included exactly once.
   */
  static async list(options?: { includeInactive?: boolean }): Promise<SchoolFeeHead[]> {
    const supabase = createClientSupabaseClient();

    let query = supabase
      .from('billing_categories')
      .select(HEAD_COLUMNS)
      .contains('applies_to', ['school'])
      .order('category_name', { ascending: true });

    if (!options?.includeInactive) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as SchoolFeeHead[];
  }

  /**
   * The head used for flat late fines. Deliberately NOT the college
   * 'Late Payment Charge', which belongs to the percentage-based
   * fn_late_charge_* engine — mixing them would corrupt both sets of
   * collection analytics. Used by Phase 10.
   */
  static async getLateFeeHead(): Promise<SchoolFeeHead | null> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('billing_categories')
      .select(HEAD_COLUMNS)
      .eq('category_name', 'School Late Fee')
      .maybeSingle();
    if (error) throw error;
    return (data as SchoolFeeHead) ?? null;
  }
}
