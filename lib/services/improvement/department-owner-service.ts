/**
 * Improvement Board — department owner service (browser client).
 * ============================================================================
 *
 * Names the accountable people for a department (one row of
 * `improvement_areas`). A department can have MORE THAN ONE owner since
 * 2026-10-06 (20271006100000_improvement_multiple_department_owners.sql):
 * adding an owner ends nobody, and each owner is removed on their own.
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
 * The two RPCs this service calls:
 *   fn_improvement_department_owner_add(p_area_id, p_staff_id, p_holder_note, p_profile_id)
 *   fn_improvement_department_owner_remove(p_assignment_id)
 *
 * NOT the organogram pair (`fn_mba_dept_role_assignment_set` / `_clear`): `set`
 * treats a second name on the same role as a HANDOVER and end-dates the first,
 * and `clear` ends every row of the role at once. Removing end-dates the row
 * rather than deleting it. History is kept.
 *
 * KNOWN INTERACTION — `fn_mba_dept_role_assignments_sync` (the organogram
 * approve path) end-dates every current role on a board whose role_type is not
 * among the titles in the approved organogram. `department_owner` is not an
 * organogram title anywhere, so approving a department's organogram would
 * un-assign the owner named here. That RPC cannot be changed from a screen-only
 * PR; it is recorded here so the next person does not rediscover it the hard
 * way.
 *
 * WHAT AN UNOWNED DEPARTMENT COSTS (added 2026-09-12)
 * ----------------------------------------------------------------------------
 * KNOWN DIVERGENCE, verified against the live catalogue 2026-09-12: the
 * notifier matches ANY `hr_additional_roles` row with `improvement_area_id`
 * set, `is_current`, and a staff->profile link — it does NOT filter
 * `role_type`. This screen does filter `role_type = 'department_owner'`.
 * Today only department_owner rows carry `improvement_area_id` (5 rows / 5
 * areas) and the two agree on all 14 active areas, so the badge is true as
 * shipped. The first non-department_owner improvement role to use
 * `improvement_area_id` would make "nobody is being told" assert a
 * falsehood — align the two definitions before that happens.
 *
 * `fn_improvement_untriaged_notify` walks every idea still in Logged, resolves
 * the current holders of its department, and — when that resolves to NOBODY —
 * executes a bare CONTINUE. On purpose: it writes no ledger row, so the idea
 * stays eligible for the day an owner is finally named. The side effect is that
 * an idea on an unowned department is skipped on every run, is recorded nowhere,
 * and is counted by nothing. Production on 2026-09-12: 33 ideas in Logged, 22
 * notices ever sent, 5 of 14 active departments owned. The ideas behind the
 * other nine departments had been invisible since the day they were written.
 *
 * This service therefore carries the count alongside the owner, so the screen
 * can say what the gap costs instead of only that it exists.
 *
 * READ ASYMMETRY, DELIBERATELY HANDLED AS UNKNOWN
 * ----------------------------------------------------------------------------
 * `improvement_ideas_select` admits admins, the idea's own author,
 * `improvement.board.manage`, and the open-visibility cohort branches. It does
 * NOT name `improvement.area_role.assign`. An officer who holds only the assign
 * permission therefore reads ZERO idea rows — and an RLS refusal comes back as
 * an empty set with NO error, indistinguishable from a genuinely quiet board.
 *
 * Widening that policy is a database change and out of scope for a screen-only
 * fix, so the honest handling is: never claim zero. A count is rendered only
 * when it is a positive number. A failed read is carried as `null` (unknown)
 * and a zero-row read simply produces no badge. Nobody is ever shown a
 * reassuring "0 ideas waiting" that the data does not support.
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

/** One current owner of a department. */
export interface DepartmentOwner {
  /** hr_additional_roles.id — what a removal targets. */
  assignmentId: string;
  /** public.staff id of the owner, when the owner is a linked record. */
  staffId: string | null;
  /**
   * User account of an owner who has NO team member record. Such an owner is
   * still a real, linked person — only `staffId` and `profileId` both being
   * null means the name was typed in.
   */
  profileId: string | null;
  /** Resolved display name — linked record first, else the typed-in name. */
  name: string | null;
  email: string | null;
  /** Date this owner took the role. */
  since: string | null;
}

/** One department, plus everyone who currently owns it. */
export interface DepartmentOwnerRow {
  areaId: string;
  areaKey: string;
  areaLabel: string;
  displayOrder: number;
  /** Current owners, longest-standing first. Empty when nobody owns it. */
  owners: DepartmentOwner[];
  /**
   * How many ideas are sitting in Logged on this department right now.
   *
   * `null` means UNKNOWN, not zero. The read below can come back empty for two
   * completely different reasons — there genuinely are no logged ideas, or the
   * caller's RLS refused the rows and Postgres returned an empty set with no
   * error. The screen therefore renders this number only when it is a positive
   * count, and says nothing at all otherwise. It never prints a reassuring "0".
   */
  waitingIdeaCount: number | null;
}

interface AreaRow {
  id: string;
  key: string;
  label: string;
  display_order: number | null;
}

