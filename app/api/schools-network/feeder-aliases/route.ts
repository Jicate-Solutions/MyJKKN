// app/api/schools-network/feeder-aliases/route.ts
// ============================================================================
// Tidy-duplicates (feeder merge) endpoints — all gated schools_network.schools.edit.
//
//   GET    → { suggestions, links }
//            suggestions: system-proposed likely-same-school pairs (trigram)
//            links:       merges already made (for the Unlink list)
//   POST   { fromKey, toKey, fromName, toName } → link (non-destructive merge)
//   DELETE ?from=<key>                          → unlink (undo one merge)
//
// Merges are stored as a non-destructive alias map; the feeder + roster fns
// resolve every canonical key through it before grouping, so counts/rosters
// combine everywhere. Undo = DELETE.
// ============================================================================

export const dynamic = 'force-dynamic';

import { connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { successResponse, errorResponse } from '@/lib/api/response';

const EDIT_PERM = 'schools_network.schools.edit';

// The link/unlink/suggestions RPCs RAISE with ERRCODE 42501 for non-admins
// (merging is admin-only). Map that to a real 403 so the client can branch on
// status, not brittle message text (advisory review LOW).
function rpcError(
  e: { message?: string; code?: string } | null,
  fallbackCode: string
) {
  // 42501 = the admin-only RAISE → a real 403 with its (safe, user-facing) text.
  if (e?.code === '42501') {
    return errorResponse(e?.message ?? 'permission denied', 403, 'FORBIDDEN');
  }
  // Any other DB/RPC error: log the raw text server-side, return a generic
  // message so internal error text / schema hints don't leak (advisory review LOW).
  console.error(`[schools-network/feeder-aliases] ${fallbackCode}:`, e?.message);
  return errorResponse('Something went wrong. Please try again.', 500, fallbackCode);
}

export const GET = withAuth(
  async (_request, auth) => {
    await connection();

    const { data: sugg, error: sErr } = await auth.supabase.rpc(
      'fn_schools_network_feeder_dupe_suggestions',
      { p_limit: 50 }
    );
    if (sErr) return rpcError(sErr, 'SUGGEST_FAILED');

    const { data: links, error: lErr } = await auth.supabase
      .from('schools_network_feeder_aliases')
      .select('from_key, to_key, from_name_sample, to_name_sample, created_at')
      .order('created_at', { ascending: false });
    if (lErr) return rpcError(lErr, 'LIST_FAILED');

    const suggestions = ((sugg ?? []) as Array<Record<string, unknown>>).map((r) => ({
      fromKey: r.from_key as string,
      fromName: (r.from_name ?? '') as string,
      fromCount: Number(r.from_count ?? 0),
      toKey: r.to_key as string,
      toName: (r.to_name ?? '') as string,
      toCount: Number(r.to_count ?? 0),
      similarity: Number(r.similarity ?? 0),
    }));

    const linkRows = ((links ?? []) as Array<Record<string, unknown>>).map((r) => ({
      fromKey: r.from_key as string,
      fromName: (r.from_name_sample ?? null) as string | null,
      toKey: r.to_key as string,
      toName: (r.to_name_sample ?? null) as string | null,
      createdAt: (r.created_at ?? null) as string | null,
    }));

    return successResponse({ suggestions, links: linkRows });
  },
  { allowApiKey: false, requirePermission: EDIT_PERM }
);

export const POST = withAuth(
  async (request, auth) => {
    await connection();
    const body = (await request.json().catch(() => ({}))) as {
      fromKey?: string;
      toKey?: string;
      fromName?: string;
      toName?: string;
    };
    if (!body.fromKey?.trim() || !body.toKey?.trim()) {
      return errorResponse('fromKey and toKey are required', 400, 'VALIDATION_ERROR');
    }
    if (body.fromKey === body.toKey) {
      return errorResponse('cannot merge a school into itself', 400, 'VALIDATION_ERROR');
    }
    const { error } = await auth.supabase.rpc('fn_schools_network_link_feeders', {
      p_from_key: body.fromKey,
      p_to_key: body.toKey,
      p_from_name: body.fromName ?? null,
      p_to_name: body.toName ?? null,
    });
    if (error) return rpcError(error, 'LINK_FAILED');
    return successResponse({ ok: true });
  },
  { allowApiKey: false, requirePermission: EDIT_PERM }
);

export const DELETE = withAuth(
  async (request, auth) => {
    await connection();
    const from = new URL(request.url).searchParams.get('from');
    if (!from?.trim()) {
      return errorResponse('from is required', 400, 'VALIDATION_ERROR');
    }
    const { error } = await auth.supabase.rpc('fn_schools_network_unlink_feeder', {
      p_from_key: from,
    });
    if (error) return rpcError(error, 'UNLINK_FAILED');
    return successResponse({ ok: true });
  },
  { allowApiKey: false, requirePermission: EDIT_PERM }
);
