/**
 * Improvement Board — board (area) management service (browser client).
 * ============================================================================
 *
 * The 14 boards in `improvement_areas` were seeded by migration and had no
 * write path at all. This service is that write path, for board managers only
 * (`improvement.board.manage`, or an administrator).
 *
 * Every mutation goes through a SECURITY DEFINER RPC — never a direct table
 * write — because the rules that make board management safe cannot live in the
 * client:
 *
 *   - a built-in board (`is_system`) may be renamed, re-ordered and switched
 *     off, but NEVER deleted;
 *   - a board with dependent work attached (ideas, department playbooks and
 *     their versions, data gaps, assignments, analyst views, rotation history)
 *     refuses to delete, because seven of the eight foreign keys pointing at
 *     `improvement_areas` CASCADE and would destroy that work silently;
 *   - `key` is a stable slug generated once at creation and never editable.
 *
 * The list call is an RPC too: it returns the per-board dependent-row counts
 * that the screen uses to explain what deleting would cost, and a manager has
 * no RLS read path to several of those tables.
 *
 * The `improvement_*` tables are live in prod but not in the generated
 * `types/supabase.ts`, so calls cast through `(supabase as any)` — the same
 * pattern the sibling improvement/data-gap services use. Row shapes are typed
 * here instead.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'improvement/boards';

/** A board row decorated with the counts of everything attached to it. */
export interface ManagedImprovementArea {
  id: string;
  key: string;
  label: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  idea_count: number;
  artifact_count: number;
  artifact_version_count: number;
  data_gap_count: number;
  posting_count: number;
  analyst_view_count: number;
  rotation_slot_count: number;
  rotation_cycle_dept_count: number;
  /**
   * Team members currently holding a role on this board. fn_improvement_area_delete
   * refuses on this too, so it has to be counted here or the screen offers a delete
   * the server will reject. Named to match `AreaDependants.role_holder_count`: one
   * count, one name, because two names for it in this file is how the omission
   * happened in the first place.
   */
  role_holder_count: number;
  /** Sum of every count above — 0 means the board is safe to delete outright. */
  dependent_count: number;
}

/** One line of the "deleting this would destroy…" explanation. */
export interface DependentBreakdownItem {
  label: string;
  count: number;
}

/** The non-zero dependent counts, in the order the screen should list them. */
export function dependentBreakdown(
  area: ManagedImprovementArea
): DependentBreakdownItem[] {
  return [
    { label: 'improvement idea', count: area.idea_count },
    { label: 'department playbook', count: area.artifact_count },
    { label: 'playbook version', count: area.artifact_version_count },
    { label: 'data gap', count: area.data_gap_count },
    { label: 'analyst assignment', count: area.posting_count },
    { label: 'analyst view', count: area.analyst_view_count },
    { label: 'rotation slot', count: area.rotation_slot_count },
    { label: 'rotation cycle entry', count: area.rotation_cycle_dept_count },
    { label: 'role holder', count: area.role_holder_count }
  ].filter((item) => item.count > 0);
}

/* -------------------------------------------------------------------------- */
/* What is attached to one board (read fresh, before switching it off)        */
/* -------------------------------------------------------------------------- */

/**
 * Everything attached to a single board, read at the moment it is needed.
 *
 * This is a SUPERSET of the per-board counts in the list above: it also carries
 * `role_holder_count`, the people recorded in `hr_additional_roles` as CURRENT
 * holders of a role on this board. Switching the board off keeps every one of
 * them recorded — that is the point, so switching it back on restores the board
 * intact — but it hides the board, and the manager should be told before that
 * happens rather than after.
 */
export interface AreaDependants {
  label: string;
  is_system: boolean;
  is_active: boolean;
  idea_count: number;
  artifact_count: number;
  artifact_version_count: number;
  data_gap_count: number;
  posting_count: number;
  analyst_view_count: number;
  rotation_slot_count: number;
  rotation_cycle_dept_count: number;
  role_holder_count: number;
  /** Sum of every count above — 0 means nothing hangs off this board. */
  dependent_count: number;
}

/**
 * Order and wording of the attached-work list. Role holders lead because they
 * are people, and they are the thing a manager is most likely not to know
 * about. Plurals are spelled out rather than suffixed so "rotation cycle entry"
 * pluralises correctly.
 */
const DEPENDANT_LABELS: Array<{
  field: keyof AreaDependants;
  one: string;
  many: string;
}> = [
  { field: 'role_holder_count', one: 'role holder', many: 'role holders' },
  {
    field: 'artifact_count',
    one: 'department playbook',
    many: 'department playbooks'
  },
  {
    field: 'artifact_version_count',
    one: 'playbook version',
    many: 'playbook versions'
  },
  { field: 'idea_count', one: 'improvement idea', many: 'improvement ideas' },
  { field: 'data_gap_count', one: 'data gap', many: 'data gaps' },
  {
    field: 'posting_count',
    one: 'analyst assignment',
    many: 'analyst assignments'
  },
  { field: 'analyst_view_count', one: 'analyst view', many: 'analyst views' },
  { field: 'rotation_slot_count', one: 'rotation slot', many: 'rotation slots' },
  {
    field: 'rotation_cycle_dept_count',
    one: 'rotation cycle entry',
    many: 'rotation cycle entries'
  }
];

/** e.g. ["8 role holders", "3 department playbooks"] — non-zero counts only. */
export function describeDependants(dependants: AreaDependants): string[] {
  return DEPENDANT_LABELS.reduce<string[]>((parts, item) => {
    const count = Number(dependants[item.field] ?? 0);
    if (count > 0) parts.push(`${count} ${count === 1 ? item.one : item.many}`);
    return parts;
  }, []);
}

