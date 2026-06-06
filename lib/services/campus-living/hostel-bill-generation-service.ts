import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';

export type GenerationLine = {
  category_name: string;
  amount: number;
  fee_source: string;
  billing_category_id?: string | null;
  package_id?: string | null;
};

export type LearnerGenerationPlan = {
  learner_id: string;
  year_of_study: number;
  proposed: GenerationLine[];
  skipped: GenerationLine[];
  new_count: number;
};

export class HostelBillGenerationService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  static async run(
    hostelYearId: string,
    learnerIds: string[],
    dryRun: boolean,
  ): Promise<LearnerGenerationPlan[]> {
    const { data, error } = await this.supabase.rpc(
      'campus_living_generate_hostel_year_bills',
      {
        p_hostel_year_id: hostelYearId,
        p_learner_ids: learnerIds,
        p_dry_run: dryRun,
      },
    );
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as LearnerGenerationPlan[];
  }
}
