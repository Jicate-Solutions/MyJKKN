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
// REJECT stores the reason and bells the old requester when they matched a
// MyJKKN profile. BULK_REJECT does the same for everything older than two years.
// ============================================================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import {
  BULK_REJECT_OLDER_THAN_DAYS,
  PENDING_MD_STATUS,
  STALE_CLAIM_MINUTES,
  buildPurchaseRequestDto,
  itemLabel,
  oldRequestMarker,
  rejectionBell,
  validateReason,
} from '@/lib/instasolver/old-purchase-requests';

const TABLE = 'legacy_instasolver_requirements';
const ROW_COLUMNS =
  'legacy_id, institution_id, details, cause, clean_category, clean_site, clean_area, legacy_location, priority, requested_at, reporter_profile_id, legacy_status, decision, decision_claimed_at, imported_purchase_request_id';

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

async function findMarkedRequest(
  admin: SupabaseClient,
  legacyId: number
): Promise<{ id: string; requested_by: string | null } | null> {
  const { data } = await admin
    .from('procurement_purchase_requests')
    .select('id, requested_by')
    .like('notes', `%${oldRequestMarker(legacyId)}%`)
    .order('created_at', { ascending: true })
    .limit(1);
  const hit = (data ?? [])[0] as { id: string; requested_by: string | null } | undefined;
  return hit ?? null;
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

async function bellRequester(admin: SupabaseClient, row: LegacyRow, reason: string, userId: string) {
  if (!row.reporter_profile_id) return false;
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

    const cutoff = new Date(Date.now() - BULK_REJECT_OLDER_THAN_DAYS * 86_400_000).toISOString();
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
    let belled = 0;
    for (const row of list) {
      if (done.has(row.legacy_id) && (await bellRequester(admin, row, reason, userId))) belled++;
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
    if (row.decision) return fail(`Already decided (${row.decision}).`, 409);

    const { data: updated, error } = await admin
      .from(TABLE)
      .update({
        decision: 'rejected',
        decision_reason: reason,
        decided_by: userId,
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('legacy_id', legacyId)
      .is('decision', null)
      .select('legacy_id');
    if (error) return fail('Could not save the rejection. Try again.', 503);
    if (!updated || updated.length === 0) return fail('Someone decided this one a moment ago.', 409);

    const belled = await bellRequester(admin, row, reason, userId);
    return NextResponse.json({ success: true, decision: 'rejected', requester_notified: belled });
  }

  // ── Approve, step 1: claim ─────────────────────────────────────────────────
  if (action === 'begin') {
    if (row.decision === 'approved') {
      return NextResponse.json({ success: true, already_done: true, purchase_request_id: row.imported_purchase_request_id });
    }
    if (row.decision === 'rejected') return fail('This one was already rejected.', 409);

    if (row.decision === 'approving') {
      // A request raised by an earlier tap whose 'complete' never landed.
      const marked = await findMarkedRequest(admin, legacyId);
      if (marked) {
        const { error } = await markApproved(admin, legacyId, marked.id, userId);
        if (error) return fail('Could not record the approval. Try again.', 503);
        return NextResponse.json({ success: true, already_done: true, purchase_request_id: marked.id });
      }
      const claimedMs = row.decision_claimed_at ? Date.parse(row.decision_claimed_at) : 0;
      if (Date.now() - claimedMs < STALE_CLAIM_MINUTES * 60_000) {
        return fail('This one is being approved in another tab. Wait a moment and refresh.', 409);
      }
    }

    let dto;
    try {
      dto = buildPurchaseRequestDto(row);
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
    ).select('legacy_id');
    if (error) return fail('Could not start the approval. Try again.', 503);
    if (!claimed || claimed.length === 0) return fail('Someone decided this one a moment ago.', 409);

    return NextResponse.json({
      success: true,
      already_done: false,
      // On behalf of the old requester when they matched a MyJKKN profile,
      // otherwise the Director himself.
      requested_by: row.reporter_profile_id ?? userId,
      dto,
    });
  }

  // ── Approve, step 2: record ────────────────────────────────────────────────
  if (action === 'complete') {
    const prId = typeof body.purchase_request_id === 'string' ? body.purchase_request_id : '';
    if (!prId) return fail('purchase_request_id is missing.', 400);
    if (row.decision !== 'approving') return fail('This approval was not started, or already finished.', 409);

    const { data: pr } = await admin
      .from('procurement_purchase_requests')
      .select('id, notes, requested_by')
      .eq('id', prId)
      .maybeSingle();
    const expectedBy = row.reporter_profile_id ?? userId;
    if (
      !pr ||
      !String((pr as { notes: string | null }).notes ?? '').includes(oldRequestMarker(legacyId)) ||
      (pr as { requested_by: string | null }).requested_by !== expectedBy
    ) {
      return fail('That purchase request does not belong to this old request.', 422);
    }

    const { error } = await markApproved(admin, legacyId, prId, userId);
    if (error) return fail('The purchase request was raised, but the approval could not be recorded. Tap Approve again to finish.', 503);
    return NextResponse.json({ success: true, decision: 'approved', purchase_request_id: prId });
  }

  // ── Approve failed in the browser: free the claim ──────────────────────────
  if (action === 'release') {
    if (row.decision !== 'approving') return NextResponse.json({ success: true, released: false });
    const marked = await findMarkedRequest(admin, legacyId);
    if (marked) {
      const { error } = await markApproved(admin, legacyId, marked.id, userId);
      if (error) return fail('Could not record the approval. Try again.', 503);
      return NextResponse.json({ success: true, released: false, already_done: true, purchase_request_id: marked.id });
    }
    const { error } = await admin
      .from(TABLE)
      .update({ decision: null, decision_claimed_at: null, decided_by: null, updated_at: new Date().toISOString() })
      .eq('legacy_id', legacyId)
      .eq('decision', 'approving');
    if (error) return fail('Could not free this one. It frees itself after 10 minutes.', 503);
    return NextResponse.json({ success: true, released: true });
  }

  return fail(`Unknown action "${action}".`, 400);
}
