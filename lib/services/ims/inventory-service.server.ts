// lib/services/ims/inventory-service.server.ts
//
// SERVER-ONLY methods that use createServerSupabaseClient (next/headers).
// Import this file ONLY from API routes / Server Actions — never from hooks or
// client components, otherwise the build will fail with a next/headers error.

import { createHash } from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  buildUnitDisplay,
  resolveUnitId,
} from '@/lib/utils/ims-item-excel-mappings';
import type {
  ImsImportError,
  ImsImportResult,
  ParsedImportRow,
  ImsCategoryRow,
  ImsUnitRow,
  ImsDestinationStoreRow,
  ImsDistributionRow,
} from '@/lib/services/ims/inventory-service';

export class ImsInventoryServiceServer {
  /**
   * Fetch categories and units needed to build the Excel import template.
   * Server-side only — uses cookie-based Supabase client.
   */
  static async getImportTemplateData(
    institutionId: string | null,
    storeId?: string | null
  ): Promise<{
    categories: ImsCategoryRow[];
    units: ImsUnitRow[];
    destinationStores: ImsDestinationStoreRow[];
  }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await createServerSupabaseClient()) as any;

    // ims_item_categories has no institution_id column — it is a global lookup
    // table (RLS SELECT = open to all authenticated users, same as ims_units).
    // Do not scope by store_id or institution_id.
    const { data: categories, error: catError } = await supabase
      .from('ims_item_categories')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name');
    if (catError) {
      throw new Error(`Failed to fetch categories: ${catError.message}`);
    }

    const { data: units, error: unitError } = await supabase
      .from('ims_units')
      .select('id, name, abbreviation')
      .order('name');

    if (unitError) {
      throw new Error(`Failed to fetch units: ${unitError.message}`);
    }

    // Stores the warehouse may forward to, for the Distribution sheet's
    // dropdown. Generated per download from the institution's ACTUAL registered
    // stores, so a typed-in or renamed store cannot reach the importer. The
    // warehouse itself is excluded — it cannot send to itself, and
    // ims_create_push_transfer rejects that anyway.
    let destinationStores: ImsDestinationStoreRow[] = [];
    if (institutionId) {
      const { data: stores, error: storeError } = await supabase
        .from('ims_stores')
        .select('id, name, code, is_central_supply_store')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('name');

      if (storeError) {
        throw new Error(`Failed to fetch stores: ${storeError.message}`);
      }

      destinationStores = ((stores || []) as ImsDestinationStoreRow[]).filter(
        (s) => !s.is_central_supply_store && s.id !== storeId
      );
    }

    return {
      categories: (categories || []) as ImsCategoryRow[],
      units: (units || []) as ImsUnitRow[],
      destinationStores,
    };
  }

  /**
   * Bulk-import parsed & validated rows into ims_items (+ opening stock records).
   * Server-side only — uses cookie-based Supabase client.
   *
   * The caller (route handler) is responsible for:
   *   - Authenticating the user
   *   - Parsing the Excel file into rows
   *   - Zod-validating each row
   * This method handles:
   *   - FK resolution (category name → id, unit display → id)
   *   - Within-file duplicate detection
   *   - DB duplicate detection
   *   - Batch insert of items + opening stock/transaction/batch records
   */
  static async bulkImport(
    rows: ParsedImportRow[],
    storeId: string | null,
    institutionId: string | null,
    userId: string
  ): Promise<ImsImportResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await createServerSupabaseClient()) as any;

    const allErrors: ImsImportError[] = [];
    const totalRows = rows.length;

    // ── Validate storeId exists ───────────────────────────────────────────
    // A stale UUID from a different Supabase project causes a FK violation on
    // ims_items_store_id_fkey. Catch it here with a clear message instead of
    // letting Postgres surface an opaque constraint error.
    if (storeId) {
      const { data: storeCheck, error: storeCheckError } = await supabase
        .from('ims_stores')
        .select('id')
        .eq('id', storeId)
        .maybeSingle();

      if (storeCheckError || !storeCheck) {
        throw new Error(
          'The selected store could not be found. Please refresh the page and re-select your store before importing.'
        );
      }
    }

    // ── Fetch reference data ──────────────────────────────────────────────

    // ims_item_categories is a global lookup table with no institution_id column.
    // Fetch all active categories so imports are not blocked by store-scoping.
    const { data: categories, error: catError } = await supabase
      .from('ims_item_categories')
      .select('id, name')
      .eq('is_active', true);
    if (catError) {
      throw new Error(`Failed to load categories: ${catError.message}`);
    }

    const categoryByName = new Map<string, string>(
      (categories || []).map((c: any) => [c.name.toLowerCase(), c.id as string])
    );

    // Auto-create any category names from the import that don't exist yet.
    // Sanitise name → code (AUTO-<NAME>); upsert with ignoreDuplicates so
    // re-running the same import never creates duplicate categories.
    const missingCategoryNames = new Set<string>();
    for (const row of rows) {
      if (row.category_name && !categoryByName.has(row.category_name.toLowerCase())) {
        missingCategoryNames.add(row.category_name.trim());
      }
    }

    if (missingCategoryNames.size > 0) {
      const toCreate = Array.from(missingCategoryNames).map((name) => ({
        name,
        code: `AUTO-${name.toUpperCase().replace(/[^A-Z0-9]/g, '-').substring(0, 20)}`,
        is_active: true,
      }));

      await supabase
        .from('ims_item_categories')
        .upsert(toCreate, { onConflict: 'code', ignoreDuplicates: true });

      // Re-fetch by name to pick up IDs whether just created or already existing.
      const { data: freshCats } = await supabase
        .from('ims_item_categories')
        .select('id, name')
        .in('name', Array.from(missingCategoryNames))
        .eq('is_active', true);

      for (const c of (freshCats || []) as any[]) {
        categoryByName.set((c.name as string).toLowerCase(), c.id as string);
      }
    }

    const { data: units, error: unitError } = await supabase
      .from('ims_units')
      .select('id, name, abbreviation');

    if (unitError) {
      throw new Error(`Failed to load units: ${unitError.message}`);
    }

    const byDisplay = new Map<string, string>();
    const byAbbr = new Map<string, string>();
    const byName = new Map<string, string>();

    for (const u of (units || []) as any[]) {
      const display = buildUnitDisplay(u.name, u.abbreviation).toLowerCase();
      byDisplay.set(display, u.id);
      byAbbr.set(u.abbreviation.toLowerCase(), u.id);
      byName.set(u.name.toLowerCase(), u.id);
    }

    // ── Resolve FKs row-by-row ────────────────────────────────────────────

    interface ResolvedItem {
      code: string;
      name: string;
      description: string | null;
      category_id: string | null;
      item_type: string;
      base_unit_id: string | null;
      purchase_unit_id: string | null;
      sale_unit_id: string | null;
      indent_unit_id: string | null;
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
      company_name: string | null;
      opening_stock: number;
      batch_number: string | null;
      expiry_date: string | null;
      store_id: string | null;
      institution_id: string | null;
      created_by: string;
    }

    const validItems: ResolvedItem[] = [];

    rows.forEach((d, idx) => {
      const rowNumber = idx + 2;

      let categoryId: string | null = null;
      if (d.category_name) {
        const resolved = categoryByName.get(d.category_name.toLowerCase());
        // Category was auto-created above if missing; null here means creation
        // failed (e.g. RLS blocked it) — set category_id to null and continue.
        categoryId = resolved ?? null;
      }

      let baseUnitId: string | null = null;
      if (d.base_unit_raw) {
        const resolved = resolveUnitId(d.base_unit_raw, byDisplay, byAbbr, byName);
        if (resolved === undefined) {
          allErrors.push({
            row: rowNumber,
            field: 'Base Unit',
            message: `Row ${rowNumber}: Base Unit — "${d.base_unit_raw}" not found — use the dropdown from the template`,
          });
          return;
        }
        baseUnitId = resolved;
      }

      const purchaseUnitId = d.purchase_unit_raw
        ? resolveUnitId(d.purchase_unit_raw, byDisplay, byAbbr, byName) ?? null
        : null;
      const saleUnitId = d.sale_unit_raw
        ? resolveUnitId(d.sale_unit_raw, byDisplay, byAbbr, byName) ?? null
        : null;
      const indentUnitId = d.indent_unit_raw
        ? resolveUnitId(d.indent_unit_raw, byDisplay, byAbbr, byName) ?? null
        : null;

      validItems.push({
        // NULL — not undefined — when the sheet's Code cell is blank. PostgREST
        // builds a bulk INSERT's column list from the keys and rejects the batch
        // with PGRST102 if they differ between rows, so a sheet mixing filled and
        // blank codes must still send the key on every row. NULL is what the
        // ims_items_autofill_code trigger looks for; NOT NULL is checked after
        // BEFORE triggers run, so the row is complete by the time it matters.
        code: d.code ? d.code.toUpperCase() : null,
        name: d.name,
        description: d.description,
        category_id: categoryId,
        item_type: d.item_type,
        base_unit_id: baseUnitId,
        purchase_unit_id: purchaseUnitId,
        sale_unit_id: saleUnitId,
        indent_unit_id: indentUnitId,
        hsn_code: d.hsn_code,
        gst_rate: d.gst_rate,
        cost_price: d.cost_price,
        mrp: d.mrp,
        selling_price: d.selling_price,
        reorder_level: d.reorder_level,
        max_stock_level: d.max_stock_level,
        track_batch: d.track_batch,
        track_expiry: d.track_expiry,
        is_sellable_to_students: d.is_sellable_to_students,
        is_active: d.is_active,
        company_name: d.company_name ?? null,
        opening_stock: d.opening_stock ?? 0,
        batch_number: d.batch_number ?? null,
        expiry_date: d.expiry_date ?? null,
        store_id: storeId,
        institution_id: institutionId,
        created_by: userId,
      });
    });

    if (validItems.length === 0) {
      return {
        success: false,
        successCount: 0,
        errorCount: allErrors.length,
        totalRows,
        errors: allErrors,
      };
    }

    // ── Duplicate detection within file ─────────────────────────────────────
    const seenCodes = new Map<string, number>();
    const duplicateCodes: string[] = [];

    const deduped = validItems.filter((item, idx) => {
      // A blank code is a request for a generated one, not a value — twenty blank
      // rows are twenty new items, not nineteen duplicates of the first.
      if (!item.code) return true;
      const key = item.code.toLowerCase();
      if (seenCodes.has(key)) {
        const firstRow = seenCodes.get(key)! + 2;
        allErrors.push({
          row: idx + 2,
          field: 'code',
          message: `Row ${idx + 2}: Code "${item.code}" duplicated in this file (first seen row ${firstRow})`,
        });
        duplicateCodes.push(item.code);
        return false;
      }
      seenCodes.set(key, idx);
      return true;
    });

    // ── Duplicate detection against DB ──────────────────────────────────────
    // Codes are unique per institution (constraint: ims_items_institution_code_unique).
    // Filter the pre-flight check by institution so we match the constraint scope —
    // otherwise the check passes but the INSERT collides with rows from another store.
    const codesToCheck = deduped
      .filter((i) => !!i.code)
      .map((i) => i.code!.toUpperCase());

    let dbDupQuery = supabase
      .from('ims_items')
      .select('code')
      .in('code', codesToCheck);

    if (institutionId) dbDupQuery = dbDupQuery.eq('institution_id', institutionId);

    const { data: existingItems, error: dupError } = await dbDupQuery;

    if (dupError) {
      console.error('[ImsInventoryServiceServer] bulkImport duplicate check:', dupError);
    }

    const existingCodes = new Set<string>(
      (existingItems || []).map((i: any) => (i.code as string).toUpperCase())
    );

    const itemsToInsert = deduped.filter((item, idx) => {
      if (!item.code) return true;
      if (existingCodes.has(item.code.toUpperCase())) {
        allErrors.push({
          row: idx + 2,
          field: 'code',
          message: `Row ${idx + 2}: Code "${item.code}" already exists in this institution`,
        });
        duplicateCodes.push(item.code);
        return false;
      }
      return true;
    });

    if (itemsToInsert.length === 0) {
      return {
        success: false,
        successCount: 0,
        errorCount: allErrors.length,
        totalRows,
        errors: allErrors,
        duplicateCodes: [...new Set(duplicateCodes)],
      };
    }

    // ── Insert items ────────────────────────────────────────────────────────
    const itemDbRecords = itemsToInsert.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ opening_stock, batch_number, expiry_date, ...item }) => item
    );

    const { data: inserted, error: insertError } = await supabase
      .from('ims_items')
      .insert(itemDbRecords)
      .select('id');

    if (insertError) {
      console.error('[ImsInventoryServiceServer] bulkImport insert error:', insertError);

      // Postgres 23505 = unique_violation. Extract the offending code so the
      // user sees which row to fix instead of the opaque "Row 0" message.
      if ((insertError as any).code === '23505') {
        const detail = (insertError as any).details || insertError.message || '';
        const codeMatch = detail.match(/=\([^,]*,\s*([^)]+)\)/);
        const offending = codeMatch?.[1]?.trim();
        if (offending) {
          const offenderRow = itemsToInsert.findIndex(
            (it) => it.code.toUpperCase() === offending.toUpperCase()
          );
          allErrors.push({
            row: offenderRow >= 0 ? offenderRow + 2 : 0,
            field: 'code',
            message: offenderRow >= 0
              ? `Row ${offenderRow + 2}: Code "${offending}" already exists in this institution`
              : `Code "${offending}" already exists in this institution`,
          });
          return {
            success: false,
            successCount: 0,
            errorCount: allErrors.length,
            totalRows,
            errors: allErrors,
            duplicateCodes: [...new Set([...duplicateCodes, offending])],
          };
        }
      }

      throw new Error(`Failed to insert items: ${insertError.message}`);
    }

    // ── Opening stock (non-fatal) ───────────────────────────────────────────
    const insertedCodeMap = new Map<string, string>(
      (inserted || []).map((ins: any, idx: number) => [
        itemsToInsert[idx].code.toUpperCase(),
        ins.id as string,
      ])
    );

    // ── List them at the importing store (non-fatal) ────────────────────────
    // The ims_stock_summary trigger would cover the rows with opening stock, but
    // it defaults the POS flag to false and never fires at all for the ones
    // imported at zero. Both matter: the sheet has a "sellable" column, and an
    // item imported with no stock still has to be visible so it can be received.
    if (storeId) {
      try {
        const links = itemsToInsert
          .map((item) => ({
            store_id: storeId,
            item_id: insertedCodeMap.get(item.code.toUpperCase()),
            is_sellable_to_students: item.is_sellable_to_students ?? false,
          }))
          .filter((l) => !!l.item_id);

        if (links.length > 0) {
          const { error: linkError } = await supabase
            .from('ims_store_items')
            .upsert(links, { onConflict: 'store_id,item_id' });
          if (linkError) {
            console.warn('[ImsInventoryServiceServer] bulkImport store listing failed:', linkError.message);
          }
        }
      } catch (e) {
        console.warn('[ImsInventoryServiceServer] bulkImport store listing threw:', e);
      }
    }

    const stockItems = itemsToInsert.filter((item) => item.opening_stock > 0);

    if (stockItems.length > 0) {
      const now = new Date().toISOString();

      try {
        const summaries = stockItems.map((item) => ({
          item_id: insertedCodeMap.get(item.code.toUpperCase()),
          opening_quantity: item.opening_stock,
          current_quantity: item.opening_stock,
          reserved_quantity: 0,
          available_quantity: item.opening_stock,
          total_value: item.opening_stock * item.cost_price,
          institution_id: institutionId,
          updated_at: now,
          ...(storeId ? { store_id: storeId } : {}),
        }));
        const { error: summaryError } = await supabase
          .from('ims_stock_summary')
          .insert(summaries);
        if (summaryError) {
          console.warn('[ImsInventoryServiceServer] bulkImport stock summary insert failed:', summaryError.message);
        }
      } catch (e) {
        console.warn('[ImsInventoryServiceServer] bulkImport stock summary insert threw:', e);
      }

      try {
        const transactions = stockItems.map((item) => ({
          transaction_type: 'adjustment',
          reference_id: null,
          reference_type: 'adjustment',
          amount: item.opening_stock * item.cost_price,
          description: `Opening stock import — ${item.name} (${item.code})`,
          item_id: insertedCodeMap.get(item.code.toUpperCase()),
          quantity: item.opening_stock,
          batch_number: item.batch_number || null,
          expiry_date: item.expiry_date || null,
          created_by: userId,
          institution_id: institutionId,
          ...(storeId ? { store_id: storeId } : {}),
        }));
        const { error: txError } = await supabase
          .from('ims_financial_transactions')
          .insert(transactions);
        if (txError) {
          console.warn('[ImsInventoryServiceServer] bulkImport financial transactions insert failed:', txError.message);
        }
      } catch (e) {
        console.warn('[ImsInventoryServiceServer] bulkImport financial transactions insert threw:', e);
      }

      const batchItems = stockItems.filter((item) => item.batch_number);
      if (batchItems.length > 0) {
        try {
          // Local date, NOT UTC. entry_date is a sort key for FEFO, and
          // toISOString() is UTC: for an IST user importing between midnight and
          // 05:30 the UTC date is still yesterday, so the batch sorts ahead of
          // stock that genuinely arrived earlier. en-CA renders as YYYY-MM-DD.
          const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
          const batches = batchItems.map((item) => ({
            item_id: insertedCodeMap.get(item.code.toUpperCase()),
            batch_number: item.batch_number,
            expiry_date: item.expiry_date || null,
            quantity: item.opening_stock,
            // quantity_available and entry_date are NOT NULL with no default
            // (20260519120000_add_batch_tracking_columns_to_ims_stock_batches.sql).
            // Omitting them raised 23502 on every import, and because the error was
            // only console.warn'd the UI still reported "Import Complete" with zero
            // batch rows. See ImsStockService.addBatch for the reference payload.
            quantity_available: item.opening_stock,
            entry_date: todayIso,
            cost_price: item.cost_price,
            total_value: item.opening_stock * item.cost_price,
            grn_id: null,
            location_type: 'central_store',
            department_id: null,
            institution_id: institutionId,
            ...(storeId ? { store_id: storeId } : {}),
          }));
          const { error: batchError } = await supabase
            .from('ims_stock_batches')
            .insert(batches);
          if (batchError) {
            // Surface it. A silent batch failure leaves stock totals looking right
            // while batch/expiry tracking is empty — the worst possible outcome.
            console.error('[ImsInventoryServiceServer] bulkImport stock batches insert failed:', batchError.message);
            allErrors.push({
              row: 0,
              field: 'batch_number',
              message: `Items were imported, but batch/expiry rows could not be created: ${batchError.message}`,
            });
          }
        } catch (e) {
          console.error('[ImsInventoryServiceServer] bulkImport stock batches insert threw:', e);
          allErrors.push({
            row: 0,
            field: 'batch_number',
            message: `Items were imported, but batch/expiry rows could not be created: ${
              e instanceof Error ? e.message : String(e)
            }`,
          });
        }
      }
    }

    const successCount = inserted?.length ?? 0;

    return {
      success: successCount > 0,
      successCount,
      errorCount: allErrors.length,
      totalRows,
      errors: allErrors,
      duplicateCodes: duplicateCodes.length > 0 ? [...new Set(duplicateCodes)] : undefined,
    };
  }

  /**
   * Replay the import file's optional "Distribution" sheet: forward part of what
   * was just loaded into the warehouse on to the institution's operating stores.
   *
   * Runs AFTER bulkImport so a row can distribute stock the same upload just
   * created via Opening Stock.
   *
   * This does NOT re-implement transfers. It resolves the sheet's text into ids
   * and then calls ims_create_push_transfer — the same RPC the "Send to Store"
   * button uses — once per destination store. So every file-driven distribution
   * produces an ordinary approved request + dispatched shipment, with FEFO batch
   * allocation, an ims_stock_movements audit row, and a receipt confirmation at
   * the far end. One transfer per store, not one per line, so the destination
   * confirms a single shipment rather than fifty.
   */
  static async distributeFromWarehouse(
    rows: ImsDistributionRow[],
    warehouseStoreId: string,
    institutionId: string | null,
    userId: string
  ): Promise<{ errors: ImsImportError[]; dispatched: number; storesServed: number; skipped: number }> {
    const errors: ImsImportError[] = [];
    if (rows.length === 0) return { errors, dispatched: 0, storesServed: 0, skipped: 0 };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await createServerSupabaseClient()) as any;

    // ── Resolve stores ────────────────────────────────────────────────────────
    const { data: stores, error: storeErr } = await supabase
      .from('ims_stores')
      .select('id, name, code, is_central_supply_store')
      .eq('institution_id', institutionId)
      .eq('is_active', true);

    if (storeErr) {
      errors.push({ row: 0, field: 'store', message: `Could not read stores: ${storeErr.message}` });
      return { errors, dispatched: 0, storesServed: 0, skipped: 0 };
    }

    // Match on the code inside "Name (CODE)", falling back to a plain name or
    // code so a hand-typed value still resolves when it is unambiguous.
    const byCode = new Map<string, ImsDestinationStoreRow>();
    const byName = new Map<string, ImsDestinationStoreRow>();
    for (const s of (stores || []) as ImsDestinationStoreRow[]) {
      byCode.set(s.code.trim().toLowerCase(), s);
      byName.set(s.name.trim().toLowerCase(), s);
    }

    const resolveStore = (raw: string): ImsDestinationStoreRow | null => {
      const text = raw.trim();
      const bracketed = text.match(/\(([^)]*)\)\s*$/);
      if (bracketed) {
        const hit = byCode.get(bracketed[1].trim().toLowerCase());
        if (hit) return hit;
      }
      return byCode.get(text.toLowerCase()) ?? byName.get(text.toLowerCase()) ?? null;
    };

    // ── Resolve item codes (institution-wide: the catalog is shared) ──────────
    const { data: items, error: itemErr } = await supabase
      .from('ims_items')
      .select('id, code')
      .eq('institution_id', institutionId);

    if (itemErr) {
      errors.push({ row: 0, field: 'item_code', message: `Could not read items: ${itemErr.message}` });
      return { errors, dispatched: 0, storesServed: 0, skipped: 0 };
    }

    const itemByCode = new Map<string, string>();
    for (const it of (items || []) as { id: string; code: string }[]) {
      itemByCode.set(it.code.trim().toLowerCase(), it.id);
    }

    // ── Validate and group by destination store ──────────────────────────────
    const grouped = new Map<string, { store: ImsDestinationStoreRow; lines: Map<string, number> }>();

    for (const row of rows) {
      const store = resolveStore(row.store_label);
      if (!store) {
        errors.push({
          row: row.row_number,
          field: 'store',
          message: `Row ${row.row_number}: "${row.store_label}" is not a store in this institution. Pick one from the dropdown.`,
        });
        continue;
      }

      if (store.is_central_supply_store || store.id === warehouseStoreId) {
        errors.push({
          row: row.row_number,
          field: 'store',
          message: `Row ${row.row_number}: "${store.name}" is the warehouse — it is where stock comes FROM, so it cannot also be the destination.`,
        });
        continue;
      }

      const itemId = itemByCode.get(row.item_code.trim().toLowerCase());
      if (!itemId) {
        errors.push({
          row: row.row_number,
          field: 'item_code',
          message: `Row ${row.row_number}: item code "${row.item_code}" is not on the Items sheet and does not already exist.`,
        });
        continue;
      }

      if (!(row.quantity > 0)) {
        errors.push({
          row: row.row_number,
          field: 'quantity',
          message: `Row ${row.row_number}: quantity must be greater than 0.`,
        });
        continue;
      }

      const bucket = grouped.get(store.id) ?? { store, lines: new Map<string, number>() };
      // Same item listed twice for one store: add them up rather than sending
      // two shipments or silently dropping one.
      bucket.lines.set(itemId, (bucket.lines.get(itemId) ?? 0) + row.quantity);
      grouped.set(store.id, bucket);
    }

    // ── Dispatch: one push transfer per destination store ────────────────────
    //
    // Re-uploading a file must not send the stock twice. There is no natural
    // idempotency key, so derive one from the content that defines the transfer
    // — warehouse, destination and the exact item/quantity set — and stamp it
    // into the request's purpose. A repeat upload produces the same key and is
    // skipped. The window is bounded to 24h because distributing the same
    // quantities to the same store on a LATER day is a legitimate restock, not
    // a duplicate; within one day it is almost always a double submit or a retry
    // after one store in the file failed.
    let dispatched = 0;
    let storesServed = 0;
    let skipped = 0;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    for (const [destStoreId, bucket] of grouped) {
      const lines = [...bucket.lines.entries()].map(([item_id, quantity]) => ({ item_id, quantity }));

      const key = createHash('sha256')
        .update(
          [
            warehouseStoreId,
            destStoreId,
            ...lines.map((l) => `${l.item_id}:${l.quantity}`).sort(),
          ].join('|')
        )
        .digest('hex')
        .slice(0, 12);

      // Columns are INVERTED on ims_indent_requests: source_store_id is the
      // RECEIVER and destination_store_id is the SUPPLYING warehouse.
      const { data: priorPush, error: priorErr } = await supabase
        .from('ims_indent_requests')
        .select('indent_number')
        .eq('initiation_mode', 'push')
        .eq('destination_store_id', warehouseStoreId)
        .eq('source_store_id', destStoreId)
        .like('purpose', `%[${key}]%`)
        .gte('created_at', since)
        .limit(1);

      // A failed lookup must not silently disable the guard, but it also must
      // not block a legitimate distribution — dispatch and say what happened.
      if (priorErr) {
        errors.push({
          row: 0,
          field: 'store',
          message: `Could not check whether ${bucket.store.name} was already sent this exact list (${priorErr.message}). Sending anyway — check ${bucket.store.name} for a duplicate transfer.`,
        });
      } else if (priorPush && priorPush.length > 0) {
        skipped += 1;
        errors.push({
          row: 0,
          field: 'store',
          message: `Skipped ${bucket.store.name}: this exact list was already sent there in the last 24 hours as ${priorPush[0].indent_number}. Re-uploading does not send it again. If you really want to send more, change the quantities or wait 24 hours.`,
        });
        continue;
      }

      const { error: pushErr } = await supabase.rpc('ims_create_push_transfer', {
        p_warehouse_store_id: warehouseStoreId,
        p_dest_store_id: destStoreId,
        p_actor: userId,
        p_purpose: `Distributed from inventory upload [${key}]`,
        p_lines: lines,
        p_dispatch_now: true,
      });

      if (pushErr) {
        // The RPC is transactional per store, so a failure here leaves THAT
        // store's stock untouched. Other stores already sent are unaffected.
        errors.push({
          row: 0,
          field: 'store',
          message: `Could not send to ${bucket.store.name}: ${pushErr.message}. The other stores in this file were unaffected; fix and re-upload only the "${bucket.store.code}" rows.`,
        });
        continue;
      }

      dispatched += lines.length;
      storesServed += 1;
    }

    return { errors, dispatched, storesServed, skipped };
  }

  /**
   * Update selling price, MRP and POS sellability on items that ALREADY EXIST.
   *
   * Why this exists rather than reusing bulkImport(): bulkImport is insert-only —
   * it treats any code already present in the institution as a duplicate and
   * rejects the row (see the pre-flight check above). So it cannot be used to fill
   * in prices for a catalogue that has already been loaded, which is exactly the
   * situation JKKN Pharmacy was in: 761 items, every one with selling_price = 0,
   * mrp = 0 and is_sellable_to_students = false, which left the POS grid empty and
   * every bill at zero.
   *
   * Deliberately narrow. It touches ONLY selling_price, mrp and
   * is_sellable_to_students. A general-purpose upsert would let a price sheet
   * silently overwrite names, units, categories or GST rates — too much blast
   * radius for a file someone assembled in a hurry.
   *
   * Matching is on UPPER(code) within institution_id, mirroring the
   * ims_items_institution_code_unique constraint scope.
   */
  static async bulkUpdatePrices(
    rows: Array<{
      row_number: number;
      code: string;
      selling_price: number | null;
      mrp: number | null;
      is_sellable: boolean | null;
    }>,
    institutionId: string
  ): Promise<ImsImportResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await createServerSupabaseClient()) as any;

    const errors: ImsImportError[] = [];
    const totalRows = rows.length;

    if (!institutionId) {
      return {
        success: false,
        successCount: 0,
        errorCount: 1,
        totalRows,
        errors: [{ row: 0, field: 'institution', message: 'An institution is required' }],
      };
    }

    // ── Row-level validation ────────────────────────────────────────────────
    const valid: typeof rows = [];
    const seen = new Map<string, number>();

    for (const r of rows) {
      const code = r.code.trim().toUpperCase();

      if (!code) {
        errors.push({ row: r.row_number, field: 'code', message: 'Code is required' });
        continue;
      }

      if (seen.has(code)) {
        errors.push({
          row: r.row_number,
          field: 'code',
          message: `Code "${code}" duplicated in this file (first seen row ${seen.get(code)})`,
        });
        continue;
      }

      if (r.selling_price !== null && (!Number.isFinite(r.selling_price) || r.selling_price < 0)) {
        errors.push({
          row: r.row_number,
          field: 'selling_price',
          message: 'Selling Price must be a number >= 0',
        });
        continue;
      }

      if (r.mrp !== null && (!Number.isFinite(r.mrp) || r.mrp < 0)) {
        errors.push({ row: r.row_number, field: 'mrp', message: 'MRP must be a number >= 0' });
        continue;
      }

      // The whole point of this import is to stop items reaching the POS at zero.
      // An item flagged sellable with no price would bill at 0.00, so refuse it
      // here rather than let it through and be discovered at the counter.
      if (r.is_sellable === true && !(r.selling_price && r.selling_price > 0)) {
        errors.push({
          row: r.row_number,
          field: 'selling_price',
          message: 'Sellable items need a Selling Price greater than 0',
        });
        continue;
      }

      // Priced above MRP is a pricing mistake, not a rounding artefact.
      if (
        r.selling_price !== null &&
        r.mrp !== null &&
        r.mrp > 0 &&
        r.selling_price > r.mrp
      ) {
        errors.push({
          row: r.row_number,
          field: 'selling_price',
          message: `Selling Price (${r.selling_price}) is above MRP (${r.mrp})`,
        });
        continue;
      }

      seen.set(code, r.row_number);
      valid.push({ ...r, code });
    }

    if (valid.length === 0) {
      return {
        success: false,
        successCount: 0,
        errorCount: errors.length,
        totalRows,
        errors,
      };
    }

    // ── Resolve codes to ids, so an unknown code is reported per row rather
    //    than silently matching nothing ──────────────────────────────────────
    const { data: existing, error: lookupError } = await supabase
      .from('ims_items')
      .select('id, code, cost_price')
      .eq('institution_id', institutionId)
      .in('code', valid.map((v) => v.code));

    if (lookupError) {
      console.error('[ImsInventoryServiceServer] bulkUpdatePrices lookup:', lookupError);
      return {
        success: false,
        successCount: 0,
        errorCount: errors.length + 1,
        totalRows,
        errors: [...errors, { row: 0, field: 'code', message: lookupError.message }],
      };
    }

    const byCode = new Map<string, { id: string; cost_price: number | null }>(
      // Codes are stored upper-case by bulkImport, but normalise anyway so a
      // legacy lower-case row still matches.
      (existing || []).map((e: any) => [
        (e.code as string).toUpperCase(),
        { id: e.id, cost_price: e.cost_price },
      ])
    );

    let successCount = 0;

    for (const r of valid) {
      const match = byCode.get(r.code);

      if (!match) {
        errors.push({
          row: r.row_number,
          field: 'code',
          message: `Code "${r.code}" does not exist in this institution — add the item first`,
        });
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = { updated_at: new Date().toISOString() };
      if (r.selling_price !== null) patch.selling_price = r.selling_price;
      if (r.mrp !== null) patch.mrp = r.mrp;
      if (r.is_sellable !== null) patch.is_sellable_to_students = r.is_sellable;

      const { error: updateError } = await supabase
        .from('ims_items')
        .update(patch)
        .eq('id', match.id)
        .eq('institution_id', institutionId);

      if (updateError) {
        errors.push({
          row: r.row_number,
          field: 'code',
          message: `Update failed for "${r.code}": ${updateError.message}`,
        });
        continue;
      }

      successCount += 1;
    }

    return {
      success: successCount > 0,
      successCount,
      errorCount: errors.length,
      totalRows,
      errors,
    };
  }
}
