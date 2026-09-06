/**
 * Improvement Board — department owner service (browser client).
 * ============================================================================
 *
 * Names ONE accountable person per department (one row of `improvement_areas`).
 *
 * Why this service exists at all: naming an owner was previously possible only
 * by opening a department's AI-drafted organogram playbook, editing it, filling
 * every placeholder and approving it — which syncs the picks into
 * `hr_additional_roles`. Nobody has ever completed that path, so every
 * department is ownerless, and two things downstream are dead as a result:
 * the gemba "self-recorded" marker (it fires only when someone holding a
 * current role on a board records a visit there) and a department being able
 * to see findings raised about itself.
 *
 * WRITES ARE REAL AND INSTITUTION-WIDE. `hr_additional_roles` is org data, not
 * a scratch surface: the moment an officer saves here, the row exists for
 * everyone. There is no draft mode and no dry run.
 *
 * Governance (Director, 2026-07-28): assigning a holder is an OFFICER action —
 * CEO / CAO / EAO, i.e. `improvement.area_role.assign`. Board managers may READ
 * holders but not change them. That rule is enforced in the database, not here:
 * both RPCs below are SECURITY DEFINER and raise
 *   "requires improvement.area_role.assign (CEO / CAO / EAO)"
 * for anyone else, so the screen's read-only rendering for a manager is a
 * courtesy over a server-side refusal, never the guard itself.
 *
 * Both RPCs already exist in production and are reused unchanged — this service
 * adds no migration and no new RPC:
 *   fn_mba_dept_role_assignment_set(p_area_id, p_role_type, p_staff_id, p_holder_note)
 *   fn_mba_dept_role_assignment_clear(p_area_id, p_role_type)
 *
 * NOTE on clearing: the `set` RPC REFUSES a null holder outright ("a holder is
 * required"), so removing an owner has to go through the dedicated `clear` RPC,
 * which end-dates the standing row rather than deleting it. History is kept.
 *
 * KNOWN INTERACTION — `fn_mba_dept_role_assignments_sync` (the organogram
 * approve path) end-dates every current role on a board whose role_type is not
 * among the titles in the approved organogram. `department_owner` is not an
 * organogram title anywhere, so approving a department's organogram would
 * un-assign the owner named here. That RPC cannot be changed from a screen-only
 * PR; it is recorded here so the next person does not rediscover it the hard
 * way.
 *
 * The `improvement_*` tables are live in prod but absent from the generated
 * `types/supabase.ts`, so calls cast through `(supabase as any)` — the same
 * pattern the sibling improvement services use. Row shapes are typed here.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'improvement/department-owners';

/**
 * The single role_type this screen writes, for every department.
 *
 * Deliberately uniform: the 14 organograms name their top role differently
 * ("Head of Admissions", "Controller of Examinations (COE)", "Dean / Head,
 * Dental Hospital", …), so no existing title fits all of them. One greppable
 * value keeps "who owns this department" answerable with a single predicate.
 *
 * Nothing downstream depends on the exact string: the gemba self-recorded check
 * matches on `improvement_area_id` + `is_current` + the person, not on the role
 * name.
 */
export const DEPARTMENT_OWNER_ROLE_TYPE = 'department_owner';

/** One department, plus whoever currently owns it. */
export interface DepartmentOwnerRow {
  areaId: string;
  areaKey: string;
  areaLabel: string;
  displayOrder: number;
  /** public.staff id of the owner, when the owner is a linked record. */
  ownerStaffId: string | null;
  /** Resolved display name — linked record first, else the typed-in name. */
  ownerName: string | null;
  ownerEmail: string | null;
  /** Date the current owner took the role. */
  ownerSince: string | null;
}

interface AreaRow {
  id: string;
  key: string;
  label: string;
  display_order: number | null;
}

