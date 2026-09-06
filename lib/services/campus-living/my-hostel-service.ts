import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { HostelYearService } from '@/lib/services/campus-living/hostel-year-service';
import { accommodationLegacyFromCode } from '@/lib/utils/accommodation-type-resolver';

export interface MyHostelSummary {
  learnerId: string;
  accommodationType: string | null;
  hostelCategory: { id: string; name: string; type: string | null; allocation_mode: string | null; upgrades_enabled: boolean } | null;
  /** In-flight upgrade target staged on confirm; promoted to hostelCategory on payment, else reverts. */
  pendingHostelCategory: { id: string; name: string } | null;
  messCategory: { id: string; name: string; upgrades_enabled: boolean } | null;
  hostelFee: number | null;
  institutionId: string | null;
}

/** Bed count + fee band of the room the current user is allocated to. */
export interface MyRoomDetails {
  id: string;
  capacity: number;
  category_id: string | null;
}

/** A co-resident of the current user's assigned room (from fn_my_roommates). */
export interface Roommate {
  full_name: string;
  bed_number: string | null;
  program_name: string | null;
  semester_name: string | null;
  status: string;
}

export class MyHostelService {
  // Resolves the current learner's hostel summary from their OWN learners_profiles
  // row (RLS: students_view_own_learner_profile). learnerId = profiles.learner_id.
  static async getMySummary(learnerId: string): Promise<MyHostelSummary | null> {
    if (!learnerId) return null;
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('learners_profiles')
      .select(
        'id, accommodation_type_id, hostel_fee, institution_id, ' +
        'accommodation_ref:accommodation_types!accommodation_type_id(code, name), ' +
        'hostelCategory:hostel_category_id(id, name, type, allocation_mode, upgrades_enabled), ' +
        'pendingHostelCategory:pending_hostel_category_id(id, name), ' +
        'messCategory:mess_category_id(id, name, upgrades_enabled)'
      )
      .eq('id', learnerId)
      .maybeSingle();
    if (error) { logger.error('campus-living/my-hostel', 'getMySummary', error); throw error; }
    if (!data) return null;
    const row = data as any;
    // accommodation_type TEXT retired — derive legacy 'HOSTEL'/'DAY SCHOLAR' from FK.
    return {
      learnerId: row.id,
      accommodationType: accommodationLegacyFromCode(row.accommodation_ref?.code) || null,
      hostelCategory: row.hostelCategory ?? null,
      pendingHostelCategory: row.pendingHostelCategory ?? null,
      messCategory: row.messCategory ?? null,
      hostelFee: row.hostel_fee ?? null,
      institutionId: row.institution_id ?? null,
    };
  }

  // Co-residents of the current user's assigned room. SECURITY DEFINER RPC —
  // residents can only read their own allocation row via RLS, so roommates must
  // be resolved server-side (scoped to the caller's own room).
  static async getMyRoommates(): Promise<Roommate[]> {
    const supabase = createClientSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_my_roommates');
    if (error) { logger.error('campus-living/my-hostel', 'getMyRoommates', error); throw error; }
    return (data ?? []) as Roommate[];
  }

  // Bed count + fee band of the resident's OWN room. Readable under
  // hostel_rooms_select_own_allocation (20260610120000) — a resident may read
  // any room their own allocation points at, so no new policy is needed.
  // Drives "you are the only one in a room built for N" (2026-08-09).
  static async getMyRoomDetails(roomId: string): Promise<MyRoomDetails | null> {
    if (!roomId) return null;
    const supabase = createClientSupabaseClient();
    const { data, error } = await supabase
      .from('hostel_rooms')
      .select('id, capacity, category_id')
      .eq('id', roomId)
      .maybeSingle();
    if (error) { logger.error('campus-living/my-hostel', 'getMyRoomDetails', error); throw error; }
    return (data as MyRoomDetails | null) ?? null;
  }

  // Fee breakdown (additive room+mess) for the resident's hostel
  // category in the current hostel year.
  static async getMyCategoryFees(hostelCategoryId: string) {
    if (!hostelCategoryId) return [];
    const supabase = createClientSupabaseClient();
    const year = await HostelYearService.getCurrentYear();
    if (!year) return [];
    const { data, error } = await supabase
      .from('hostel_fees')
      .select('id, amount, frequency, mess_category_id, is_active')
      .eq('hostel_year_id', year.id)
      .eq('hostel_category_id', hostelCategoryId)
      .eq('is_active', true);
    if (error) { logger.error('campus-living/my-hostel', 'getMyCategoryFees', error); throw error; }
    return data ?? [];
  }
}
