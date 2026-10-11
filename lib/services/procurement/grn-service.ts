// lib/services/procurement/grn-service.ts
//
// Goods Receipt Note service (PRD steps 8-14). A GRN is raised against a Purchase
// Order; each line reconciles ordered / invoiced / received quantities via the pure
// three-way-match engine. On VERIFY the accepted quantity of every line is posted
// into the domain's inventory through the registered adapter (the Phase 0 seam),
// the PO line's received_quantity advances, and the PO auto-closes once fully
// received. Chemical lines cannot be verified without batch + expiry.
//
// Numbering uses procurement_next_number (doc_type 'GRN'). Status transitions are
// guarded with .eq('status', from) for concurrency safety, mirroring the PO service.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { istBusinessDate } from '@/lib/utils/date-format';
import { getAdapter } from './domain-adapters/registry';
import { matchLine, validateLineForVerify } from './three-way-match';
import {
  BLANK_INVOICE_MESSAGE,
  blankInvoiceBlocksStock,
  REPLACEMENT_NOT_OPEN_MESSAGE,
  REPLACEMENT_ORIGIN_VERIFY_MESSAGE,
  REPLACEMENT_SCHEMA_MISSING_MESSAGE,
  REPLACEMENT_SELF_CHECK_MESSAGE,
  REPLACEMENT_SHAPE_MESSAGE,
  replacementShapeBlocks,
  SELF_CHECK_MESSAGE,
  selfCheckBlocks,
  duplicateHold,
  expiredLineBlocks,
  findDuplicateGrns,
  GRN_STUCK_POSTED_MESSAGE,
  INVOICE_NUMBER_FORMAT_MESSAGE,
  invoiceNumberFormatOk,
  invoiceAgeCheck,
  isIsoDate,
  lateReasonMissing,
  POSTED_GRN_STATUSES,
  receivedMatchingDelivery,
  THIRD_PERSON_MESSAGE,
  CONFIRMATION_VOID_MESSAGE,
  DUPLICATE_CHECKS_MISSING_MESSAGE,
  NO_RECEIVER_MESSAGE,
  LINES_CHANGED_MESSAGE,
  linesChangedSinceCheck,
  type DuplicateCandidate,
} from './invoice-checks';
import {
  PO_PURCHASE_REQUEST_EMBED,
  rfqIdsForRequestSearch,
  sanitizeOrSearch,
  withPurchaseRequest,
} from './purchase-order-service';
import type { ProcurementDomain, DomainCtx } from './domain-adapters/types';
import type {
  ProcurementGrn,
  GrnWithItems,
  ProcurementGrnItem,
  ProcurementGrnReplacement,
  ReceiveReplacementInput,
  CreateGrnInput,
  GrnExpectations,
  GrnFilters,
} from '@/types/procurement';

/** Lifts purchase_order.rfq.source_request up to `purchase_request` (the "Purchase no."). */
function withGrnPurchaseRequest(row: any) {
  if (!row?.purchase_order) return { ...row, purchase_request: null };
  const { purchase_request, ...purchase_order } = withPurchaseRequest(row.purchase_order);
  return { ...row, purchase_order, purchase_request };
}

/** An earlier receipt shown side by side when an invoice number repeats (I1). */
export interface SupplierInvoiceGrn extends DuplicateCandidate {
  grn_number: string;
  invoice_date: string | null;
  invoice_amount: number | null;
  created_at: string;
  received_by_profile?: { full_name: string | null } | null;
}

