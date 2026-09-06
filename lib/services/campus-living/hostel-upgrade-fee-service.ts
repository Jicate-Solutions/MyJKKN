import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  getUpgradeFeeKind,
  type UpgradeFee,
  type UpgradeFeeRow,
  type UpgradeFeeGender,
  type CreateUpgradeFeeDto,
  type UpdateUpgradeFeeDto,
} from '@/types/hostel-category-upgrade-fees';

const LOG = 'campus-living/hostel-upgrade-fees';

// Explicit from→to upgrade pricing (room/mess) per hostel year — reads/writes
// hostel_category_upgrade_fees and enriches rows with category names + base fees.
export class HostelUpgradeFeeService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  static async getByYear(hostelYearId: string): Promise<UpgradeFeeRow[]> {
    const { data, error } = await this.supabase
      .from('hostel_category_upgrade_fees')
      .select(
        `*,
         from_room:hostel_categories!from_hostel_category_id(name, type),
         to_room:hostel_categories!to_hostel_category_id(name, type),
         from_mess:mess_categories!from_mess_category_id(name, type),
         to_mess:mess_categories!to_mess_category_id(name, type)`
      )
      .eq('hostel_year_id', hostelYearId)
      .order('created_at', { ascending: true });
    if (error) {
      logger.error(LOG, 'getByYear failed', error);
      throw new Error(error.message || 'Failed to load upgrade fees');
    }

    // Base (full) per-category fees for this year — to show "From (27,500) → To (35,000)".
    const { data: baseFees, error: bfErr } = await this.supabase
      .from('hostel_fees')
      .select('hostel_category_id, mess_category_id, amount')
      .eq('hostel_year_id', hostelYearId)
      .eq('is_active', true);
    if (bfErr) logger.error(LOG, 'base fees lookup failed', bfErr);
    const roomBase = new Map<string, number>();
    const messBase = new Map<string, number>();
    for (const f of (baseFees ?? []) as {
      hostel_category_id: string | null;
      mess_category_id: string | null;
      amount: number;
    }[]) {
      if (f.hostel_category_id && !f.mess_category_id) roomBase.set(f.hostel_category_id, f.amount);
      else if (f.mess_category_id) messBase.set(f.mess_category_id, f.amount);
    }

    return (data ?? []).map((r: Record<string, unknown>) => {
      const fromRoom = r.from_room as { name?: string; type?: string } | null;
      const toRoom = r.to_room as { name?: string; type?: string } | null;
      const fromMess = r.from_mess as { name?: string; type?: string } | null;
      const toMess = r.to_mess as { name?: string; type?: string } | null;
      const {
        from_room: _fr,
        to_room: _tr,
        from_mess: _fm,
        to_mess: _tm,
        ...rest
      } = r;
      const row = rest as UpgradeFee;
      const kind = getUpgradeFeeKind(row);
      return {
        ...row,
        kind,
        from_name: (kind === 'room' ? fromRoom?.name : fromMess?.name) ?? null,
        to_name: (kind === 'room' ? toRoom?.name : toMess?.name) ?? null,
        from_type: ((kind === 'room' ? fromRoom?.type : fromMess?.type) ?? null) as
          | UpgradeFeeGender
          | null,
        to_type: ((kind === 'room' ? toRoom?.type : toMess?.type) ?? null) as
          | UpgradeFeeGender
          | null,
        from_base_fee:
          kind === 'room'
            ? roomBase.get(row.from_hostel_category_id ?? '') ?? null
            : messBase.get(row.from_mess_category_id ?? '') ?? null,
        to_base_fee:
          kind === 'room'
            ? roomBase.get(row.to_hostel_category_id ?? '') ?? null
            : messBase.get(row.to_mess_category_id ?? '') ?? null,
      };
    });
  }

  static async create(dto: CreateUpgradeFeeDto): Promise<UpgradeFee> {
    const { data, error } = await this.supabase
      .from('hostel_category_upgrade_fees')
      .insert([dto])
      .select('*')
      .single();
    if (error) {
      logger.error(LOG, 'create failed', error);
      const enhanced: Error & { code?: string } = new Error(
        error.code === '23505'
          ? 'An upgrade fee already exists for this From → To pair and hostel year.'
          : error.message || 'Failed to create upgrade fee'
      );
      enhanced.code = error.code;
      throw enhanced;
    }
    return data as UpgradeFee;
  }

  static async update(id: string, dto: UpdateUpgradeFeeDto): Promise<UpgradeFee> {
    const { data, error } = await this.supabase
      .from('hostel_category_upgrade_fees')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      logger.error(LOG, 'update failed', error);
      throw new Error(error.message || 'Failed to update upgrade fee');
    }
    return data as UpgradeFee;
  }

  static async remove(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('hostel_category_upgrade_fees')
      .delete()
      .eq('id', id);
    if (error) {
      logger.error(LOG, 'delete failed', error);
      throw new Error(error.message || 'Failed to delete upgrade fee');
    }
  }
}
