/**
 * Leave type assignment scope.
 *
 * Static class, SupabaseClient passed first — mirrors HRLeaveTypeService.
 * Supabase errors are plain objects, not Error instances, so every call
 * destructures { error } and throws it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRLeaveTypeAssignmentInsert,
  HRLeaveTypeAssignmentRow,
  HRLeaveTypeCoverage,
  StaffPickerOption,
} from '@/types/hr-leave-assignments';

export class LeaveAssignmentService {
  /**
   * Assignments for one leave type, with targets resolved for display.
   *
   * Both embeds are LEFT joins and each is null for the scopes it does not
   * apply to — an organization row has neither. An inner join would return
   * nothing at all.
   */
  static async listForType(
    supabase: SupabaseClient,
    leaveTypeId: string
  ): Promise<HRLeaveTypeAssignmentRow[]> {
    const { data, error } = await supabase
      .from('hr_leave_type_assignments')
      .select(
        `*,
         dept:department_id ( department_name ),
         person:staff_id ( first_name, last_name, staff_id )`
      )
      .eq('leave_type_id', leaveTypeId)
      .order('scope_kind', { ascending: true });
    if (error) throw error;

    return (data ?? []).map((row: Record<string, unknown>) => {
      const d = row.dept as { department_name: string | null } | null;
      const p = row.person as
        | { first_name: string | null; last_name: string | null; staff_id: string | null }
        | null;
      return {
        ...(row as unknown as HRLeaveTypeAssignmentRow),
        entitled_days:
          row.entitled_days === null || row.entitled_days === undefined
            ? null
            : Number(row.entitled_days),
        department_name: d?.department_name ?? null,
        staff_name:
          [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() || null,
        staff_code: p?.staff_id ?? null,
      };
    });
  }

  /** Impact preview — how many people this type actually reaches. */
  static async getCoverage(
    supabase: SupabaseClient,
    leaveTypeId: string
  ): Promise<HRLeaveTypeCoverage> {
    const { data, error } = await supabase.rpc('hr_leave_type_coverage', {
      p_leave_type_id: leaveTypeId,
    });
    if (error) throw error;
    return data as HRLeaveTypeCoverage;
  }

  /**
   * Create assignments. Accepts a batch so picking five departments is one
   * round trip and one cache invalidation rather than five.
   *
   * A duplicate target hits the partial unique indexes; 23505 is translated
   * because "already assigned" is the only thing it can mean here.
   */
  static async create(
    supabase: SupabaseClient,
    rows: HRLeaveTypeAssignmentInsert[]
  ): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await supabase.from('hr_leave_type_assignments').insert(rows);
    if (error) {
      if (error.code === '23505') {
        throw new Error('One or more of those targets is already assigned to this leave type.');
      }
      throw error;
    }
  }

  static async updateEntitlement(
    supabase: SupabaseClient,
    id: string,
    entitledDays: number | null
  ): Promise<void> {
    const { error } = await supabase
      .from('hr_leave_type_assignments')
      .update({ entitled_days: entitledDays })
      .eq('id', id);
    if (error) throw error;
  }

  /**
   * Hard delete, not a soft archive.
   *
   * Unlike a leave type, an assignment is referenced by nothing — balances
   * record the resolved number, not the rule that produced it. Keeping dead
   * rows would only make the precedence list harder to read.
   */
  static async remove(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase
      .from('hr_leave_type_assignments')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  /** Departments that actually have active staff, for the picker. */
  static async listDepartments(
    supabase: SupabaseClient,
    institutionId: string
  ): Promise<Array<{ id: string; name: string; staff_count: number }>> {
    const { data, error } = await supabase
      .from('staff')
      .select('department_id, departments:department_id ( department_name )')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .not('department_id', 'is', null);
    if (error) throw error;

    // Aggregated client-side: PostgREST cannot GROUP BY, and this is a few
    // hundred rows for one institution.
    const counts = new Map<string, { name: string; n: number }>();
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const id = row.department_id as string;
      const dep = row.departments as { department_name: string | null } | null;
      const cur = counts.get(id);
      if (cur) cur.n += 1;
      else counts.set(id, { name: dep?.department_name ?? 'Unnamed department', n: 1 });
    }
    return [...counts.entries()]
      .map(([id, v]) => ({ id, name: v.name, staff_count: v.n }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Type-ahead over active staff in one institution.
   *
   * Queries the staff table directly rather than a role allow-list — a role
   * list answers "who may log in", not "who works here", and the two diverge.
   */
  static async searchStaff(
    supabase: SupabaseClient,
    institutionId: string,
    term: string
  ): Promise<StaffPickerOption[]> {
    let q = supabase
      .from('staff')
      .select('id, staff_id, first_name, last_name, departments:department_id ( department_name )')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .limit(25);

    if (term.trim()) {
      const safe = term.trim().replace(/[%,()]/g, '');
      q = q.or(
        `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,staff_id.ilike.%${safe}%`
      );
    }

    const { data, error } = await q;
    if (error) throw error;

    return (data ?? []).map((row: Record<string, unknown>) => {
      const dep = row.departments as { department_name: string | null } | null;
      return {
        id: row.id as string,
        staff_code: (row.staff_id as string | null) ?? null,
        name:
          [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || 'Unnamed',
        department_name: dep?.department_name ?? null,
      };
    });
  }
}