export class ProcurementGrnService {
  private static get supabase() {
    // procurement_* + ims_* tables are not in the generated Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  static async getGrns(filters: GrnFilters = {}): Promise<{
    data: ProcurementGrn[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      let query = this.supabase
        .from('procurement_grn')
        .select(
          `*,
           supplier:ims_suppliers(id,name,code,gstin),
           purchase_order:procurement_purchase_orders(id,po_number,${PO_PURCHASE_REQUEST_EMBED}),
           received_by_profile:profiles!received_by(full_name),
           verified_by_profile:profiles!verified_by(full_name),
           items:procurement_grn_items(count)`,
          { count: 'exact' }
        );

      if (filters.search) {
        // Match the GRN number, the order's PO number or the purchase (request)
        // number — the latter two resolved to PO ids first (see rfqIdsForRequestSearch).
        const term = sanitizeOrSearch(filters.search);
        const rfqIds = await rfqIdsForRequestSearch(term);
        const { data: pos, error: poErr } = await this.supabase
          .from('procurement_purchase_orders')
          .select('id')
          .or(
            rfqIds.length
              ? `po_number.ilike.%${term}%,rfq_id.in.(${rfqIds.join(',')})`
              : `po_number.ilike.%${term}%`
          )
          .limit(200);
        if (poErr) throw poErr;
        const poIds = (pos || []).map((r: { id: string }) => r.id);
        query = query.or(
          poIds.length
            ? `grn_number.ilike.%${term}%,purchase_order_id.in.(${poIds.join(',')})`
            : `grn_number.ilike.%${term}%`
        );
      }
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.purchase_order_id) query = query.eq('purchase_order_id', filters.purchase_order_id);
      if (filters.supplier_id) query = query.eq('supplier_id', filters.supplier_id);
      if (filters.store_id) query = query.eq('store_id', filters.store_id);
      else if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);

      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const from = (page - 1) * limit;
      query = query.range(from, from + limit - 1).order('created_at', { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;

      const rows = (data || []).map((r: any) => ({
        ...withGrnPurchaseRequest(r),
        item_count: Array.isArray(r.items) ? r.items[0]?.count ?? 0 : 0,
      }));

      return {
        data: rows as ProcurementGrn[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      console.error('[ProcurementGrnService] getGrns:', error);
      throw error;
    }
  }

  static async getGrn(id: string): Promise<GrnWithItems> {
    try {
      const { data: header, error: headerErr } = await this.supabase
        .from('procurement_grn')
        .select(
          `*,
           supplier:ims_suppliers(id,name,code,gstin),
           purchase_order:procurement_purchase_orders(id,po_number,${PO_PURCHASE_REQUEST_EMBED}),
           received_by_profile:profiles!received_by(full_name),
           verified_by_profile:profiles!verified_by(full_name)`
        )
        .eq('id', id)
        .single();
      if (headerErr) throw headerErr;

      const { data: items, error: itemsErr } = await this.supabase
        .from('procurement_grn_items')
        .select('*')
        .eq('grn_id', id)
        .order('created_at', { ascending: true });
      if (itemsErr) throw itemsErr;

      return { ...withGrnPurchaseRequest(header), items: items || [] } as GrnWithItems;
    } catch (error) {
      console.error('[ProcurementGrnService] getGrn:', error);
      throw error;
    }
  }

  /**
   * Create a GRN against a PO. Seeds one grn_item per submitted line from the PO
   * line snapshot, resolves is_chemical + cost_price from the domain catalog, and
   * classifies each line with the three-way-match engine. Header lands in
   * 'pending_verification'; nothing is posted to inventory until verifyGrn().
   */
  static async createGrnAgainstPO(input: CreateGrnInput, userId: string): Promise<ProcurementGrn> {
    try {
      if (!input.lines?.length) throw new Error('A delivery record needs at least one line.');
      // Supplier invoice is mandatory — a GRN records goods received against a billed
      // invoice, and the three-way match has nothing to compare against without it.
      const invoiceNumber = input.invoice_number?.trim() ?? '';
      if (!invoiceNumber) {
        throw new Error('Invoice number is required to record a delivery.');
      }
      // D3 (Director 2026-10-10): letters, digits, "-" and "/" only. The database's
      // procurement_grn_invoice_number_charset CHECK refuses anything else too.
      if (!invoiceNumberFormatOk(invoiceNumber)) {
        throw new Error(INVOICE_NUMBER_FORMAT_MESSAGE);
      }
      if (!input.invoice_date) {
        throw new Error('Invoice date is required to record a delivery.');
      }
      // A non-ISO date would silently switch off I4 (and I2 for line dates) — the rules
      // treat an unreadable date as "nothing to judge" — so it is refused here.
      if (!isIsoDate(input.invoice_date)) {
        throw new Error(`Invoice date "${input.invoice_date}" is not a valid date — re-enter it.`);
      }

      // 1) Load PO header + lines (ordered qty and remaining-to-receive per line).
      const { data: po, error: poErr } = await this.supabase
        .from('procurement_purchase_orders')
        .select('*')
        .eq('id', input.purchase_order_id)
        .single();
      if (poErr) throw poErr;
      if (!['sent', 'approved', 'partially_received'].includes(po.status)) {
        throw new Error(`Order ${po.po_number} is "${po.status}" — receive only sent/approved orders.`);
      }

      const { data: poItems, error: piErr } = await this.supabase
        .from('procurement_purchase_order_items')
        .select('*')
        .eq('po_id', po.id);
      if (piErr) throw piErr;
      const poItemMap = new Map<string, any>((poItems || []).map((r: any) => [r.id, r]));

      const domain = (po.domain ?? 'ims') as ProcurementDomain;
      const ctx: DomainCtx = { institutionId: po.institution_id, storeId: po.store_id, userId };
      const adapter = getAdapter(domain);

      // The receiver's declared expectations. Re-applied here rather than trusted from the
      // client's preview, so the verdict we STORE is the verdict computed under the same bar
      // the receiver was shown — and so the batch/expiry gate cannot be bypassed by posting
      // straight to the API.
      const expectations = input.expectations ?? null;
      const tolerancePct = expectations?.tolerance_pct ?? null;
      const requireBatchExpiry = expectations?.require_batch_expiry === true;
      const traceabilityErrors: string[] = [];

      // 2) Build grn_item rows. Resolve chemical flag + cost from the catalog once.
      const grnItemRows: any[] = [];
      for (const line of input.lines) {
        const poItem = poItemMap.get(line.po_item_id);
        if (!poItem) throw new Error('A submitted line does not belong to this order.');

        const orderedRemaining =
          Number(poItem.ordered_quantity) - Number(poItem.received_quantity ?? 0);

        for (const [label, value] of [
          ['expiry', line.expiry_date],
          ['manufacturing', line.manufacturing_date],
        ] as const) {
          if (value && !isIsoDate(value)) {
            throw new Error(`"${poItem.item_name}": the ${label} date "${value}" is not a valid date — re-enter it.`);
          }
        }

        // Catalog lookup for chemical flag + cost (null domain_item_id => new item).
        let isChemical = false;
        let costPrice = Number(poItem.unit_price ?? 0);
        if (poItem.domain_item_id) {
          const catItem = await adapter.getItem(poItem.domain_item_id, ctx);
          if (catItem) {
            isChemical = catItem.isChemical ?? false;
            costPrice = Number(poItem.unit_price ?? catItem.costPrice ?? 0);
          }
        }
        // Prefer the actual invoice unit price for the batch's cost when supplied.
        if (line.cost != null && Number(line.cost) > 0) costPrice = Number(line.cost);

        const received = Number(line.received_quantity ?? 0);
        const accepted = Number(line.accepted_quantity ?? 0);
        const rejected = Number(line.rejected_quantity ?? 0);
        if (accepted + rejected > received + 0.001) {
          throw new Error(
            `"${poItem.item_name}": accepted + rejected (${accepted + rejected}) exceeds received (${received}).`
          );
        }

        // Serial numbers are optional per line, but if given they must account for
        // every accepted unit — a partial list would silently leave units unidentified.
        if (line.serial_numbers?.length && line.serial_numbers.length !== accepted) {
          throw new Error(
            `"${poItem.item_name}": ${line.serial_numbers.length} serial number(s) given for ${accepted} accepted unit(s).`
          );
        }

        const invoiceUnitPrice = line.cost != null && Number(line.cost) > 0 ? Number(line.cost) : null;
        const match = matchLine({
          orderedRemaining,
          invoiceQty: line.invoice_quantity,
          receivedQty: received,
          poUnitPrice: Number(poItem.unit_price ?? 0) || null,
          invoiceUnitPrice,
          tolerancePct,
        });

        if (requireBatchExpiry) {
          traceabilityErrors.push(
            ...validateLineForVerify(
              {
                item_name: poItem.item_name,
                is_chemical: isChemical,
                accepted_quantity: accepted,
                batch_number: line.batch_number,
                expiry_date: line.expiry_date,
              },
              { requireBatchExpiry: true }
            )
          );
        }

        grnItemRows.push({
          po_item_id: line.po_item_id,
          domain_item_id: poItem.domain_item_id ?? null,
          item_name: poItem.item_name,
          ordered_quantity: orderedRemaining,
          invoice_quantity: line.invoice_quantity ?? null,
          received_quantity: received,
          accepted_quantity: accepted,
          rejected_quantity: rejected,
          missing_quantity: line.missing_quantity ?? 0,
          mismatch_flag: match.mismatch_flag,
          mismatch_remarks: match.reason,
          match_status: match.match_status,
          replacement_required: line.replacement_required ?? false,
          rejection_reason: line.rejection_reason ?? null,
          batch_number: line.batch_number ?? null,
          expiry_date: line.expiry_date ?? null,
          manufacturing_date: line.manufacturing_date ?? null,
          serial_numbers: line.serial_numbers?.length ? line.serial_numbers : null,
          cost_price: costPrice,
          invoice_unit_price: invoiceUnitPrice,
          is_chemical: isChemical,
        });
      }

      // The receiver asked for full traceability on this delivery — hold the receipt until
      // every accepted line carries batch + expiry. Reported together so they fix one round.
      if (traceabilityErrors.length) {
        throw new Error(
          `Batch and expiry were required for this receipt:\n${traceabilityErrors.join('\n')}`
        );
      }

      // Invoice checks I1/I2/I4 (lib/services/procurement/invoice-checks.ts), re-applied
      // here so the save path enforces what the form shows, not only the form.
      // Deep-panel round 3 (S-M4): "today" is the IST business day, never the runtime's own
      // clock — on a UTC server it was still yesterday until 05:30 IST.
      const today = istBusinessDate();

      // I2 — already-expired goods are never accepted into stock (rejecting them is fine).
      const expired = input.lines
        .filter((l) => expiredLineBlocks(l, today))
        .map((l) => `"${poItemMap.get(l.po_item_id)?.item_name ?? 'A line'}" expired on ${l.expiry_date}`);
      if (expired.length) {
        throw new Error(
          `Expired goods cannot be accepted — reject them or correct the expiry date:\n${expired.join('\n')}`
        );
      }

      // I4 — an invoice older than the receiver's limit needs a typed reason.
      if (
        lateReasonMissing(
          input.invoice_date,
          today,
          expectations?.max_invoice_age_days ?? null,
          input.late_invoice_reason
        )
      ) {
        throw new Error(
          `This invoice is older than the ${expectations?.max_invoice_age_days} days you allowed — say why before recording it.`
        );
      }

      // I1 — a repeated invoice number is NOT refused here (Director: held save). The
      // receipt saves as usual; verify is refused until a verifier other than the
      // receiver confirms it is a different invoice (verifyGrn + the DB verify guard).
      // I4 is enforced HERE only: the age limit is the receiver's own (expectations), kept in
      // the notes text, so the database has nothing to enforce it against (migration
      // 20271010170000, section 14 S-M5). The reason is stored only when I4 fired (S-L7).
      const lateReason = invoiceAgeCheck(
        input.invoice_date,
        today,
        expectations?.max_invoice_age_days ?? null
      ).tooOld
        ? input.late_invoice_reason?.trim() || null
        : null;

      // 3) Insert header, then lines.
      const grnNumber = await this.generateGrnNumber(po.institution_id);
      const header = {
        institution_id: po.institution_id,
        store_id: po.store_id ?? null,
        grn_number: grnNumber,
        purchase_order_id: po.id,
        supplier_id: po.supplier_id,
        domain,
        invoice_number: invoiceNumber,
        invoice_date: input.invoice_date ?? null,
        invoice_amount: input.invoice_amount ?? null,
        invoice_document_url: input.invoice_document_url ?? null,
        status: 'pending_verification',
        received_by: userId,
        notes: this.composeNotes(input.notes, expectations),
      };
      let { data: grn, error: grnErr } = await this.supabase
        .from('procurement_grn')
        .insert({ ...header, ...(lateReason ? { late_invoice_reason: lateReason } : {}) })
        .select()
        .single();
      // late_invoice_reason is sent only when I4 fired. On a database where
      // 20271010170000_procurement_grn_invoice_checks is not applied yet the column does
      // not exist (PostgREST PGRST204): save anyway, with the reason kept in the notes,
      // so an old invoice can still be recorded and its reason is not lost.
      if (
        grnErr &&
        lateReason &&
        grnErr.code === 'PGRST204' &&
        /late_invoice_reason/.test(String(grnErr.message ?? ''))
      ) {
        ({ data: grn, error: grnErr } = await this.supabase
          .from('procurement_grn')
          .insert({
            ...header,
            notes: this.composeNotes(
              [input.notes?.trim(), `Late invoice reason: ${lateReason}`].filter(Boolean).join('\n'),
              expectations
            ),
          })
          .select()
          .single());
      }
      if (grnErr) throw grnErr;

      const { error: lineErr } = await this.supabase
        .from('procurement_grn_items')
        .insert(grnItemRows.map((r) => ({ ...r, grn_id: grn.id })));
      if (lineErr) throw lineErr;

      return grn as ProcurementGrn;
    } catch (error) {
      console.error('[ProcurementGrnService] createGrnAgainstPO:', error);
      throw error;
    }
  }

  /**
   * Earlier receipts from one supplier that carry an invoice number — the candidate set
   * for the I1 duplicate check (matched on the normalised number by findDuplicateGrns).
   * Read under the caller's RLS, so it covers the institutions the caller can see.
   * Deep-panel round 3 (S-L8): read page by page to the end — it used to stop at the newest
   * 500, so the banner and the third-person fallbacks missed older repeats. The number is
   * matched on its NORMALISED form, which PostgREST cannot filter on, hence all of them.
   */
  static async getSupplierInvoiceGrns(supplierId: string): Promise<SupplierInvoiceGrn[]> {
    const PAGE = 1000;
    const rows: SupplierInvoiceGrn[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.supabase
        .from('procurement_grn')
        .select(
          `id, grn_number, supplier_id, invoice_number, invoice_date, invoice_amount, status, created_at,
           received_by, received_by_profile:profiles!received_by(full_name)`
        )
        .eq('supplier_id', supplierId)
        .not('invoice_number', 'is', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const page = (data ?? []) as SupplierInvoiceGrn[];
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }

  /**
   * Is this receipt's invoice number a repeat of another (non-cancelled) receipt from the
   * same supplier? Asks the database first (fn_procurement_grn_has_duplicate — the same
   * check the verify guard runs, and it also sees colleges the caller cannot); falls back
   * to the caller's own view where that function does not exist yet.
   */
  static async hasDuplicateInvoice(
    grn: Pick<ProcurementGrn, 'id' | 'supplier_id' | 'invoice_number' | 'created_at'>,
    opts: { strict?: boolean } = {}
  ): Promise<boolean> {
    // Receipts already in stock, or recorded EARLIER, count: the original is never held
    // by a later, not-yet-verified repeat — but is held once that repeat is in stock.
    const { data, error } = await this.supabase.rpc('fn_procurement_grn_has_duplicate', {
      p_grn_id: grn.id,
      p_supplier_id: grn.supplier_id,
      p_invoice_number: grn.invoice_number,
      p_created_at: grn.created_at,
    });
    if (!error && typeof data === 'boolean') return data;
    // Deep-panel L7: the fallback only sees the caller's own colleges, so a repeat
    // recorded elsewhere would quietly pass. Good enough to show a banner; never to
    // decide whether goods go into stock.
    if (opts.strict) throw new Error(DUPLICATE_CHECKS_MISSING_MESSAGE);
    const visible = await this.getSupplierInvoiceGrns(grn.supplier_id);
    return (
      findDuplicateGrns(visible, grn.supplier_id, grn.invoice_number, grn.id, grn).length > 0
    );
  }

  /**
   * D4 (Director 2026-10-10), third-person rule: did `userId` receive another delivery
   * that this receipt's invoice number repeats? Asks the database first
   * (fn_procurement_grn_has_duplicate with p_received_by — it answers only about the
   * signed-in user, and also sees colleges the caller cannot); falls back to the
   * caller's own view where that argument does not exist yet.
   */
  static async receivedMatchingDelivery(
    grn: Pick<ProcurementGrn, 'id' | 'supplier_id' | 'invoice_number' | 'created_at'>,
    userId: string,
    opts: { strict?: boolean } = {}
  ): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('fn_procurement_grn_has_duplicate', {
      p_grn_id: grn.id,
      p_supplier_id: grn.supplier_id,
      p_invoice_number: grn.invoice_number,
      p_created_at: grn.created_at,
      p_received_by: userId,
    });
    if (!error && typeof data === 'boolean') return data;
    if (opts.strict) throw new Error(DUPLICATE_CHECKS_MISSING_MESSAGE);
    const visible = await this.getSupplierInvoiceGrns(grn.supplier_id);
    return receivedMatchingDelivery(visible, grn, userId);
  }

  /**
   * D4 at verify time (decisions round, red team): did whoever CONFIRMED this repeated
   * invoice receive another delivery with the same number, in any status?
   * Deep-panel round 3 (S-M2): the database answers this too — fn_procurement_grn_has_duplicate
   * with p_received_by = the receipt's STORED confirmer, for a caller who may confirm it
   * (an admin, or a verifier who did not receive it); it sees every college. Under `strict`
   * (verifyGrn) no database answer means no stock — never the RLS-capped view, which misses
   * a matching receipt at a college the viewer cannot open. Otherwise (the receipt page's
   * button state) the viewer's own view is the fallback. The verify guard re-asks it anyway.
   */
  static async confirmerReceivedMatch(
    grn: Pick<
      ProcurementGrn,
      'id' | 'supplier_id' | 'invoice_number' | 'created_at' | 'duplicate_confirmed_by'
    >,
    viewerId: string,
    opts: { strict?: boolean } = {}
  ): Promise<boolean> {
    const confirmer = grn.duplicate_confirmed_by;
    if (!confirmer) return false;
    if (confirmer === viewerId) return this.receivedMatchingDelivery(grn, viewerId, opts);
    const { data, error } = await this.supabase.rpc('fn_procurement_grn_has_duplicate', {
      p_grn_id: grn.id,
      p_supplier_id: grn.supplier_id,
      p_invoice_number: grn.invoice_number,
      p_created_at: grn.created_at,
      p_received_by: confirmer,
    });
    if (!error && typeof data === 'boolean') return data;
    if (opts.strict) throw new Error(DUPLICATE_CHECKS_MISSING_MESSAGE);
    const visible = await this.getSupplierInvoiceGrns(grn.supplier_id);
    return receivedMatchingDelivery(visible, grn, confirmer);
  }

  /**
   * I1 held save: the verifier confirms that a repeated invoice number is a different
   * invoice. The DB trigger fn_procurement_grn_invoice_checks stamps the time and refuses
   * anyone who is the receiver, received the other delivery (D4), lacks verify rights,
   * or is not the signed-in user.
   */
  static async confirmDifferentInvoice(id: string, userId: string): Promise<ProcurementGrn> {
    try {
      // D4: nor may whoever received the other delivery this one repeats — checked
      // before any write.
      const { data: current, error: curErr } = await this.supabase
        .from('procurement_grn')
        .select('id, supplier_id, invoice_number, created_at, status, received_by')
        .eq('id', id)
        .single();
      if (curErr) throw curErr;
      // Deep-panel M4: each refusal says why, before any write. received_by is NOT NULL
      // in the schema (20260801000700) and pinned at INSERT, so a receipt without a
      // receiver should not exist; if one ever does, say so plainly rather than let the
      // `.neq('received_by', …)` below match nothing (SQL: NULL <> x is never true) and
      // blame the confirmer.
      if (current.status !== 'pending_verification') {
        throw new Error('Could not confirm — this delivery is no longer waiting to be checked.');
      }
      if (!current.received_by) {
        throw new Error(NO_RECEIVER_MESSAGE);
      }
      if (current.received_by === userId) {
        throw new Error(
          'Could not confirm — you received it yourself, so another verifier must confirm it is a different invoice.'
        );
      }
      if (await this.receivedMatchingDelivery(current, userId)) {
        throw new Error(THIRD_PERSON_MESSAGE);
      }
      const { data, error } = await this.supabase
        .from('procurement_grn')
        .update({ duplicate_confirmed_by: userId, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'pending_verification')
        .neq('received_by', userId)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        // The guarded update matched nothing: the receipt changed in between.
        throw new Error('Could not confirm — this delivery changed while you were confirming. Reload and try again.');
      }
      return data as ProcurementGrn;
    } catch (error) {
      console.error('[ProcurementGrnService] confirmDifferentInvoice:', error);
      throw error;
    }
  }

  /**
   * Verify a GRN: gate chemical lines, post accepted qty to inventory via the domain
   * adapter, advance PO received_quantity, auto-close the PO when fully received, and
   * set the GRN's terminal status. Guarded so a GRN can only be verified once.
   */
  static async verifyGrn(id: string, userId: string): Promise<ProcurementGrn> {
    try {
      const grn = await this.getGrn(id);
      if (grn.status !== 'pending_verification') {
        throw new Error(`Delivery record ${grn.grn_number} is "${grn.status}" — only pending delivery records can be verified.`);
      }

      // 0) E1 (Director 2026-10-10 afternoon): the person who received the delivery never
      //    checks it, whatever their rights (admins included). The DB verify guard refuses
      //    it too.
      if (selfCheckBlocks(grn.received_by, userId)) {
        throw new Error(SELF_CHECK_MESSAGE);
      }

      // 0a) Director decision 11 Oct 2026 02:00 — a replacement delivery also needs two
      //     people. Its recorder is refused by 0) (received_by); the original delivery's
      //     receiver is refused here. The replacement must still be open (claimed, not yet
      //     fulfilled) and the receipt shaped as one line within what is owed. The database
      //     verify guard refuses all three too.
      const replacement = grn.replacement_id ? await this.getReplacementOrigin(grn.replacement_id) : null;
      if (grn.replacement_id) {
        if (!replacement || replacement.status !== 'received' || replacement.replacement_grn_item_id) {
          throw new Error(REPLACEMENT_NOT_OPEN_MESSAGE);
        }
        if (selfCheckBlocks(replacement.original_received_by, userId)) {
          throw new Error(REPLACEMENT_ORIGIN_VERIFY_MESSAGE);
        }
        if (replacementShapeBlocks(grn.items, replacement)) {
          throw new Error(REPLACEMENT_SHAPE_MESSAGE);
        }
      }

      // 1) Chemical validation — block the whole verify if any accepted chemical line
      //    is missing batch/expiry (fail loudly, post nothing).
      const errors = grn.items.flatMap((i) =>
        validateLineForVerify({
          item_name: i.item_name,
          is_chemical: i.is_chemical,
          accepted_quantity: Number(i.accepted_quantity),
          batch_number: i.batch_number,
          expiry_date: i.expiry_date,
        })
      );
      if (errors.length) throw new Error(errors.join(' '));

      // 1a) I2 — expired goods never go into stock, whenever they are verified: a line
      //     that expired after it was recorded, or whose expiry was edited on the receipt
      //     page (updateGrnItem), is refused here, before anything is posted. IST business
      //     day (S-M4); the database verify guard refuses the same lines (G8).
      const today = istBusinessDate();
      const expired = grn.items
        .filter((i) => expiredLineBlocks(i, today))
        .map((i) => `"${i.item_name}" expired on ${i.expiry_date}`);
      if (expired.length) {
        throw new Error(
          `Expired goods cannot be accepted — reject them or correct the expiry date:\n${expired.join('\n')}`
        );
      }

      // 1a2) D2 (Director 2026-10-10): a receipt with no invoice number never goes into
      //      stock. A replacement receipt is exempt — since 11 Oct it is checked in here,
      //      and 0a) has just confirmed its replacement is open. The database verify guard
      //      applies the same rule.
      if (blankInvoiceBlocksStock(grn.invoice_number, grn.replacement_id)) {
        throw new Error(BLANK_INVOICE_MESSAGE);
      }

      // 1b) I1 held save — a repeated invoice number must be confirmed as a different
      //     invoice before stock is added. D4 again at this moment (decisions round, red
      //     team): a confirmation from someone who received this delivery or ANY other
      //     with this number does not count. The DB verify guard refuses both too.
      const hold = duplicateHold({
        // L7: strict — no database answer, no stock (never the RLS-limited fallback).
        hasDuplicate: await this.hasDuplicateInvoice(grn, { strict: true }),
        confirmedBy: grn.duplicate_confirmed_by,
        viewerId: userId,
        receivedBy: grn.received_by,
        viewerCanVerify: true,
        confirmerReceivedMatch: await this.confirmerReceivedMatch(grn, userId, { strict: true }),
      });
      if (hold.confirmationVoid) {
        throw new Error(CONFIRMATION_VOID_MESSAGE);
      }
      if (hold.blocksVerify) {
        throw new Error(
          'This invoice number repeats another delivery from the same supplier (already in stock, or recorded earlier). A verifier other than the receiver must confirm it is a different invoice before it is added to stock.'
        );
      }

      // 2) Guard the transition first so a concurrent verify can't double-post.
      const { data: locked, error: lockErr } = await this.supabase
        .from('procurement_grn')
        .update({
          status: 'accepted', // provisional; refined below once lines post
          verified_by: userId,
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'pending_verification')
        .select()
        .single();
      if (lockErr) throw lockErr;
      if (!locked) throw new Error('Delivery record was already verified by someone else; refresh.');

      // 2a) Skeptic re-check (M4): the checks above judged the lines read at the start, in
      //     separate requests. From the header post on, the database freezes the lines
      //     (and makes a line write that was in flight finish first), so read them again
      //     now: if any line was added, removed or changed in between, reopen the receipt
      //     before anything posts and ask for a fresh check.
      const { data: currentItems, error: currentErr } = await this.supabase
        .from('procurement_grn_items')
        .select('*')
        .eq('grn_id', id)
        .order('created_at', { ascending: true });
      if (currentErr || linesChangedSinceCheck(grn.items, (currentItems ?? []) as typeof grn.items)) {
        // Deep-panel round 3 (S-H1, S-L6): a reopen that did not happen is said so — the
        // receipt is then stuck in a posted status with nothing in stock, and "check it
        // again" could never succeed.
        if (!(await this.reopenProvisionalPost(id, userId, 'lines changed during the check'))) {
          throw new Error(GRN_STUCK_POSTED_MESSAGE);
        }
        throw currentErr ?? new Error(LINES_CHANGED_MESSAGE);
      }

      const domain = (grn.domain ?? 'ims') as ProcurementDomain;
      const ctx: DomainCtx = { institutionId: grn.institution_id, storeId: grn.store_id, userId };
      const adapter = getAdapter(domain);

      // 3) Post each accepted line into the domain's inventory.
      //    Retry-safe (review 2026-07-11): lines that already posted carry
      //    domain_posted_at and are skipped; a mid-loop failure reopens the GRN
      //    (catch below) so verify can be re-run instead of stranding a partial
      //    post on the money path.
      let anyRejected = false;
      let anyReplacement = false;
      try {
        for (const line of grn.items) {
          const accepted = Number(line.accepted_quantity);
          if (Number(line.rejected_quantity) > 0) anyRejected = true;
          if (line.replacement_required && Number(line.rejected_quantity) > 0) {
            anyReplacement = true;
            // One replacement request per line — a retry must not duplicate it.
            const { data: existingRep, error: repSelErr } = await this.supabase
              .from('procurement_grn_replacements')
              .select('id')
              .eq('grn_item_id', line.id)
              .limit(1)
              .maybeSingle();
            if (repSelErr) throw repSelErr;
            if (!existingRep) {
              const { error: repErr } = await this.supabase
                .from('procurement_grn_replacements')
                .insert({
                  grn_item_id: line.id,
                  rejected_quantity: Number(line.rejected_quantity),
                  reason: line.rejection_reason ?? line.mismatch_remarks ?? null,
                  status: 'pending',
                });
              if (repErr) throw repErr;
            }
          }
          if (accepted <= 0) continue;

          let domainItemId: string | null = line.domain_item_id ?? null;
          if (!line.domain_posted_at) {
            // Before materializing a "new item", re-read the PO line's
            // domain_item_id from the DB: a sibling GRN's verify (split
            // delivery) may have materialized it after this GRN snapshotted
            // NULL. Domain-agnostic dedup — covers IMS, whose reconcile hook
            // has no PO-line lock of its own (review r2).
            if (!domainItemId && line.po_item_id) {
              const { data: freshPoi, error: freshErr } = await this.supabase
                .from('procurement_purchase_order_items')
                .select('domain_item_id')
                .eq('id', line.po_item_id)
                .single();
              if (freshErr) throw freshErr;
              domainItemId = freshPoi?.domain_item_id ?? null;
              if (domainItemId) {
                const { error: relinkErr } = await this.supabase
                  .from('procurement_grn_items')
                  .update({ domain_item_id: domainItemId })
                  .eq('id', line.id);
                if (relinkErr) throw relinkErr;
              }
            }

            // "New item" lines carry no catalog id. Materialize one via the domain's
            // reconcileNewItem hook (draft/needs-setup record) so the receipt can post;
            // persist the id back so replacements and re-reads see a linked line.
            // Domains without the hook: skip posting (never crash the verify).
            // Retry cannot duplicate the draft: po_item_id is NOT NULL by schema,
            // and RM's reconcile backfills the PO line inside its own transaction,
            // so a re-invocation returns the existing id.
            if (!domainItemId && adapter.reconcileNewItem) {
              domainItemId = await adapter.reconcileNewItem(
                { name: line.item_name, isChemical: line.is_chemical ?? undefined },
                ctx,
                line.po_item_id ?? null
              );
              const { error: linkErr } = await this.supabase
                .from('procurement_grn_items')
                .update({ domain_item_id: domainItemId })
                .eq('id', line.id);
              if (linkErr) throw linkErr;
              if (line.po_item_id) {
                const { error: poLinkErr } = await this.supabase
                  .from('procurement_purchase_order_items')
                  .update({ domain_item_id: domainItemId })
                  .eq('id', line.po_item_id);
                if (poLinkErr) throw poLinkErr;
              }
            }

            if (domainItemId) {
              await adapter.postReceipt(
                {
                  domainItemId,
                  acceptedQuantity: accepted,
                  costPrice: Number(line.cost_price),
                  totalValue: Number(line.cost_price) * accepted,
                  batchNumber: line.batch_number,
                  expiryDate: line.expiry_date,
                  manufacturingDate: line.manufacturing_date,
                  serialNumbers: line.serial_numbers,
                  grnId: grn.id,
                  grnNumber: grn.grn_number,
                  purchaseOrderId: grn.purchase_order_id,
                  supplierId: grn.supplier_id,
                  grnItemId: line.id,
                },
                ctx
              );

              // Mark the line posted. The RM RPC already claimed it inside its
              // own transaction (this update then matches 0 rows); for
              // client-side domains (IMS) the marker makes a MANUAL reset +
              // re-verify skip lines that did post — it is an audit/recovery
              // aid, not an exactly-once guarantee for those domains (which is
              // why the catch below only auto-retries idempotentPosts domains).
              // Ordering is deliberate (reviewed both ways, r3): marking BEFORE
              // the post would turn a crash-between into SILENT inventory loss
              // that the marker itself hides; post-first leaves a narrow,
              // DETECTABLE double-post window on manual re-verify (IMS batch
              // rows carry the GRN reference, so an auditor can see the line
              // posted) — and is strictly narrower than the pre-marker recovery,
              // which replayed every line. True exactly-once for IMS = moving
              // its post into a single RPC like RM's (follow-up scope).
              // Deep-panel round 3 (S-M3): the goods ARE in stock by now, so a failed mark is
              // logged, never thrown — a throw would strand an IMS receipt in 'accepted'
              // with a posted but unmarked line, which a manual reset + re-verify would post
              // twice. The line stays markable (NULL -> now() is allowed on a posted receipt).
              await this.markLinePosted(line.id, 'verifyGrn');
            }
          }

          // 4) Recompute the PO line's received_quantity from verified GRN
          //    lines — atomic single-statement RPC (row lock + subselect), so
          //    concurrent verifies can't clobber each other, and convergent on
          //    retry. Runs for EVERY accepted line, including hookless domains
          //    that never post, so their POs still close (review r2).
          if (line.po_item_id) {
            const { error: advErr } = await this.supabase.rpc(
              'fn_procurement_recompute_po_line_received',
              { p_po_item_id: line.po_item_id }
            );
            if (advErr) throw advErr;
          }
        }

        // 5) Recompute PO status: completed when every line is fully received.
        await this.refreshPoReceiptStatus(grn.purchase_order_id);

        // 6) Refine the GRN's terminal status now that posting is done. Inside
        //    the compensation envelope so a failed write here reopens the GRN
        //    instead of stranding it in provisional 'accepted' (review r2).
        const finalStatus = anyReplacement
          ? 'replacement_requested'
          : anyRejected
            ? 'partially_accepted'
            : 'completed';
        const { data: finalGrn, error: finalErr } = await this.supabase
          .from('procurement_grn')
          .update({ status: finalStatus, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (finalErr) throw finalErr;

        // 7) Director 11 Oct: a replacement receipt fulfils its replacement only now, once a
        //    second person has checked it into stock. Written once (the database refuses a
        //    second link, or a link to a receipt not in stock); a 0-row answer means it was
        //    already linked, which a retry after a lost response can see.
        if (grn.replacement_id && grn.items.length === 1) {
          const { error: linkErr } = await this.supabase
            .from('procurement_grn_replacements')
            .update({ replacement_grn_item_id: grn.items[0].id })
            .eq('id', grn.replacement_id)
            .is('replacement_grn_item_id', null);
          if (linkErr) throw linkErr;
        }

        return (finalGrn ?? locked) as ProcurementGrn;
      } catch (postError) {
        // Compensate ONLY for domains whose posts are exactly-once at the DB
        // (RM): reopening lets verify re-run and converge — posted lines no-op
        // via the RPC claim. For client-side-post domains (IMS) a retry would
        // REPLAY unguarded stock/ledger writes and double-count, so keep the
        // pre-existing strand-in-'accepted' semantics; the domain_posted_at
        // markers make the manual reset path skip lines that already posted.
        if (adapter.idempotentPosts) {
          // Same 0-row trap as the M4 reopen above (S-H1): the receipt may already carry
          // its refined status, and a silent no-op left it posted. Said so, loudly.
          if (!(await this.reopenProvisionalPost(id, userId, 'posting failed'))) {
            console.error('[ProcurementGrnService] verifyGrn: the post failure was:', postError);
            throw new Error(GRN_STUCK_POSTED_MESSAGE);
          }
        } else {
          console.error(
            `[ProcurementGrnService] verifyGrn: posting failed mid-loop for domain "${domain}" — GRN left in provisional 'accepted'; lines with domain_posted_at already posted, remaining lines need a manual status reset to pending_verification before re-verify`,
            postError
          );
        }
        throw postError;
      }
    } catch (error) {
      console.error('[ProcurementGrnService] verifyGrn:', error);
      throw error;
    }
  }

  /**
   * Deep-panel round 3 (S-H1): put a receipt that THIS verifier provisionally posted back
   * to pending. It matches every posted status (the refine step may already have written
   * partially_accepted / replacement_requested / completed) and only this verifier's own
   * post, and it reports whether a row actually moved: PostgREST answers a 0-row update
   * with no error, which used to leave the receipt in a posted status with nothing in stock
   * and nothing logged.
   */
  private static async reopenProvisionalPost(id: string, userId: string, why: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('procurement_grn')
      .update({
        status: 'pending_verification',
        verified_by: null,
        verified_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .in('status', [...POSTED_GRN_STATUSES])
      .eq('verified_by', userId)
      .select('id');
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    if (error || rows.length === 0) {
      console.error(
        `[ProcurementGrnService] verifyGrn: ${why} AND the GRN ${id} could NOT be reopened (${
          error ? 'error' : '0 rows matched'
        }) — it is stuck in a posted status; an admin must reset it to pending_verification`,
        error ?? null
      );
      return false;
    }
    return true;
  }

  /**
   * Mark a line whose stock was just posted (S-M3). The RM RPC already marked it inside its
   * own transaction (then this matches 0 rows). A failure is logged, never thrown: the
   * goods are in stock, and every caller's rollback must treat the line as posted.
   */
  private static async markLinePosted(lineId: string, where: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('procurement_grn_items')
        .update({ domain_posted_at: new Date().toISOString() })
        .eq('id', lineId)
        .is('domain_posted_at', null);
      if (error) throw error;
    } catch (markErr) {
      console.error(
        `[ProcurementGrnService] ${where}: line ${lineId} IS in stock but its domain_posted_at mark failed — set it by hand (NULL -> now()) before any reset or re-verify`,
        markErr
      );
    }
  }

  /**
   * Edit a GRN line's batch/expiry/mfg before verification — lets a store admin supply the
   * chemical-mandatory batch + expiry at verify time (PRD verify.md §9) without recreating the GRN.
   */
  static async updateGrnItem(
    grnItemId: string,
    patch: { batch_number?: string | null; expiry_date?: string | null; manufacturing_date?: string | null }
  ): Promise<void> {
    const upd: Record<string, unknown> = {};
    if (patch.batch_number !== undefined) upd.batch_number = patch.batch_number;
    if (patch.expiry_date !== undefined) upd.expiry_date = patch.expiry_date;
    if (patch.manufacturing_date !== undefined) upd.manufacturing_date = patch.manufacturing_date;
    if (Object.keys(upd).length === 0) return;
    const { error } = await this.supabase
      .from('procurement_grn_items')
      .update(upd)
      .eq('id', grnItemId);
    if (error) throw error;
  }

  /** Pending + fulfilled replacements raised from a GRN's rejected lines. */
  static async getReplacements(grnId: string): Promise<ProcurementGrnReplacement[]> {
    const { data: items, error: itemsErr } = await this.supabase
      .from('procurement_grn_items')
      .select('id')
      .eq('grn_id', grnId);
    if (itemsErr) throw itemsErr;
    const ids = (items || []).map((i: any) => i.id);
    if (!ids.length) return [];

    // Two foreign keys join these tables (grn_item_id, replacement_grn_item_id), so the
    // embed names one; without it PostgREST refuses the whole read (PGRST201).
    const { data, error } = await this.supabase
      .from('procurement_grn_replacements')
      .select(
        '*, grn_item:procurement_grn_items!procurement_grn_replacements_grn_item_id_fkey(id,item_name,is_chemical,domain_item_id)'
      )
      .in('grn_item_id', ids)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const reps = (data || []) as ProcurementGrnReplacement[];

    // Director 11 Oct: a recorded replacement waits as a pending receipt until a second
    // person checks it in — show which receipt, and whether it is in stock yet.
    const claimedIds = reps.filter((r) => r.status === 'received').map((r) => r.id);
    if (!claimedIds.length) return reps;
    const { data: receipts, error: recErr } = await this.supabase
      .from('procurement_grn')
      .select('id, grn_number, status, replacement_id')
      .in('replacement_id', claimedIds);
    if (recErr) {
      console.error('[ProcurementGrnService] getReplacements: replacement receipts not read:', recErr);
      return reps;
    }
    const byRep = new Map(
      ((receipts || []) as Array<{ id: string; grn_number: string; status: string; replacement_id: string }>).map(
        (g) => [g.replacement_id, { id: g.id, grn_number: g.grn_number, status: g.status }]
      )
    );
    return reps.map((r) => ({ ...r, receipt: byRep.get(r.id) ?? null }));
  }

  /**
   * The replacement a replacement receipt fulfils, with who received the ORIGINAL delivery
   * (Director 11 Oct: that person never checks the replacement in) and the rejected line's
   * order line (the replacement's one line must be for it).
   */
  static async getReplacementOrigin(replacementId: string): Promise<{
    id: string;
    status: string;
    rejected_quantity: number;
    replacement_grn_item_id: string | null;
    po_item_id: string | null;
    original_grn_id: string | null;
    original_grn_number: string | null;
    original_received_by: string | null;
  } | null> {
    const { data, error } = await this.supabase
      .from('procurement_grn_replacements')
      .select(
        'id, status, rejected_quantity, replacement_grn_item_id, grn_item:procurement_grn_items!procurement_grn_replacements_grn_item_id_fkey(po_item_id, grn:procurement_grn(id, grn_number, received_by))'
      )
      .eq('id', replacementId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as any;
    const grn = row.grn_item?.grn ?? null;
    return {
      id: row.id,
      status: row.status,
      rejected_quantity: Number(row.rejected_quantity),
      replacement_grn_item_id: row.replacement_grn_item_id ?? null,
      po_item_id: row.grn_item?.po_item_id ?? null,
      original_grn_id: grn?.id ?? null,
      original_grn_number: grn?.grn_number ?? null,
      original_received_by: grn?.received_by ?? null,
    };
  }

  /**
   * Record replacement goods for a previously-rejected line (PRD steps 13-14).
   *
   * Director decision 11 Oct 2026 02:00 — a replacement delivery also needs TWO people.
   * This saves a dedicated single-line replacement receipt as PENDING: nothing reaches
   * stock here. A different verifier — not the person who recorded it, never the original
   * delivery's receiver — checks it into stock through verifyGrn, which posts the goods,
   * advances the PO and links the fulfilment back to the replacement row. The database
   * refuses any other order (migration 20271010170000, section 15).
   *
   * Concurrency: the pending->received claim is the mutex (and one receipt per replacement
   * is a unique index), so two people cannot record the same replacement. Nothing is
   * posted here, so on a failure the half-recorded receipt is removed and the claim
   * reopened — the replacement can simply be recorded again.
   */
  static async receiveReplacement(
    input: ReceiveReplacementInput,
    userId: string
  ): Promise<ProcurementGrn> {
    const accepted = Number(input.accepted_quantity);
    if (!(accepted > 0)) throw new Error('Accepted replacement quantity must be greater than zero.');
    if (input.serial_numbers?.length && input.serial_numbers.length !== accepted) {
      throw new Error(
        `${input.serial_numbers.length} serial number(s) given for ${accepted} accepted unit(s).`
      );
    }

    // 1) Load the pending replacement + its originating line + parent GRN.
    const { data: rep, error: repErr } = await this.supabase
      .from('procurement_grn_replacements')
      .select(
        '*, grn_item:procurement_grn_items!procurement_grn_replacements_grn_item_id_fkey(id,item_name,is_chemical,domain_item_id,cost_price,po_item_id,grn_id)'
      )
      .eq('id', input.replacement_id)
      .single();
    if (repErr) throw repErr;
    if (rep.status !== 'pending') throw new Error('This replacement has already been received.');

    const originItem = rep.grn_item;
    if (!originItem) throw new Error('Replacement is missing its originating delivery line.');
    if (accepted > Number(rep.rejected_quantity) + 0.001) {
      throw new Error(
        `Accepted (${accepted}) exceeds the rejected quantity awaiting replacement (${rep.rejected_quantity}).`
      );
    }

    const { data: parentGrn, error: pgErr } = await this.supabase
      .from('procurement_grn')
      .select('id,institution_id,store_id,domain,purchase_order_id,supplier_id,grn_number,status,received_by')
      .eq('id', originItem.grn_id)
      .single();
    if (pgErr) throw pgErr;
    // 1a) E1, replacement arm (Director 2026-10-10 afternoon): whoever received the original
    //     delivery neither claims nor receives its replacement — checked before the claim.
    //     The database refuses both (trg_pgrnr_replacement_checks, the verify guard).
    if (selfCheckBlocks(parentGrn.received_by, userId)) {
      throw new Error(REPLACEMENT_SELF_CHECK_MESSAGE);
    }
    // 1b) I1 (review round 2, red team): a replacement exists only for a line of a delivery
    //     that was checked into stock. A pending (possibly HELD) receipt cannot reach stock
    //     through its replacements. The database refuses such a replacement row too
    //     (trg_pgrnr_replacement_checks).
    if (!POSTED_GRN_STATUSES.includes(parentGrn.status)) {
      throw new Error(
        `Delivery record ${parentGrn.grn_number} has not been checked into stock ("${parentGrn.status}") — a replacement can only be received after it is verified.`
      );
    }

    // 2) Chemical gate — same rule as verify: batch + expiry required to post (asked
    //    now so the replacement is recorded complete; verifyGrn asks again).
    const errors = validateLineForVerify({
      item_name: originItem.item_name,
      is_chemical: originItem.is_chemical,
      accepted_quantity: accepted,
      batch_number: input.batch_number,
      expiry_date: input.expiry_date,
    });
    if (errors.length) throw new Error(errors.join(' '));

    // 2b) I2 — an expired replacement is never accepted into stock (same rule as save
    //     and verify). A non-ISO date is refused rather than skipped.
    for (const [label, value] of [
      ['expiry', input.expiry_date],
      ['manufacturing', input.manufacturing_date],
    ] as const) {
      if (value && !isIsoDate(value)) {
        throw new Error(`The ${label} date "${value}" is not a valid date — re-enter it.`);
      }
    }
    // IST business day (S-M4); the database refuses an expired replacement line too.
    if (expiredLineBlocks({ expiry_date: input.expiry_date, accepted_quantity: accepted }, istBusinessDate())) {
      throw new Error(
        `Expired goods cannot be accepted — "${originItem.item_name}" expired on ${input.expiry_date}. Correct the expiry date or do not receive it.`
      );
    }

    // 3) Claim the replacement (mutex). Only one person wins the pending->received flip.
    const { data: claimed, error: claimErr } = await this.supabase
      .from('procurement_grn_replacements')
      .update({ status: 'received' })
      .eq('id', input.replacement_id)
      .eq('status', 'pending')
      .select()
      .single();
    if (claimErr) throw claimErr;
    if (!claimed) throw new Error('Replacement was already received by someone else; refresh.');

    let createdGrnId: string | null = null;
    let createdItemId: string | null = null;
    const domain = (parentGrn.domain ?? 'ims') as ProcurementDomain;
    try {
      const costPrice = Number(originItem.cost_price ?? 0);

      // 4) The replacement receipt header — PENDING, recorded by the caller, naming the
      //    replacement it fulfils (the database lets an invoice-less receipt into stock at
      //    verify only when this names a claimed, unfulfilled replacement).
      const grnNumber = await this.generateGrnNumber(parentGrn.institution_id);
      const { data: grn, error: grnErr } = await this.supabase
        .from('procurement_grn')
        .insert({
          institution_id: parentGrn.institution_id,
          store_id: parentGrn.store_id ?? null,
          grn_number: grnNumber,
          purchase_order_id: parentGrn.purchase_order_id,
          supplier_id: parentGrn.supplier_id,
          domain,
          status: 'pending_verification',
          received_by: userId,
          notes: `Replacement for ${parentGrn.grn_number} — ${originItem.item_name}`,
          replacement_id: input.replacement_id,
        })
        .select()
        .single();
      if (grnErr) {
        // A database without migration 20271010170000 has no replacement_id column
        // (PostgREST PGRST204). Without it the receipt could never be checked in as a
        // replacement, so stop plainly (the catch reopens the claim).
        if (grnErr.code === 'PGRST204' && /replacement_id/.test(String(grnErr.message ?? ''))) {
          throw new Error(REPLACEMENT_SCHEMA_MISSING_MESSAGE);
        }
        throw grnErr;
      }
      createdGrnId = grn.id;

      // 5) Which catalog item the goods go to: the origin line's, or the PO line's (a
      //    sibling verify may have linked it since). When neither is known, verifyGrn
      //    creates it at check-in, as for any delivery.
      let domainItemId: string | null = originItem.domain_item_id ?? null;
      if (!domainItemId && originItem.po_item_id) {
        const { data: freshPoi, error: freshErr } = await this.supabase
          .from('procurement_purchase_order_items')
          .select('domain_item_id')
          .eq('id', originItem.po_item_id)
          .single();
        if (freshErr) throw freshErr;
        domainItemId = freshPoi?.domain_item_id ?? null;
      }

      // 6) Its single line.
      const match = matchLine({
        orderedRemaining: Number(rep.rejected_quantity),
        invoiceQty: accepted,
        receivedQty: accepted,
      });
      const { data: newItem, error: niErr } = await this.supabase
        .from('procurement_grn_items')
        .insert({
          grn_id: grn.id,
          po_item_id: originItem.po_item_id,
          domain_item_id: domainItemId,
          item_name: originItem.item_name,
          ordered_quantity: Number(rep.rejected_quantity),
          invoice_quantity: accepted,
          received_quantity: accepted,
          accepted_quantity: accepted,
          rejected_quantity: 0,
          mismatch_flag: match.mismatch_flag,
          mismatch_remarks: match.reason,
          match_status: match.match_status,
          batch_number: input.batch_number ?? null,
          expiry_date: input.expiry_date ?? null,
          manufacturing_date: input.manufacturing_date ?? null,
          serial_numbers: input.serial_numbers?.length ? input.serial_numbers : null,
          cost_price: costPrice,
          is_chemical: originItem.is_chemical ?? false,
        })
        .select()
        .single();
      if (niErr) throw niErr;
      createdItemId = newItem.id;

      return grn as ProcurementGrn;
    } catch (error) {
      // Nothing was posted. Remove the half-recorded receipt (line before header, for the
      // foreign key) and reopen the claim so the replacement can be recorded again. Each
      // step reports whether a row actually went (PostgREST answers a 0-row delete with no
      // error); if one did not, the rest stay as they are and an admin is told.
      let cleaned = true;
      if (createdItemId) {
        const { data: gone, error: delErr } = await this.supabase
          .from('procurement_grn_items')
          .delete()
          .eq('id', createdItemId)
          .select('id');
        if (delErr || !Array.isArray(gone) || gone.length === 0) cleaned = false;
      }
      if (cleaned && createdGrnId) {
        const { data: gone, error: delErr } = await this.supabase
          .from('procurement_grn')
          .delete()
          .eq('id', createdGrnId)
          .select('id');
        if (delErr || !Array.isArray(gone) || gone.length === 0) cleaned = false;
      }
      if (cleaned) {
        const { error: reopenErr } = await this.supabase
          .from('procurement_grn_replacements')
          .update({ status: 'pending', replacement_grn_item_id: null })
          .eq('id', input.replacement_id)
          .eq('status', 'received');
        if (reopenErr) cleaned = false;
      }
      if (!cleaned) {
        console.error(
          `[ProcurementGrnService] receiveReplacement: recording failed and could not be undone — replacement ${input.replacement_id} stays claimed with receipt ${createdGrnId ?? '-'} and line ${createdItemId ?? '-'}; nothing is in stock. An admin must remove the receipt and reopen the replacement.`
        );
      }
      console.error('[ProcurementGrnService] receiveReplacement:', error);
      throw error;
    }
  }

  static async cancel(id: string): Promise<ProcurementGrn> {
    const { data, error } = await this.supabase
      .from('procurement_grn')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending_verification')
      .select()
      .single();
    if (error) throw error;
    if (!data) throw new Error('Only a pending delivery record can be cancelled.');
    return data as ProcurementGrn;
  }

  /**
   * Set PO status from its receipt state (PRD verify.md §10). A PO 'completed' ONLY when
   * every line is fully received AND every GRN for it is verified AND no replacement is
   * still pending. Otherwise 'partially_received'. This keeps the PO open while goods are
   * still owed via a replacement or an unverified delivery.
   */
  private static async refreshPoReceiptStatus(poId: string): Promise<void> {
    const { data: items } = await this.supabase
      .from('procurement_purchase_order_items')
      .select('ordered_quantity, received_quantity')
      .eq('po_id', poId);
    if (!items?.length) return;

    const fullyReceived = items.every(
      (i: any) => Number(i.received_quantity ?? 0) >= Number(i.ordered_quantity) - 0.001
    );
    const anyReceived = items.some((i: any) => Number(i.received_quantity ?? 0) > 0);

    // A PO can only close when there's nothing left owed: no unverified GRN, no pending replacement.
    let canComplete = fullyReceived;
    if (canComplete) {
      const { count: pendingGrns } = await this.supabase
        .from('procurement_grn')
        .select('id', { count: 'exact', head: true })
        .eq('purchase_order_id', poId)
        .eq('status', 'pending_verification');
      if ((pendingGrns ?? 0) > 0) canComplete = false;
    }
    if (canComplete) {
      // Pending replacements are reached via grn_items -> grn for this PO.
      const { data: grnIds } = await this.supabase
        .from('procurement_grn')
        .select('id')
        .eq('purchase_order_id', poId);
      const ids = (grnIds || []).map((g: any) => g.id);
      if (ids.length) {
        const { data: itemIds } = await this.supabase
          .from('procurement_grn_items')
          .select('id')
          .in('grn_id', ids);
        const gItemIds = (itemIds || []).map((r: any) => r.id);
        if (gItemIds.length) {
          const { count: pendingRepl } = await this.supabase
            .from('procurement_grn_replacements')
            .select('id', { count: 'exact', head: true })
            .in('grn_item_id', gItemIds)
            .eq('status', 'pending');
          if ((pendingRepl ?? 0) > 0) canComplete = false;
        }
      }
    }

    const status = canComplete ? 'completed' : anyReceived ? 'partially_received' : undefined;
    if (!status) return;

    await this.supabase
      .from('procurement_purchase_orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', poId)
      .in('status', ['sent', 'approved', 'partially_received']);
  }

  /**
   * Fold the receiver's expectations into the GRN note as one readable line.
   *
   * These have no columns of their own (they are per-receipt, not configuration), but the
   * verifier needs to know the bar the receiver worked to — a line marked "matched" under a
   * 2% variance is a different claim from one matched exactly. Storing it as prose keeps the
   * record honest without a migration.
   */
  private static composeNotes(
    notes: string | null | undefined,
    expectations: GrnExpectations | null
  ): string | null {
    const parts: string[] = [];
    const pct = Number(expectations?.tolerance_pct) || 0;
    if (pct > 0) parts.push(`±${pct}% variance allowed`);
    if (expectations?.require_batch_expiry) parts.push('batch + expiry required on every line');
    const days = Number(expectations?.max_invoice_age_days) || 0;
    if (days > 0) parts.push(`invoice expected within ${days} days`);
    const watch = expectations?.watch_for?.trim();
    if (watch) parts.push(`watch for: ${watch}`);

    const summary = parts.length ? `Expectations at receipt — ${parts.join(' · ')}.` : null;
    const own = notes?.trim() || null;
    if (!summary) return own;
    return own ? `${summary}\n${own}` : summary;
  }

  private static async generateGrnNumber(institutionId: string): Promise<string> {
    const today = new Date().toISOString().split('T')[0];
    const { data: nextNum, error } = await this.supabase.rpc('procurement_next_number', {
      p_institution_id: institutionId,
      p_doc_type: 'GRN',
      p_date: today,
    });
    const yymmdd = today.replace(/-/g, '').slice(2);
    if (error || nextNum == null) {
      console.error('[ProcurementGrnService] generateGrnNumber:', error);
      return `GRN-${yymmdd}-${String(Date.now()).slice(-5)}`;
    }
    return `GRN-${yymmdd}-${String(nextNum).padStart(5, '0')}`;
  }
}

export type { ProcurementGrnItem };
