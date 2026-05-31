import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
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
  static async getRules(institutionId: string): Promise<RoomEligibilityRuleRow[]> {
    const { data, error } = await this.supabase
      .from('hostel_room_eligibility_rules')
      .select(
        `*,
         block:hostel_blocks(name),
         degree:degrees(degree_name),
         department:departments(department_name),
         program:programs(program_name),
         semester:semesters(semester_name),
         rooms:hostel_room_eligibility_rule_rooms(room_id)`
      )
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error(LOG, 'Database error listing room eligibility rules', error);
      throw new Error(error.message || 'Failed to fetch room eligibility rules');
    }

    return (data ?? []).map((r: Record<string, unknown>) => {
      const block = r.block as { name?: string } | null;
      const degree = r.degree as { degree_name?: string } | null;
      const department = r.department as { department_name?: string } | null;
      const program = r.program as { program_name?: string } | null;
      const semester = r.semester as { semester_name?: string } | null;
      const rooms = (r.rooms as { room_id: string }[] | null) ?? [];
      const {
        block: _b,
        degree: _d,
        department: _dept,
        program: _p,
        semester: _s,
        rooms: _r,
        ...rest
      } = r;
      const roomIds = rooms.map((x) => x.room_id);
      return {
        ...(rest as RoomEligibilityRule),
        block_name: block?.name ?? null,
        degree_name: degree?.degree_name ?? null,
        department_name: department?.department_name ?? null,
        program_name: program?.program_name ?? null,
        semester_name: semester?.semester_name ?? null,
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
          semester_id: ruleFields.semester_id ?? null,
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

  static async getBlocks(institutionId: string): Promise<BlockOption[]> {
    const { data: junction, error: jErr } = await this.supabase
      .from('hostel_block_institutions')
      .select('block_id')
      .eq('institution_id', institutionId);
    if (jErr) throw new Error(jErr.message || 'Failed to load blocks');
    const ids = (junction ?? []).map((j) => j.block_id);
    if (ids.length === 0) return [];
    const { data, error } = await this.supabase
      .from('hostel_blocks')
      .select('id, name')
      .in('id', ids)
      .order('name', { ascending: true });
    if (error) throw new Error(error.message || 'Failed to load blocks');
    return (data ?? []).map((b: Record<string, unknown>) => ({
      id: b.id as string,
      label: b.name as string,
    }));
  }

  static async getRoomsForBlock(blockId: string): Promise<RoomOption[]> {
    const { data, error } = await this.supabase
      .from('hostel_rooms')
      .select('id, room_number, floor')
      .eq('block_id', blockId)
      .eq('room_purpose', 'student')
      .order('floor', { ascending: true })
      .order('room_number', { ascending: true });
    if (error) throw new Error(error.message || 'Failed to load rooms');
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      room_number: r.room_number as string,
      floor: r.floor as number,
    }));
  }
}
