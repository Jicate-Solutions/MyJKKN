// lib/services/ims/inventory-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  buildUnitDisplay,
  resolveUnitId,
} from '@/lib/utils/ims-item-excel-mappings';
import type {
  ImsItem,
  ImsItemWithRelations,
  ImsItemFilters,
  CreateImsItemDto,
  UpdateImsItemDto,
} from '@/types/ims';

// ============================================================================
// Types for bulk import (server-side)
// ============================================================================

export interface ImsImportError {
  row: number;
  field?: string;
  message: string;
}

export interface ImsImportResult {
  success: boolean;
  successCount: number;
  errorCount: number;
  totalRows: number;
  errors: ImsImportError[];
  duplicateCodes?: string[];
  /** Present when the file's Distribution sheet forwarded stock to other stores. */
  distributionNote?: string;
}

/** A single row parsed from the Excel file, after Zod validation. */
export interface ParsedImportRow {
  code: string;
  name: string;
  description: string | null;
  category_name: string | null;
  item_type: string;
  base_unit_raw: string | null;
  purchase_unit_raw: string | null;
  sale_unit_raw: string | null;
  indent_unit_raw: string | null;
  hsn_code: string | null;
  gst_rate: number;
  cost_price: number;
  mrp: number;
  selling_price: number;
  reorder_level: number;
  max_stock_level: number;
  track_batch: boolean;
  track_expiry: boolean;
  is_sellable_to_students: boolean;
  is_active: boolean;
  company_name?: string | null;
  opening_stock: number;
  batch_number?: string | null;
  expiry_date?: string | null;
}

export interface ImsCategoryRow {
  id: string;
  name: string;
  code?: string;
}

export interface ImsUnitRow {
  id: string;
  name: string;
  abbreviation: string;
}

/**
 * A store the warehouse may forward stock to. Feeds the import template's
 * Distribution dropdown, so the sheet can only ever offer stores that actually
 * exist in the institution.
 */
export interface ImsDestinationStoreRow {
  id: string;
  name: string;
  code: string;
  is_central_supply_store: boolean;
}

/** One line of the import file's optional "Distribution" sheet. */
export interface ImsDistributionRow {
  row_number: number;
  item_code: string;
  /** Raw cell text, normally "Store Name (CODE)" from the dropdown. */
  store_label: string;
  quantity: number;
}

/** Shape returned by getItemsForSelect — used by useImsItemsForSelect and the indent form (Teammate C). */
export interface ImsItemForSelect {
  id: string;
  name: string;
  code: string;
  gst_rate: number;
  hsn_code: string | null;
  indent_unit_id: string | null;
  base_unit_id: string | null;
  indent_unit: { id: string; name: string; abbreviation: string } | null;
  base_unit: { id: string; name: string; abbreviation: string } | null;
}

