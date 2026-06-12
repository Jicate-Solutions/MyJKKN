import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';

export type HostelFeeLine = {
  fee_source: 'hostel_package' | 'hostel_category';
  package_id: string | null;
  category_id: string | null;
  category_name: string;
  amount: number;
};

export class HostelFeeResolutionService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  static async resolve(learnerId: string, hostelYearId: string): Promise<HostelFeeLine[]> {
    const { data, error } = await this.supabase.rpc('campus_living_resolve_hostel_fee', {
      p_learner_id: learnerId,
      p_hostel_year_id: hostelYearId,
    });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as HostelFeeLine[];
  }
}
