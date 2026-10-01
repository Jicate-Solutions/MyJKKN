// app/api/instasolver/old-purchase-requests/route.ts
// ============================================================================
// The Director's decisions on the OLD InstaSolver site's purchase requests
// left at 'Pending MD Approval' (ruling 30 Sep 2026). Super admin only.
//
// The history rows live in legacy_instasolver_requirements, which has NO write
// policy — the caller's own session can read them (RLS) but never change them.
// So this route checks the caller is a super admin with their OWN session, and
// only then writes with the service-role client.
//
// APPROVE is two calls around a browser step, because the Procurement request
// must be raised through ProcurementPurchaseRequestService.createPurchaseRequest,
// which runs on the browser's own session:
//   begin    -> claims the row ('approving') so a double tap cannot raise two
//               requests, and returns what to raise and on whose behalf;
//   (browser) createPurchaseRequest(dto, requested_by);
//   complete -> checks the new request really carries this row's marker and
//               records it on the row ('approved');
//   release  -> the browser step failed; frees the claim, unless a request
//               with the marker exists (then it is completed instead).
// A half-finished approve is finished on the next 'begin' by finding the
// request through its marker — never raised twice.
//
// createPurchaseRequest is itself three browser calls (header as 'draft',
// then its lines, then draft -> submitted), so a marked request found later
// can be half-made. settleMarked() never records the old row against a
// request Procurement cannot see: a submitted (or later) one counts; a draft
// WITH lines is finished (flipped to submitted, as createPurchaseRequest
// would have); a draft with NO lines is withdrawn ('cancelled') and does not
// count. A duplicate raised by a tab whose claim was taken over is withdrawn
// in 'complete'.
//
// REJECT stores the reason and bells the old requester when they matched a
// MyJKKN profile. BULK_REJECT does the same for everything older than two years.
//
// REQUESTERS WHO HAVE LEFT (Director ruling, 1 Oct 2026). Checked LIVE on every
// call: no matched profile, or one that is inactive or login-disabled, means
// the person has left JKKN. They are NEVER messaged (a failed status lookup
// counts as "do not message"). The Director still approves or rejects; an
// approved one is raised on behalf of that college's office — an active
// Store Administrator there, else another active holder of
// procurement.request_create there, else the Director — with a note naming the
// original requester's role only.
// ============================================================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import {
  PENDING_MD_STATUS,
  STALE_CLAIM_MINUTES,
  buildPurchaseRequestDto,
  bulkRejectCutoff,
  hasLeftJkkn,
  itemLabel,
  oldRequestMarker,
  rejectionBell,
  validateReason,
} from '@/lib/instasolver/old-purchase-requests';

const TABLE = 'legacy_instasolver_requirements';
const ROW_COLUMNS =
  'legacy_id, institution_id, details, cause, clean_category, clean_site, clean_area, legacy_location, priority, requested_at, reporter_profile_id, legacy_status, decision, decided_by, decision_claimed_at, imported_purchase_request_id';

type LegacyRow = {
  legacy_id: number;
  institution_id: string | null;
  details: string | null;
  cause: string | null;
  clean_category: string | null;
  clean_site: string | null;
  clean_area: string | null;
  legacy_location: string | null;
  priority: string | null;
  requested_at: string | null;
  reporter_profile_id: string | null;
  legacy_status: string | null;
  decision: string | null;
  decided_by: string | null;
  decision_claimed_at: string | null;
  imported_purchase_request_id: string | null;
};

function fail(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

/** The caller must be signed in AND a super admin — checked with their own session. */
async function requireSuperAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: fail('You need to be signed in.', 401) };

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (error) return { ok: false, response: fail('Could not check your access just now. Try again.', 503) };
  if (profile?.is_super_admin !== true) {
    return {
      ok: false,
      response: fail('Only the Director (super admin) can decide old InstaSolver purchase requests.', 403),
    };
  }
  return { ok: true, userId: user.id };
}

const PR_TABLE = 'procurement_purchase_requests';
const PR_MARKED_COLUMNS = 'id, status, requested_by, notes, items:procurement_purchase_request_items(count)';

type MarkedRequest = { id: string; status: string; requested_by: string | null; notes: string | null; items: number };

