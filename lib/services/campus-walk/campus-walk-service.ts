/**
 * Campus Walk — turn a photographed campus condition into a project task.
 *
 * Spec: specs/campus-walk-2026-08-17.md (13 Director decisions, 5 guardrails).
 *
 * D13, the decision this file exists to implement, splits the outcome by evidence
 * rather than by reporter:
 *   SYMPTOM     "this toilet is dirty"        -> one action, short due date
 *   SYSTEM GAP  "there is no cleaning SOP"    -> broader work, longer due date
 * Both are project_tasks under the standing CAMPUS-OPS project. They differ by
 * `metadata.kind` and by due date, not by table.
 *
 * WHY NOT grievance_tickets (reversal recorded 2026-08-19, after reading the
 * consumers rather than the schema):
 * grievance_tickets has assigned_to, real SLA columns and a business-day deadline
 * RPC, so it looked like the better home. It is not. Nothing that counts those rows
 * filters by type, and one counter is a STAFF PERFORMANCE SCORE — 20260722200000
 * computes an HOD's grievance-resolution percentage straight from COUNT(*) on that
 * table. Filing facility photos there would drag down a department head's rating and
 * inflate the NAAC/UGC figures exported by app/api/b2a/grievance/dashboard. That is
 * exactly the harm guardrail G1 exists to prevent.
 *
 * Fail-soft throughout, copied deliberately from meeting-trigger-service's
 * createCampusOpsTask: the Director is standing in a corridor when this runs. A
 * thrown error loses the observation; a null return loses only the routing, and the
 * photo is already safely in storage by the time we get here. Everything added
 * after the task row itself exists (attachments, RACI, EAO routing, leave
 * reassignment, notifications) is best-effort and individually guarded — none of
 * it is allowed to turn an already-created task into a null result.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import {
  sendUrgentConditionAlert,
  type UrgentAlertOutcome
} from '@/lib/campus-walk/urgent-alert';

const CAMPUS_OPS_PROJECT_CODE = 'CAMPUS-OPS';

/**
 * Due-date policy (Director ruling, locked 2026-08-19 — supersedes the D6 draft
 * numbers). D6: an unsafe condition is due the SAME DAY it is spotted, never
 * queued behind a dusty sill — a 0-day offset, not "tomorrow". A normal symptom
 * (one action, e.g. "clean this toilet") gets 2 days. A system gap (no SOP, an
 * audit finding — broader work) gets 7 days.
 */
const DUE_IN_DAYS = {
  unsafe: 0,
  symptom: 2,
  system_gap: 7
} as const;

export type WalkKind = 'symptom' | 'system_gap';