/** The shape `/api/mba/dept-artifacts/role-assignments` returns per role. */
interface RoleAssignmentResponse {
  role_type: string;
  staff_id: string | null;
  holder_note: string | null;
  holder_name: string | null;
  holder_email: string | null;
  start_date: string | null;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

export class DepartmentOwnerService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /**
   * Every active department, in the order the board itself uses, with its
   * current owner attached.
   *
   * Two reads, deliberately:
   *
   *  1. `improvement_areas` through the caller's own client. Its SELECT policy
   *     admits `improvement.board.manage` OR `improvement.area_role.assign`
   *     (plus admins), which is exactly the two tiers allowed on this screen.
   *
   *  2. The owner's NAME comes from the existing
   *     `/api/mba/dept-artifacts/role-assignments` route, not from a direct
   *     `public.staff` read. That table's RLS needs `staff.view`, which neither
   *     tier here is guaranteed to hold — and an RLS denial returns zero rows
   *     with no error, so a direct read would quietly render "No owner yet" for
   *     a department that HAS one. The route resolves names server-side, so
   *     both tiers see the same truth. Only departments that actually have a
   *     row are looked up, so this costs nothing while the board is empty.
   */
  static async listDepartmentsWithOwners(): Promise<DepartmentOwnerRow[]> {
    const supabase = this.getSupabase();

    const { data: areaData, error: areaError } = (await (supabase as any)
      .from('improvement_areas')
      .select('id, key, label, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('label', { ascending: true })) as {
      data: AreaRow[] | null;
      error: unknown;
    };

    if (areaError) {
      logger.error(MODULE, 'Error loading departments', areaError);
      throw new Error(
        errorMessage(areaError, 'Failed to load the departments.')
      );
    }

    const areas = areaData ?? [];

    // Which departments already carry an owner row. Read separately from the
    // name lookup so an empty board costs exactly one extra query.
    const { data: ownerData, error: ownerError } = (await (supabase as any)
      .from('hr_additional_roles')
      .select('improvement_area_id')
      .eq('is_current', true)
      .eq('role_type', DEPARTMENT_OWNER_ROLE_TYPE)
      .not('improvement_area_id', 'is', null)) as {
      data: Array<{ improvement_area_id: string | null }> | null;
      error: unknown;
    };

    if (ownerError) {
      logger.error(MODULE, 'Error loading current owners', ownerError);
      throw new Error(
        errorMessage(ownerError, 'Failed to load who owns each department.')
      );
    }

    const ownedAreaIds = new Set(
      (ownerData ?? [])
        .map((row) => row.improvement_area_id)
        .filter((id): id is string => Boolean(id))
    );

    const resolved = await Promise.all(
      areas
        .filter((area) => ownedAreaIds.has(area.id))
        .map(async (area) => {
          const owner = await this.fetchOwnerForArea(area.id);
          return [area.id, owner] as const;
        })
    );
    const ownerByArea = new Map(resolved);

    return areas.map((area) => {
      const owner = ownerByArea.get(area.id) ?? null;
      return {
        areaId: area.id,
        areaKey: area.key,
        areaLabel: area.label,
        displayOrder: Number(area.display_order ?? 0),
        ownerStaffId: owner?.staff_id ?? null,
        ownerName: owner?.holder_name ?? null,
        ownerEmail: owner?.holder_email ?? null,
        ownerSince: owner?.start_date ?? null
      };
    });
  }

  /**
   * The department_owner assignment for one department, with its name already
   * resolved. Throws rather than degrading to "nobody" — an empty answer and a
   * failed lookup look identical on screen, and this page exists to make the
   * difference between "nobody owns this" and "we could not tell" visible.
   */
  private static async fetchOwnerForArea(
    areaId: string
  ): Promise<RoleAssignmentResponse | null> {
    const response = await fetch(
      `/api/mba/dept-artifacts/role-assignments?area_id=${encodeURIComponent(areaId)}`
    );
    if (!response.ok) {
      throw new Error(
        response.status === 403
          ? 'You are not allowed to read who holds each department role.'
          : `Could not read the current owners (the server returned ${response.status}).`
      );
    }
    const body = (await response.json()) as {
      assignments?: RoleAssignmentResponse[];
    };
    return (
      (body.assignments ?? []).find(
        (assignment) =>
          assignment.role_type.trim().toLowerCase() ===
          DEPARTMENT_OWNER_ROLE_TYPE
      ) ?? null
    );
  }

  /**
   * Name (or replace) the owner of one department. Returns the new assignment
   * id.
   *
   * `staffId` is a `public.staff` id, so only a team member can be named — a
   * learner has no record there and cannot be picked. When the person has no
   * MyJKKN record the picker falls back to a typed name, which is stored as
   * text; the RPC rejects a bracketed value like "[Manager to complete]"
   * because that is the AI draft's prompt to a human, not a person.
   *
   * Replacing an owner is a handover, not an overwrite: the RPC end-dates the
   * standing row and opens a new one, so who owned what and when survives.
   */
  static async setOwner(
    areaId: string,
    staffId: string | null,
    typedName: string | null
  ): Promise<string> {
    const supabase = this.getSupabase();
    const trimmedName = (typedName ?? '').trim();

    const { data, error } = (await (supabase as any).rpc(
      'fn_mba_dept_role_assignment_set',
      {
        p_area_id: areaId,
        p_role_type: DEPARTMENT_OWNER_ROLE_TYPE,
        p_staff_id: staffId,
        // Matches the organogram path's convention exactly: the free-typed name
        // is stored ONLY when nobody was linked. Both write this same table, so
        // they must not disagree about what `notes` means.
        p_holder_note: staffId ? null : trimmedName || null
      }
    )) as { data: string | null; error: unknown };

    if (error) {
      logger.error(MODULE, 'Error naming a department owner', error);
      throw new Error(
        errorMessage(error, 'Failed to name an owner for this department.')
      );
    }
    return data as string;
  }

  /**
   * Remove the owner of one department. Returns how many assignments were
   * ended (0 or 1 here).
   *
   * Goes through the dedicated clear RPC because the set RPC refuses a null
   * holder. The row is end-dated, never deleted.
   */
  static async clearOwner(areaId: string): Promise<number> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any).rpc(
      'fn_mba_dept_role_assignment_clear',
      {
        p_area_id: areaId,
        p_role_type: DEPARTMENT_OWNER_ROLE_TYPE
      }
    )) as { data: number | null; error: unknown };

    if (error) {
      logger.error(MODULE, 'Error removing a department owner', error);
      throw new Error(
        errorMessage(error, 'Failed to remove the owner of this department.')
      );
    }
    return Number(data ?? 0);
  }
}