function toMarked(raw: Record<string, unknown>): MarkedRequest {
  const items = raw.items as Array<{ count: number }> | { count: number } | null | undefined;
  const count = Array.isArray(items) ? Number(items[0]?.count ?? 0) : Number(items?.count ?? 0);
  return {
    id: String(raw.id),
    status: String(raw.status ?? ''),
    requested_by: (raw.requested_by as string | null) ?? null,
    notes: (raw.notes as string | null) ?? null,
    items: Number.isFinite(count) ? count : 0,
  };
}

/** Ids per .in() — keeps the PostgREST URL well under its length limit. */
const IN_CHUNK = 150;

type ProfileStatus = {
  id: string;
  role: string | null;
  institution_id: string | null;
  is_active: boolean | null;
  is_login_disabled: boolean | null;
  is_super_admin: boolean | null;
};
const PROFILE_STATUS_COLUMNS = 'id, role, institution_id, is_active, is_login_disabled, is_super_admin';

async function profileStatuses(
  admin: SupabaseClient,
  ids: string[]
): Promise<Map<string, ProfileStatus> | null> {
  const out = new Map<string, ProfileStatus>();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const { data, error } = await admin
      .from('profiles')
      .select(PROFILE_STATUS_COLUMNS)
      .in('id', unique.slice(i, i + IN_CHUNK));
    if (error) return null;
    for (const p of (data ?? []) as ProfileStatus[]) out.set(p.id, p);
  }
  return out;
}

/** The ids among `ids` that still work or study at JKKN. A failed lookup = nobody (never message on doubt). */
async function stillAtJkkn(admin: SupabaseClient, ids: string[]): Promise<Set<string>> {
  const statuses = await profileStatuses(admin, ids);
  if (!statuses) return new Set();
  return new Set([...statuses.values()].filter((p) => !hasLeftJkkn(p)).map((p) => p.id));
}

/**
 * The college office an approved request from a departed person is raised on
 * behalf of: an active, login-enabled Store Administrator of that college,
 * else another active holder there of a role granting
 * procurement.request_create. Super admins are left out (the Director is the
 * caller's own fallback). Ordered so repeated calls agree: Store Administrator
 * first, then by profile id.
 */
async function findCollegeOffice(admin: SupabaseClient, institutionId: string | null): Promise<string | null> {
  if (!institutionId) return null;
  const { data: roles, error: roleErr } = await admin
    .from('custom_roles')
    .select('id, role_key')
    .eq('is_active', true)
    .contains('permissions', { 'procurement.request_create': true });
  if (roleErr) return null;
  const roleList = (roles ?? []) as Array<{ id: string; role_key: string }>;
  if (roleList.length === 0) return null;
  const storeRoleIds = new Set(roleList.filter((r) => r.role_key === 'store_admin').map((r) => r.id));

  const { data: held, error: heldErr } = await admin
    .from('user_roles')
    .select('user_id, role_id')
    .in('role_id', roleList.map((r) => r.id));
  if (heldErr) return null;
  const rank = new Map<string, number>();
  for (const h of (held ?? []) as Array<{ user_id: string; role_id: string }>) {
    const r = storeRoleIds.has(h.role_id) ? 0 : 1;
    rank.set(h.user_id, Math.min(rank.get(h.user_id) ?? 1, r));
  }
  // The legacy single-role column, for Store Administrators set up before user_roles.
  const { data: legacy } = await admin
    .from('profiles')
    .select('id')
    .eq('institution_id', institutionId)
    .eq('role', 'store_admin');
  for (const p of (legacy ?? []) as Array<{ id: string }>) rank.set(p.id, 0);
  if (rank.size === 0) return null;

  const statuses = await profileStatuses(admin, [...rank.keys()]);
  if (!statuses) return null;
  const eligible = [...statuses.values()]
    .filter((p) => p.institution_id === institutionId && !hasLeftJkkn(p) && p.is_super_admin !== true)
    .sort((a, b) => (rank.get(a.id) ?? 1) - (rank.get(b.id) ?? 1) || a.id.localeCompare(b.id));
  return eligible[0]?.id ?? null;
}

type Requester = {
  /** Who the Procurement request is raised by. */
  requestedBy: string;
  /** Set when the old requester has left JKKN: their role, for the note (never the name). */
  departed: { role: string | null } | null;
  onBehalfOf: 'requester' | 'college_office' | 'director';
};

