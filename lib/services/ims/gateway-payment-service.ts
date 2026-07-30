// lib/services/ims/gateway-payment-service.ts
//
// SERVER-ONLY. Gateway-verified counter payments.
//
// The manual UPI QR this sits beside cannot know whether money arrived — it points
// at a bank account the application has no connection to, so "paid" means a cashier
// typed a reference and clicked a button. Here Razorpay issues the QR against a
// merchant account we can query, reports the credit itself, and tells us the amount
// it actually captured.
//
// Two rules shape everything below:
//
//   1. THE SERVER PRICES THE CART. The route never accepts an amount, a unit price
//      or a cost price. Items are re-read from ims_items and re-priced here, and the
//      priced result is stored on the payment row. The sale is later booked FROM
//      THAT SNAPSHOT, so the amount the customer was asked for and the amount the
//      sale books cannot diverge.
//
//   2. NEVER REFUSE MONEY WE RECEIVED. If Razorpay credits a QR after our own
//      expiry, we take it, flag it, and book the sale. The alternative is a customer
//      who has paid and a counter that says they have not.

import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getPaymentProvider } from '@/lib/services/payments/factory';
import { RazorpayProvider } from '@/lib/services/payments/razorpay/razorpay-provider';
import { IMS_POS_FEE_HEAD } from '@/lib/services/payments/fee-heads';
import { toPaise } from '@/lib/services/payments/amount';
import { priceCart, type PriceableSaleLine } from '@/lib/services/ims/sale-pricing';
import { logger } from '@/lib/utils/enhanced-logger';

/** How long a counter QR stays payable. Razorpay enforces its own minimum too. */
const QR_TTL_SECONDS = 15 * 60;
/** Razorpay's own floor for a UPI collection. */
const MIN_AMOUNT_PAISE = 100;
/** Counter ceiling. Replaces the bare `100000` literal the manual QR route used. */
const MAX_AMOUNT_PAISE = 100_000 * 100;
/** Don't ask Razorpay again more often than this while the cashier's screen polls. */
const INQUIRY_COOLDOWN_MS = 5_000;

export interface GatewayCartLine {
  item_id: string;
  quantity: number;
  discount_percent?: number;
}

export interface CreateGatewayPaymentInput {
  storeId: string;
  institutionId: string;
  lines: GatewayCartLine[];
  additionalDiscount?: number;
  customerType?: string;
  customerName?: string | null;
  customerPhone?: string | null;
}

export interface GatewayPaymentStatus {
  id: string;
  status: string;
  amount: number;
  sale_id: string | null;
  sale_number: string | null;
  razorpay_payment_id: string | null;
  expires_at: string;
  late_credit: boolean;
  finalize_error: string | null;
}

export class ImsGatewayPaymentService {
  /**
   * Verify the caller may bill for this store.
   *
   * Mirrors the ownership check ImsPaymentService.generateUpiQr makes, and the one
   * ims_pos_checkout enforces in SQL — a route that opens a payment must not be
   * weaker than the function that later books the sale.
   */
  private static async assertStoreAccess(
     
    supabase: any,
    storeId: string,
    userId: string,
  ): Promise<{ institutionId: string; storeName: string; storeCode: string }> {
    const { data: store } = await supabase
      .from('ims_stores')
      .select('id, name, code, institution_id, is_active')
      .eq('id', storeId)
      .maybeSingle();

    if (!store || !store.is_active) throw new Error('Store not found');

    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', userId)
      .maybeSingle();

    const isSuperAdmin = profile?.role === 'super_admin';
    if (!isSuperAdmin && profile?.institution_id !== store.institution_id) {
      throw new Error('You do not have access to this store');
    }

    return {
      institutionId: store.institution_id,
      storeName: store.name,
      storeCode: store.code,
    };
  }

  /**
   * Re-price the cart from the catalog.
   *
   * This is the whole point of the route taking `lines` rather than an amount: a
   * browser can ask to buy item X, but it cannot say what X costs.
   */
  private static async priceServerSide(
     
    supabase: any,
    storeId: string,
    institutionId: string,
    lines: GatewayCartLine[],
    additionalDiscount: number,
  ) {
    if (!lines?.length) throw new Error('Cart is empty');

    for (const l of lines) {
      if (!l.item_id) throw new Error('Cart line is missing an item');
      if (!(l.quantity > 0)) throw new Error('Quantity must be greater than 0');
      const dp = l.discount_percent ?? 0;
      if (dp < 0 || dp > 100) throw new Error('Line discount must be between 0 and 100');
    }

    const ids = [...new Set(lines.map((l) => l.item_id))];

    // Same filter getSellableItems uses, so anything the POS could not legitimately
    // have shown cannot be bought either.
    const { data: items, error } = await supabase
      .from('ims_items')
      .select('id, name, selling_price, cost_price')
      .in('id', ids)
      .eq('is_active', true)
      .eq('is_sellable_to_students', true)
      .eq('institution_id', institutionId);

    if (error) throw new Error(`Could not read items: ${error.message}`);

    const byId = new Map<string, { selling_price: number; cost_price: number }>(
       
      (items ?? []).map((i: any) => [i.id, { selling_price: i.selling_price, cost_price: i.cost_price }]),
    );

    // An id that does not come back is where a tampered or stale cart dies.
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new Error('One or more items are no longer available for sale — refresh the cart');
    }

