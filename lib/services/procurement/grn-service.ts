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
import { getAdapter } from './domain-adapters/registry';
import { matchLine, validateLineForVerify } from './three-way-match';
import type { ProcurementDomain, DomainCtx } from './domain-adapters/types';
import type {
  ProcurementGrn,
  GrnWithItems,
  ProcurementGrnItem,
  ProcurementGrnReplacement,
  ReceiveReplacementInput,
  CreateGrnInput,
  GrnFilters,
} from '@/types/procurement';

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
           purchase_order:procurement_purchase_orders(id,po_number),
           received_by_profile:profiles!received_by(full_name),
           verified_by_profile:profiles!verified_by(full_name),
           items:procurement_grn_items(count)`,
          { count: 'exact' }
        );

      if (filters.search) query = query.ilike('grn_number', `%${filters.search}%`);
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
        ...r,
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
           purchase_order:procurement_purchase_orders(id,po_number),
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

      return { ...header, items: items || [] } as GrnWithItems;
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
      if (!input.lines?.length) throw new Error('A GRN needs at least one line.');
      // Supplier invoice is mandatory — a GRN records goods received against a billed
      // invoice, and the three-way match has nothing to compare against without it.
      if (!input.invoice_number?.trim()) {
        throw new Error('Invoice number is required to create a GRN.');
      }
      if (!input.invoice_date) {
        throw new Error('Invoice date is required to create a GRN.');
      }

      // 1) Load PO header + lines (ordered qty and remaining-to-receive per line).
      const { data: po, error: poErr } = await this.supabase
        .from('procurement_purchase_orders')
        .select('*')
        .eq('id', input.purchase_order_id)
        .single();
      if (poErr) throw poErr;
      if (!['sent', 'approved', 'partially_received'].includes(po.status)) {
        throw new Error(`PO ${po.po_number} is "${po.status}" — receive only sent/approved POs.`);
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

      // 2) Build grn_item rows. Resolve chemical flag + cost from the catalog once.
      const grnItemRows: any[] = [];
      for (const line of input.lines) {
        const poItem = poItemMap.get(line.po_item_id);
        if (!poItem) throw new Error('A submitted line does not belong to this PO.');

        const orderedRemaining =
          Number(poItem.ordered_quantity) - Number(poItem.received_quantity ?? 0);

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

        const invoiceUnitPrice = line.cost != null && Number(line.cost) > 0 ? Number(line.cost) : null;
        const match = matchLine({
          orderedRemaining,
          invoiceQty: line.invoice_quantity,
          receivedQty: received,
          poUnitPrice: Number(poItem.unit_price ?? 0) || null,
          invoiceUnitPrice,
        });

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
          cost_price: costPrice,
          invoice_unit_price: invoiceUnitPrice,
          is_chemical: isChemical,
        });
      }

      // 3) Insert header, then lines.
      const grnNumber = await this.generateGrnNumber(po.institution_id);
      const { data: grn, error: grnErr } = await this.supabase
        .from('procurement_grn')
        .insert({
          institution_id: po.institution_id,
          store_id: po.store_id ?? null,
          grn_number: grnNumber,
          purchase_order_id: po.id,
          supplier_id: po.supplier_id,
          domain,
          invoice_number: input.invoice_number ?? null,
          invoice_date: input.invoice_date ?? null,
          invoice_amount: input.invoice_amount ?? null,
          invoice_document_url: input.invoice_document_url ?? null,
          status: 'pending_verification',
          received_by: userId,
          notes: input.notes ?? null,
        })
        .select()
        .single();
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
   * Verify a GRN: gate chemical lines, post accepted qty to inventory via the domain
   * adapter, advance PO received_quantity, auto-close the PO when fully received, and
   * set the GRN's terminal status. Guarded so a GRN can only be verified once.
   */
  static async verifyGrn(id: string, userId: string): Promise<ProcurementGrn> {
    try {
      const grn = await this.getGrn(id);
      if (grn.status !== 'pending_verification') {
        throw new Error(`GRN ${grn.grn_number} is "${grn.status}" — only pending GRNs can be verified.`);
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
      if (!locked) throw new Error('GRN was already verified by someone else; refresh.');

      const domain = (grn.domain ?? 'ims') as ProcurementDomain;
      const ctx: DomainCtx = { institutionId: grn.institution_id, storeId: grn.store_id, userId };
      const adapter = getAdapter(domain);

      // 3) Post each accepted line into the domain's inventory.
      let anyRejected = false;
      let anyReplacement = false;
      for (const line of grn.items) {
        const accepted = Number(line.accepted_quantity);
        if (Number(line.rejected_quantity) > 0) anyRejected = true;
        if (line.replacement_required && Number(line.rejected_quantity) > 0) {
          anyReplacement = true;
          await this.supabase.from('procurement_grn_replacements').insert({
            grn_item_id: line.id,
            rejected_quantity: Number(line.rejected_quantity),
            reason: line.rejection_reason ?? line.mismatch_remarks ?? null,
            status: 'pending',
          });
        }
        if (accepted <= 0) continue;

        await adapter.postReceipt(
          {
            domainItemId: line.domain_item_id!,
            acceptedQuantity: accepted,
            costPrice: Number(line.cost_price),
            totalValue: Number(line.cost_price) * accepted,
            batchNumber: line.batch_number,
            expiryDate: line.expiry_date,
            manufacturingDate: line.manufacturing_date,
            grnId: grn.id,
            grnNumber: grn.grn_number,
            purchaseOrderId: grn.purchase_order_id,
          },
          ctx
        );

        // 4) Advance the PO line's received_quantity by accepted qty (rejected qty
        //    still owes delivery, keeping the PO open for a replacement).
        const { data: poItem } = await this.supabase
          .from('procurement_purchase_order_items')
          .select('id, received_quantity')
          .eq('id', line.po_item_id)
          .single();
        if (poItem) {
          await this.supabase
            .from('procurement_purchase_order_items')
            .update({ received_quantity: Number(poItem.received_quantity ?? 0) + accepted })
            .eq('id', line.po_item_id);
        }
      }

      // 5) Recompute PO status: completed when every line is fully received.
      await this.refreshPoReceiptStatus(grn.purchase_order_id);

      // 6) Refine the GRN's terminal status now that posting is done.
      const finalStatus = anyReplacement
        ? 'replacement_requested'
        : anyRejected
          ? 'partially_accepted'
          : 'completed';
      const { data: finalGrn } = await this.supabase
        .from('procurement_grn')
        .update({ status: finalStatus, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      return (finalGrn ?? locked) as ProcurementGrn;
    } catch (error) {
      console.error('[ProcurementGrnService] verifyGrn:', error);
      throw error;
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

    const { data, error } = await this.supabase
      .from('procurement_grn_replacements')
      .select('*, grn_item:procurement_grn_items(id,item_name,is_chemical,domain_item_id)')
      .in('grn_item_id', ids)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []) as ProcurementGrnReplacement[];
  }

  /**
   * Receive replacement goods for a previously-rejected line (PRD steps 13-14).
   * Creates a dedicated single-line "replacement" GRN (already inspected, so it lands
   * 'completed'), posts the accepted qty to inventory through the domain adapter,
   * advances the PO, and links the fulfilment back to the pending replacement row.
   *
   * Concurrency: the pending->received claim is the mutex (taken BEFORE posting) so
   * two receivers can't double-post stock. On any downstream failure the claim is
   * rolled back to 'pending' — best-effort atomicity without a DB transaction.
   */
  static async receiveReplacement(
    input: ReceiveReplacementInput,
    userId: string
  ): Promise<ProcurementGrn> {
    const accepted = Number(input.accepted_quantity);
    if (!(accepted > 0)) throw new Error('Accepted replacement quantity must be greater than zero.');

    // 1) Load the pending replacement + its originating line + parent GRN.
    const { data: rep, error: repErr } = await this.supabase
      .from('procurement_grn_replacements')
      .select(
        '*, grn_item:procurement_grn_items(id,item_name,is_chemical,domain_item_id,cost_price,po_item_id,grn_id)'
      )
      .eq('id', input.replacement_id)
      .single();
    if (repErr) throw repErr;
    if (rep.status !== 'pending') throw new Error('This replacement has already been received.');

    const originItem = rep.grn_item;
    if (!originItem) throw new Error('Replacement is missing its originating GRN line.');
    if (accepted > Number(rep.rejected_quantity) + 0.001) {
      throw new Error(
        `Accepted (${accepted}) exceeds the rejected quantity awaiting replacement (${rep.rejected_quantity}).`
      );
    }

    const { data: parentGrn, error: pgErr } = await this.supabase
      .from('procurement_grn')
      .select('id,institution_id,store_id,domain,purchase_order_id,supplier_id,grn_number')
      .eq('id', originItem.grn_id)
      .single();
    if (pgErr) throw pgErr;

    // 2) Chemical gate — same rule as verify: batch + expiry required to post.
    const errors = validateLineForVerify({
      item_name: originItem.item_name,
      is_chemical: originItem.is_chemical,
      accepted_quantity: accepted,
      batch_number: input.batch_number,
      expiry_date: input.expiry_date,
    });
    if (errors.length) throw new Error(errors.join(' '));

    // 3) Claim the replacement (mutex). Only one receiver wins the pending->received flip.
    const { data: claimed, error: claimErr } = await this.supabase
      .from('procurement_grn_replacements')
      .update({ status: 'received' })
      .eq('id', input.replacement_id)
      .eq('status', 'pending')
      .select()
      .single();
    if (claimErr) throw claimErr;
    if (!claimed) throw new Error('Replacement was already received by someone else; refresh.');

    try {
      const domain = (parentGrn.domain ?? 'ims') as ProcurementDomain;
      const ctx: DomainCtx = {
        institutionId: parentGrn.institution_id,
        storeId: parentGrn.store_id,
        userId,
      };
      const adapter = getAdapter(domain);
      const costPrice = Number(originItem.cost_price ?? 0);

      // 4) Create the replacement GRN header (pre-inspected -> completed).
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
          status: 'completed',
          received_by: userId,
          verified_by: userId,
          verified_at: new Date().toISOString(),
          notes: `Replacement for ${parentGrn.grn_number} — ${originItem.item_name}`,
        })
        .select()
        .single();
      if (grnErr) throw grnErr;

      // 5) Its single line.
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
          domain_item_id: originItem.domain_item_id ?? null,
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
          cost_price: costPrice,
          is_chemical: originItem.is_chemical ?? false,
        })
        .select()
        .single();
      if (niErr) throw niErr;

      // 6) Post to inventory.
      if (originItem.domain_item_id) {
        await adapter.postReceipt(
          {
            domainItemId: originItem.domain_item_id,
            acceptedQuantity: accepted,
            costPrice,
            totalValue: costPrice * accepted,
            batchNumber: input.batch_number,
            expiryDate: input.expiry_date,
            manufacturingDate: input.manufacturing_date,
            grnId: grn.id,
            grnNumber,
            purchaseOrderId: parentGrn.purchase_order_id,
          },
          ctx
        );
      }

      // 7) Advance the PO line + recompute PO status.
      const { data: poItem } = await this.supabase
        .from('procurement_purchase_order_items')
        .select('id, received_quantity')
        .eq('id', originItem.po_item_id)
        .single();
      if (poItem) {
        await this.supabase
          .from('procurement_purchase_order_items')
          .update({ received_quantity: Number(poItem.received_quantity ?? 0) + accepted })
          .eq('id', originItem.po_item_id);
        await this.refreshPoReceiptStatus(parentGrn.purchase_order_id);
      }

      // 8) Link the fulfilment back to the pending row.
      await this.supabase
        .from('procurement_grn_replacements')
        .update({ replacement_grn_item_id: newItem.id })
        .eq('id', input.replacement_id);

      return grn as ProcurementGrn;
    } catch (error) {
      // Roll the claim back so the replacement can be retried.
      await this.supabase
        .from('procurement_grn_replacements')
        .update({ status: 'pending', replacement_grn_item_id: null })
        .eq('id', input.replacement_id);
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
    if (!data) throw new Error('Only a pending GRN can be cancelled.');
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
