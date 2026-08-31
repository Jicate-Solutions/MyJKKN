import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  resolveScannedCode,
  type MessScanLookup,
  type MessScanResolution,
  type ScannedLearner,
} from '@/lib/services/campus-living/mess-scan-resolver';
import type {
  MessMealRecord,
  CreateMessMealRecordDTO,
  MessMealBooking,
  MealRecordFilters,
  MealType,
  BookingStatus,
} from '@/types/campus-living';

/** Postgres unique_violation — the duplicate-scan guard firing, not a fault. */
const PG_UNIQUE_VIOLATION = '23505';

type LearnerRow = {
  id: string;
  institution_id: string | null;
  first_name: string | null;
  last_name: string | null;
  roll_number: string | null;
  lifecycle_status: string | null;
};

function toScannedLearner(row: LearnerRow): ScannedLearner {
  return {
    id: row.id,
    institutionId: row.institution_id ?? null,
    fullName: [row.first_name, row.last_name].filter(Boolean).join(' ').trim(),
    rollNumber: row.roll_number ?? null,
    lifecycleStatus: row.lifecycle_status ?? null,
  };
}

const LEARNER_COLS =
  'id, institution_id, first_name, last_name, roll_number, lifecycle_status';

/**
 * Is the person behind an employee card still on the staff register?
 *
 * `staff.is_active` is the employment flag. NOT `staff.status`, which reads
 * 'draft' / 'published' — a profile-page publish state that says nothing about
 * whether someone still works here. The email bridge matches how the card
 * render engine finds a team member. Null when we could not establish it,
 * which the leaver rule treats as "not shown to have left".
 */
async function teamMemberIsActive(
  supabase: ReturnType<typeof createClientSupabaseClient>,
  email: string | null
): Promise<boolean | null> {
  const value = (email ?? '').trim();
  if (value === '') return null;
  for (const column of ['institution_email', 'email'] as const) {
    const { data, error } = await supabase
      .from('staff')
      .select('is_active')
      .eq(column, value)
      .limit(1);
    if (error) continue;
    const rows = data as Array<{ is_active: boolean | null }> | null;
    if (rows && rows.length > 0) return rows[0].is_active ?? null;
  }
  return null;
}

/**
 * The live implementation of the scan resolver's I/O port. Every read here is
 * a plain RLS-scoped browser query — the resolver holds the decisions, this
 * holds only the queries.
 */
function createSupabaseScanLookup(): MessScanLookup {
  const supabase = createClientSupabaseClient();
  return {
    async learnerByLearnerProfileId(id) {
      const { data } = await supabase
        .from('learners_profiles')
        .select(LEARNER_COLS)
        .eq('id', id)
        .maybeSingle();
      return data ? toScannedLearner(data as LearnerRow) : null;
    },
    async learnerByRollNumber(rollOrRegister) {
      const { data } = await supabase
        .from('learners_profiles')
        .select(LEARNER_COLS)
        .or(`roll_number.eq.${rollOrRegister},register_number.eq.${rollOrRegister}`)
        .limit(1)
        .maybeSingle();
      return data ? toScannedLearner(data as LearnerRow) : null;
    },
    async learnerProfileIdByJkknId(jkknId) {
      // retired_at IS NULL — a retired number must read as "not recognised".
      const { data } = await supabase
        .from('jkkn_identities')
        .select('learner_profile_id')
        .eq('jkkn_id', jkknId)
        .is('retired_at', null)
        .maybeSingle();
      return (data as { learner_profile_id: string | null } | null)?.learner_profile_id ?? null;
    },
    async profileIdForLearner(learnerProfileId) {
      // The canonical learners_profiles.id -> profiles.id bridge; profiles
      // .learner_id is strictly 1:1 (see learner-hostelite-service.ts).
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('learner_id', learnerProfileId)
        .maybeSingle();
      return (data as { id: string } | null)?.id ?? null;
    },
    async profileById(id) {
      const { data } = await supabase
        .from('profiles')
        .select('id, institution_id, full_name, email')
        .eq('id', id)
        .maybeSingle();
      if (!data) return null;
      const row = data as {
        id: string;
        institution_id: string | null;
        full_name: string | null;
        email: string | null;
      };
      return {
        id: row.id,
        institutionId: row.institution_id ?? null,
        fullName: (row.full_name ?? '').trim(),
        teamMemberIsActive: await teamMemberIsActive(supabase, row.email),
      };
    },
  };
}

/** What the scan screen renders after one card is presented. */
export type MessScanOutcome =
  | {
      status: 'recorded';
      record: MessMealRecord;
      displayName: string;
      rollNumber: string | null;
    }
  | {
      status: 'already_scanned';
      displayName: string;
      rollNumber: string | null;
    }
  | { status: 'not_recognised'; code: string }
  | { status: 'no_login_profile'; code: string; displayName: string }
  /** A working card belonging to someone who has left. No meal is filed. */
  | { status: 'has_left'; displayName: string; reason: string }
  | { status: 'failed'; message: string };