/** Who an approved old request is raised by, decided live (ruling 1 Oct 2026). */
async function resolveRequester(
  admin: SupabaseClient,
  row: LegacyRow,
  userId: string
): Promise<Requester | { error: string }> {
  let role: string | null = null;
  if (row.reporter_profile_id) {
    const statuses = await profileStatuses(admin, [row.reporter_profile_id]);
    if (!statuses) return { error: 'Could not check who asked for this one. Try again.' };
    const p = statuses.get(row.reporter_profile_id);
    if (p && !hasLeftJkkn(p)) {
      return { requestedBy: p.id, departed: null, onBehalfOf: 'requester' };
    }
    role = p?.role ?? null;
  }
  const office = await findCollegeOffice(admin, row.institution_id);
  return office
    ? { requestedBy: office, departed: { role }, onBehalfOf: 'college_office' }
    : { requestedBy: userId, departed: { role }, onBehalfOf: 'director' };
}

/**
 * Who a marked request for this row may have been raised by: the person the
 * request is raised by now, the old requester (raised before they left), and
 * the Director who claimed it / is calling. Never every office holder — a
 * marker typed into someone else's own request must not count.
 */
async function allowedRequesters(
  admin: SupabaseClient,
  row: LegacyRow,
  userId: string
): Promise<string[] | { error: string }> {
  const who = await resolveRequester(admin, row, userId);
  if ('error' in who) return who;
  const ids = [who.requestedBy, row.reporter_profile_id];
  if (who.departed) ids.push(row.decided_by, userId);
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

/** A draft with its lines in: finish it exactly as createPurchaseRequest would have. */
async function finishDraft(admin: SupabaseClient, id: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data } = await admin
    .from(PR_TABLE)
    .update({ status: 'submitted', submitted_at: now, updated_at: now })
    .eq('id', id)
    .eq('status', 'draft')
    .select('id');
  return Array.isArray(data) && data.length > 0;
}

/** Withdraw a request this flow made that must not reach Procurement's queue. */
async function withdraw(admin: SupabaseClient, id: string, fromStatuses: string[]) {
  await admin
    .from(PR_TABLE)
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', fromStatuses);
}

/**
 * Finds the Procurement request an earlier tap raised for this old row (by its
 * marker AND its requester) and says whether it really exists for Procurement.
 *   'look'   -> only a submitted-or-later request counts; drafts are left alone
 *               (the tab that made them may still be finishing them);
 *   'finish' -> a draft with lines is submitted; a draft with none is withdrawn;
 *   'cancel' -> every draft is withdrawn (the Director is rejecting this row).
 * Returns the id to record, or null when nothing usable exists.
 */
async function settleMarked(
  admin: SupabaseClient,
  row: LegacyRow,
  userId: string,
  drafts: 'look' | 'finish' | 'cancel'
): Promise<{ raisedId: string | null } | { error: string }> {
  const requesters = await allowedRequesters(admin, row, userId);
  if ('error' in requesters) return requesters;
  const { data, error } = await admin
    .from(PR_TABLE)
    .select(PR_MARKED_COLUMNS)
    .like('notes', `%${oldRequestMarker(row.legacy_id)}%`)
    .in('requested_by', requesters)
    .order('created_at', { ascending: true });
  if (error) return { error: 'Could not check Procurement for this one. Try again.' };
  const marked = ((data ?? []) as Array<Record<string, unknown>>)
    .map(toMarked)
    .filter((m) => String(m.notes ?? '').includes(oldRequestMarker(row.legacy_id)));

  const live = marked.find((m) => m.status !== 'draft' && m.status !== 'cancelled');
  if (live) return { raisedId: live.id };
  if (drafts === 'look') return { raisedId: null };

  let finished: string | null = null;
  for (const d of marked.filter((m) => m.status === 'draft')) {
    if (drafts === 'finish' && !finished && d.items > 0 && (await finishDraft(admin, d.id))) {
      finished = d.id;
    } else {
      await withdraw(admin, d.id, ['draft']);
    }
  }
  return { raisedId: finished };
}

