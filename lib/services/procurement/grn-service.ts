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
  GrnExpectations,
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
          notes: this.composeNotes(input.notes, expectations),
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
                  grnId: grn.id,
                  grnNumber: grn.grn_number,
                  purchaseOrderId: grn.purchase_order_id,
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
              const { error: postedErr } = await this.supabase
                .from('procurement_grn_items')
                .update({ domain_posted_at: new Date().toISOString() })
                .eq('id', line.id)
                .is('domain_posted_at', null);
              if (postedErr) throw postedErr;
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

        return (finalGrn ?? locked) as ProcurementGrn;
      } catch (postError) {
        // Compensate ONLY for domains whose posts are exactly-once at the DB
        // (RM): reopening lets verify re-run and converge — posted lines no-op
        // via the RPC claim. For client-side-post domains (IMS) a retry would
        // REPLAY unguarded stock/ledger writes and double-count, so keep the
        // pre-existing strand-in-'accepted' semantics; the domain_posted_at
        // markers make the manual reset path skip lines that already posted.
        if (adapter.idempotentPosts) {
          const { error: revertErr } = await this.supabase
            .from('procurement_grn')
            .update({
              status: 'pending_verification',
              verified_by: null,
              verified_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('status', 'accepted');
          if (revertErr) {
            console.error(
              '[ProcurementGrnService] verifyGrn: post failed AND the GRN could not be reopened — needs manual status reset',
              revertErr
            );
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

    // Track what got created/posted so the catch can compensate precisely:
    // void the paper trail only when inventory was NOT touched (review r2 —
    // a retry after a successful post must not create a second line whose
    // accepted qty the recompute would sum into the PO).
    let createdGrnId: string | null = null;
    let createdItemId: string | null = null;
    let posted = false;
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
      createdGrnId = grn.id;

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
      createdItemId = newItem.id;

      // 6) Post to inventory. A fully-rejected new-item line was never
      //    materialized at verify (accepted=0 skipped it), so its replacement
      //    must materialize here or the goods never reach inventory (review
      //    r3) — same fresh-PO-read dedup + reconcile as verifyGrn.
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
      if (!domainItemId && adapter.reconcileNewItem) {
        domainItemId = await adapter.reconcileNewItem(
          { name: originItem.item_name, isChemical: originItem.is_chemical ?? undefined },
          ctx,
          originItem.po_item_id ?? null
        );
      }
      if (domainItemId && domainItemId !== (originItem.domain_item_id ?? null)) {
        // Back-link the origin line, the fresh replacement line, and the PO line
        // so later reads/replacements see a linked item (RM's reconcile already
        // backfilled the PO line in its own transaction; this is a no-op there).
        const { error: relinkErr } = await this.supabase
          .from('procurement_grn_items')
          .update({ domain_item_id: domainItemId })
          .in('id', [originItem.id, newItem.id]);
        if (relinkErr) throw relinkErr;
        if (originItem.po_item_id) {
          const { error: poLinkErr } = await this.supabase
            .from('procurement_purchase_order_items')
            .update({ domain_item_id: domainItemId })
            .eq('id', originItem.po_item_id);
          if (poLinkErr) throw poLinkErr;
        }
      }
      if (domainItemId) {
        await adapter.postReceipt(
          {
            domainItemId,
            acceptedQuantity: accepted,
            costPrice,
            totalValue: costPrice * accepted,
            batchNumber: input.batch_number,
            expiryDate: input.expiry_date,
            manufacturingDate: input.manufacturing_date,
            grnId: grn.id,
            grnNumber,
            purchaseOrderId: parentGrn.purchase_order_id,
            grnItemId: newItem.id,
          },
          ctx
        );
        posted = true;
      }

      // 7) Recompute the PO line's received_quantity — atomic single-statement
      //    RPC (same mechanism as verifyGrn) + recompute PO status.
      const { error: advErr } = await this.supabase.rpc(
        'fn_procurement_recompute_po_line_received',
        { p_po_item_id: originItem.po_item_id }
      );
      if (advErr) throw advErr;
      await this.refreshPoReceiptStatus(parentGrn.purchase_order_id);

      // 8) Link the fulfilment back to the pending row.
      const { error: linkRepErr } = await this.supabase
        .from('procurement_grn_replacements')
        .update({ replacement_grn_item_id: newItem.id })
        .eq('id', input.replacement_id);
      if (linkRepErr) throw linkRepErr;

      return grn as ProcurementGrn;
    } catch (error) {
      if (!posted) {
        // Inventory untouched — void the just-created paper trail (line before
        // header for the FK) so the PO recompute never sums an orphan, then
        // roll the claim back so the replacement can be retried cleanly.
        if (createdItemId) {
          await this.supabase.from('procurement_grn_items').delete().eq('id', createdItemId);
        }
        if (createdGrnId) {
          await this.supabase.from('procurement_grn').delete().eq('id', createdGrnId);
        }
        await this.supabase
          .from('procurement_grn_replacements')
          .update({ status: 'pending', replacement_grn_item_id: null })
          .eq('id', input.replacement_id);
      } else {
        // Goods ARE in inventory — reopening the claim would let a retry create
        // a second line and post again. Keep it 'received' and surface the
        // incomplete follow-through (PO totals / fulfilment link) for repair.
        console.error(
          `[ProcurementGrnService] receiveReplacement: inventory posted but a later step failed — replacement ${input.replacement_id} stays received; check PO received_quantity and replacement_grn_item_id linkage`
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
