// lib/services/hr/duty-harness/db-deps.ts
// ============================================================================
// The database side of the HR chase ladder: where waiting items come from,
// who owns them, who supervises the owner, who is on leave. Server-only; runs
// on the service-role client (the cron has no signed-in user).
//
// OWNERS — how "who is this waiting on" is answered, per item:
//   1. somebody pinned on the item by name (a leave or recruitment step's
//      approver_user_id)                                         -> them;
//   2. else the role keys the item's current step names          -> everyone
//      who holds that role, limited to the item's college unless the role's
//      institution_scope is 'all' (recruitment steps are matched on the role
//      alone, as My Desk and fn_list_my_pending_recruitment match them);
//   3. else the duty's owner_permission_key from hr_duty_definitions
//      -> everyone whose ACTIVE role carries that permission, same college rule.
//   Super admins are never owners by virtue of the bypass; the person the item
//   is about is never an owner of it. More owners than
//   hr.harness.chase.max_owners_per_item means "a shared queue, not a person"
//   and the item skips the personal rungs (recorded as owners_over_cap).
//
//   NOTE: this does not reuse resolveApproversByRoleKey() from
//   lib/services/hr/form-submission-notifications.ts. That helper selects
//   user_roles.institution_id, a column user_roles does not have
//   (20251128_add_multi_role_support.sql; types/supabase.ts agrees), so on a
//   real database its query errors and it returns [] — reported, not fixed here.
//
// SUPERVISOR — "the owner's HOD / reporting line":
//   hr_staff_details.reports_to_staff_id (the explicit reporting line; empty for
//   0 of 543 rows when memo-service last measured it, so it is future-proofing)
//   -> else departments.head_of_department_id of the owner's staff.department_id
//   (7 of 89 departments had one on 2026-07-30, per campus-walk-service). The
//   same two sources memo-service and the appraisal cycle use. Nobody found ->
//   the item goes to the HR head's list instead (reroute 'no_supervisor').
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import { fetchHolidayKeys } from '@/lib/hr/attendance/holiday-dates';
import {
  HARNESS_POLICY_KEYS,
  SOURCE_LOAD_LIMIT,
  itemKey,
  type ChaseDeps,
  type HrHeadHolder
} from './chase-service';
import {
  parseLadder,
  type BlockedMark,
  type DutyDefinition,
  type WaitingItem
} from './ladder';

/** Rows one source may load per run. The volume fuse is the real bound. */
const LOAD_LIMIT = SOURCE_LOAD_LIMIT;
/** How long a claimed rung whose send keeps failing is retried. */
export const UNSENT_RETRY_DAYS = 7;
/** Ids per PostgREST `.in()` — the list travels in the URL. */
const IN_CHUNK = 100;
const DIRECTOR_LIST_KEY = 'platform.the_director_profile_ids';

