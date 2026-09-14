import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { getErrorMessage } from '@/lib/utils';
import type {
  Cleaner,
  CreateCleanerDto,
  UpdateCleanerDto,
} from '@/types/campus-living/housekeeping';

const LOG = 'campus-living/housekeeping-cleaners';

export class HousekeepingCleanerService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * The directory is GLOBAL — cleaners carry no institution_id. Their real scope
   * is hostel_cleaner_blocks, because hostel_blocks has no institution either:
   * 4 of the 6 blocks house learners from several colleges at once.
   */
  static async listCleaners(includeInactive = false): Promise<Cleaner[]> {
    try {
      let query = this.supabase
        .from('hostel_cleaners')
        .select('*, blocks:hostel_cleaner_blocks(block_id)')
        .order('full_name', { ascending: true });

      if (!includeInactive) query = query.eq('is_active', true);

      const { data, error } = await query;
      if (error) {
        logger.error(LOG, 'Failed to list cleaners', error);
        throw error;
      }
      return (data ?? []).map((row: any) => ({
        ...(row as Cleaner),
        block_ids: (row.blocks ?? []).map((b: any) => b.block_id),
      }));
    } catch (error) {
      logger.error(LOG, `Unexpected error in listCleaners: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /**
   * Cleaners who serve this block AND work this weekday. Mirrors the two
   * checks in fn_cl_housekeeping_assign so the picker never offers someone
   * the RPC will refuse.
   */
  static async listAssignableForBooking(blockId: string, bookingDate: string): Promise<Cleaner[]> {
    try {
      const { data, error } = await this.supabase
        .from('hostel_cleaner_blocks')
        .select('cleaner:hostel_cleaners(*)')
        .eq('block_id', blockId);
      if (error) {
        logger.error(LOG, 'Failed to list assignable cleaners', error);
        throw error;
      }
      // Postgres DOW: getUTCDay() is 0=Sunday..6=Saturday, the same convention.
      const dow = new Date(`${bookingDate}T12:00:00Z`).getUTCDay();
      return (data ?? [])
        .map((r: any) => r.cleaner)
        .filter((c: any) => c && c.is_active && (c.working_days ?? []).includes(dow))
        .map((c: any) => ({ ...(c as Cleaner), block_ids: [blockId] }))
        .sort((a: Cleaner, b: Cleaner) => a.full_name.localeCompare(b.full_name));
    } catch (error) {
      logger.error(LOG, `Unexpected error in listAssignableForBooking: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async createCleaner(dto: CreateCleanerDto): Promise<Cleaner> {
    try {
      const { data, error } = await this.supabase
        .from('hostel_cleaners')
        .insert({
          full_name: dto.full_name.trim(),
          phone: dto.phone?.trim() || null,
          gender: dto.gender || null,
          employee_code: dto.employee_code?.trim() || null,
          working_days: dto.working_days,
          shift_start: dto.shift_start || null,
          shift_end: dto.shift_end || null,
          is_active: dto.is_active ?? true,
          notes: dto.notes?.trim() || null,
        })
        .select()
        .single();
      if (error) {
        logger.error(LOG, 'Failed to create cleaner', error);
        throw error;
      }
      const created = data as unknown as Cleaner;
      await this.replaceBlocks(created.id, dto.block_ids);
      return { ...created, block_ids: dto.block_ids };
    } catch (error) {
      logger.error(LOG, `Unexpected error in createCleaner: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async updateCleaner(cleanerId: string, dto: UpdateCleanerDto): Promise<void> {
    try {
      const patch: Record<string, unknown> = {};
      if (dto.full_name !== undefined) patch.full_name = dto.full_name.trim();
      if (dto.phone !== undefined) patch.phone = dto.phone?.trim() || null;
      if (dto.gender !== undefined) patch.gender = dto.gender || null;
      if (dto.employee_code !== undefined) patch.employee_code = dto.employee_code?.trim() || null;
      if (dto.working_days !== undefined) patch.working_days = dto.working_days;
      if (dto.shift_start !== undefined) patch.shift_start = dto.shift_start || null;
      if (dto.shift_end !== undefined) patch.shift_end = dto.shift_end || null;
      if (dto.is_active !== undefined) patch.is_active = dto.is_active;
      if (dto.notes !== undefined) patch.notes = dto.notes?.trim() || null;

      if (Object.keys(patch).length > 0) {
        const { error } = await this.supabase
          .from('hostel_cleaners')
          .update(patch)
          .eq('id', cleanerId);
        if (error) {
          logger.error(LOG, 'Failed to update cleaner', error);
          throw error;
        }
      }
      if (dto.block_ids !== undefined) await this.replaceBlocks(cleanerId, dto.block_ids);
    } catch (error) {
      logger.error(LOG, `Unexpected error in updateCleaner: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /** Refused by the database once bookings reference the cleaner. Deactivate instead. */
  static async deleteCleaner(cleanerId: string): Promise<void> {
    try {
      const { error } = await this.supabase.from('hostel_cleaners').delete().eq('id', cleanerId);
      if (error) {
        logger.error(LOG, 'Failed to delete cleaner', error);
        throw error;
      }
    } catch (error) {
      logger.error(LOG, `Unexpected error in deleteCleaner: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  private static async replaceBlocks(cleanerId: string, blockIds: string[]): Promise<void> {
    const { error: delErr } = await this.supabase
      .from('hostel_cleaner_blocks')
      .delete()
      .eq('cleaner_id', cleanerId);
    if (delErr) {
      logger.error(LOG, 'Failed to clear cleaner blocks', delErr);
      throw delErr;
    }
    if (blockIds.length === 0) return;
    const { error } = await this.supabase
      .from('hostel_cleaner_blocks')
      .insert(blockIds.map((block_id) => ({ cleaner_id: cleanerId, block_id })));
    if (error) {
      logger.error(LOG, 'Failed to insert cleaner blocks', error);
      throw error;
    }
  }
}
