import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { CategoryUpgradeRow } from '@/types/campus-living/category-upgrade-report';

export class CategoryUpgradesReportService {
  // All in-flight + completed category upgrades, newest first. Reverted attempts
  // (cancelled/superseded/refunded) are excluded. Institution access is enforced by
  // billing_student_bills RLS. Left joins (no !inner) so a missing learner/category
  // FK degrades to "—" rather than silently dropping the row.
  static async getUpgrades(): Promise<CategoryUpgradeRow[]> {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('billing_student_bills')
        .select(
          `id, bill_description, final_amount, balance_amount, status, created_at,
           item_category:billing_categories(category_name),
           student:learners_profiles(id, first_name, last_name, roll_number),
           institution:institutions(name),
           academic_year:academic_years(academic_year_name)`
        )
        .eq('fee_source', 'hostel_category')
        .not('status', 'in', '(cancelled,superseded,refunded)')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('campus-living/upgrades-report', 'Failed to fetch upgrades', error);
        throw error;
      }

      return ((data ?? []) as Record<string, unknown>[]).map((r) => {
        const stu = r.student as {
          id?: string; first_name?: string; last_name?: string; roll_number?: string;
        } | null;
        const cat = (r.item_category as { category_name?: string } | null)?.category_name ?? '';
        const status = r.status as string;
        const fee = Number(r.final_amount ?? 0);
        const balance = Number(r.balance_amount ?? 0);
        const name = `${stu?.first_name ?? ''} ${stu?.last_name ?? ''}`.trim();
        return {
          bill_id: r.id as string,
          learner_id: stu?.id ?? '',
          learner_name: name || '—',
          roll_number: stu?.roll_number ?? null,
          institution_name: (r.institution as { name?: string } | null)?.name ?? null,
          kind: cat === 'Mess Upgrade Fee' ? 'mess' : 'room',
          description: (r.bill_description as string) ?? '',
          upgrade_fee: fee,
          paid_amount: Math.max(0, fee - balance),
          status,
          status_label: status === 'paid' ? 'Completed' : 'Pending',
          created_at: r.created_at as string,
          academic_year_name:
            (r.academic_year as { academic_year_name?: string } | null)?.academic_year_name ?? null,
        } satisfies CategoryUpgradeRow;
      });
    } catch (error) {
      logger.error('campus-living/upgrades-report', 'Unexpected error in getUpgrades', error);
      throw error;
    }
  }
}