/** "a", "a and b", "a, b and c" — plain English, no Oxford comma. */
export function joinWithAnd(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export interface CreateAreaPayload {
  label: string;
  description?: string | null;
}

export interface UpdateAreaPayload {
  label: string;
  description?: string | null;
  display_order?: number | null;
  is_active?: boolean | null;
}

/** Coerce a possibly-string bigint from PostgREST into a number. */
function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normaliseArea(row: any): ManagedImprovementArea {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description ?? null,
    is_system: !!row.is_system,
    is_active: !!row.is_active,
    display_order: num(row.display_order),
    created_at: row.created_at,
    updated_at: row.updated_at,
    idea_count: num(row.idea_count),
    artifact_count: num(row.artifact_count),
    artifact_version_count: num(row.artifact_version_count),
    data_gap_count: num(row.data_gap_count),
    posting_count: num(row.posting_count),
    analyst_view_count: num(row.analyst_view_count),
    rotation_slot_count: num(row.rotation_slot_count),
    rotation_cycle_dept_count: num(row.rotation_cycle_dept_count),
    role_holder_count: num(row.role_holder_count),
    dependent_count: num(row.dependent_count)
  };
}

export class ImprovementAreaService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /**
   * Every board (active AND inactive) with its dependent-row counts.
   * Manager-only — the RPC raises for anyone else, and the error is surfaced
   * rather than swallowed so the screen never renders a silently empty list.
   */
  static async listForManagement(): Promise<ManagedImprovementArea[]> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any).rpc(
      'fn_improvement_areas_manage_list'
    )) as { data: any[] | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error loading boards for management', error);
      throw new Error(error.message || 'Failed to load the boards.');
    }
    return (data || []).map(normaliseArea);
  }

  /**
   * Everything attached to ONE board, read fresh.
   *
   * Called immediately before a board is switched off, not taken from the list
   * loaded when the page opened — another manager may have filed work against
   * the board since, and the warning has to be honest about the board as it is
   * right now. Read-only: it counts, it never ends an assignment.
   */
  static async fetchDependants(areaId: string): Promise<AreaDependants> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any).rpc(
      'fn_improvement_area_dependants',
      { p_area_id: areaId }
    )) as { data: any[] | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error reading what is attached to a board', error);
      throw new Error(
        error.message || 'Failed to check what is attached to this board.'
      );
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      throw new Error('That board no longer exists. Refresh and try again.');
    }
    return {
      label: row.label,
      is_system: !!row.is_system,
      is_active: !!row.is_active,
      idea_count: num(row.idea_count),
      artifact_count: num(row.artifact_count),
      artifact_version_count: num(row.artifact_version_count),
      data_gap_count: num(row.data_gap_count),
      posting_count: num(row.posting_count),
      analyst_view_count: num(row.analyst_view_count),
      rotation_slot_count: num(row.rotation_slot_count),
      rotation_cycle_dept_count: num(row.rotation_cycle_dept_count),
      role_holder_count: num(row.role_holder_count),
      dependent_count: num(row.dependent_count)
    };
  }

  /**
   * Create a board. `key` is slugged from the label inside the RPC and is not
   * editable afterwards. Returns the new board id.
   */
  static async createArea(payload: CreateAreaPayload): Promise<string> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any).rpc(
      'fn_improvement_area_create',
      {
        p_label: payload.label,
        p_description: payload.description ?? null,
        p_key: null
      }
    )) as { data: string | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error creating board', error);
      throw new Error(error.message || 'Failed to create the board.');
    }
    if (!data) throw new Error('Failed to create the board — no id returned.');
    return data;
  }

  /**
   * Rename / re-describe a board, and optionally move it or switch it on/off.
   * A null description CLEARS it — the edit form always sends both fields.
   * `key` and `is_system` are not updatable by design.
   */
  static async updateArea(
    areaId: string,
    payload: UpdateAreaPayload
  ): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any).rpc('fn_improvement_area_update', {
      p_area_id: areaId,
      p_label: payload.label,
      p_description: payload.description ?? null,
      p_display_order: payload.display_order ?? null,
      p_is_active: payload.is_active ?? null
    });

    if (error) {
      logger.error(MODULE, 'Error updating board', error);
      throw new Error(error.message || 'Failed to update the board.');
    }
  }

  /** Switch a board on or off. Off hides it from every picker, reversibly. */
  static async setActive(
    area: ManagedImprovementArea,
    isActive: boolean
  ): Promise<void> {
    await this.updateArea(area.id, {
      label: area.label,
      description: area.description,
      is_active: isActive
    });
  }

  /**
   * Persist a new board order. Pass the ids in the order they should appear;
   * the RPC rewrites display_order as 10, 20, 30 …
   */
  static async reorder(areaIds: string[]): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any).rpc(
      'fn_improvement_area_reorder',
      { p_area_ids: areaIds }
    );

    if (error) {
      logger.error(MODULE, 'Error re-ordering boards', error);
      throw new Error(error.message || 'Failed to save the new order.');
    }
  }

  /**
   * Delete a board permanently. The RPC refuses for a built-in board and for
   * any board with dependent work, and its message names the counts — surface
   * it verbatim so the manager is told exactly what is holding the board open.
   */
  static async deleteArea(areaId: string): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any).rpc('fn_improvement_area_delete', {
      p_area_id: areaId
    });

    if (error) {
      logger.error(MODULE, 'Error deleting board', error);
      throw new Error(error.message || 'Failed to delete the board.');
    }
  }
}
