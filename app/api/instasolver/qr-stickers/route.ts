// app/api/instasolver/qr-stickers/route.ts
// ============================================================================
// The central sticker desk behind /resource-management/qr-stickers.
//
// Director ruling (1 Oct 2026): InstaSolver stickers are printed and stuck by
// ONE central team — JKKN Main Office — for every college. So:
//   - WHO: super admins, and Main Office people (profile's college is JKKN
//     Main Office) who hold resources.resources.edit. Everyone else gets an
//     explicit 403 with the reason (rule #27).
//   - ANY COLLEGE: a Main Office person's own row-level security only lets
//     them read Main Office's resources, so after the gate this route reads
//     and writes with the service role.
//   - PRINTED: resources.custom_attributes[instasolver_sticker_printed_at],
//     read-merge-written so no other attribute is lost. No new table.
//
// GET  ?institution_id=<uuid>&category_id=<uuid>&show=unprinted|all
//      -> every college with { total, unprinted } counts, and — when a college
//         is chosen — its rooms and items with their sticker code and printed time.
// POST { action: 'prepare', institution_id, resource_ids }
//      -> gives every listed row with no sticker code one (only where empty).
// POST { action: 'mark_printed', institution_id, resource_ids }
//      -> records the printed time on each listed row.
// ============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/instasolver/resource-report';
import {
  MAX_STICKER_BATCH,
  isMainOfficeName,
  newStickerToken,
  stickerPrintedAt,
  withStickerPrinted,
} from '@/lib/instasolver/sticker-desk';

const PRINT_PERMISSION = 'resources.resources.edit';
const RESOURCE_COLUMNS =
  'id, name, institution_id, building_number, block_number, floor_number, room_number, qr_code_token, custom_attributes';

type Admin = ReturnType<typeof createServiceRoleClient>;

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

/** Exactly one of the two is set: the service-role client, or the refusal. */
type Gate = { admin: Admin; response: null } | { admin: null; response: NextResponse };

/** Super admin, or Main Office + resources.resources.edit. Checked before any resource read. */
async function gate(): Promise<Gate> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { admin: null, response: fail('You need to be signed in to print stickers.', 401) };

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, institution_id, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (profileErr) {
    return { admin: null, response: fail('Could not check your account just now. Please try again.', 503) };
  }
  if (!profile || profile.is_active !== true) {
    return { admin: null, response: fail('Your account is not active, so it cannot print stickers.', 403) };
  }

  const admin = createServiceRoleClient();
  const { data: superAdmin } = await (supabase as any).rpc('is_super_admin');
  if (superAdmin === true) return { admin, response: null };

  let mainOffice = false;
  if (profile.institution_id) {
    const { data: inst } = await admin
      .from('institutions')
      .select('name')
      .eq('id', profile.institution_id)
      .maybeSingle();
    mainOffice = isMainOfficeName((inst as { name?: string } | null)?.name ?? null);
  }
  if (!mainOffice) {
    return {
      admin: null,
      response: fail(
        'InstaSolver stickers are printed by the central team at JKKN Main Office for every college. Ask them to print the stickers you need.',
        403
      ),
    };
  }
  const { data: allowed } = await (supabase as any).rpc('user_has_permission', {
    permission_name: PRINT_PERMISSION,
  });
  if (allowed !== true) {
    return {
      admin: null,
      response: fail(
        'Printing stickers needs permission to edit resources. Ask an administrator to add it to your role.',
        403
      ),
    };
  }
  return { admin, response: null };
}

interface ResourceRow {
  id: string;
  name: string;
  institution_id: string | null;
  building_number: string | null;
  block_number: string | null;
  floor_number: string | null;
  room_number: string | null;
  qr_code_token: string | null;
  custom_attributes: unknown;
}

function toClientRow(r: ResourceRow) {
  return {
    id: r.id,
    name: r.name,
    building_number: r.building_number,
    block_number: r.block_number,
    floor_number: r.floor_number,
    room_number: r.room_number,
    qr_code_token: r.qr_code_token,
    printed_at: stickerPrintedAt(r.custom_attributes),
  };
}