/** The shape `/api/mba/dept-artifacts/role-assignments` returns per role. */
interface RoleAssignmentResponse {
  id: string;
  role_type: string;
  staff_id: string | null;
  profile_id?: string | null;
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
   *
   *  3. How many ideas are waiting in Logged per department — ONE read for the
   *     whole board, tallied here, never one query per department. A failure
   *     leaves every count `null` (unknown) and the owner list still renders:
   *     knowing who owns what is the page's job, and the waiting counts are an
   *     addition to it, not a precondition for it.
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
          const owners = await this.fetchOwnersForArea(area.id);
          return [area.id, owners] as const;
        })
    );
    const ownersByArea = new Map(resolved);

    const waitingByArea = await this.countWaitingIdeasByArea();

    return areas.map((area) => {
      return {
        areaId: area.id,
        areaKey: area.key,
        areaLabel: area.label,
        displayOrder: Number(area.display_order ?? 0),
        owners: ownersByArea.get(area.id) ?? [],
        waitingIdeaCount:
          waitingByArea === null ? null : (waitingByArea.get(area.id) ?? 0)
      };
    });
  }

  /**
   * How many ideas are sitting in Logged, per department.
   *
   * ONE read for the entire board — every logged idea's `area_id`, tallied in
   * memory — rather than a count query per department. Fourteen departments
   * against thirty-odd ideas makes the single read cheaper and, more usefully,
   * atomic: fourteen separate reads could each land on a different instant and
   * produce a header total that does not equal the sum of the rows.
   *
   * Returns `null` when the read FAILED, which the caller carries through as an
   * unknown count so nothing on screen asserts a number that was never read.
   * Ideas with no department are skipped, matching the notifier exactly: its
   * JOIN to `improvement_areas` drops them, because an idea with no department
   * has no owner to tell.
   *
   * Deliberately does not throw. A department having an owner is the page's
   * subject; what that gap costs is additional information. If the addition
   * cannot be read, the page still does its job.
   */
  private static async countWaitingIdeasByArea(): Promise<Map<
    string,
    number
  > | null> {
    const supabase = this.getSupabase();

    const { data, error } = (await (supabase as any)
      .from('improvement_ideas')
      .select('area_id')
      .eq('status', 'logged')
      .not('area_id', 'is', null)) as {
      data: Array<{ area_id: string | null }> | null;
      error: unknown;
    };

    if (error) {
      logger.error(MODULE, 'Error counting ideas waiting per department', error);
      return null;
    }

    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      const areaId = row.area_id;
      if (!areaId) continue;
      counts.set(areaId, (counts.get(areaId) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * Every department_owner assignment for one department, with names already
   * resolved. Throws rather than degrading to "nobody" — an empty answer and a
   * failed lookup look identical on screen, and this page exists to make the
   * difference between "nobody owns this" and "we could not tell" visible.
   */
  private static async fetchOwnersForArea(
    areaId: string
  ): Promise<DepartmentOwner[]> {
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
    return (body.assignments ?? [])
      .filter(
        (assignment) =>
          assignment.role_type.trim().toLowerCase() ===
          DEPARTMENT_OWNER_ROLE_TYPE
      )
      .map((assignment) => ({
        assignmentId: assignment.id,
        staffId: assignment.staff_id,
        profileId: assignment.profile_id ?? null,
        name: assignment.holder_name,
        email: assignment.holder_email,
        since: assignment.start_date
      }));
  }

  /**
   * Add one owner to a department, alongside whoever already owns it. Returns
   * the assignment id.
   *
   * `staffId` is a `public.staff` id. `profileId` is for a user account that
   * has no team member record — the RPC links it by account, and switches to
   * the team member record itself if one turns out to exist. A learner is never
   * offered by the picker. With neither id, the typed name is stored as text;
   * the RPC rejects a bracketed value like "[Manager to complete]" because that
   * is the AI draft's prompt to a human, not a person.
   *
   * Nobody is end-dated. Naming someone who already owns the department is a
   * no-op that returns their standing row.
   */
  static async addOwner(
    areaId: string,
    staffId: string | null,
    typedName: string | null,
    profileId: string | null = null
  ): Promise<string> {
    const supabase = this.getSupabase();
    const trimmedName = (typedName ?? '').trim();

    const { data, error } = (await (supabase as any).rpc(
      'fn_improvement_department_owner_add',
      {
        p_area_id: areaId,
        p_staff_id: staffId,
        // Matches the organogram path's convention exactly: the free-typed name
        // is stored ONLY when nobody was linked. Both write this same table, so
        // they must not disagree about what `notes` means.
        p_holder_note: staffId || profileId ? null : trimmedName || null,
        // Sent only for an account pick, so a team member or typed-name pick
        // still resolves against the 3-argument function that production
        // carries until 20271006100000 is re-run.
        ...(!staffId && profileId ? { p_profile_id: profileId } : {})
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
   * Remove ONE owner of a department, leaving any co-owners standing. Returns
   * how many assignments were ended (0 or 1).
   *
   * The row is end-dated, never deleted.
   */
  static async removeOwner(assignmentId: string): Promise<number> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any).rpc(
      'fn_improvement_department_owner_remove',
      { p_assignment_id: assignmentId }
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