function chunk<T>(xs: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

function isTrueish(v: unknown): boolean {
  return v === true || v === 'true';
}

function fullName(r: { first_name?: string | null; last_name?: string | null } | undefined): string {
  const n = `${r?.first_name ?? ''} ${r?.last_name ?? ''}`.trim();
  return n || 'A team member';
}

function dmy(iso: string | null | undefined): string {
  if (!iso) return '?';
  const [y, m, d] = iso.slice(0, 10).split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(d)} ${months[Number(m) - 1] ?? m} ${y}`;
}

/** The approvers of one chain step: `approvers[]` when present, else the step. */
export function stepApprovers(step: unknown): { userIds: string[]; roleKeys: string[] } {
  const s = (step && typeof step === 'object' ? step : {}) as Record<string, unknown>;
  const entries = Array.isArray(s.approvers) && s.approvers.length > 0 ? s.approvers : [s];
  const userIds: string[] = [];
  const roleKeys: string[] = [];
  for (const e of entries as Array<Record<string, unknown>>) {
    const u = typeof e?.approver_user_id === 'string' ? e.approver_user_id.trim() : '';
    const r = typeof e?.approver_role === 'string' ? e.approver_role.trim() : '';
    if (u) userIds.push(u);
    else if (r) roleKeys.push(r);
  }
  return { userIds: [...new Set(userIds)], roleKeys: [...new Set(roleKeys)] };
}

/** When the wait for chain step `idx` began: the previous step's decision. */
export function chainStepWaitingSince(chain: unknown, idx: number, fallback: string): string {
  if (Array.isArray(chain) && idx > 0) {
    const prev = chain[idx - 1] as Record<string, unknown> | undefined;
    const at = typeof prev?.decided_at === 'string' ? prev.decided_at : null;
    if (at) return at;
  }
  return fallback;
}

function positiveInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

async function staffByIds(
  db: SupabaseClient,
  ids: string[]
): Promise<Map<string, { first_name: string | null; last_name: string | null; profile_id: string | null; institution_id: string | null }>> {
  const out = new Map();
  for (const batch of chunk([...new Set(ids.filter(Boolean))])) {
    const { data, error } = await db
      .from('staff')
      .select('id, first_name, last_name, profile_id, institution_id')
      .in('id', batch);
    if (error) throw new Error(`people lookup: ${error.message}`);
    for (const r of (data ?? []) as any[]) out.set(r.id, r);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Source adapters — one per duty whose waiting rows are cheap to read today.
// A duty without an adapter is skipped by the run (recorded as
// no_source_adapter), which is how the other 31 duties stay inert even if
// someone switches one on before its source exists.
// ---------------------------------------------------------------------------

/** `truncated` = the source query came back full, so more rows may be waiting. */
type Adapter = (
  db: SupabaseClient,
  def: DutyDefinition
) => Promise<{ items: WaitingItem[]; truncated: boolean }>;

const L1_LEAVE: Adapter = async (db, def) => {
  const { data, error } = await db
    .from('hr_leave_applications')
    .select('id, employee_id, start_date, end_date, created_at, approval_chain, current_step')
    .in('status', ['pending', 'escalated'])
    .order('created_at', { ascending: true })
    .limit(LOAD_LIMIT);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  const staff = await staffByIds(db, rows.map((r) => r.employee_id));
  const items: WaitingItem[] = [];
  for (const r of rows) {
    const chain = r.approval_chain;
    const idx = Number(r.current_step ?? 0);
    const step = Array.isArray(chain) ? chain[idx] : null;
    if (!step) continue;
    const who = stepApprovers(step);
    const s = staff.get(r.employee_id);
    items.push({
      dutyCode: def.code,
      itemId: r.id,
      stageKey: String(idx),
      label: `${fullName(s)} — leave ${dmy(r.start_date)} to ${dmy(r.end_date)}`,
      institutionId: s?.institution_id ?? null,
      waitingSince: chainStepWaitingSince(chain, idx, r.created_at),
      deadlineDate: r.start_date ?? null,
      dueHoursOverride: positiveInt((step as any).escalate_after_hours),
      pinnedOwnerIds: who.userIds,
      ownerRoleKeys: who.roleKeys,
      ownerRoleScope: 'institution',
      subjectProfileId: s?.profile_id ?? null,
      href: def.href ?? '/hr/leave/approvals'
    });
  }
  return { items, truncated: rows.length >= LOAD_LIMIT };
};

const L2_COMP_OFF: Adapter = async (db, def) => {
  const { data, error } = await db
    .from('hr_comp_off_credits')
    .select('id, employee_id, worked_date, expires_on, created_at')
    .eq('status', 'pending')
    .eq('source', 'claim')
    .order('created_at', { ascending: true })
    .limit(LOAD_LIMIT);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  const staff = await staffByIds(db, rows.map((r) => r.employee_id));
  const items: WaitingItem[] = rows.map((r) => {
    const s = staff.get(r.employee_id);
    return {
      dutyCode: def.code,
      itemId: r.id,
      stageKey: '',
      label: `${fullName(s)} — comp-off claim for ${dmy(r.worked_date)} (expires ${dmy(r.expires_on)})`,
      institutionId: s?.institution_id ?? null,
      waitingSince: r.created_at,
      deadlineDate: r.expires_on ?? null,
      pinnedOwnerIds: [],
      ownerRoleKeys: [],
      subjectProfileId: s?.profile_id ?? null,
      href: def.href ?? '/hr/leave/compensatory-off'
    };
  });
  return { items, truncated: rows.length >= LOAD_LIMIT };
};

const A3_REGULARISATION: Adapter = async (db, def) => {
  const { data, error } = await db
    .from('hr_attendance_regularizations')
    .select('id, employee_id, for_date, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(LOAD_LIMIT);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  const staff = await staffByIds(db, rows.map((r) => r.employee_id));
  const items: WaitingItem[] = rows.map((r) => {
    const s = staff.get(r.employee_id);
    return {
      dutyCode: def.code,
      itemId: r.id,
      stageKey: '',
      label: `${fullName(s)} — attendance correction for ${dmy(r.for_date)}`,
      institutionId: s?.institution_id ?? null,
      waitingSince: r.created_at,
      pinnedOwnerIds: [],
      ownerRoleKeys: [],
      subjectProfileId: s?.profile_id ?? null,
      href: def.href ?? '/hr/attendance/regularize/approvals'
    };
  });
  return { items, truncated: rows.length >= LOAD_LIMIT };
};

const R5_RECRUITMENT_STEP: Adapter = async (db, def) => {
  const { data, error } = await db
    .from('hr_recruitment_candidates')
    .select('id, name, role_title, institution_id, submitted_at, approval_chain, current_step')
    .in('status', ['submitted', 'pending_approval'])
    .order('submitted_at', { ascending: true })
    .limit(LOAD_LIMIT);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  const items: WaitingItem[] = [];
  for (const r of rows) {
    const chain = r.approval_chain;
    const idx = Number(r.current_step ?? 0);
    const step = Array.isArray(chain) ? chain[idx] : null;
    if (!step) continue;
    const who = stepApprovers(step);
    items.push({
      dutyCode: def.code,
      itemId: r.id,
      stageKey: String(idx),
      label: `Candidate ${r.name} — ${r.role_title}, step ${idx + 1} of ${Array.isArray(chain) ? chain.length : '?'}`,
      institutionId: r.institution_id ?? null,
      waitingSince: chainStepWaitingSince(chain, idx, r.submitted_at),
      dueHoursOverride: positiveInt((step as any).escalate_after_hours),
      pinnedOwnerIds: who.userIds,
      ownerRoleKeys: who.roleKeys,
      ownerRoleScope: 'any',
      subjectProfileId: null,
      href: def.href ?? '/hr/recruitment/approvals'
    });
  }
  return { items, truncated: rows.length >= LOAD_LIMIT };
};

const S2_DOCUMENTS: Adapter = async (db, def) => {
  const { data, error } = await db
    .from('hr_employee_documents')
    .select('id, staff_id, institution_id, document_name, uploaded_at')
    .eq('verification_status', 'pending')
    .order('uploaded_at', { ascending: true })
    .limit(LOAD_LIMIT);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  const staff = await staffByIds(db, rows.map((r) => r.staff_id));
  const items: WaitingItem[] = rows.map((r) => {
    const s = staff.get(r.staff_id);
    return {
      dutyCode: def.code,
      itemId: r.id,
      stageKey: '',
      label: `${fullName(s)} — ${r.document_name} to verify`,
      institutionId: r.institution_id ?? s?.institution_id ?? null,
      waitingSince: r.uploaded_at,
      pinnedOwnerIds: [],
      ownerRoleKeys: [],
      subjectProfileId: s?.profile_id ?? null,
      href: def.href ?? '/hr/documents/verify'
    };
  });
  return { items, truncated: rows.length >= LOAD_LIMIT };
};

const S3_PHOTOS: Adapter = async (db, def) => {
  const { data, error } = await db
    .from('hr_staff_photo_submissions')
    .select('id, staff_id, institution_id, submitted_at')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true })
    .limit(LOAD_LIMIT);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  const staff = await staffByIds(db, rows.map((r) => r.staff_id));
  const items: WaitingItem[] = rows.map((r) => {
    const s = staff.get(r.staff_id);
    return {
      dutyCode: def.code,
      itemId: r.id,
      stageKey: '',
      label: `${fullName(s)} — photo to review`,
      institutionId: r.institution_id ?? s?.institution_id ?? null,
      waitingSince: r.submitted_at,
      pinnedOwnerIds: [],
      ownerRoleKeys: [],
      subjectProfileId: s?.profile_id ?? null,
      href: def.href ?? '/hr/staff-photos'
    };
  });
  return { items, truncated: rows.length >= LOAD_LIMIT };
};

const G2_FORMS: Adapter = async (db, def) => {
  const { data, error } = await db
    .from('hr_form_submissions')
    .select('id, form_id, submitted_by, institution_id, current_step, approval_history, created_at')
    .in('status', ['submitted', 'in_review'])
    .order('created_at', { ascending: true })
    .limit(LOAD_LIMIT);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  const formIds = [...new Set(rows.map((r) => r.form_id).filter(Boolean))];
  const forms = new Map<string, any>();
  for (const batch of chunk(formIds)) {
    const { data: f, error: fErr } = await db
      .from('hr_forms')
      .select('id, form_title, approval_workflow')
      .in('id', batch);
    if (fErr) throw new Error(`hr_forms: ${fErr.message}`);
    for (const r of (f ?? []) as any[]) forms.set(r.id, r);
  }
  const names = new Map<string, string>();
  for (const batch of chunk([...new Set(rows.map((r) => r.submitted_by).filter(Boolean))])) {
    const { data: p } = await db.from('profiles').select('id, full_name').in('id', batch);
    for (const r of (p ?? []) as any[]) names.set(r.id, r.full_name ?? 'A team member');
  }
  const items: WaitingItem[] = [];
  for (const r of rows) {
    const form = forms.get(r.form_id);
    const steps = Array.isArray(form?.approval_workflow?.steps) ? form.approval_workflow.steps : [];
    const step = steps.find((s: any) => Number(s?.order) === Number(r.current_step));
    const role = typeof step?.required_role === 'string' ? step.required_role.trim() : '';
    const history = Array.isArray(r.approval_history) ? r.approval_history : [];
    const last = history.length > 0 ? history[history.length - 1] : null;
    items.push({
      dutyCode: def.code,
      itemId: r.id,
      stageKey: String(r.current_step ?? ''),
      label: `${form?.form_title ?? 'HR form'} from ${names.get(r.submitted_by) ?? 'a team member'}${step?.label ? ` — step "${step.label}"` : ''}`,
      institutionId: r.institution_id ?? null,
      waitingSince: typeof last?.at === 'string' ? last.at : r.created_at,
      pinnedOwnerIds: [],
      ownerRoleKeys: role ? [role] : [],
      ownerRoleScope: 'institution',
      subjectProfileId: r.submitted_by ?? null,
      href: def.href ?? '/hr/forms/inbox'
    });
  }
  return { items, truncated: rows.length >= LOAD_LIMIT };
};

/** duty code -> source. Everything else has no adapter in this build. */
export const SOURCE_ADAPTERS: Record<string, Adapter> = {
  L1: L1_LEAVE,
  L2: L2_COMP_OFF,
  A3: A3_REGULARISATION,
  R5: R5_RECRUITMENT_STEP,
  S2: S2_DOCUMENTS,
  S3: S3_PHOTOS,
  G2: G2_FORMS
};

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

interface RoleRow {
  id: string;
  role_key: string;
  institution_scope: string | null;
}

async function activeProfiles(
  db: SupabaseClient,
  ids: string[]
): Promise<Map<string, { institution_id: string | null }>> {
  const out = new Map<string, { institution_id: string | null }>();
  for (const batch of chunk([...new Set(ids.filter(Boolean))])) {
    const { data, error } = await db
      .from('profiles')
      .select('id, institution_id, is_active')
      .in('id', batch);
    if (error) throw new Error(`profiles: ${error.message}`);
    for (const r of (data ?? []) as any[]) {
      if (r.is_active !== false) out.set(r.id, { institution_id: r.institution_id ?? null });
    }
  }
  return out;
}

/** Holders of a set of roles, with each holder's reach (college or 'all'). */
async function holdersOfRoles(
  db: SupabaseClient,
  roles: RoleRow[]
): Promise<Array<{ userId: string; scopeAll: boolean; institutionId: string | null }>> {
  if (roles.length === 0) return [];
  const scopeAll = new Map(roles.map((r) => [r.id, r.institution_scope === 'all']));
  const assignments: Array<{ user_id: string; role_id: string }> = [];
  for (const batch of chunk(roles.map((r) => r.id))) {
    const { data, error } = await db.from('user_roles').select('user_id, role_id').in('role_id', batch);
    if (error) throw new Error(`user_roles: ${error.message}`);
    assignments.push(...((data ?? []) as any[]));
  }
  const profiles = await activeProfiles(db, assignments.map((a) => a.user_id));
  const out: Array<{ userId: string; scopeAll: boolean; institutionId: string | null }> = [];
  for (const a of assignments) {
    const p = profiles.get(a.user_id);
    if (!p) continue;
    out.push({ userId: a.user_id, scopeAll: !!scopeAll.get(a.role_id), institutionId: p.institution_id });
  }
  return out;
}

/**
 * The holders who may act on an item of `institutionId`. An item with no
 * college reaches only holders whose role covers every college: matching it
 * to everyone would send one college's names and dates to all the others.
 * Nobody in reach -> no owner, and the item goes to the HR head's list.
 */
export function inReach(
  holders: Array<{ userId: string; scopeAll: boolean; institutionId: string | null }>,
  institutionId: string | null,
  anyCollege: boolean
): string[] {
  return [
    ...new Set(
      holders
        .filter(
          (h) =>
            anyCollege ||
            h.scopeAll ||
            (institutionId !== null && h.institutionId === institutionId)
        )
        .map((h) => h.userId)
    )
  ].sort();
}

// ---------------------------------------------------------------------------
// The dependency object
// ---------------------------------------------------------------------------

export function createHarnessDbDeps(db: SupabaseClient = createServiceRoleClient()): ChaseDeps {
  const roleCache = new Map<string, Promise<RoleRow[]>>();
  const holderCache = new Map<string, Promise<Array<{ userId: string; scopeAll: boolean; institutionId: string | null }>>>();

  const rolesByKeys = (keys: string[]): Promise<RoleRow[]> => {
    const k = `keys:${[...keys].sort().join(',')}`;
    if (!roleCache.has(k)) {
      roleCache.set(
        k,
        (async () => {
          const { data, error } = await db
            .from('custom_roles')
            .select('id, role_key, institution_scope, is_active')
            .in('role_key', keys);
          if (error) throw new Error(`custom_roles: ${error.message}`);
          return ((data ?? []) as any[]).filter((r) => r.is_active !== false);
        })()
      );
    }
    return roleCache.get(k)!;
  };

  /**
   * Roles whose permissions carry `key`. Projected, not the whole blob, and the
   * key is QUOTED: unquoted, PostgREST reads the dots as a nested path and
   * returns nothing (measured for the handover chase, 2026-08-05).
   */
  const rolesByPermission = (key: string): Promise<RoleRow[]> => {
    const k = `perm:${key}`;
    if (!roleCache.has(k)) {
      roleCache.set(
        k,
        (async () => {
          const { data, error } = await db
            .from('custom_roles')
            .select(`id, role_key, institution_scope, is_active, granted:permissions->>"${key}"`);
          if (error) throw new Error(`custom_roles(${key}): ${error.message}`);
          return ((data ?? []) as any[]).filter((r) => r.is_active !== false && isTrueish(r.granted));
        })()
      );
    }
    return roleCache.get(k)!;
  };

  // Named owners' active state for this run: prefetchOwners fills it for every
  // item in one query, so resolveOwners needs no query per item.
  const activeKnown = new Map<string, boolean>();
  const activeAmong = async (ids: string[]): Promise<string[]> => {
    const missing = [...new Set(ids.filter((id) => id && !activeKnown.has(id)))];
    if (missing.length > 0) {
      const active = await activeProfiles(db, missing);
      for (const id of missing) activeKnown.set(id, active.has(id));
    }
    return [...new Set(ids.filter((id) => activeKnown.get(id)))].sort();
  };

  const holders = (cacheKey: string, roles: () => Promise<RoleRow[]>) => {
    if (!holderCache.has(cacheKey)) {
      holderCache.set(cacheKey, roles().then((r) => holdersOfRoles(db, r)));
    }
    return holderCache.get(cacheKey)!;
  };

  return {
    now: () => new Date(),

    async loadPolicies() {
      const keys = [...Object.values(HARNESS_POLICY_KEYS)];
      const { data, error } = await db
        .from('platform_policies')
        .select('policy_key, value')
        .in('policy_key', keys)
        .eq('scope_type', 'global')
        .eq('is_active', true);
      if (error) throw new Error(error.message);
      const out: Record<string, unknown> = {};
      for (const r of (data ?? []) as any[]) out[r.policy_key] = r.value;
      return out;
    },

    async loadDefinitions() {
      const { data, error } = await db
        .from('hr_duty_definitions')
        .select(
          'config_key, display_name, owning_queue, owner_rule, owner_permission_key, due_hours, due_working_days, due_calendar_rule, ladder, enabled, href'
        )
        .eq('is_active', true);
      if (error) throw new Error(error.message);
      return ((data ?? []) as any[]).map(
        (r): DutyDefinition => ({
          code: r.config_key,
          name: r.display_name,
          owningQueue: r.owning_queue,
          ownerRule: r.owner_rule,
          ownerPermissionKey: r.owner_permission_key ?? null,
          dueHours: r.due_hours ?? null,
          dueWorkingDays: r.due_working_days ?? null,
          dueCalendarRule: r.due_calendar_rule ?? null,
          // An unreadable ladder means no rungs: the duty is skipped, not guessed.
          ladder: parseLadder(r.ladder) ?? [],
          enabled: r.enabled === true,
          href: r.href ?? null
        })
      );
    },

    async collectItems(def) {
      const adapter = SOURCE_ADAPTERS[def.code];
      return adapter ? adapter(db, def) : null;
    },

    loadHolidayKeys: (ids, from, to) => fetchHolidayKeys(db, ids, from, to),

    async loadReachedRungs(items) {
      const out = new Map<string, Set<string>>();
      const ids = [...new Set(items.map((i) => i.itemId))];
      for (const batch of chunk(ids)) {
        const { data, error } = await db
          .from('hr_duty_chase_ledger')
          .select('duty_code, item_id, stage_key, step_key')
          .in('item_id', batch);
        if (error) throw new Error(`ledger: ${error.message}`);
        for (const r of (data ?? []) as any[]) {
          const k = itemKey({ dutyCode: r.duty_code, itemId: r.item_id, stageKey: r.stage_key });
          if (!out.has(k)) out.set(k, new Set());
          out.get(k)!.add(r.step_key);
        }
      }
      return out;
    },

    async loadUnsentRungs(items) {
      const out = new Map<string, Map<string, string>>();
      const ids = [...new Set(items.map((i) => i.itemId))];
      // A send that keeps failing is retried for UNSENT_RETRY_DAYS, then left:
      // the item still climbs the ladder, and the run log has every failure.
      const since = new Date(Date.now() - UNSENT_RETRY_DAYS * 86_400_000).toISOString();
      for (const batch of chunk(ids)) {
        const { data, error } = await db
          .from('hr_duty_chase_ledger')
          .select('id, duty_code, item_id, stage_key, step_key, notified_profile_ids')
          .is('notification_id', null)
          .is('resolved_at', null)
          .gte('created_at', since)
          .in('item_id', batch);
        if (error) throw new Error(`ledger (unsent): ${error.message}`);
        for (const r of (data ?? []) as any[]) {
          // A rung with nobody to tell (the HR head's list) has nothing to send.
          if (!Array.isArray(r.notified_profile_ids) || r.notified_profile_ids.length === 0) continue;
          const k = itemKey({ dutyCode: r.duty_code, itemId: r.item_id, stageKey: r.stage_key });
          if (!out.has(k)) out.set(k, new Map());
          out.get(k)!.set(r.step_key, r.id);
        }
      }
      return out;
    },

    async loadBlockedMarks(items) {
      const out = new Map<string, BlockedMark>();
      const ids = [...new Set(items.map((i) => i.itemId))];
      for (const batch of chunk(ids)) {
        const { data, error } = await db
          .from('hr_duty_blocked_marks')
          .select('duty_code, item_id, stage_key, at_step_key, reason')
          .is('cleared_at', null)
          .in('item_id', batch);
        if (error) throw new Error(`blocked marks: ${error.message}`);
        for (const r of (data ?? []) as any[]) {
          out.set(itemKey({ dutyCode: r.duty_code, itemId: r.item_id, stageKey: r.stage_key }), {
            atStepKey: r.at_step_key ?? null,
            reason: r.reason
          });
        }
      }
      return out;
    },

    async prefetchOwners(items) {
      await activeAmong(items.flatMap((i) => i.pinnedOwnerIds));
    },

    async resolveOwners(def, item) {
      if (item.pinnedOwnerIds.length > 0) return activeAmong(item.pinnedOwnerIds);
      if (item.ownerRoleKeys.length > 0) {
        const keys = [...item.ownerRoleKeys].sort();
        const h = await holders(`roles:${keys.join(',')}`, () => rolesByKeys(keys));
        return inReach(h, item.institutionId, item.ownerRoleScope === 'any');
      }
      if (def.ownerPermissionKey) {
        const key = def.ownerPermissionKey;
        const h = await holders(`perm:${key}`, () => rolesByPermission(key));
        return inReach(h, item.institutionId, false);
      }
      return [];
    },

    async resolveSupervisors(profileIds) {
      const out = new Map<string, string[]>();
      if (profileIds.length === 0) return out;
      const staffRows: any[] = [];
      for (const batch of chunk(profileIds)) {
        const { data, error } = await db
          .from('staff')
          .select('id, profile_id, department_id, is_active')
          .in('profile_id', batch);
        if (error) throw new Error(`people: ${error.message}`);
        staffRows.push(...((data ?? []) as any[]).filter((r) => r.is_active !== false));
      }
      const staffIds = staffRows.map((s) => s.id);
      const reportsTo = new Map<string, string>();
      for (const batch of chunk(staffIds)) {
        const { data, error } = await db
          .from('hr_staff_details')
          .select('staff_id, reports_to_staff_id')
          .in('staff_id', batch);
        if (error) throw new Error(`hr_staff_details: ${error.message}`);
        for (const r of (data ?? []) as any[]) if (r.reports_to_staff_id) reportsTo.set(r.staff_id, r.reports_to_staff_id);
      }
      const managerStaff = new Map<string, string>();
      for (const batch of chunk([...new Set(reportsTo.values())])) {
        const { data, error } = await db
          .from('staff')
          .select('id, profile_id, is_active')
          .in('id', batch);
        if (error) throw new Error(`people (managers): ${error.message}`);
        for (const r of (data ?? []) as any[]) if (r.profile_id && r.is_active !== false) managerStaff.set(r.id, r.profile_id);
      }
      const hod = new Map<string, string>();
      for (const batch of chunk([...new Set(staffRows.map((s) => s.department_id).filter(Boolean))])) {
        const { data, error } = await db
          .from('departments')
          .select('id, head_of_department_id')
          .in('id', batch);
        if (error) throw new Error(`departments: ${error.message}`);
        for (const r of (data ?? []) as any[]) if (r.head_of_department_id) hod.set(r.id, r.head_of_department_id);
      }
      for (const s of staffRows) {
        const viaLine = reportsTo.has(s.id) ? managerStaff.get(reportsTo.get(s.id)!) : undefined;
        const viaHod = s.department_id ? hod.get(s.department_id) : undefined;
        const sup = [viaLine ?? viaHod].filter((id): id is string => !!id && id !== s.profile_id);
        if (sup.length > 0) out.set(s.profile_id, [...new Set([...(out.get(s.profile_id) ?? []), ...sup])]);
      }
      return out;
    },

    async loadOnLeave(profileIds, todayISO) {
      const out = new Set<string>();
      if (profileIds.length === 0) return out;
      const profileOf = new Map<string, string>();
      for (const batch of chunk([...new Set(profileIds)])) {
        const { data, error } = await db.from('staff').select('id, profile_id').in('profile_id', batch);
        if (error) throw new Error(`leave check (people): ${error.message}`);
        for (const r of (data ?? []) as any[]) profileOf.set(r.id, r.profile_id);
      }
      for (const batch of chunk([...profileOf.keys()])) {
        const { data, error } = await db
          .from('hr_leave_applications')
          .select('employee_id')
          .in('employee_id', batch)
          .eq('status', 'approved')
          .lte('start_date', todayISO)
          .gte('end_date', todayISO);
        // Thrown, not swallowed: "could not check" must not read as "not on leave".
        if (error) throw new Error(`leave check: ${error.message}`);
        for (const r of (data ?? []) as any[]) {
          const p = profileOf.get(r.employee_id);
          if (p) out.add(p);
        }
      }
      return out;
    },

    async resolveHrHeads(roleKeys): Promise<HrHeadHolder[]> {
      const keys = [...roleKeys].sort();
      const h = await holders(`roles:${keys.join(',')}`, () => rolesByKeys(keys));
      // Each holder with their reach; the run sends each only their colleges.
      return h.map((x) => ({ userId: x.userId, scopeAll: x.scopeAll, institutionId: x.institutionId }));
    },

    async resolveDirectors() {
      const { data, error } = await db
        .from('platform_policies')
        .select('value')
        .eq('policy_key', DIRECTOR_LIST_KEY)
        .eq('scope_type', 'global')
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw new Error(`director list: ${error.message}`);
      const ids = Array.isArray((data as any)?.value)
        ? ((data as any).value as unknown[]).filter((v): v is string => typeof v === 'string')
        : [];
      const active = await activeProfiles(db, ids);
      return [...active.keys()].sort();
    },

    async loadInstitutionNames(ids) {
      const out = new Map<string, string>();
      for (const batch of chunk(ids)) {
        const { data, error } = await db.from('institutions').select('id, name').in('id', batch);
        if (error) throw new Error(`institutions: ${error.message}`);
        for (const r of (data ?? []) as any[]) out.set(r.id, r.name);
      }
      return out;
    },

    async weeklyListsAlreadySent(isoWeek) {
      const { data, error } = await db
        .from('hr_duty_chase_runs')
        .select('id')
        .eq('iso_week', isoWeek)
        .eq('weekly_lists_sent', true)
        .limit(1);
      if (error) throw new Error(`runs: ${error.message}`);
      return (data ?? []).length > 0;
    },

    async claimLedger(row) {
      const { data, error } = await db
        .from('hr_duty_chase_ledger')
        .insert({
          duty_code: row.dutyCode,
          item_id: row.itemId,
          stage_key: row.stageKey,
          step_key: row.stepKey,
          audience: row.audience,
          item_label: row.itemLabel,
          institution_id: row.institutionId,
          owner_profile_ids: row.ownerProfileIds,
          supervisor_profile_ids: row.supervisorProfileIds,
          notified_profile_ids: row.recipientIds,
          reroute_reason: row.reroute,
          blocked: row.blocked,
          due_at: row.dueAt,
          late_working_days: row.lateWorkingDays
        })
        .select('id')
        .single();
      if (error) {
        if ((error as any).code === '23505') return { status: 'exists' };
        throw new Error(error.message);
      }
      return { status: 'claimed', id: (data as any).id };
    },

    async finishLedger(id, notificationId) {
      // No notification id after a send that did not fail = nobody was told
      // (the rung has nobody to tell any more, or the notification layer
      // skipped it). Record exactly that, so the rung is not "unsent" for ever.
      const patch = notificationId ? { notification_id: notificationId } : { notified_profile_ids: [] };
      const { error } = await db.from('hr_duty_chase_ledger').update(patch).eq('id', id);
      if (error) throw new Error(`ledger (finish): ${error.message}`);
    },

    async send(msg) {
      const out = await fanoutNotification(db, {
        title: msg.title,
        body: msg.body,
        userIds: msg.recipientIds,
        category: msg.category,
        kind: 'work_item',
        url: msg.url,
        idempotencyKey: msg.idempotencyKey,
        metadata: msg.metadata,
        source: 'cron:hr-duty-chase'
      });
      return { notified: out.notified, notificationId: out.notificationId };
    },

    async resolveCleared(dutyCode, stillWaiting) {
      const { data, error } = await db
        .from('hr_duty_chase_ledger')
        .select('id, item_id, stage_key')
        .eq('duty_code', dutyCode)
        .is('resolved_at', null)
        .limit(5000);
      if (error) throw new Error(error.message);
      const gone = ((data ?? []) as any[])
        .filter((r) => !stillWaiting.has(itemKey({ dutyCode, itemId: r.item_id, stageKey: r.stage_key })))
        .map((r) => r.id);
      for (const batch of chunk(gone)) {
        const { error: uErr } = await db
          .from('hr_duty_chase_ledger')
          .update({ resolved_at: new Date().toISOString() })
          .in('id', batch);
        if (uErr) throw new Error(uErr.message);
      }
      return gone.length;
    },

    async recordRun(run) {
      const { error } = await db.from('hr_duty_chase_runs').insert({
        run_date: run.runDate,
        iso_week: run.isoWeek,
        outcome: run.outcome,
        master_switch: run.masterSwitch,
        fuse_limit: run.fuseLimit,
        fuse_blown: run.fuseBlown,
        items_seen: run.itemsSeen,
        items_due: run.itemsDue,
        planned_deliveries: run.plannedDeliveries,
        sent_deliveries: run.sentDeliveries,
        weekly_lists_due: run.weeklyListsDue,
        weekly_lists_sent: run.weeklyListsSent,
        detail: run.detail,
        errors: run.errors,
        finished_at: new Date().toISOString()
      });
      if (error) throw new Error(error.message);
    }
  };
}
