import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * AC / room-category audit (PR ι-b).
 *
 * READ-ONLY visibility surface. After decisions 26-29 (2026-05-28) AC is a
 * billable amenity ORTHOGONAL to room category. Boobalan's prior backfill
 * (20260528000011) derived category FROM AC (AC -> Premium, else Classic).
 * That heuristic is wrong-in-principle; this audit surfaces the rooms where
 * category and AC presence DIVERGE from that old heuristic — i.e. AC rooms
 * NOT categorised "Premium Room", and non-AC rooms categorised "Premium Room"
 * — so a warden can confirm the category is intentionally what it is.
 *
 * This is purely informational. Category stays Director-controlled; there is
 * NO auto-fix here. The AC FACT lives in the amenity system (the migration
 * 2026052904000 backfills it), independent of category.
 */

const AC_BILLABLE_CODE = 'air_conditioner';

export interface AcCategoryAuditRow {
  room_id: string;
  room_number: string | null;
  block_name: string | null;
  category_name: string | null;
  ac_status: string | null;
  has_ac: boolean;
  /** true when category↔AC diverges from the old AC=Premium heuristic. */
  diverges: boolean;
}

interface RoomRow {
  id: string;
  room_number: string | null;
  ac_status: string | null;
  hostel_blocks: { name: string | null } | { name: string | null }[] | null;
  hostel_categories: { name: string | null } | { name: string | null }[] | null;
}

function pickOne<T>(rel: T | T[] | null): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel ?? null;
}

export class AcAmenityAuditService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * All rooms with their category + AC status, flagged for divergence.
   * `divergentOnly = true` returns only the rooms the old heuristic would
   * have mis-categorised.
   */
  static async getAudit(divergentOnly = false): Promise<AcCategoryAuditRow[]> {
    const { data, error } = await this.supabase
      .from('hostel_rooms')
      .select(
        'id, room_number, ac_status, hostel_blocks(name), hostel_categories(name)'
      )
      .not('ac_status', 'is', null)
      .order('room_number', { ascending: true });

    if (error) {
      logger.error('AcAmenityAuditService.getAudit failed', { error });
      throw error;
    }

    const rows: AcCategoryAuditRow[] = (data as RoomRow[] | null ?? []).map(
      (r) => {
        const block = pickOne(r.hostel_blocks);
        const category = pickOne(r.hostel_categories);
        const categoryName = category?.name ?? null;
        const hasAc = r.ac_status === 'ac';
        const isPremium = categoryName === 'Premium Room';
        // Old heuristic = (AC <-> Premium). Divergence = the two disagree.
        const diverges = hasAc !== isPremium;
        return {
          room_id: r.id,
          room_number: r.room_number,
          block_name: block?.name ?? null,
          category_name: categoryName,
          ac_status: r.ac_status,
          has_ac: hasAc,
          diverges,
        };
      }
    );

    return divergentOnly ? rows.filter((r) => r.diverges) : rows;
  }

  /** Count of AC rooms that now carry a billable AC assignment (correction proof). */
  static async getAcBillableAssignmentCount(): Promise<number> {
    const { data: amenity, error: aErr } = await this.supabase
      .from('hostel_billable_amenities')
      .select('id')
      .eq('code', AC_BILLABLE_CODE)
      .maybeSingle();

    if (aErr || !amenity) {
      logger.error('AcAmenityAuditService: AC billable amenity not found', {
        error: aErr,
      });
      return 0;
    }

    const { count, error } = await this.supabase
      .from('hostel_room_billable_amenities')
      .select('room_id', { count: 'exact', head: true })
      .eq('billable_id', amenity.id)
      .eq('present', true);

    if (error) {
      logger.error('AcAmenityAuditService: assignment count failed', { error });
      return 0;
    }
    return count ?? 0;
  }
}
