// app/api/schools-network/feeder-splits/route.ts
// ============================================================================
// Rescue shared-name feeders (split by home pincode) — gated schools_network.schools.edit.
//
//   GET                       → { feeders, splits }
//                                 feeders: generic feeders worth splitting (span many pincodes)
//                                 splits:  confirmed splits already made (for the Unlink list)
//   GET  ?school=<name>       → { candidates }
//                                 candidates: pincode groups for that feeder (town/district/count)
//   POST { genericKey, pincodes[], name, district?, institutionId? }
//                             → confirm → { id }  (creates a real adoptable school)
//   DELETE ?splitId=<uuid>    → unconfirm (undo one split; cleans up a pristine school)
//
// Confirming creates an ORG-WIDE `schools` row, so every underlying RPC is
// admin-only (RAISE 42501 for non-admins → mapped to a clean 403 here).
// ============================================================================

export const dynamic = 'force-dynamic';

import { connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { successResponse, createdResponse, errorResponse } from '@/lib/api/response';

const EDIT_PERM = 'schools_network.schools.edit';

// The split RPCs RAISE ERRCODE 42501 for non-admins (creating schools org-wide
// is admin-only). Map that to a real 403 so the client branches on status, not
// brittle message text (mirrors feeder-aliases).
function rpcError(
  e: { message?: string; code?: string } | null,
  fallbackCode: string
) {
  if (e?.code === '42501') {
    return errorResponse(e?.message ?? 'permission denied', 403, 'FORBIDDEN');
  }
  // P0001 = our own RAISE EXCEPTION validation (pincodes already claimed / not in
  // this feeder / institution not found / name required). These messages are safe
  // and actionable — surface them as a 422 so the admin sees the real reason
  // (e.g. "already part of a confirmed split") instead of a generic error.
  if (e?.code === 'P0001') {
    return errorResponse(e?.message ?? 'Invalid request', 422, 'VALIDATION_ERROR');
  }
  // Any other DB/RPC error: log raw text server-side, return a generic message
  // so internal error text / schema hints don't leak (advisory LOW).
  console.error(`[schools-network/feeder-splits] ${fallbackCode}:`, e?.message);
  return errorResponse('Something went wrong. Please try again.', 500, fallbackCode);
}

export const GET = withAuth(
  async (request, auth) => {
    await connection();
    const school = new URL(request.url).searchParams.get('school');

    // Per-feeder candidate groups (pincode → town/district/count).
    if (school?.trim()) {
      const { data, error } = await auth.supabase.rpc(
        'fn_schools_network_feeder_split_candidates',
        { p_school_name: school }
      );
      if (error) return rpcError(error, 'CANDIDATES_FAILED');
      const candidates = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        pincode: (r.pincode ?? null) as string | null,
        town: (r.town ?? null) as string | null,
        district: (r.district ?? null) as string | null,
        learnerCount: Number(r.learner_count ?? 0),
        alreadyConfirmed: !!r.already_confirmed,
      }));
      return successResponse({ candidates });
    }

    // Default: generic feeders worth splitting + the confirmed-splits list.
    const { data: feedersRaw, error: fErr } = await auth.supabase.rpc(
      'fn_schools_network_list_generic_feeders'
    );
    if (fErr) return rpcError(fErr, 'FEEDERS_FAILED');

    const { data: splitsRaw, error: sErr } = await auth.supabase
      .from('schools_network_feeder_splits')
      .select('id, generic_key, pincodes, confirmed_school_id, confirmed_name, district, created_at')
      .order('created_at', { ascending: false })
      .limit(200); // cap the confirmed-splits list (grows over time)
    if (sErr) return rpcError(sErr, 'SPLITS_FAILED');

    const feeders = ((feedersRaw ?? []) as Array<Record<string, unknown>>).map((r) => ({
      schoolName: (r.school_name ?? '') as string,
      learnerCount: Number(r.learner_count ?? 0),
      distinctPincodes: Number(r.distinct_pincodes ?? 0),
    }));

    const splits = ((splitsRaw ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      genericKey: r.generic_key as string,
      pincodes: (Array.isArray(r.pincodes) ? r.pincodes : []) as string[],
      confirmedSchoolId: (r.confirmed_school_id ?? null) as string | null,
      confirmedName: (r.confirmed_name ?? null) as string | null,
      district: (r.district ?? null) as string | null,
      createdAt: (r.created_at ?? null) as string | null,
    }));

    return successResponse({ feeders, splits });
  },
  { allowApiKey: false, requirePermission: EDIT_PERM }
);

export const POST = withAuth(
  async (request, auth) => {
    await connection();
    const body = (await request.json().catch(() => ({}))) as {
      genericKey?: string;
      pincodes?: string[];
      name?: string;
      district?: string | null;
      institutionId?: string | null;
    };

    if (!body.genericKey?.trim()) {
      return errorResponse('genericKey is required', 422, 'VALIDATION_ERROR');
    }
    if (!body.name?.trim()) {
      return errorResponse('a school name is required', 422, 'VALIDATION_ERROR');
    }
    const pincodes = Array.isArray(body.pincodes)
      ? body.pincodes.filter((p) => typeof p === 'string' && p.trim() !== '')
      : [];
    if (pincodes.length === 0) {
      return errorResponse(
        'select at least one pincode group (the unknown-location bucket cannot be confirmed)',
        422,
        'VALIDATION_ERROR'
      );
    }

    const { data, error } = await auth.supabase.rpc('fn_schools_network_confirm_split', {
      p_generic_key: body.genericKey,
      p_pincodes: pincodes,
      p_name: body.name,
      p_district: body.district ?? null,
      p_institution_id: body.institutionId ?? null,
    });
    if (error) return rpcError(error, 'CONFIRM_FAILED');

    // fn_schools_network_confirm_split RETURNS uuid → PostgREST hands back the
    // scalar directly.
    return createdResponse({ id: data as string });
  },
  { allowApiKey: false, requirePermission: EDIT_PERM }
);

export const DELETE = withAuth(
  async (request, auth) => {
    await connection();
    const splitId = new URL(request.url).searchParams.get('splitId')?.trim();
    if (!splitId) {
      return errorResponse('splitId is required', 400, 'VALIDATION_ERROR');
    }
    // Validate the UUID shape before the RPC so a malformed id returns a clean
    // 400 rather than a Postgres cast error mapped to a generic 500.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(splitId)) {
      return errorResponse('splitId must be a valid UUID', 400, 'VALIDATION_ERROR');
    }
    const { error } = await auth.supabase.rpc('fn_schools_network_unconfirm_split', {
      p_split_id: splitId,
    });
    if (error) return rpcError(error, 'UNCONFIRM_FAILED');
    return successResponse({ ok: true });
  },
  { allowApiKey: false, requirePermission: EDIT_PERM }
);