export class MessMealService {
  // ── List meal records with filters ────────────────────────────────
  static async getMealRecords(
    institutionId: string | undefined,
    filters?: MealRecordFilters,
    page = 1,
    pageSize = 100
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_meal_records')
        .select('*', { count: 'exact' });

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (filters?.date) query = query.eq('date', filters.date);
      if (filters?.meal_type) query = query.eq('meal_type', filters.meal_type);
      if (filters?.learner_id) query = query.eq('learner_id', filters.learner_id);

      const from = (page - 1) * pageSize;
      query = query.order('date', { ascending: false }).order('meal_type').range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/meals', 'Failed to fetch meal records', error);
        throw error;
      }
      return { data: data as MessMealRecord[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in getMealRecords', error);
      throw error;
    }
  }

  // ── Single meal record ────────────────────────────────────────────
  static async getMealRecord(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_meal_records')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error('campus-living/meals', 'Failed to fetch meal record', error);
        throw error;
      }
      return data as MessMealRecord | null;
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in getMealRecord', error);
      throw error;
    }
  }

  // ── Record meal consumption (scan) ────────────────────────────────
  static async recordMeal(payload: CreateMessMealRecordDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_meal_records')
        .insert({
          ...payload,
          consumed: true,
          scan_time: payload.scan_time || new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        logger.error('campus-living/meals', 'Failed to record meal', error);
        throw error;
      }
      return data as MessMealRecord;
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in recordMeal', error);
      throw error;
    }
  }

  // ── Record a meal from a scanned / typed card code ────────────────
  /**
   * The mess-door entrypoint. Resolves whatever the camera or the keyboard
   * produced to a profiles.id, then writes the record against it.
   *
   * institution_id is taken from the RESOLVED LEARNER, not from the guard on
   * duty. All JKKN colleges share one walkable campus, so a guard from one
   * college routinely scans a learner from another; tagging the record to the
   * guard's own institution would mis-file the headcount that mess billing is
   * later computed from — and RLS would allow it, because
   * role_has_institution_access() is evaluated against that same value.
   *
   * Returns an outcome rather than throwing for the expected refusals — an
   * unknown card and an already-scanned learner are both answers a guard needs
   * to read at a glance, not exceptions.
   */
  static async recordMealByScannedCode(input: {
    code: string;
    date: string;
    mealType: MealType;
    scanMethod: 'qr_code' | 'manual';
    /** Used only when the resolved learner carries no institution of their own. */
    fallbackInstitutionId?: string | null;
    lookup?: MessScanLookup;
  }): Promise<MessScanOutcome> {
    const lookup = input.lookup ?? createSupabaseScanLookup();

    let resolution: MessScanResolution;
    try {
      resolution = await resolveScannedCode(input.code, lookup);
    } catch (error) {
      logger.error('campus-living/meals', 'Card lookup failed', error);
      return {
        status: 'failed',
        message: error instanceof Error ? error.message : 'Could not look up that card',
      };
    }

    if (resolution.status === 'not_recognised') {
      return { status: 'not_recognised', code: resolution.code };
    }
    if (resolution.status === 'has_left') {
      // The card reads perfectly; the person behind it has gone. Refuse the
      // meal and say which record says so — never a silent no-op, and never
      // the "card not recognised" line, which would send the server off to
      // fix a reader that is working.
      return {
        status: 'has_left',
        displayName: resolution.displayName,
        reason: resolution.reason,
      };
    }
    if (resolution.status === 'no_login_profile') {
      return {
        status: 'no_login_profile',
        code: resolution.code,
        displayName: resolution.displayName,
      };
    }

    const institutionId = resolution.institutionId || input.fallbackInstitutionId || '';
    if (!institutionId) {
      return {
        status: 'failed',
        message: 'That learner has no college on record, so the meal cannot be filed.',
      };
    }

    try {
      const record = await MessMealService.recordMeal({
        institution_id: institutionId,
        learner_id: resolution.profileId,
        date: input.date,
        meal_type: input.mealType,
        consumed: true,
        scan_method: input.scanMethod,
        scan_time: new Date().toISOString(),
        is_guest_meal: false,
      });
      return {
        status: 'recorded',
        record,
        displayName: resolution.displayName,
        rollNumber: resolution.rollNumber,
      };
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === PG_UNIQUE_VIOLATION) {
        // The partial unique index doing its job: this learner already ate
        // this meal today. Not a fault — the guard just waves them through.
        return {
          status: 'already_scanned',
          displayName: resolution.displayName,
          rollNumber: resolution.rollNumber,
        };
      }
      return {
        status: 'failed',
        message: error instanceof Error ? error.message : 'Could not record that meal',
      };
    }
  }

  // ── Bulk record meals (batch scan) ────────────────────────────────
  static async bulkRecordMeals(records: CreateMessMealRecordDTO[]) {
    try {
      const supabase = createClientSupabaseClient();
      const enriched = records.map((r) => ({
        ...r,
        consumed: true,
        scan_time: r.scan_time || new Date().toISOString(),
      }));

      const { data, error } = await supabase
        .from('mess_meal_records')
        .insert(enriched)
        .select();

      if (error) {
        logger.error('campus-living/meals', 'Failed to bulk record meals', error);
        throw error;
      }
      return data as MessMealRecord[];
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in bulkRecordMeals', error);
      throw error;
    }
  }

  // ── Record guest meal ─────────────────────────────────────────────
  static async recordGuestMeal(payload: CreateMessMealRecordDTO & { guest_name: string; guest_count: number }) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_meal_records')
        .insert({
          ...payload,
          is_guest_meal: true,
          consumed: true,
          scan_time: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        logger.error('campus-living/meals', 'Failed to record guest meal', error);
        throw error;
      }
      return data as MessMealRecord;
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in recordGuestMeal', error);
      throw error;
    }
  }

  // ── Update meal record ────────────────────────────────────────────
  static async updateMealRecord(id: string, payload: Partial<CreateMessMealRecordDTO>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_meal_records')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/meals', 'Failed to update meal record', error);
        throw error;
      }
      return data as MessMealRecord;
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in updateMealRecord', error);
      throw error;
    }
  }

  // ── Delete meal record ────────────────────────────────────────────
  static async deleteMealRecord(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('mess_meal_records')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/meals', 'Failed to delete meal record', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in deleteMealRecord', error);
      throw error;
    }
  }

  // ── Meal count for a date and meal type ───────────────────────────
  static async getMealCount(institutionId: string | undefined, date: string, mealType?: MealType) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_meal_records')
        .select('*', { count: 'exact', head: true })
        .eq('date', date)
        .eq('consumed', true);

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (mealType) query = query.eq('meal_type', mealType);

      const { count, error } = await query;
      if (error) {
        logger.error('campus-living/meals', 'Failed to get meal count', error);
        throw error;
      }
      return count ?? 0;
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in getMealCount', error);
      throw error;
    }
  }

  // ── Meal bookings ─────────────────────────────────────────────────
  static async getBookings(
    institutionId: string | undefined,
    filters?: { learner_id?: string; date?: string; meal_type?: MealType; status?: BookingStatus }
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_meal_bookings')
        .select('*');

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (filters?.learner_id) query = query.eq('learner_id', filters.learner_id);
      if (filters?.date) query = query.eq('date', filters.date);
      if (filters?.meal_type) query = query.eq('meal_type', filters.meal_type);
      if (filters?.status) query = query.eq('status', filters.status);

      query = query.order('date').order('meal_type');

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/meals', 'Failed to fetch bookings', error);
        throw error;
      }
      return data as MessMealBooking[];
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in getBookings', error);
      throw error;
    }
  }

  // ── Create booking ────────────────────────────────────────────────
  static async createBooking(payload: Omit<MessMealBooking, 'id' | 'created_at'>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_meal_bookings')
        .insert(payload)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/meals', 'Failed to create booking', error);
        throw error;
      }
      return data as MessMealBooking;
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in createBooking', error);
      throw error;
    }
  }

  // ── Cancel booking ────────────────────────────────────────────────
  static async cancelBooking(bookingId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('mess_meal_bookings')
        .update({
          status: 'cancelled' as BookingStatus,
          cancellation_time: new Date().toISOString(),
        })
        .eq('id', bookingId)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/meals', 'Failed to cancel booking', error);
        throw error;
      }
      return data as MessMealBooking;
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in cancelBooking', error);
      throw error;
    }
  }

  // ── Learner meal history ──────────────────────────────────────────
  static async getLearnerMealHistory(
    learnerId: string,
    dateFrom?: string,
    dateTo?: string
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('mess_meal_records')
        .select('*')
        .eq('learner_id', learnerId);

      if (dateFrom) query = query.gte('date', dateFrom);
      if (dateTo) query = query.lte('date', dateTo);
      query = query.order('date', { ascending: false }).order('meal_type');

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/meals', 'Failed to fetch learner meal history', error);
        throw error;
      }
      return data as MessMealRecord[];
    } catch (error) {
      logger.error('campus-living/meals', 'Unexpected error in getLearnerMealHistory', error);
      throw error;
    }
  }
}