export async function GET(request: NextRequest) {
  const g = await gate();
  if (g.response) return g.response;
  const admin = g.admin as Admin;

  const params = request.nextUrl.searchParams;
  const institutionId = params.get('institution_id');
  const categoryId = params.get('category_id');
  const show = params.get('show') === 'all' ? 'all' : 'unprinted';
  if (institutionId && !isUuid(institutionId)) return fail('That college is not valid.', 400);
  if (categoryId && !isUuid(categoryId)) return fail('That category is not valid.', 400);

  // Every college, with how many of its rooms and items still need a sticker.
  const [{ data: institutions, error: instErr }, { data: all, error: allErr }] = await Promise.all([
    admin.from('institutions').select('id, name').order('name', { ascending: true }),
    admin.from('resources').select('institution_id, custom_attributes').limit(20000),
  ]);
  if (instErr || allErr) return fail('Could not load the colleges just now. Please try again.', 503);
  const counts = new Map<string, { total: number; unprinted: number }>();
  for (const r of (all ?? []) as Array<{ institution_id: string | null; custom_attributes: unknown }>) {
    if (!r.institution_id) continue;
    const c = counts.get(r.institution_id) ?? { total: 0, unprinted: 0 };
    c.total += 1;
    if (!stickerPrintedAt(r.custom_attributes)) c.unprinted += 1;
    counts.set(r.institution_id, c);
  }
  const colleges = ((institutions ?? []) as Array<{ id: string; name: string }>).map((i) => ({
    id: i.id,
    name: i.name,
    total: counts.get(i.id)?.total ?? 0,
    unprinted: counts.get(i.id)?.unprinted ?? 0,
  }));

  if (!institutionId) return NextResponse.json({ success: true, colleges, rows: [] });

  let query = admin
    .from('resources')
    .select(RESOURCE_COLUMNS)
    .eq('institution_id', institutionId)
    .order('name', { ascending: true })
    .limit(MAX_STICKER_BATCH);
  if (categoryId) query = query.eq('parent_category_id', categoryId);
  const { data: rows, error: rowsErr } = await query;
  if (rowsErr) return fail('Could not load the rooms and items for this college.', 503);
  const mapped = ((rows ?? []) as ResourceRow[]).map(toClientRow);
  return NextResponse.json({
    success: true,
    colleges,
    rows: show === 'all' ? mapped : mapped.filter((r) => !r.printed_at),
  });
}

export async function POST(request: NextRequest) {
  const g = await gate();
  if (g.response) return g.response;
  const admin = g.admin as Admin;

  let payload: { action?: unknown; institution_id?: unknown; resource_ids?: unknown };
  try {
    payload = await request.json();
  } catch {
    return fail('Expected JSON.', 400);
  }
  const action = payload.action;
  const institutionId = payload.institution_id;
  const ids = Array.isArray(payload.resource_ids) ? payload.resource_ids.filter(isUuid) : [];
  if (action !== 'prepare' && action !== 'mark_printed') return fail('Unknown action.', 400);
  if (!isUuid(institutionId)) return fail('Choose a college first.', 400);
  if (ids.length === 0) return fail('No rooms or items were chosen.', 400);
  if (ids.length > MAX_STICKER_BATCH) {
    return fail(`At most ${MAX_STICKER_BATCH} at a time. Pick a category to make the list shorter.`, 400);
  }

  // Only rows of the chosen college — an id from elsewhere is ignored.
  const { data: found, error: readErr } = await admin
    .from('resources')
    .select(RESOURCE_COLUMNS)
    .eq('institution_id', institutionId)
    .in('id', ids);
  if (readErr) return fail('Could not load those rooms and items just now. Please try again.', 503);
  const rows = (found ?? []) as ResourceRow[];

  if (action === 'prepare') {
    let failed = 0;
    for (const row of rows) {
      if (row.qr_code_token) continue;
      const token = newStickerToken();
      // Only where still empty: a code someone else wrote in between is kept.
      const { error: upErr } = await admin
        .from('resources')
        .update({ qr_code_token: token, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .is('qr_code_token', null);
      if (upErr) failed += 1;
    }
    const { data: fresh, error: freshErr } = await admin
      .from('resources')
      .select(RESOURCE_COLUMNS)
      .eq('institution_id', institutionId)
      .in('id', ids)
      .order('name', { ascending: true });
    if (freshErr) return fail('The sticker codes were saved, but the list could not be re-read. Refresh.', 503);
    return NextResponse.json({
      success: true,
      rows: ((fresh ?? []) as ResourceRow[]).map(toClientRow),
      failed,
    });
  }

  // mark_printed: read-merge-write, so every other custom attribute is kept.
  const at = new Date().toISOString();
  let marked = 0;
  let skipped = 0;
  for (const row of rows) {
    const next = withStickerPrinted(row.custom_attributes, at);
    if (!next) {
      skipped += 1;
      continue;
    }
    const { error: upErr } = await admin
      .from('resources')
      .update({ custom_attributes: next, updated_at: at })
      .eq('id', row.id);
    if (upErr) skipped += 1;
    else marked += 1;
  }
  return NextResponse.json({ success: true, marked, skipped, printed_at: at });
}