function claimIsStale(row: LegacyRow): boolean {
  const claimedMs = row.decision_claimed_at ? Date.parse(row.decision_claimed_at) : 0;
  return Date.now() - claimedMs >= STALE_CLAIM_MINUTES * 60_000;
}

/** The claim the browser holds (returned by 'begin') still matches the row. Absent = not checked. */
function holdsClaim(row: LegacyRow, claimedAt: unknown): boolean {
  if (typeof claimedAt !== 'string' || !claimedAt) return true;
  if (!row.decision_claimed_at) return false;
  return Date.parse(claimedAt) === Date.parse(row.decision_claimed_at);
}

async function markApproved(
  admin: SupabaseClient,
  legacyId: number,
  purchaseRequestId: string,
  userId: string
) {
  return admin
    .from(TABLE)
    .update({
      decision: 'approved',
      decided_by: userId,
      decided_at: new Date().toISOString(),
      imported_purchase_request_id: purchaseRequestId,
      updated_at: new Date().toISOString(),
    })
    .eq('legacy_id', legacyId)
    .eq('decision', 'approving');
}

/** `atJkkn`: the ids that still work or study at JKKN — a departed person is never messaged. */
async function bellRequester(
  admin: SupabaseClient,
  row: LegacyRow,
  reason: string,
  userId: string,
  atJkkn: ReadonlySet<string>
) {
  if (!row.reporter_profile_id || !atJkkn.has(row.reporter_profile_id)) return false;
  try {
    const bell = rejectionBell(itemLabel(row), reason, row.requested_at);
    await createBellNotification(admin, {
      recipientIds: [row.reporter_profile_id],
      createdBy: userId,
      title: bell.title,
      body: bell.body,
      url: '/instasolver',
      category: 'instasolver:old-request-closed',
      metadata: { legacy_instasolver_requirement_id: row.legacy_id, source: 'old-instasolver' },
    });
    return true;
  } catch (e: unknown) {
    console.error('[instasolver/old-requests] bell failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

function parseLegacyId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdmin();
  // `in`, not `!gate.ok`: this repo compiles without strictNullChecks, where
  // a boolean discriminant does not narrow the union.
  if ('response' in gate) return gate.response;
  const userId = gate.userId;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('Expected a JSON body.', 400);
  }
  const action = String(body.action ?? '');
  const admin = createServiceRoleClient();

  // ── Bulk: reject everything older than two years ───────────────────────────
  if (action === 'bulk_reject') {
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const bad = validateReason(reason);
    if (bad) return fail(bad, 400);

    const cutoff = bulkRejectCutoff().toISOString();
    const { data: rows, error } = await admin
      .from(TABLE)
      .select(ROW_COLUMNS)
      .eq('legacy_status', PENDING_MD_STATUS)
      .is('decision', null)
      .lt('requested_at', cutoff);
    if (error) return fail('Could not read the old requests. Try again.', 503);

    const list = (rows ?? []) as LegacyRow[];
    if (list.length === 0) return NextResponse.json({ success: true, rejected: 0, belled: 0 });

    const { data: updated, error: upErr } = await admin
      .from(TABLE)
      .update({
        decision: 'rejected',
        decision_reason: reason,
        decided_by: userId,
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('legacy_id', list.map((r) => r.legacy_id))
      .is('decision', null)
      .select('legacy_id');
    if (upErr) return fail('Could not save the rejections. Nothing was changed.', 503);

    const done = new Set(((updated ?? []) as Array<{ legacy_id: number }>).map((r) => r.legacy_id));
    const atJkkn = await stillAtJkkn(
      admin,
      list.filter((r) => done.has(r.legacy_id)).map((r) => r.reporter_profile_id ?? '')
    );
    let belled = 0;
    for (const row of list) {
      if (done.has(row.legacy_id) && (await bellRequester(admin, row, reason, userId, atJkkn))) belled++;
    }
    return NextResponse.json({ success: true, rejected: done.size, belled });
  }

  const legacyId = parseLegacyId(body.legacy_id);
  if (!legacyId) return fail('Which old request? legacy_id is missing.', 400);

  const { data: rowData, error: rowErr } = await admin
    .from(TABLE)
    .select(ROW_COLUMNS)
    .eq('legacy_id', legacyId)
    .maybeSingle();
  if (rowErr) return fail('Could not read that old request. Try again.', 503);
  const row = rowData as LegacyRow | null;
  if (!row) return fail('That old request was not found.', 404);
  if (row.legacy_status !== PENDING_MD_STATUS) {
    return fail(`That old request is not waiting for approval (it is "${row.legacy_status}").`, 409);
  }

  // ── Reject one ─────────────────────────────────────────────────────────────
  if (action === 'reject') {
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const bad = validateReason(reason);
    if (bad) return fail(bad, 400);

    if (row.decision === 'approving') {
      // An approve that was started and never finished (tab closed). If it did
      // reach Procurement, record that instead of rejecting; otherwise, once
      // the claim is stale, withdraw any half-made draft and let the reject through.
      const stale = claimIsStale(row);
      const settled = await settleMarked(admin, row, userId, stale ? 'cancel' : 'look');
      if ('error' in settled) return fail(settled.error, 503);
      if (settled.raisedId) {
        const { error } = await markApproved(admin, legacyId, settled.raisedId, userId);
        if (error) return fail('Could not record the approval. Try again.', 503);
        return fail(
          'This one was already sent to Procurement by an earlier Approve, so it cannot be rejected here. Reject it in Procurement instead.',
          409,
          { already_done: true, purchase_request_id: settled.raisedId }
        );
      }
      if (!stale) {
        return fail(
          `This one is being approved in another tab. If that tab was closed, you can reject it after ${STALE_CLAIM_MINUTES} minutes.`,
          409
        );
      }
    } else if (row.decision) {
      return fail(`Already decided (${row.decision}).`, 409);
    }

    const rejectUpdate = admin
      .from(TABLE)
      .update({
        decision: 'rejected',
        decision_reason: reason,
        decided_by: userId,
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('legacy_id', legacyId);
    const { data: updated, error } = await (row.decision === 'approving'
      ? rejectUpdate.eq('decision', 'approving').eq('decision_claimed_at', row.decision_claimed_at as string)
      : rejectUpdate.is('decision', null)
    ).select('legacy_id');
    if (error) return fail('Could not save the rejection. Try again.', 503);
    if (!updated || updated.length === 0) return fail('Someone decided this one a moment ago.', 409);

    const atJkkn = await stillAtJkkn(admin, row.reporter_profile_id ? [row.reporter_profile_id] : []);
    const belled = await bellRequester(admin, row, reason, userId, atJkkn);
    return NextResponse.json({ success: true, decision: 'rejected', requester_notified: belled });
  }

  // ── Approve, step 1: claim ─────────────────────────────────────────────────
  if (action === 'begin') {
    if (row.decision === 'approved') {
      return NextResponse.json({ success: true, already_done: true, purchase_request_id: row.imported_purchase_request_id });
    }
    if (row.decision === 'rejected') return fail('This one was already rejected.', 409);

    if (row.decision === 'approving') {
      // A request raised by an earlier tap whose 'complete' never landed. A
      // submitted one is recorded at once; a half-made draft is only touched
      // once the claim is stale (the tab that made it may still be finishing it).
      const stale = claimIsStale(row);
      const settled = await settleMarked(admin, row, userId, stale ? 'finish' : 'look');
      if ('error' in settled) return fail(settled.error, 503);
      if (settled.raisedId) {
        const { error } = await markApproved(admin, legacyId, settled.raisedId, userId);
        if (error) return fail('Could not record the approval. Try again.', 503);
        return NextResponse.json({ success: true, already_done: true, purchase_request_id: settled.raisedId });
      }
      if (!stale) {
        return fail('This one is being approved in another tab. Wait a moment and refresh.', 409);
      }
    }

    const who = await resolveRequester(admin, row, userId);
    if ('error' in who) return fail(who.error, 503);

    let dto;
    try {
      dto = buildPurchaseRequestDto(row, who.departed ?? undefined);
    } catch (e: unknown) {
      return fail(e instanceof Error ? e.message : 'This old request cannot be raised.', 422);
    }

    const claim = admin
      .from(TABLE)
      .update({
        decision: 'approving',
        decision_claimed_at: new Date().toISOString(),
        decided_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('legacy_id', legacyId);
    const { data: claimed, error } = await (row.decision === 'approving'
      ? claim.eq('decision', 'approving').eq('decision_claimed_at', row.decision_claimed_at as string)
      : claim.is('decision', null)
    ).select('legacy_id, decision_claimed_at');
    if (error) return fail('Could not start the approval. Try again.', 503);
    if (!claimed || claimed.length === 0) return fail('Someone decided this one a moment ago.', 409);

    return NextResponse.json({
      success: true,
      already_done: false,
      // Sent back on 'complete' / 'release' so a tab whose claim was taken
      // over cannot record (or free) someone else's approval.
      claimed_at: (claimed[0] as { decision_claimed_at: string | null }).decision_claimed_at,
      // On behalf of the old requester while they are still at JKKN; for one
      // who has left, the college office (else the Director himself).
      requested_by: who.requestedBy,
      on_behalf_of: who.onBehalfOf,
      requester_left: who.departed !== null,
      dto,
    });
  }

  // ── Approve, step 2: record ────────────────────────────────────────────────
  if (action === 'complete') {
    const prId = typeof body.purchase_request_id === 'string' ? body.purchase_request_id : '';
    if (!prId) return fail('purchase_request_id is missing.', 400);

    const { data: prData } = await admin.from(PR_TABLE).select(PR_MARKED_COLUMNS).eq('id', prId).maybeSingle();
    const pr = prData ? toMarked(prData as Record<string, unknown>) : null;
    // This tab raised it on behalf of the old requester, the college office or itself.
    const requesters = await allowedRequesters(admin, row, userId);
    if ('error' in requesters) return fail(requesters.error, 503);
    if (
      !pr ||
      !String(pr.notes ?? '').includes(oldRequestMarker(legacyId)) ||
      !pr.requested_by ||
      !requesters.includes(pr.requested_by)
    ) {
      return fail('That purchase request does not belong to this old request.', 422);
    }

    if (row.decision === 'approved' && row.imported_purchase_request_id === prId) {
      return NextResponse.json({ success: true, decision: 'approved', purchase_request_id: prId });
    }
    if (row.decision !== 'approving' || !holdsClaim(row, body.claimed_at)) {
      // Another tab took this one over (or it was decided) while this tab was
      // raising its request — withdraw this tab's request so Procurement never
      // gets the same old request twice.
      await withdraw(admin, prId, ['draft', 'submitted']);
      return fail(
        'Another tab finished this one first, so the extra purchase request from this tab was withdrawn.',
        409
      );
    }
    if (pr.status === 'cancelled') {
      return fail('That purchase request was cancelled, so it was not recorded. Tap Approve again.', 422);
    }
    if (pr.status === 'draft') {
      // Header written, submit never landed. Finish it only when its lines are in.
      if (pr.items === 0 || !(await finishDraft(admin, prId))) {
        return fail('That purchase request was only half made, so it was not recorded. Tap Approve again.', 422);
      }
    }

    const { error } = await markApproved(admin, legacyId, prId, userId);
    if (error) return fail('The purchase request was raised, but the approval could not be recorded. Tap Approve again to finish.', 503);
    return NextResponse.json({ success: true, decision: 'approved', purchase_request_id: prId });
  }

  // ── Approve failed in the browser: free the claim ──────────────────────────
  if (action === 'release') {
    if (row.decision !== 'approving' || !holdsClaim(row, body.claimed_at)) {
      return NextResponse.json({ success: true, released: false });
    }
    const settled = await settleMarked(admin, row, userId, 'finish');
    if ('error' in settled) return fail(settled.error, 503);
    if (settled.raisedId) {
      const { error } = await markApproved(admin, legacyId, settled.raisedId, userId);
      if (error) return fail('Could not record the approval. Try again.', 503);
      return NextResponse.json({ success: true, released: false, already_done: true, purchase_request_id: settled.raisedId });
    }
    const { error } = await admin
      .from(TABLE)
      .update({ decision: null, decision_claimed_at: null, decided_by: null, updated_at: new Date().toISOString() })
      .eq('legacy_id', legacyId)
      .eq('decision', 'approving')
      .eq('decision_claimed_at', row.decision_claimed_at as string);
    if (error) return fail('Could not free this one. It frees itself after 10 minutes.', 503);
    return NextResponse.json({ success: true, released: true });
  }

  return fail(`Unknown action "${action}".`, 400);
}
