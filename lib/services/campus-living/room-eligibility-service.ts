import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { getErrorMessage } from '@/lib/utils';
import type {
  RoomEligibilityRule,
  RoomEligibilityRuleRow,
  CreateRoomEligibilityRuleDto,
  UpdateRoomEligibilityRuleDto,
  AcademicOption,
  BlockOption,
  RoomOption,
} from '@/types/room-eligibility';

const LOG = 'campus-living/room-eligibility';

export class RoomEligibilityService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  // ── Rules ────────────────────────────────────────────────────────────
  // institutionId omitted => list rules across ALL institutions (the settings
  // page lists every institution; each rule carries its own institution_id).
  static async getRules(institutionId?: string): Promise<RoomEligibilityRuleRow[]> {
    let query = this.supabase
      .from('hostel_room_eligibility_rules')
      .select(
        `*,
         institution:institutions(name),
         block:hostel_blocks(name),
         degree:degrees(degree_name),
         department:departments(department_name),
         program:programs(program_name),
         rooms:hostel_room_eligibility_rule_rooms(room_id)`
      )
      .order('institution_id', { ascending: true })
      .order('created_at', { ascending: true });

    if (institutionId) query = query.eq('institution_id', institutionId);

    const { data, error } = await query;

    if (error) {
      // Spread the fields explicitly: PostgrestError extends Error, so message /
      // code / details / hint are NON-ENUMERABLE and logging the object whole
      // serialises to a useless `{}`.
      logger.error(LOG, 'Database error listing room eligibility rules', {
        message: getErrorMessage(error),
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      throw new Error(getErrorMessage(error));
    }

    const rules = (data ?? []) as Record<string, unknown>[];

    // semester_ids is a uuid[] with no foreign key, so PostgREST cannot embed
    // the names the way it does for degree/department/program. Resolve them in
    // one follow-up query keyed by the union of ids, then map back PER RULE in
    // that rule's own order — the array order is the allocation fill priority
    // and must survive the round-trip unsorted.
    const allSemesterIds = [
      ...new Set(rules.flatMap((r) => (r.semester_ids as string[] | null) ?? [])),
    ];
    const semesterNames = new Map<string, string>();
    if (allSemesterIds.length > 0) {
      const { data: sems, error: semErr } = await this.supabase
        .from('semesters')
        .select('id, semester_name')
        .in('id', allSemesterIds);
      if (semErr) {
        // Non-fatal: the rules still list correctly, just without semester labels.
        logger.error(LOG, 'Failed to resolve rule semester names', {
          message: getErrorMessage(semErr),
          code: semErr.code,
        });
      } else {
        (sems ?? []).forEach((s: Record<string, unknown>) =>
          semesterNames.set(s.id as string, s.semester_name as string)
        );
      }
    }

    return rules.map((r: Record<string, unknown>) => {
      const institution = r.institution as { name?: string } | null;
      const block = r.block as { name?: string } | null;
      const degree = r.degree as { degree_name?: string } | null;
      const department = r.department as { department_name?: string } | null;
      const program = r.program as { program_name?: string } | null;
      const rooms = (r.rooms as { room_id: string }[] | null) ?? [];
      const {
        institution: _i,
        block: _b,
        degree: _d,
        department: _dept,
        program: _p,
        rooms: _r,
        ...rest
      } = r;
      const roomIds = rooms.map((x) => x.room_id);
      const semesterIds = (r.semester_ids as string[] | null) ?? [];
      return {
        ...(rest as RoomEligibilityRule),
        semester_ids: semesterIds,
        institution_name: institution?.name ?? null,
        block_name: block?.name ?? null,
        degree_name: degree?.degree_name ?? null,
        department_name: department?.department_name ?? null,
        program_name: program?.program_name ?? null,
        semester_names: semesterIds.map((id) => semesterNames.get(id) ?? 'Unknown semester'),
        room_ids: roomIds,
        room_count: roomIds.length,
      };
    });
  }

  static async createRule(
    dto: CreateRoomEligibilityRuleDto
  ): Promise<RoomEligibilityRule> {
    const { room_ids, ...ruleFields } = dto;
    const { data, error } = await this.supabase
      .from('hostel_room_eligibility_rules')
      .insert([
        {
          ...ruleFields,
          floor: ruleFields.floor ?? null,
          degree_id: ruleFields.degree_id ?? null,
          department_id: ruleFields.department_id ?? null,
          program_id: ruleFields.program_id ?? null,
          // Column is NOT NULL DEFAULT '{}' — empty array means "any semester".
          semester_ids: ruleFields.semester_ids ?? [],
          rule_name: ruleFields.rule_name ?? null,
        },
      ])
      .select('*')
      .single();
    if (error) {
      logger.error(LOG, 'Database error creating room eligibility rule', error);
      throw new Error(error.message || 'Failed to create room eligibility rule');
    }
    const rule = data as RoomEligibilityRule;
    if (room_ids && room_ids.length > 0) {
      await this.syncRuleRooms(rule.id, room_ids);
    }
    return rule;
  }

  static async updateRule(
    id: string,
    dto: UpdateRoomEligibilityRuleDto
  ): Promise<RoomEligibilityRule> {
    const { room_ids, ...ruleFields } = dto;
    const { data, error } = await this.supabase
      .from('hostel_room_eligibility_rules')
      .update({ ...ruleFields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      logger.error(LOG, 'Database error updating room eligibility rule', error);
      throw new Error(error.message || 'Failed to update room eligibility rule');
    }
    if (room_ids !== undefined) {
      await this.syncRuleRooms(id, room_ids);
    }
    return data as RoomEligibilityRule;
  }

  static async deleteRule(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('hostel_room_eligibility_rules')
      .delete()
      .eq('id', id);
    if (error) {
      logger.error(LOG, 'Database error deleting room eligibility rule', error);
      throw new Error(error.message || 'Failed to delete room eligibility rule');
    }
  }

  // Replace a rule's explicit room set (clear then insert). Empty = whole block/floor.
  static async syncRuleRooms(ruleId: string, roomIds: string[]): Promise<void> {
    const { error: delErr } = await this.supabase
      .from('hostel_room_eligibility_rule_rooms')
      .delete()
      .eq('rule_id', ruleId);
    if (delErr) {
      logger.error(LOG, 'Database error clearing rule rooms', delErr);
      throw new Error(delErr.message || 'Failed to update rule rooms');
    }
    if (roomIds.length === 0) return;
    const rows = roomIds.map((room_id) => ({ rule_id: ruleId, room_id }));
    const { error: insErr } = await this.supabase
      .from('hostel_room_eligibility_rule_rooms')
      .insert(rows);
    if (insErr) {
      logger.error(LOG, 'Database error inserting rule rooms', insErr);
      throw new Error(insErr.message || 'Failed to update rule rooms');
    }
  }

  // ── Cascade option loaders (Institution → Degree → Department → Program → Semester) ──
  static async getDegrees(institutionId: string): Promise<AcademicOption[]> {
    const { data, error } = await this.supabase
      .from('degrees')
      .select('id, degree_name, display_name')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('degree_order', { ascending: true });
    if (error) throw new Error(error.message || 'Failed to load degrees');
    return (data ?? []).map((d: Record<string, unknown>) => ({
      id: d.id as string,
      label: (d.display_name as string) || (d.degree_name as string),
    }));
  }

  static async getDepartments(degreeId: string): Promise<AcademicOption[]> {
    const { data, error } = await this.supabase
      .from('departments')
      .select('id, department_name, display_name')
      .eq('degree_id', degreeId)
      .eq('is_active', true)
      .order('department_order', { ascending: true });
    if (error) throw new Error(error.message || 'Failed to load departments');
    return (data ?? []).map((d: Record<string, unknown>) => ({
      id: d.id as string,
      label: (d.display_name as string) || (d.department_name as string),
    }));
  }

  static async getPrograms(departmentId: string): Promise<AcademicOption[]> {
    const { data, error } = await this.supabase
      .from('programs')
      .select('id, program_name, display_name')
      .eq('department_id', departmentId)
      .eq('is_active', true)
      .order('program_order', { ascending: true });
    if (error) throw new Error(error.message || 'Failed to load programs');
    return (data ?? []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      label: (p.display_name as string) || (p.program_name as string),
    }));
  }

  static async getSemesters(programId: string): Promise<AcademicOption[]> {
    const { data, error } = await this.supabase
      .from('semesters')
      .select('id, semester_name, semester_order')
      .eq('program_id', programId)
      .eq('is_active', true)
      .order('semester_order', { ascending: true });
    if (error) throw new Error(error.message || 'Failed to load semesters');
    return (data ?? []).map((s: Record<string, unknown>) => ({
      id: s.id as string,
      label: s.semester_name as string,
    }));
  }

  // All blocks. An eligibility rule's block is a PHYSICAL target, independent of
  // which institution the cohort belongs to (the institution dimension gates the
  // learner, not the block). Filtering by the hostel_block_institutions junction
  // hid blocks linked to a different institution (or not linked at all, e.g. a
  // block created by a super-admin with no institution).
  static async getBlocks(): Promise<BlockOption[]> {
    const { data, error } = await this.supabase
      .from('hostel_blocks')
      .select('id, name')
      .order('name', { ascending: true });
    if (error) throw new Error(error.message || 'Failed to load blocks');
    return (data ?? []).map((b: Record<string, unknown>) => ({
      id: b.id as string,
      label: b.name as string,
    }));
  }

  // Does a block have any ACTIVE physical-room rule? Auto-allocation is
  // rule-driven (2026-06-03) and refuses to run on a block with no rule, so
  // the Auto-Allocate page checks this on block-select to guard + guide.
  static async hasRulesForBlock(blockId: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from('hostel_room_eligibility_rules')
      .select('id', { count: 'exact', head: true })
      .eq('block_id', blockId)
      .eq('is_active', true);
    if (error) throw new Error(error.message || 'Failed to check block rules');
    return (count ?? 0) > 0;
  }

  static async getRoomsForBlock(blockId: string): Promise<RoomOption[]> {
    // Left-join the category (no !inner) so a room missing a category still
    // appears — it lands in the "Uncategorized" group rather than vanishing.
    // `capacity` is the planned bed count (also what the Block detail page sums).
    const { data, error } = await this.supabase
      .from('hostel_rooms')
      .select('id, room_number, floor, capacity, category_id, hostel_categories(name)')
      .eq('block_id', blockId)
      .eq('room_purpose', 'student')
      .order('floor', { ascending: true })
      .order('room_number', { ascending: true });
    if (error) throw new Error(error.message || 'Failed to load rooms');

    // Live occupancy for the free/total bed badge — same source the Block detail
    // Overview uses. Non-fatal: if it fails, degrade to occupied=0 (shows full
    // capacity as free) rather than blocking the rooms picker.
    const { data: occ, error: occErr } = await this.supabase
      .from('v_hostel_room_occupancy')
      .select('room_id, active_residents')
      .eq('block_id', blockId);
    if (occErr) {
      logger.error(LOG, 'Failed to load room occupancy for rooms picker', occErr);
    }
    const occupiedByRoom = new Map<string, number>();
    for (const row of (occ ?? []) as { room_id: string | null; active_residents: number | null }[]) {
      if (row.room_id) occupiedByRoom.set(row.room_id, row.active_residents ?? 0);
    }

    return (data ?? []).map((r: Record<string, unknown>) => {
      const category = r.hostel_categories as { name?: string } | null;
      const capacity = (r.capacity as number) ?? 0;
      const occupied = occupiedByRoom.get(r.id as string) ?? 0;
      return {
        id: r.id as string,
        room_number: r.room_number as string,
        floor: r.floor as number,
        category_id: (r.category_id as string) ?? null,
        category_name: category?.name ?? null,
        capacity,
        occupied,
        available: Math.max(capacity - occupied, 0),
      };
    });
  }
}