    const priceable: PriceableSaleLine[] = lines.map((l) => {
      const cat = byId.get(l.item_id)!;
      return {
        item_id: l.item_id,
        quantity: l.quantity,
        unit_price: Number(cat.selling_price ?? 0),
        cost_price: Number(cat.cost_price ?? 0),
        discount_percent: l.discount_percent ?? 0,
      };
    });

    const priced = priceCart(priceable, additionalDiscount);

    // Never open a payment for stock we cannot hand over.
    const { data: stock } = await supabase
      .from('ims_stock_summary')
      .select('item_id, available_quantity')
      .eq('store_id', storeId)
      .in('item_id', ids);

    const availableById = new Map<string, number>(
       
      (stock ?? []).map((s: any) => [s.item_id, Number(s.available_quantity ?? 0)]),
    );
    for (const l of priceable) {
      const have = availableById.get(l.item_id) ?? 0;
      if (have < l.quantity) {
        throw new Error('Not enough stock for one or more items — refresh the cart');
      }
    }

    return priced;
  }

  /** Open a Razorpay QR for this cart. */
  static async createQr(input: CreateGatewayPaymentInput, userId: string) {
     
    const supabase = (await createServerSupabaseClient()) as any;

    const { institutionId, storeName, storeCode } = await this.assertStoreAccess(
      supabase,
      input.storeId,
      userId,
    );

    const priced = await this.priceServerSide(
      supabase,
      input.storeId,
      institutionId,
      input.lines,
      input.additionalDiscount ?? 0,
    );

    const amountPaise = toPaise(priced.total_amount);
    if (amountPaise < MIN_AMOUNT_PAISE) {
      throw new Error('Amount is below the minimum a UPI payment can collect');
    }
    if (amountPaise > MAX_AMOUNT_PAISE) {
      throw new Error('Amount is above the counter limit for a single UPI payment');
    }

    const creds = await import('@/lib/services/payments/razorpay/resolve-credentials').then((m) =>
      m.resolveRazorpayCredentials({
        institutionId,
        feeHead: IMS_POS_FEE_HEAD,
        purpose: 'create-order',
      }),
    );

    // FAIL CLOSED IN PRODUCTION. Resolution falls back to the common env account
    // when no vault row matches, which for counter takings would mean collecting
    // into the wrong merchant account. In development that fallback is how local
    // testing works at all, so it is permitted there — the same split
    // sandboxPaymentsAllowed() already makes for test-mode keys.
    const isProduction = (process.env.VERCEL_ENV ?? process.env.NODE_ENV) === 'production';
    if (isProduction && creds.source !== 'institution') {
      throw new Error(
        'Verified UPI is not set up for this store yet — use the UPI QR tab.',
      );
    }

    const transactionRef = `IMSPOS-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`;

    const service = createServiceRoleClient() as any;

    // INSERT BEFORE CALLING RAZORPAY. If the API succeeds and our write then fails,
    // the reverse order would leave a live QR the customer can pay into with nothing
    // tracking it. This way the row always exists first and the qr id is filled in
    // after; a failure leaves a row we can close, not money we cannot see.
    const expiresAt = new Date(Date.now() + QR_TTL_SECONDS * 1000);
    const { data: row, error: insErr } = await service
      .from('ims_gateway_payments')
      .insert({
        store_id: input.storeId,
        institution_id: institutionId,
        cashier_id: userId,
        transaction_ref: transactionRef,
        amount_paise: amountPaise,
        amount: priced.total_amount,
        cart_snapshot: priced,
        customer_type: input.customerType ?? 'walk_in',
        customer_name: input.customerName ?? null,
        customer_phone: input.customerPhone ?? null,
        expires_at: expiresAt.toISOString(),
        razorpay_account_id: creds.accountId ?? null,
      })
      .select()
      .single();

    if (insErr || !row) throw new Error(`Could not open payment: ${insErr?.message ?? 'unknown'}`);

    try {
      const provider = (await getPaymentProvider('ims', {
        institutionId,
        feeHead: IMS_POS_FEE_HEAD,
        purpose: 'create-order',
      })) as RazorpayProvider;

      const qr = await provider.createQrCode({
        transactionRef,
        amountPaise,
        module: 'ims',
        closeBy: Math.floor(expiresAt.getTime() / 1000),
        name: storeName,
        description: `${storeCode} · ${transactionRef}`,
        notes: {
          gateway_payment_id: row.id,
          store_id: input.storeId,
          store_code: storeCode,
          institution_id: institutionId,
        },
      });

      await service
        .from('ims_gateway_payments')
        .update({
          razorpay_qr_code_id: qr.id,
          qr_image_url: qr.image_url,
          gateway_response: qr as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      return {
        id: row.id as string,
        transactionRef,
        amount: priced.total_amount,
        qrImageUrl: qr.image_url,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (err) {
      await service
        .from('ims_gateway_payments')
        .update({ status: 'failed', finalize_error: err instanceof Error ? err.message : String(err) })
        .eq('id', row.id);
      logger.error('ims/gateway-payment', 'createQrCode failed', err);
      throw err;
    }
  }

  /**
   * What the POS screen polls.
   *
   * Does three things in order, and each is a genuine finalizer in its own right:
   *
   *   1. If the payment is still open, ASK RAZORPAY directly. The webhook is not
   *      the only path to "paid" — it can be missed, misconfigured, or simply
   *      unable to reach the host at all (nothing reaches localhost). Polling that
   *      only read our own table would leave a paid customer staring at a pending
   *      QR forever in development, and after any webhook outage in production.
   *
   *   2. If the money is confirmed but no sale exists yet, BOOK IT. This runs in
   *      the cashier's session, which is why ims_pos_checkout's auth.uid() guard
   *      needs no service-role bypass.
   *
   *   3. Report. `paid` is NOT the terminal state the UI waits for — `sale_id` is.
   *      Stopping at paid would show a cashier "done" while the sale is still
   *      being booked.
   */
  static async getStatus(paymentId: string, userId: string): Promise<GatewayPaymentStatus> {
    const supabase = (await createServerSupabaseClient()) as any;

    // Read through the caller's session: RLS scopes this to their institution, so
    // one store cannot poll another's payments.
    const { data: row, error } = await supabase
      .from('ims_gateway_payments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();

    if (error || !row) throw new Error('Payment not found');

    let current = row;

    // ── 1. Live inquiry ──────────────────────────────────────────────────────
    const cooledDown =
      !current.last_inquiry_at ||
      Date.now() - new Date(current.last_inquiry_at).getTime() > INQUIRY_COOLDOWN_MS;

    if (current.status === 'initiated' && current.razorpay_qr_code_id && cooledDown) {
      current = await this.inquireAndMarkPaid(current);
    }

    // ── 2. Book the sale ─────────────────────────────────────────────────────
    if (current.status === 'paid' && !current.sale_id) {
      current = await this.finalize(current, supabase);
    }

    let saleNumber: string | null = null;
    if (current.sale_id) {
      const { data: sale } = await supabase
        .from('ims_sales')
        .select('sale_number')
        .eq('id', current.sale_id)
        .maybeSingle();
      saleNumber = sale?.sale_number ?? null;
    }

    return {
      id: current.id,
      status: current.status,
      amount: Number(current.amount),
      sale_id: current.sale_id ?? null,
      sale_number: saleNumber,
      razorpay_payment_id: current.razorpay_payment_id ?? null,
      expires_at: current.expires_at,
      late_credit: !!current.late_credit,
      finalize_error: current.finalize_error ?? null,
    };
  }

  /** Ask Razorpay whether this QR has been credited, and record the answer. */
  private static async inquireAndMarkPaid(row: any): Promise<any> {
    const service = createServiceRoleClient() as any;
    const stamp = { last_inquiry_at: new Date().toISOString() };

    try {
      const provider = (await getPaymentProvider('ims', {
        institutionId: row.institution_id,
        feeHead: IMS_POS_FEE_HEAD,
      })) as RazorpayProvider;

      const payments = await provider.getQrCodePayments(row.razorpay_qr_code_id);
      const captured = payments.find((p) => p.status === 'captured');

      if (!captured) {
        // Not paid yet. Expire it locally once past its window — but note this is
        // NOT final: a later credit is still honoured (see qr_code.credited).
        const expired = new Date(row.expires_at).getTime() < Date.now();
        const patch = expired ? { ...stamp, status: 'expired' } : stamp;
        await service.from('ims_gateway_payments').update(patch).eq('id', row.id);
        return { ...row, ...patch };
      }

      const capturedPaise = Number(captured.amount ?? 0);

      // Same rule the webhook applies: the amount actually captured must equal the
      // bill, or a human decides. Booking a sale for a different amount than was
      // collected is worse than making someone look at it.
      if (capturedPaise !== Number(row.amount_paise)) {
        const patch = {
          ...stamp,
          status: 'amount_mismatch',
          razorpay_payment_id: captured.id,
          captured_amount_paise: capturedPaise,
        };
        await service.from('ims_gateway_payments').update(patch).eq('id', row.id);
        logger.error('ims/gateway-payment', 'captured amount does not match the bill', {
          id: row.id, expectedPaise: row.amount_paise, capturedPaise,
        });
        return { ...row, ...patch };
      }

      const patch = {
        ...stamp,
        status: 'paid',
        razorpay_payment_id: captured.id,
        captured_amount_paise: capturedPaise,
        paid_at: new Date().toISOString(),
        late_credit: row.status === 'expired',
      };
      // Guarded so this cannot overwrite a status the webhook already resolved.
      await service
        .from('ims_gateway_payments')
        .update(patch)
        .eq('id', row.id)
        .in('status', ['initiated', 'expired']);

      return { ...row, ...patch };
    } catch (err) {
      // An inquiry failure must not break the cashier's screen — the webhook may
      // still resolve it, and the next poll will try again.
      logger.warn('ims/gateway-payment', 'QR inquiry failed (non-fatal)', err);
      await service.from('ims_gateway_payments').update(stamp).eq('id', row.id);
      return { ...row, ...stamp };
    }
  }

  /**
   * Book the sale for a confirmed payment.
   *
   * Claims the row first: two polls can both observe paid + no sale, and without a
   * claim both would call ims_pos_checkout — deducting stock twice and burning two
   * invoice numbers before the unique index caught the second link.
   */
  private static async finalize(row: any, sessionClient: any): Promise<any> {
    const service = createServiceRoleClient() as any;

    const { data: claimed } = await service
      .from('ims_gateway_payments')
      .update({ finalize_claimed_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'paid')
      .is('sale_id', null)
      .or(`finalize_claimed_at.is.null,finalize_claimed_at.lt.${new Date(Date.now() - 120_000).toISOString()}`)
      .select()
      .maybeSingle();

    // Someone else owns it, or it is already booked. Re-read and report.
    if (!claimed) {
      const { data: fresh } = await service
        .from('ims_gateway_payments').select('*').eq('id', row.id).maybeSingle();
      return fresh ?? row;
    }

    const snapshot = row.cart_snapshot;

    try {
      // Booked from the SERVER-PRICED snapshot, never from anything the browser
      // sends now — that is what keeps the amount charged and the amount booked
      // the same number.
      const { data: result, error: rpcError } = await sessionClient.rpc('ims_pos_checkout', {
        p_store_id:               row.store_id,
        p_institution_id:         row.institution_id,
        p_customer_type:          row.customer_type,
        p_customer_name:          row.customer_name,
        p_customer_id:            null,
        p_payment_method:         'upi_qr',
        p_cash_amount:            0,
        p_gpay_amount:            0,
        p_card_amount:            0,
        p_upi_qr_amount:          Number(row.amount),
        p_gpay_transaction_id:    null,
        p_upi_qr_transaction_ref: row.transaction_ref,
        p_additional_discount:    0,
        p_lines: (snapshot?.lines ?? []).map((l: any) => ({
          item_id:          l.item_id,
          quantity:         l.quantity,
          unit_price:       l.unit_price,
          cost_price:       l.cost_price,
          discount_percent: l.discount_percent,
        })),
      });

      if (rpcError) throw new Error(rpcError.message || 'Checkout failed');

      const saleId = result?.sale_id;
      if (!saleId) throw new Error('Checkout returned no sale');

      // Link both ways. ims_sales.gateway_payment_id is what marks this sale as
      // gateway-VERIFIED, and its unique index is the hard floor against a second
      // sale for the same payment.
      await service.from('ims_sales').update({ gateway_payment_id: row.id }).eq('id', saleId);

      const { data: done } = await service
        .from('ims_gateway_payments')
        .update({
          sale_id: saleId,
          finalize_claimed_at: null,
          finalize_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .select()
        .maybeSingle();

      return done ?? { ...row, sale_id: saleId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Release the claim and record why. The row stays 'paid' — the money IS ours,
      // so the cashier must never be told to collect again. The screen shows
      // "payment received, completing sale" with a retry.
      await service
        .from('ims_gateway_payments')
        .update({ finalize_claimed_at: null, finalize_error: message })
        .eq('id', row.id);
      logger.error('ims/gateway-payment', 'booking the sale failed after payment', {
        id: row.id, error: message,
      });
      return { ...row, finalize_error: message };
    }
  }
}
