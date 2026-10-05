// lib/services/procurement/request-stock.ts
//
// Live store stock for the lines of one purchase request, so the approver sees
// what is on the shelf NOW (the request only keeps a snapshot from when it was
// raised). Catalog lines look up their item; a "new item" line is matched by exact
// name against the college's catalog, because people often raise as new something
// the store already carries.
//
// Read with the viewer's own rights: someone without IMS access to that college
// simply gets no figures (null), never an error.

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface LineStock {
  /** Units on hand across the college's stores (or the request's store). */
  on_hand: number;
  /** Set when a "new item" line matched a catalog item by name. */
  matched_name?: string;
}

interface Line {
  id: string;
  item_name: string;
  domain_item_id: string | null;
}

export async function getRequestLineStock(
  institutionId: string,
  storeId: string | null,
  lines: Line[]
): Promise<Record<string, LineStock>> {
  const db = createClientSupabaseClient() as any;
  const out: Record<string, LineStock> = {};

  // New-item lines: exact (case-insensitive) name match within the college catalog.
  const nameToItem = new Map<string, { id: string; name: string }>();
  const newNames = [...new Set(lines.filter((l) => !l.domain_item_id).map((l) => l.item_name.trim()))].filter(Boolean);
  if (newNames.length) {
    const { data, error } = await db
      .from('ims_items')
      .select('id, name')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      // ilike without wildcards = case-insensitive equality; quoted so spaces/commas are safe.
      .or(newNames.map((n) => `name.ilike."${n.replace(/["\\*%_]/g, '')}"`).join(','))
      .limit(200);
    if (!error) for (const it of data ?? []) nameToItem.set(String(it.name).trim().toLowerCase(), it);
  }

  const itemIdFor = (l: Line) => l.domain_item_id ?? nameToItem.get(l.item_name.trim().toLowerCase())?.id ?? null;
  const itemIds = [...new Set(lines.map(itemIdFor).filter((x): x is string => !!x))];
  if (!itemIds.length) return out;

  let q = db
    .from('ims_stock_summary')
    .select('item_id, available_quantity, current_quantity')
    .in('item_id', itemIds)
    .eq('institution_id', institutionId);
  if (storeId) q = q.eq('store_id', storeId);
  const { data: rows, error } = await q;
  if (error) return out; // no IMS access → no figures

  const onHand = new Map<string, number>();
  for (const r of rows ?? []) {
    const qty = Number(r.available_quantity ?? r.current_quantity ?? 0);
    onHand.set(r.item_id, (onHand.get(r.item_id) ?? 0) + qty);
  }
  for (const l of lines) {
    const itemId = itemIdFor(l);
    if (!itemId) continue;
    out[l.id] = {
      on_hand: onHand.get(itemId) ?? 0,
      ...(l.domain_item_id ? {} : { matched_name: nameToItem.get(l.item_name.trim().toLowerCase())?.name }),
    };
  }
  return out;
}
