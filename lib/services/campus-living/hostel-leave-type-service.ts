// Campus-living hostel leave type reader.
//
// The CRUD master moved to the global Learner Leave Types list
// (public.learner_leave_types — see lib/services/learners/learner-leave-type-service.ts).
// This service now only re-shapes that table into the legacy HostelLeaveType
// DTO for the one caller that still needs it: the hostel leave-request/gate-pass
// selector (useActiveHostelLeaveTypes). requires_parent_consent and
// requires_chief_warden have no equivalent on learner_leave_types and are
// always false; is_system is always false (nothing here is a seeded default
// anymore — that concept lives on learner_leave_types.category/residency).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { HostelLeaveType } from '@/types/hostel-leave-types';

export class HostelLeaveTypeService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * Active-only listing — consumed by UI that needs to let users PICK a leave
   * type (e.g. the gate-pass request/new forms).
   */
  static async getActiveHostelLeaveTypes(): Promise<HostelLeaveType[]> {
    const { data, error } = await this.supabase
      .from('learner_leave_types')
      .select(
        'id, leave_type_code:code, leave_type_name:name, description, color_code, default_max_duration_days:max_duration_days, advance_notice_hours, requires_attachment, sort_order, is_active'
      )
      .eq('is_active', true)
      .in('residency', ['hostel', 'both'])
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      logger.error('campus-living/leave-types', 'Database error listing active', error);
      throw new Error(error.message || 'Failed to fetch active hostel leave types');
    }

    return ((data ?? []) as any[]).map((row) => ({
      ...row,
      requires_parent_consent: false,
      requires_chief_warden: false,
      is_system: false,
      created_by: null,
      created_at: '',
      updated_at: '',
    })) as HostelLeaveType[];
  }
}