/** One captured photo. 1–3 per task; see `CreateWalkTaskInput.photos`. */
export interface WalkPhoto {
  /** Storage path in the private `campus-walk` bucket. */
  storagePath: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface CreateWalkTaskInput {
  /** One line the Director typed while standing there. */
  title: string;
  /** Longer description, may be empty. */
  description?: string;
  kind: WalkKind;
  /** D6 urgent lane — exposed wire, gas smell, broken stair. */
  isUnsafe?: boolean;
  /** Storage path in the private `campus-walk` bucket. */
  photoStoragePath: string;
  photoMimeType?: string;
  photoSizeBytes?: number;
  /**
   * 1–3 photos. First is primary. Supersedes photoStoragePath/photoMimeType/
   * photoSizeBytes above when present — those three fields stay for backward
   * compatibility with existing callers and are used as-is when `photos` is
   * omitted. Capped at 3; extras are dropped (logged, never thrown).
   */
  photos?: WalkPhoto[];
  /** Free-text category the classifier suggested and the human confirmed (D3). */
  category?: string;
  /**
   * G3 — the Director's answer to "what is blocking you?", captured at the scene.
   * Stored so a recurring blocker is visible across observations; without it the
   * guardrail collects nothing and the walk degrades into naming individuals.
   */
  blocker?: string;
  /** Whoever owns the fix — Accountable. Null is legal: the task still gets created. */
  accountableProfileId?: string | null;
  /** Kept Consulted, e.g. the block warden or principal. */
  consultedProfileIds?: string[];
  /** Explicitly captured (G4) — never read back out of EXIF. */
  geo?: { lat: number; lng: number; accuracy?: number } | null;
  /**
   * CAMPUS-OPS carries institution_id NULL (it is cross_institution), so anything
   * resolving a college from the project silently gets nobody. Carry it here, as
   * the meetings engine already does.
   */
  institutionId?: string | null;
  /** Who filed it. Stored for audit; NOT surfaced on the ticket — D10 shows "Management walk". */
  raisedByProfileId?: string | null;
}

/**
 * profiles.id -> staff.id.
 *
 * Duplicated from meeting-trigger-service.ts:877 rather than imported: that function
 * is module-private in a 3,500-line file that is a known parallel-PR conflict hotspot,
 * and exporting it would widen that surface. The join itself is load-bearing and must
 * not be "simplified" to email matching — that was measured lossy on 5 of 10 principals.
 */
async function mapProfilesToStaff(
  db: SupabaseClient,
  profileIds: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const ids = [...new Set(profileIds.filter(Boolean))] as string[];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await db
    .from('staff')
    .select('id, profile_id, is_active')
    .in('profile_id', ids);
  for (const r of (data ?? []) as any[]) {
    if (r.profile_id && r.is_active && !map.has(r.profile_id)) {
      map.set(r.profile_id, r.id);
    }
  }
  return map;
}

/**
 * staff.id -> profiles.id, ACTIVE staff only. Same active-only rule as
 * mapStaffToProfiles in meeting-trigger-service.ts:1364 (duplicated here for the
 * same reason mapProfilesToStaff is: that file is module-private and a known
 * parallel-PR hotspot). Used to find who to notify (RACI assignees) — a
 * departed staff member simply drops out of the notify list rather than
 * erroring, matching the fail-soft rule. Exported so lib/campus-walk/repeats.ts
 * (D7 "same as before") can resolve a task's current owner_staff_id back to an
 * active profile id before re-running routeAccountable below, rather than
 * keeping a second copy of this same join.
 */
export async function mapStaffToProfilesLocal(
  db: SupabaseClient,
  staffIds: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const ids = [...new Set(staffIds.filter(Boolean))] as string[];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await db
    .from('staff')
    .select('id, profile_id, is_active')
    .in('id', ids);
  for (const r of (data ?? []) as any[]) {
    if (r.profile_id && r.is_active) map.set(r.id, r.profile_id);
  }
  return map;
}

/**
 * The Executive Admin Officer — same role and same resolution order as
 * meeting-trigger-service.ts:845 `getExecutiveAdminOfficerIds` (duplicated for
 * the same module-private / parallel-PR-hotspot reason as mapProfilesToStaff
 * above). Resolved BY ROLE so it survives the person changing; the email
 * lookup is only a fallback for the role being unassigned. `CAMPUS-OPS`'s own
 * seed migration (20260808090000_campus_operations_project.sql) resolves its
 * owner the identical way: `profiles.role = 'executive_admin_officer'`.
 *
 * Used here as the catch-all Accountable so a walk task never has nobody
 * responsible for it (2026-08 ruling: "a task with nobody accountable never
 * closes").
 */
const EAO_ROLE = 'executive_admin_officer';
const EAO_FALLBACK_EMAIL = 'eao@jkkn.ac.in';

async function getExecutiveAdminOfficerIds(db: SupabaseClient): Promise<string[]> {
  const { data: byRole } = await db
    .from('profiles')
    .select('id')
    .eq('role', EAO_ROLE)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  const ids = (byRole ?? []).map((r: any) => r.id).filter(Boolean);
  if (ids.length > 0) return ids;

  const { data: byEmail } = await db
    .from('profiles')
    .select('id')
    .eq('email', EAO_FALLBACK_EMAIL)
    .eq('is_active', true)
    .order('id', { ascending: true })
    .limit(1);
  return (byEmail ?? []).map((r: any) => r.id).filter(Boolean);
}

/**
 * Resolve one EAO who also has an active staff row (needed for owner_staff_id /
 * project_task_assignees). There can be more than one profile holding the role;
 * try each in the locked order until one maps to staff, rather than trusting
 * the first id blindly. Returns null when nobody holds the role at all, or
 * nobody who does has a staff row — the caller logs that and moves on.
 */
async function resolveEao(
  db: SupabaseClient
): Promise<{ profileId: string; staffId: string } | null> {
  const eaoIds = await getExecutiveAdminOfficerIds(db);
  if (eaoIds.length === 0) return null;
  const staffMap = await mapProfilesToStaff(db, eaoIds);
  for (const profileId of eaoIds) {
    const staffId = staffMap.get(profileId);
    if (staffId) return { profileId, staffId };
  }
  return null;
}

/**
 * Is this staff member on APPROVED leave today? Mirrors
 * meeting-trigger-service.ts:1380 `isStaffOnApprovedLeave` exactly (same table,
 * same columns, same fail-open-on-error rule) so the two engines agree on what
 * "on leave" means. Fail-OPEN: a query error returns false so a leave-table
 * hiccup never silently blocks a task from being assigned to its rightful
 * owner.
 */
async function isStaffOnApprovedLeave(
  db: SupabaseClient,
  staffId: string | null | undefined,
  todayISO: string
): Promise<boolean> {
  if (!staffId) return false;
  const { data, error } = await db
    .from('hr_leave_applications')
    .select('id')
    .eq('employee_id', staffId)
    .eq('status', 'approved')
    .lte('start_date', todayISO)
    .gte('end_date', todayISO)
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

/**
 * staff.department_id -> departments.head_of_department_id (a profiles.id).
 * Both columns are live. Measured elsewhere on prod (2026-07-30,
 * app/api/cron/learner-risk-notifications/route.ts): head_of_department_id is
 * only set on 7 of 89 departments, so this returning null is the COMMON case,
 * not an edge case — the caller's EAO fallback carries most of the real
 * traffic. That sparsity is a known, accepted gap, not a bug in this function.
 */
async function resolveDepartmentHeadProfileId(
  db: SupabaseClient,
  staffId: string
): Promise<string | null> {
  const { data: staffRow } = await db
    .from('staff')
    .select('department_id')
    .eq('id', staffId)
    .maybeSingle();
  const departmentId = (staffRow as any)?.department_id ?? null;
  if (!departmentId) return null;

  const { data: dept } = await db
    .from('departments')
    .select('head_of_department_id')
    .eq('id', departmentId)
    .maybeSingle();
  return (dept as any)?.head_of_department_id ?? null;
}

export interface RouteAccountableParams {
  kind: WalkKind;
  /** D6 urgent lane — same-day due date regardless of kind. */
  isUnsafe: boolean;
  /** Supplied/candidate owner, profiles.id. Null is legal — routes straight to the EAO. */
  candidateProfileId: string | null;
}

export interface RouteAccountableResult {
  accountableProfileId: string | null;
  accountableStaffId: string | null;
  /** True when nobody was supplied (or the supplied owner has no active staff row) and this fell through to the EAO. */
  routedToEaoNoOwner: boolean;
  /** True when whoever ended up accountable (candidate or EAO fallback) is on approved leave right now. */
  onApprovedLeave: boolean;
  leaveOriginalProfileId: string | null;
  leaveOriginalStaffId: string | null;
  /** YYYY-MM-DD, computed from `kind`/`isUnsafe` at the moment this runs. */
  dueDate: string;
}

/**
 * The routing rules a fresh report gets: due date by kind/unsafe, the EAO
 * fallback when there is no valid owner, and leave reassignment when whoever
 * is accountable is on approved leave right now. Extracted out of
 * createWalkTask (behavior unchanged — see the call site below) specifically
 * so D7's reopen flow (lib/campus-walk/repeats.ts, "same as before") can call
 * into this rather than keeping a second, driftable copy of it. The whole
 * point of D7's "reopen the original task" ruling is that a recurrence gets
 * the SAME routing a brand-new report would get.
 */
export async function routeAccountable(
  db: SupabaseClient,
  params: RouteAccountableParams
): Promise<RouteAccountableResult> {
  const staffByCandidate = params.candidateProfileId
    ? await mapProfilesToStaff(db, [params.candidateProfileId])
    : new Map<string, string>();

  let accountableProfileId: string | null = params.candidateProfileId ?? null;
  let accountableStaffId: string | null = accountableProfileId
    ? staffByCandidate.get(accountableProfileId) ?? null
    : null;

  // No owner supplied, or the supplied owner has no active staff record — a
  // task with nobody accountable never closes. Route to the EAO instead of
  // leaving it unassigned.
  let routedToEaoNoOwner = false;
  if (!accountableStaffId) {
    const eao = await resolveEao(db);
    if (eao) {
      accountableProfileId = eao.profileId;
      accountableStaffId = eao.staffId;
      routedToEaoNoOwner = true;
    } else {
      console.error(
        '[campus-walk] no owner supplied and no EAO could be resolved (role or fallback email) — routing left unassigned'
      );
    }
  }

  const dueInDays = params.isUnsafe ? DUE_IN_DAYS.unsafe : DUE_IN_DAYS[params.kind];
  const dueDate = new Date(Date.now() + dueInDays * 86_400_000).toISOString().slice(0, 10);

  // Whoever ends up Accountable — candidate or the EAO fallback above — must
  // not be penalised for being on sanctioned leave. Pause the clock and hand
  // it to the department head; if that link is missing, fall back to the EAO
  // and log it. Never throw: an unresolvable leave chain just leaves the
  // clock paused on the original assignee.
  const todayISO = new Date().toISOString().slice(0, 10);
  let onApprovedLeave = false;
  let leaveOriginalProfileId: string | null = null;
  let leaveOriginalStaffId: string | null = null;

  if (accountableStaffId && (await isStaffOnApprovedLeave(db, accountableStaffId, todayISO))) {
    onApprovedLeave = true;
    leaveOriginalProfileId = accountableProfileId;
    leaveOriginalStaffId = accountableStaffId;

    const headProfileId = await resolveDepartmentHeadProfileId(db, accountableStaffId);
    let headStaffId: string | null = null;
    if (headProfileId) {
      const headMap = await mapProfilesToStaff(db, [headProfileId]);
      headStaffId = headMap.get(headProfileId) ?? null;
    }

    if (headProfileId && headStaffId && headStaffId !== leaveOriginalStaffId) {
      accountableProfileId = headProfileId;
      accountableStaffId = headStaffId;
    } else {
      if (!headProfileId) {
        console.error(
          `[campus-walk] accountable team member ${leaveOriginalStaffId} is on approved leave; no department head on record (the department link or its head-of-department link is missing) — routing to EAO`
        );
      } else {
        console.error(
          `[campus-walk] accountable team member ${leaveOriginalStaffId} is on approved leave; department head profile ${headProfileId} has no active personnel record — routing to EAO`
        );
      }
      const eao = await resolveEao(db);
      if (eao && eao.staffId !== leaveOriginalStaffId) {
        accountableProfileId = eao.profileId;
        accountableStaffId = eao.staffId;
      } else if (!eao) {
        console.error(
          '[campus-walk] on-leave assignee has no department head and no EAO could be resolved either — clock paused, task stays with the on-leave assignee'
        );
      }
    }
  }

  return {
    accountableProfileId,
    accountableStaffId,
    routedToEaoNoOwner,
    onApprovedLeave,
    leaveOriginalProfileId,
    leaveOriginalStaffId,
    dueDate
  };
}

export interface CreateWalkTaskResult {
  taskId: string;
  /** The primary (first) attachment id, or null if every attachment insert failed. */
  attachmentId: string | null;
  /** Every attachment row that was successfully created, primary first. Empty when photos failed or none were supplied that inserted successfully. */
  attachmentIds?: string[];
  /**
   * D6 urgent lane. Present ONLY when the observation was marked unsafe;
   * undefined otherwise, so an ordinary observation's result shape is
   * unchanged. Carries whether a phone was actually reached — the caller is
   * expected to surface `failureReason` rather than discard it, because an
   * unsafe condition that paged nobody must not look like one that did.
   */
  urgentAlert?: UrgentAlertOutcome;
}

/**
 * Create the task, attach the photo(s), assign RACI, route/reassign the
 * Accountable role as needed. Returns null only if the task itself could not
 * be created — everything after that is best-effort and individually guarded.
 */
export async function createWalkTask(
  db: SupabaseClient,
  input: CreateWalkTaskInput
): Promise<CreateWalkTaskResult | null> {
  try {
    const { data: project } = await db
      .from('projects')
      .select('id')
      .eq('code', CAMPUS_OPS_PROJECT_CODE)
      .maybeSingle();

    if (!project?.id) {
      console.warn(`[campus-walk] ${CAMPUS_OPS_PROJECT_CODE} project not found — cannot route`);
      return null;
    }

    const consulted = input.consultedProfileIds ?? [];
    // Only the consulted ids need batching here now — the accountable
    // candidate is resolved independently by routeAccountable() below, which
    // does its own lookup. (Previously batched together purely as a query
    // optimisation; splitting it costs one extra small query and removes the
    // only thing coupling this map to the routing logic below.)
    const staffByProfile = await mapProfilesToStaff(db, consulted);

    // Due date + EAO fallback + leave reassignment — the exact rules D7's
    // reopen flow (lib/campus-walk/repeats.ts) re-runs for a recurrence, via
    // this same exported function rather than a duplicated copy.
    const routing = await routeAccountable(db, {
      kind: input.kind,
      isUnsafe: Boolean(input.isUnsafe),
      candidateProfileId: input.accountableProfileId ?? null
    });
    const accountableProfileId = routing.accountableProfileId;
    const accountableStaffId = routing.accountableStaffId;
    const routedToEaoNoOwner = routing.routedToEaoNoOwner;
    const dueDate = routing.dueDate;
    const onApprovedLeave = routing.onApprovedLeave;
    const leaveOriginalProfileId = routing.leaveOriginalProfileId;
    const leaveOriginalStaffId = routing.leaveOriginalStaffId;

    const photoList: WalkPhoto[] =
      input.photos && input.photos.length > 0
        ? input.photos.slice(0, 3)
        : [
            {
              storagePath: input.photoStoragePath,
              mimeType: input.photoMimeType,
              sizeBytes: input.photoSizeBytes
            }
          ];
    if (input.photos && input.photos.length > 3) {
      console.warn(
        `[campus-walk] ${input.photos.length} photos supplied, capping at 3 (primary + next 2 kept)`
      );
    }
    const primaryPhotoPath = photoList[0]?.storagePath ?? input.photoStoragePath;
    const nowIso = new Date().toISOString();

    // D8's block/unblock shape (app/api/campus-walk/fix/route.ts) is the
    // canonical "SLA clock paused" record on this table already — that
    // route's `unblock` action reads metadata.blocked.at and metadata.sla to
    // work out how many days to push due_date out by. Reuse that exact shape
    // rather than inventing a second one, so a task auto-paused for leave can
    // be unblocked through the same fixer screen and the arithmetic still
    // works. reason_code 'other' is the closest fit in BLOCK_REASONS; nothing
    // enforces that set on this direct write, but matching it keeps any UI
    // that maps reason_code -> label from hitting an unknown value.
    const metadata: Record<string, unknown> = {
      source: 'campus-walk',
      kind: input.kind,
      unsafe: Boolean(input.isUnsafe),
      category: input.category ?? null,
      blocker: input.blocker ?? null,
      photo_storage_path: primaryPhotoPath,
      geo: input.geo ?? null,
      institution_id: input.institutionId ?? null,
      raised_by_profile_id: input.raisedByProfileId ?? null,
      // D10: the ticket presents as a Management walk, not a personal name.
      attribution: 'Management walk',
      accountable_routed_to_eao_no_owner: routedToEaoNoOwner,
      reassigned_from_profile_id: onApprovedLeave ? leaveOriginalProfileId : null
    };
    if (onApprovedLeave) {
      metadata.blocked = {
        at: nowIso,
        by_profile_id: null,
        by_staff_id: null,
        by_name: 'Campus Walk (auto — assignee on leave)',
        reason_code: 'other',
        reason: 'Original assignee is on approved leave; task auto-reassigned.',
        due_date_at_block: dueDate
      };
      metadata.sla = { paused_at: nowIso, paused_days_total: 0 };
    }

    const { data: task, error: taskError } = await db
      .from('project_tasks')
      .insert({
        project_id: project.id,
        title: input.title.slice(0, 300),
        description: input.description ?? '',
        task_type: 'task',
        status_key: 'todo',
        owner_staff_id: accountableStaffId,
        due_date: dueDate,
        // D8's pattern (`blocked` stops the SLA clock against the assignee)
        // reused here for the same purpose: is_blocked=true means "don't chase
        // this one on schedule" — here because the assignee is on leave, not
        // because it needs budget.
        is_blocked: onApprovedLeave,
        metadata
      })
      .select('id')
      .single();

    if (taskError || !task?.id) {
      console.error('[campus-walk] task insert failed:', taskError?.message);
      return null;
    }

    // ── D6, the urgent lane (Director ruling 2026-09-03) ───────────────────
    // An UNSAFE condition pages a phone STRAIGHT AWAY. This sits here, at the
    // first moment a task id exists and BEFORE the attachment, RACI and
    // notification steps below, deliberately: those are bookkeeping the fixer
    // can survive arriving a second late, and if anything after this point
    // fails the phone has still rung. Everything it needs to decide WHO to
    // page — the EAO fallback, the on-leave reassignment — was already settled
    // by routeAccountable() above, so no recipient logic is duplicated here.
    //
    // The recorded outcome is written back onto the task in its own guarded
    // update rather than being folded into the insert above, because the alert
    // cannot run until the row it refers to exists. A failure to persist it
    // never affects the alert that already went out, nor the returned result.
    let urgentAlert: UrgentAlertOutcome | undefined;
    if (input.isUnsafe) {
      urgentAlert = await sendUrgentConditionAlert(db, {
        taskId: task.id as string,
        title: input.title,
        dueDate,
        category: input.category ?? null,
        locationHint: input.geo ? `${input.geo.lat}, ${input.geo.lng}` : null,
        accountableProfileId
      });
      metadata.urgent_alert = urgentAlert;
      const { error: alertMetaError } = await db
        .from('project_tasks')
        .update({ metadata })
        .eq('id', task.id);
      if (alertMetaError) {
        console.error(
          '[campus-walk] could not record the urgent-alert outcome on the task:',
          alertMetaError.message
        );
      }
    }

    // The problem photo(s), version 1. The fix photo later supersedes the
    // primary and carries is_final_report = true — that pair is the D4
    // closure gate. Best-effort per photo: one failed insert must never lose
    // the task, and must never block the remaining photos.
    let attachmentId: string | null = null;
    const attachmentIds: string[] = [];
    for (let i = 0; i < photoList.length; i++) {
      const photo = photoList[i];
      const { data: attachment, error: attachmentError } = await db
        .from('project_task_attachments')
        .insert({
          task_id: task.id,
          project_id: project.id,
          file_name: photo.storagePath.split('/').pop() ?? 'observation.jpg',
          storage_path: photo.storagePath,
          mime_type: photo.mimeType ?? 'image/jpeg',
          size_bytes: photo.sizeBytes ?? null,
          version: 1,
          is_final_report: false,
          uploaded_by: input.raisedByProfileId ?? null
        })
        .select('id')
        .single();

      if (attachmentError) {
        console.error(
          `[campus-walk] attachment insert failed (photo ${i + 1}/${photoList.length}):`,
          attachmentError.message
        );
        continue;
      }
      const id = (attachment?.id as string) ?? null;
      if (id) {
        attachmentIds.push(id);
        if (attachmentId === null) attachmentId = id; // primary = first success
      }
    }

    // RACI. UNIQUE (task_id, staff_id) means one person gets exactly ONE letter —
    // a duplicate 23505s the whole batch, so the accountable id is filtered out of
    // the consulted list rather than inserted twice. accountableStaffId here
    // already reflects any EAO / leave reassignment above.
    const rows: Array<{ task_id: string; staff_id: string; role: string }> = [];
    if (accountableStaffId) {
      rows.push({ task_id: task.id, staff_id: accountableStaffId, role: 'accountable' });
    }
    for (const pid of consulted) {
      const sid = staffByProfile.get(pid);
      if (sid && sid !== accountableStaffId) {
        rows.push({ task_id: task.id, staff_id: sid, role: 'consulted' });
      }
    }
    if (rows.length > 0) {
      const { error: assigneeError } = await db.from('project_task_assignees').insert(rows);
      if (assigneeError) {
        console.error('[campus-walk] assignees failed:', assigneeError.message);
      }
    }

    // A task alone sits unseen. Notify whoever the routing above actually
    // touched — never the base "owner supplied and available" path, which is
    // unchanged from before. Each block is independently guarded: a
    // notification failure here must not turn an already-created task into a
    // null result.
    if (routedToEaoNoOwner && accountableProfileId) {
      try {
        await createBellNotification(db, {
          recipientIds: [accountableProfileId],
          createdBy: accountableProfileId,
          title: `Campus Walk needs an owner — ${input.title.slice(0, 100)}`,
          body: `No specific owner was set for "${input.title}", so it has been routed to you as Executive Admin Officer to assign or action.`,
          url: '/projects',
          category: 'campus-walk:eao-routed',
          metadata: { task_id: task.id, source: 'campus-walk' }
        });
      } catch (e: any) {
        console.error('[campus-walk] EAO routing notification failed:', e?.message ?? e);
      }
    }

    if (onApprovedLeave) {
      try {
        const reassigned = accountableProfileId !== leaveOriginalProfileId;
        const recipients = [
          ...new Set(
            [leaveOriginalProfileId, reassigned ? accountableProfileId : null].filter(
              (id): id is string => Boolean(id)
            )
          )
        ];
        if (recipients.length > 0) {
          await createBellNotification(db, {
            recipientIds: recipients,
            createdBy: recipients[0],
            title: `Campus Walk ${reassigned ? 'reassigned' : 'clock paused'} — ${input.title.slice(0, 100)}`,
            body: reassigned
              ? `"${input.title}" was reassigned because the original assignee is on approved leave. The SLA clock is paused until it is picked up.`
              : `"${input.title}" is assigned to you, but you are on approved leave, so the SLA clock is paused. It has no department head or EAO on record to reassign to automatically — ask the EAO to route it manually if needed.`,
            url: '/projects',
            category: 'campus-walk:leave-reassigned',
            metadata: { task_id: task.id, source: 'campus-walk', reason: 'assignee_on_leave' }
          });
        }
      } catch (e: any) {
        console.error('[campus-walk] leave-reassignment notification failed:', e?.message ?? e);
      }
    }

    return {
      taskId: task.id as string,
      attachmentId,
      attachmentIds,
      urgentAlert
    };
  } catch (e: any) {
    console.error('[campus-walk] createWalkTask threw:', e?.message ?? e);
    return null;
  }
}

export interface CancelWalkTaskInput {
  taskId: string;
  /** Required — a ticket that vanishes silently destroys trust with the fixer. */
  reason: string;
  cancelledByProfileId?: string | null;
}

export interface CancelWalkTaskResult {
  taskId: string;
  /** Profiles told this was withdrawn (deduped, excludes whoever cancelled it). */
  notifiedProfileIds: string[];
}

/**
 * Cancel a walk task at any time, with a mandatory reason. Anyone already on
 * the task's RACI (accountable + consulted, via project_task_assignees) is
 * told it was WITHDRAWN — never left silently wondering why a ticket vanished.
 *
 * Director ruling (cancel-must-not-erase-work): cancelling still closes the
 * job, but if the fixer had already uploaded their proof photo and was
 * waiting on approval, that work is CREDITED, not silently discarded.
 * Detection reuses the exact markers app/api/campus-walk/fix/route.ts's
 * `submit` action writes together in one update (D4) — `metadata.fix`
 * (submitted_at/by) and `status_key = 'review'` — rather than inventing a new
 * one. `metadata.fix` itself is never deleted or overwritten here (the whole
 * prior metadata object is preserved via spread); a sibling `metadata.fix_credit`
 * block is added purely as a flat, self-contained summary for any later
 * credit / performance view to read without having to reconstruct it from the
 * approval-flow shape of `metadata.fix`.
 *
 * Fail-soft, same rule as createWalkTask: returns null only when the task
 * itself could not be read or updated. The notification step is best-effort
 * and independently guarded.
 */
export async function cancelWalkTask(
  db: SupabaseClient,
  input: CancelWalkTaskInput
): Promise<CancelWalkTaskResult | null> {
  try {
    const reason = (input.reason ?? '').trim();
    if (!reason) {
      console.error(
        '[campus-walk] cancelWalkTask called without a reason — refusing to cancel silently'
      );
      return null;
    }

    const { data: existing, error: fetchError } = await db
      .from('project_tasks')
      .select('id, title, status_key, metadata')
      .eq('id', input.taskId)
      .maybeSingle();

    if (fetchError || !existing?.id) {
      console.error(
        '[campus-walk] cancelWalkTask: task not found:',
        fetchError?.message ?? input.taskId
      );
      return null;
    }

    const priorMetadata = ((existing as any).metadata as Record<string, unknown>) ?? {};

    // A fix was already submitted iff the fixer's screen recorded one
    // (metadata.fix.submitted_at) OR the task is sitting in 'review' — the
    // exact pair fix/route.ts's `submit` action writes atomically together.
    // Checking both, not inventing a third marker, in case one write landed
    // and the metadata shape ever drifts from the status column.
    const priorFix = (priorMetadata as any)?.fix ?? null;
    const hadSubmission =
      Boolean(priorFix?.submitted_at) || (existing as any).status_key === 'review';
    const submitterProfileId: string | null =
      hadSubmission && typeof priorFix?.submitted_by_profile_id === 'string'
        ? (priorFix.submitted_by_profile_id as string)
        : null;

    const nowIso = new Date().toISOString();

    // Flat, self-contained credit record — who did the work and when, plus
    // when it was cancelled out from under them. metadata.fix (the approval
    // flow's own record) is left completely untouched above via the spread.
    const fixCredit = hadSubmission
      ? {
          completed: true,
          completed_at: priorFix?.submitted_at ?? null,
          completed_by_profile_id: priorFix?.submitted_by_profile_id ?? null,
          completed_by_staff_id: priorFix?.submitted_by_staff_id ?? null,
          completed_by_name: priorFix?.submitted_by_name ?? null,
          attachment_id: priorFix?.attachment_id ?? null,
          attachment_version: priorFix?.attachment_version ?? null,
          cancelled_at: nowIso
        }
      : null;

    const { error: updateError } = await db
      .from('project_tasks')
      .update({
        status_key: 'cancelled',
        // Cancellation ends any leave-pause too; there is nothing left to chase.
        is_blocked: false,
        metadata: {
          ...priorMetadata,
          cancelled: true,
          cancelled_reason: reason,
          cancelled_at: nowIso,
          cancelled_by_profile_id: input.cancelledByProfileId ?? null,
          ...(fixCredit ? { fix_credit: fixCredit } : {})
        }
      })
      .eq('id', input.taskId);

    if (updateError) {
      console.error('[campus-walk] cancelWalkTask: update failed:', updateError.message);
      return null;
    }

    let notifiedProfileIds: string[] = [];
    try {
      const { data: assignees } = await db
        .from('project_task_assignees')
        .select('staff_id')
        .eq('task_id', input.taskId);
      const staffIds = [
        ...new Set(((assignees ?? []) as any[]).map((r) => r.staff_id).filter(Boolean))
      ] as string[];

      const profileMap = await mapStaffToProfilesLocal(db, staffIds);
      const raciProfileIds = [...new Set(profileMap.values())].filter(
        (id) => id !== (input.cancelledByProfileId ?? undefined)
      );

      // The person who actually submitted the fix (if any) gets a DIFFERENT
      // message than the rest of the RACI — one that says plainly their
      // completed work is recorded, not just that the job vanished. When
      // nothing was submitted, submitterProfileId is null and this whole
      // block behaves exactly as before: one notice, to the same recipients,
      // with the same wording.
      const isSubmitterCancelling =
        submitterProfileId !== null && submitterProfileId === (input.cancelledByProfileId ?? null);
      const generalRecipients = submitterProfileId
        ? raciProfileIds.filter((id) => id !== submitterProfileId)
        : raciProfileIds;
      const title = ((existing as any).title ?? '').slice(0, 100);

      if (generalRecipients.length > 0) {
        await createBellNotification(db, {
          recipientIds: generalRecipients,
          createdBy: input.cancelledByProfileId ?? generalRecipients[0],
          title: `Campus Walk withdrawn — ${title}`,
          body: `This item has been withdrawn: ${reason}`,
          url: '/projects',
          category: 'campus-walk:cancelled',
          metadata: { task_id: input.taskId, source: 'campus-walk', reason }
        });
      }

      // The whole point of the ruling: someone who watches their finished job
      // vanish with nothing to show learns not to hurry next time. Skipped
      // only when the canceller IS the submitter — nobody needs telling they
      // credited themselves.
      if (submitterProfileId && !isSubmitterCancelling) {
        await createBellNotification(db, {
          recipientIds: [submitterProfileId],
          createdBy: input.cancelledByProfileId ?? submitterProfileId,
          title: `Campus Walk withdrawn — ${title}`,
          body:
            `This item has been withdrawn: ${reason}. Your completed work on this job has been ` +
            `recorded and credited — it is not lost, even though the ticket itself is now closed.`,
          url: '/projects',
          category: 'campus-walk:cancelled',
          metadata: { task_id: input.taskId, source: 'campus-walk', reason, fix_credited: true }
        });
      }

      notifiedProfileIds = [
        ...new Set([
          ...generalRecipients,
          ...(submitterProfileId && !isSubmitterCancelling ? [submitterProfileId] : [])
        ])
      ];
    } catch (e: any) {
      console.error('[campus-walk] cancelWalkTask notification failed:', e?.message ?? e);
    }

    return { taskId: input.taskId, notifiedProfileIds };
  } catch (e: any) {
    console.error('[campus-walk] cancelWalkTask threw:', e?.message ?? e);
    return null;
  }
}
