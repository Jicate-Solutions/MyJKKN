export const dynamic = 'force-dynamic';

// POST /api/ims/inventory/pos-visibility
//
// Put items on THIS store's counter, or take them off — in bulk.
//
// The POS lists only items flagged sellable, and almost nothing is flagged:
// Dental had 1 of 165, Pharmacy 0 of 761. Doing that through the item form is one
// dialog per item. This is the same change, applied to a selection.
//
// WHAT CHANGED IN 20260804090000. The flag used to live on ims_items, which is an
// INSTITUTION-wide row — so this route enabled an item on every counter in the
// college at once. Dental has three stores; flagging something at the student
// store put it on the warehouse's and the patient store's tills as well. The flag
// now lives on the store's listing (ims_store_items), so a store id is required
// and the write is scoped to it.
//
// TWO THINGS THIS ROUTE DOES THAT A NAIVE VERSION WOULD NOT:
//
//   1. IT RE-APPLIES THE FILTER SERVER-SIDE. "Select all 164 matching" cannot be
//      expressed as a list of ids, because the browser only ever holds one page of
//      them. Sending the FILTER and re-running it here is what makes the promise on
//      the button ("164") the thing that actually happens.
//
//   2. IT REFUSES WHEN THE COUNT MOVED. The client says how many rows it believes it
//      is changing; if the server counts a different number it changes nothing and
//      reports both. Between rendering a page and clicking a button, someone else can
//      add an item or a filter can go stale — and the difference between "enable 20"
//      and "enable 761" is exactly that kind of drift. A bulk write should fail loudly
//      rather than do a different job than the one on screen.
//
// Note the column name: `is_sellable_to_students`. It predates walk-in and patient
// customers, and the UI says "At POS" instead. Renaming it would touch the POS query,
// the item form and the change-request allowlist for no functional gain.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

interface PosVisibilityBody {
  action: 'add' | 'remove';
  institutionId: string;
  /** The counter being changed. Required — the flag is per-store. */
  storeId: string;
  mode: 'ids' | 'filter';
  ids?: string[];
  filter?: {
    search?: string;
    category_id?: string;
    item_type?: string;
    is_active?: boolean;
    /** Narrow to items currently on/off THIS store's counter. */
    pos_visibility?: 'at_pos' | 'not_at_pos';
  };
  /** How many rows the caller believes it is about to change. */
  expectedCount: number;
}

/**
 * Applies exactly the predicates ImsInventoryService.getItems uses under store
 * scope — including the assortment join, so an item this store does not carry
 * cannot be put on its counter.
 */
function applyFilters(
  query: any,
  institutionId: string,
  storeId: string,
  filter: PosVisibilityBody['filter']
) {
  // Institution and store are both forced from the validated body, never taken
  // from the filter — a bulk write must not be able to reach into another
  // college, or another college's store.
  query = query.eq('institution_id', institutionId).eq('store_link.store_id', storeId);

  if (filter?.search) {
    query = query.or(`name.ilike.%${filter.search}%,code.ilike.%${filter.search}%`);
  }
  if (filter?.category_id) query = query.eq('category_id', filter.category_id);
  if (filter?.item_type) query = query.eq('item_type', filter.item_type);
  if (filter?.is_active !== undefined) query = query.eq('is_active', filter.is_active);

  if (filter?.pos_visibility === 'at_pos') {
    query = query.eq('store_link.is_sellable_to_students', true);
  } else if (filter?.pos_visibility === 'not_at_pos') {
    query = query.eq('store_link.is_sellable_to_students', false);
  }

  return query;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Same gate the item form applies, enforced here because a route is callable
    // without the form. RLS on ims_store_items requires this permission too, so this
    // check is the readable error rather than the only defence.
    const { data: allowed } = await supabase.rpc('user_has_permission', {
      permission_name: 'ims.inventory.edit',
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'You do not have permission to change what appears at the POS.' },
        { status: 403 },
      );
    }

    const body = (await request.json()) as PosVisibilityBody;
    const { action, institutionId, storeId, mode, ids, filter, expectedCount } = body ?? {};

    if (action !== 'add' && action !== 'remove') {
      return NextResponse.json({ error: 'action must be "add" or "remove"' }, { status: 400 });
    }
    if (!institutionId) {
      return NextResponse.json({ error: 'institutionId is required' }, { status: 400 });
    }
    if (!storeId) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }
    if (typeof expectedCount !== 'number' || expectedCount < 1) {
      return NextResponse.json({ error: 'expectedCount is required' }, { status: 400 });
    }
    if (mode === 'ids' && (!Array.isArray(ids) || ids.length === 0)) {
      return NextResponse.json({ error: 'ids are required for mode "ids"' }, { status: 400 });
    }

    // The store must belong to the institution the caller named. Without this the
    // pair is unvalidated: a caller could send their own institution (which passes
    // RLS) alongside a store id from anywhere.
    const { data: store, error: storeError } = await supabase
      .from('ims_stores')
      .select('id, name, institution_id')
      .eq('id', storeId)
      .maybeSingle();

    if (storeError) {
      logger.error('ims/pos-visibility', 'store lookup failed', storeError);
      return NextResponse.json({ error: storeError.message }, { status: 500 });
    }
    if (!store || store.institution_id !== institutionId) {
      return NextResponse.json(
        { error: 'That store does not belong to this institution.' },
        { status: 403 },
      );
    }

    const target = action === 'add';

    // ── Resolve the exact rows, then check the interlock ─────────────────────
    // Resolving ids rather than head-counting, because the write now lands on
    // ims_store_items and needs to know WHICH listings to touch. The inner join
    // is what confines it to items this store actually carries.

    let selectQuery: any = supabase
      .from('ims_items')
      .select('id, store_link:ims_store_items!inner(store_id)');

    selectQuery = mode === 'ids'
      ? selectQuery
          .eq('institution_id', institutionId)
          .eq('store_link.store_id', storeId)
          .in('id', ids as string[])
      : applyFilters(selectQuery, institutionId, storeId, filter);

    const { data: matched, error: matchError } = await selectQuery;
    if (matchError) {
      logger.error('ims/pos-visibility', 'match failed', matchError);
      return NextResponse.json({ error: matchError.message }, { status: 500 });
    }

    const matchedIds: string[] = (matched ?? []).map((r: any) => r.id);

    if (matchedIds.length !== expectedCount) {
      return NextResponse.json(
        {
          error:
            `This would change ${matchedIds.length} items at ${store.name}, but the screen ` +
            `showed ${expectedCount}. The list has moved on — refresh and try again.`,
          expected: expectedCount,
          actual: matchedIds.length,
        },
        { status: 409 },
      );
    }

    // ── Apply ────────────────────────────────────────────────────────────────
    // An UPDATE, not an upsert: every matched id came back through the assortment
    // join, so its listing already exists. Upserting would let a bad id silently
    // ADD an item to this store's catalogue as a side effect of a POS toggle.

    const { data: updated, error: updateError } = await supabase
      .from('ims_store_items')
      .update({ is_sellable_to_students: target, updated_at: new Date().toISOString() })
      .eq('store_id', storeId)
      .in('item_id', matchedIds)
      .select('id');

    if (updateError) {
      logger.error('ims/pos-visibility', 'bulk update failed', {
        code: updateError.code, details: updateError.details, error: updateError.message,
      });
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    logger.info('ims/pos-visibility', 'bulk POS visibility changed', {
      action, mode, institutionId, storeId, changed: updated?.length ?? 0, by: user.id,
    });

    return NextResponse.json({ updated: updated?.length ?? 0, action });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    logger.error('ims/pos-visibility', 'request failed', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