export class ImsInventoryService {
  private static get supabase() {
    // IMS tables are not yet in the Supabase-generated Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /**
   * List items with category and unit joins, search, filtering, and pagination.
   */
  static async getItems(filters: ImsItemFilters): Promise<{
    data: ImsItemWithRelations[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      // Three layers, three questions, three tables:
      //   ims_items          — what the item IS.       institution-wide, UNIQUE(institution_id, code)
      //   ims_store_items    — who CARRIES it.         per-store (the assortment)
      //   ims_stock_summary  — how much they HOLD.     per-store
      //
      // `store` scope inner-joins the assortment so a store lists only its own
      // catalogue. `institution` scope skips that join and returns everything —
      // the warehouse needs it, because it must be able to push an item to a
      // store before that store has ever stocked it.
      //
      // ims_items.store_id is NOT used for either. It records which store created
      // the row and is never rewritten when the item is stocked elsewhere; see the
      // column comment added in 20260804090000.
      const scope: 'store' | 'institution' =
        filters.scope ?? (filters.store_id ? 'store' : 'institution');
      const storeScoped = scope === 'store' && !!filters.store_id;

      // All four units, not just the base one. The three extra joins are tiny and
      // PostgREST resolves them in the same round trip, which is cheaper than the
      // detail dialog re-fetching the row it already has in hand.
      const embeds = [
        'category:ims_item_categories(id,name,code)',
        'base_unit:ims_units!ims_items_base_unit_id_fkey(id,name,abbreviation)',
        'purchase_unit:ims_units!ims_items_purchase_unit_id_fkey(id,name,abbreviation)',
        'sale_unit:ims_units!ims_items_sale_unit_id_fkey(id,name,abbreviation)',
        'indent_unit:ims_units!ims_items_indent_unit_id_fkey(id,name,abbreviation)',
      ];
      // `!inner` under store scope is what narrows the row set to the assortment.
      // Under institution scope the same embed is a LEFT join: every item still
      // comes back, but each carries THIS store's listing when it has one — so
      // the warehouse's "whole institution" view can still say, truthfully, which
      // of them this store carries and sells. Without it the screen would fall
      // back to the item-level default and report some other counter's answer.
      if (storeScoped) {
        embeds.push('store_link:ims_store_items!inner(is_sellable_to_students,is_active)');
      } else if (filters.store_id) {
        embeds.push('store_link:ims_store_items(is_sellable_to_students,is_active)');
      }
      // Stock is normally read in a second pass below (see the note there), but
      // has_stock has to narrow the ROW SET, so it needs a join in the main query.
      if (storeScoped && filters.has_stock) {
        embeds.push('stock_link:ims_stock_summary!inner(available_quantity)');
      }

      let query = this.supabase
        .from('ims_items')
        .select(`*, ${embeds.join(', ')}`, { count: 'exact' });

      if (filters.store_id) {
        query = query.eq('store_link.store_id', filters.store_id);
      }
      if (storeScoped && filters.has_stock) {
        query = query
          .eq('stock_link.store_id', filters.store_id)
          .gt('stock_link.available_quantity', 0);
      }

      // Search on name or code
      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`
        );
      }

      // Category filter
      if (filters.category_id) {
        query = query.eq('category_id', filters.category_id);
      }

      // Item type filter
      if (filters.item_type) {
        query = query.eq('item_type', filters.item_type);
      }

      // Active filter
      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      // Distribution eligibility. Declared on ImsItemFilters since the warehouse
      // work but never actually applied, so the transfer pickers that pass these
      // were quietly offering bundles and non-distributable items.
      if (filters.is_distributable !== undefined) {
        query = query.eq('is_distributable', filters.is_distributable);
      }
      if (filters.is_bundle !== undefined) {
        query = query.eq('is_bundle', filters.is_bundle);
      }

      // On the counter or not. The whole reason this filter exists is finding the
      // items that are NOT at the POS — with 164 of 165 hidden, eyeballing nine
      // pages is not a search strategy.
      //
      // Under store scope this reads the STORE's flag. The item-level column is
      // only the default a new listing inherits; asking it "is this at the POS"
      // gets you an answer about a different store's counter.
      const posColumn = storeScoped
        ? 'store_link.is_sellable_to_students'
        : 'is_sellable_to_students';
      if (filters.pos_visibility === 'at_pos') {
        query = query.eq(posColumn, true);
      } else if (filters.pos_visibility === 'not_at_pos') {
        query = query.eq(posColumn, false);
      }

      // Institution always applies — it is the catalogue's real boundary and RLS
      // enforces it anyway. Under store scope the assortment join has already
      // narrowed things further.
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      // Pagination
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('name', { ascending: true });

      const { data, error, count } = await query;

      if (error) throw error;

      // Enrich items with stock data from ims_stock_summary
      let enrichedData = (data || []) as any[];
      if (enrichedData.length > 0) {
        const itemIds = enrichedData.map((i) => i.id);
        let stockQuery = this.supabase
          .from('ims_stock_summary')
          .select('item_id, current_quantity, available_quantity, opening_quantity')
          .in('item_id', itemIds);

        // Stock is genuinely per-store (ims_stock_summary is UNIQUE(item_id, store_id)),
        // so when a store is active we show ONLY that store's balance.
        if (filters.store_id) {
          stockQuery = stockQuery.eq('store_id', filters.store_id);
        } else if (filters.institution_id) {
          stockQuery = stockQuery.eq('institution_id', filters.institution_id);
        }

        const { data: stockData } = await stockQuery;
        // Without a store filter an item can return one row PER store, so a
        // plain Map would silently keep whichever row arrived last. Accumulate
        // instead: the institution-wide view is the sum across its stores.
        const stockMap = new Map<
          string,
          { current_quantity: number; available_quantity: number; opening_quantity: number }
        >();
        for (const s of stockData || []) {
          const prev = stockMap.get(s.item_id);
          stockMap.set(s.item_id, {
            current_quantity: (prev?.current_quantity ?? 0) + (s.current_quantity ?? 0),
            available_quantity: (prev?.available_quantity ?? 0) + (s.available_quantity ?? 0),
            opening_quantity: (prev?.opening_quantity ?? 0) + (s.opening_quantity ?? 0),
          });
        }
        enrichedData = enrichedData.map((item) => ({
          ...item,
          stock: stockMap.get(item.id) || null,
        }));
      }

      // ims_items -> ims_store_items is one-to-many, so PostgREST hands the embed
      // back as an ARRAY even though the store_id filter guarantees at most one
      // row (UNIQUE (store_id, item_id)). Flatten it, or every consumer has to
      // remember to write store_link[0]. stock_link only ever existed to narrow
      // the row set, so it goes.
      enrichedData = enrichedData.map(({ stock_link: _ignored, ...item }) => ({
        ...item,
        store_link: Array.isArray(item.store_link)
          ? (item.store_link[0] ?? null)
          : (item.store_link ?? null),
      }));

      return {
        data: enrichedData as ImsItemWithRelations[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      console.error('[ImsInventoryService] Error in getItems:', error);
      throw error;
    }
  }

  /**
   * Get a single item by ID with all unit relations.
   */
  static async getItem(id: string): Promise<ImsItemWithRelations> {
    try {
      const { data, error } = await this.supabase
        .from('ims_items')
        .select(
          `*,
           category:ims_item_categories(id,name,code),
           base_unit:ims_units!ims_items_base_unit_id_fkey(id,name,abbreviation),
           purchase_unit:ims_units!ims_items_purchase_unit_id_fkey(id,name,abbreviation),
           sale_unit:ims_units!ims_items_sale_unit_id_fkey(id,name,abbreviation),
           indent_unit:ims_units!ims_items_indent_unit_id_fkey(id,name,abbreviation)`
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return data as ImsItemWithRelations;
    } catch (error) {
      console.error('[ImsInventoryService] Error in getItem:', error);
      throw error;
    }
  }

  /**
   * Create a new inventory item, listed at the store that created it.
   */
  static async createItem(data: CreateImsItemDto): Promise<ImsItem> {
    try {
      const { data: item, error } = await this.supabase
        .from('ims_items')
        .insert(data)
        .select()
        .single();

      if (error) {
        // 23505 now has two sources: the code unique index, and the duplicate-item
        // trigger from 20260804140000. The trigger's message names the item that
        // already exists and says what to do about it, so it must not be replaced
        // by a guess about the code — especially now that codes are generated and
        // a code collision is nearly impossible.
        if (error.code === '23505') {
          throw new Error(error.message || 'This item already exists');
        }
        throw error;
      }

      // The ims_stock_summary trigger lists an item wherever stock lands, but a
      // brand-new item has no stock yet — so without this it would be invisible
      // in the very store that just created it. Its POS flag seeds the listing:
      // "sellable" was answered on the form, for this counter.
      if (data.store_id) {
        const { error: linkError } = await this.supabase
          .from('ims_store_items')
          .upsert(
            {
              store_id: data.store_id,
              item_id: (item as ImsItem).id,
              is_sellable_to_students: data.is_sellable_to_students ?? false,
            },
            { onConflict: 'store_id,item_id' }
          );

        // Do not fail the create over this — the item exists and the code is
        // taken, so a retry would collide on ims_items_institution_code_unique
        // and read as "already exists" to someone who just created it. Surface
        // it in the console; the item is recoverable via "Add to this store".
        if (linkError) {
          console.error('[ImsInventoryService] Item created but not listed at store:', linkError);
        }
      }

      return item as ImsItem;
    } catch (error) {
      console.error('[ImsInventoryService] Error in createItem:', error);
      throw error;
    }
  }

  /**
   * Update an existing inventory item.
   */
  static async updateItem(id: string, data: UpdateImsItemDto): Promise<ImsItem> {
    try {
      const { data: item, error } = await this.supabase
        .from('ims_items')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      // Renaming an item into one that already exists is the same mistake as
      // creating a duplicate, and the trigger says so in the same words.
      if (error) {
        if (error.code === '23505') {
          throw new Error(error.message || 'Another item with this name already exists');
        }
        throw error;
      }

      return item as ImsItem;
    } catch (error) {
      console.error('[ImsInventoryService] Error in updateItem:', error);
      throw error;
    }
  }

  /**
   * Put items on the counter, or take them off, in bulk.
   *
   * Goes through an API route rather than updating here, for two reasons the client
   * cannot cover: "select all N matching" has to re-run the filter server-side
   * (the browser holds only one page of ids), and the count interlock has to be
   * checked against the same predicates the update will use.
   */
  static async setPosVisibility(input: {
    action: 'add' | 'remove';
    institutionId: string;
    /** The counter being changed — the flag is per-store, not per-institution. */
    storeId: string;
    expectedCount: number;
    mode: 'ids' | 'filter';
    ids?: string[];
    filter?: {
      search?: string;
      category_id?: string;
      item_type?: string;
      is_active?: boolean;
      pos_visibility?: 'at_pos' | 'not_at_pos';
    };
  }): Promise<{ updated: number }> {
    const res = await fetch('/api/ims/inventory/pos-visibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const body = await res.json();
    if (!res.ok) {
      // 409 carries the two counts, which is the whole point of the interlock —
      // surface the server's message rather than a generic failure.
      throw new Error(body?.error || 'Could not update what appears at the POS');
    }
    return body as { updated: number };
  }

  /**
   * Delete an inventory item.
   *
   * Goes through ims_delete_item rather than DELETE-ing the row directly. A plain
   * delete on an item that had ever been stocked produced
   *
   *   update or delete on table "ims_items" violates foreign key constraint
   *   "ims_stock_summary_item_id_fkey" on table "ims_stock_summary"
   *
   * — fifteen tables reference ims_items, and the raw constraint name is not an
   * error message. The RPC sorts them into documents (refuse, and say which) and
   * the item's own ledger (clean up), all in one transaction.
   *
   * Returns what was discarded so the caller can report it.
   */
  static async deleteItem(
    id: string
  ): Promise<{ name: string; code: string; discarded_qty: number; discarded_batches: number }> {
    try {
      const { data, error } = await this.supabase.rpc('ims_delete_item', { p_item_id: id });

      // The RPC raises with a sentence meant for the person reading it, so pass
      // it straight through instead of wrapping it in something generic.
      if (error) throw new Error(error.message || 'Could not delete this item');

      return data as { name: string; code: string; discarded_qty: number; discarded_batches: number };
    } catch (error) {
      console.error('[ImsInventoryService] Error in deleteItem:', error);
      throw error;
    }
  }

  /**
   * Toggle item active/inactive status.
   */
  static async toggleItemActive(id: string, is_active: boolean): Promise<ImsItem> {
    try {
      const { data, error } = await this.supabase
        .from('ims_items')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data as ImsItem;
    } catch (error) {
      console.error('[ImsInventoryService] Error in toggleItemActive:', error);
      throw error;
    }
  }

  /**
   * List existing catalogue items at a store — the assortment, not the stock.
   *
   * Lets the warehouse seed an operating store's catalogue before shipping
   * anything, so a store can see and request an item it has never held.
   * Idempotent: re-adding an item leaves its POS flag alone.
   */
  static async addItemsToStore(storeId: string, itemIds: string[]): Promise<number> {
    if (itemIds.length === 0) return 0;
    try {
      const { data, error } = await this.supabase
        .from('ims_store_items')
        .upsert(
          itemIds.map((item_id) => ({ store_id: storeId, item_id })),
          { onConflict: 'store_id,item_id', ignoreDuplicates: true }
        )
        .select('id');

      if (error) throw error;
      return data?.length ?? 0;
    } catch (error) {
      console.error('[ImsInventoryService] Error in addItemsToStore:', error);
      throw error;
    }
  }

  /**
   * Delist items from a store.
   *
   * Refuses to delist anything the store still holds: a listing is what ties the
   * stock row to a visible catalogue entry, so removing it would strand the
   * quantity somewhere nobody can see or count it. Issue or transfer it out first.
   */
  static async removeItemsFromStore(storeId: string, itemIds: string[]): Promise<number> {
    if (itemIds.length === 0) return 0;
    try {
      const { data: stocked, error: stockError } = await this.supabase
        .from('ims_stock_summary')
        .select('item_id')
        .eq('store_id', storeId)
        .in('item_id', itemIds)
        .gt('current_quantity', 0);

      if (stockError) throw stockError;

      const blocked = new Set((stocked ?? []).map((s: any) => s.item_id));
      const removable = itemIds.filter((id) => !blocked.has(id));

      if (blocked.size > 0 && removable.length === 0) {
        throw new Error(
          'Cannot remove items this store still holds stock of. Issue or transfer the stock out first.'
        );
      }
      if (removable.length === 0) return 0;

      const { data, error } = await this.supabase
        .from('ims_store_items')
        .delete()
        .eq('store_id', storeId)
        .in('item_id', removable)
        .select('id');

      if (error) throw error;
      return data?.length ?? 0;
    } catch (error) {
      console.error('[ImsInventoryService] Error in removeItemsFromStore:', error);
      throw error;
    }
  }

  /**
   * Lightweight item list for dropdown selects.
   * Includes unit IDs and joined unit objects so the indent form can auto-populate
   * the unit field when the user picks an item (Teammate C dependency).
   */
  static async getItemsForSelect(
    storeId: string,
    institutionId?: string
  ): Promise<ImsItemForSelect[]> {
    try {
      let query = this.supabase
        .from('ims_items')
        .select(
          `id, name, code, gst_rate, hsn_code,
           indent_unit_id, base_unit_id,
           indent_unit:ims_units!ims_items_indent_unit_id_fkey(id, name, abbreviation),
           base_unit:ims_units!ims_items_base_unit_id_fkey(id, name, abbreviation)`
        )
        .eq('is_active', true)
        .order('name');

      // Deliberately NOT narrowed to the store's assortment, unlike getItems.
      // This feeds the indent form, and the whole point of an indent is asking
      // for something you do not have — an item you already carry is the one
      // case you do not need to request. storeId stays in the signature (every
      // caller passes it) as a fallback for when the institution is unresolved.
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      } else if (storeId) {
        query = query.eq('store_id', storeId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []) as ImsItemForSelect[];
    } catch (error) {
      console.error('[ImsInventoryService] Error in getItemsForSelect:', error);
      throw error;
    }
  }

  // Server-side methods (bulkImport, getImportTemplateData) live in
  // inventory-service.server.ts to avoid pulling next/headers into the client bundle.
}
