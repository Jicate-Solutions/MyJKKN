// lib/services/ims/pos-device-payment-service.ts
//
// SERVER-ONLY. IMS counter payments collected on a Razorpay POS DQR terminal.
//
// The terminal is a customer-facing soundbox on the counter. We push the bill
// amount to it by serial number; it shows a dynamic UPI QR; the customer pays;
// this server asks Ezetap until it says AUTHORIZED, then books the sale.
//
// Sits beside ImsGatewayPaymentService and SHARES ITS TABLE AND RULES, not its
// implementation (see specs/razorpay-pos-dqr-device-integration-2026-08-27.md §12):
//
//   - THE SERVER PRICES THE CART. Same priceServerSide; the route takes lines,
//     never an amount. The sale is booked from the stored snapshot.
//   - 'paid' IS NOT THE FINISH LINE. sale_id is. Same ims_gateway_finalize_sale.
//   - NEVER REFUSE MONEY WE RECEIVED. An AUTHORIZED that arrives after our
//     deadline or after a cancel is taken and flagged late_credit.
//
// What is different from the Razorpay QR, and why each piece below exists:
//
//   - NO WEBHOOK, NO SIGNATURE. Our server asking Ezetap is the only proof, so
//     the browser can never assert anything — it only asks "what does the server
//     think?".
//   - ONE PUSH PER TERMINAL. Ezetap refuses a second with EZETAP_0000623. The
//     unique index uq_ims_pos_device_inflight refuses it here first, before any
//     vendor call, and we tell the cashier which payment is holding the device.
//   - A PUSH LEFT ALONE KEEPS THE TERMINAL ARMED. So the deadline is enforced by
//     the server (in the poll, and in the sweep cron for a closed tab), by
//     withdrawing the push from the device — not by a countdown in the browser.

import 'server-only';

import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { toPaise } from '@/lib/services/payments/amount';
import { EzetapApiError, EzetapTransportError } from '@/lib/services/payments/ezetap/client';
import { describePushError } from '@/lib/services/payments/ezetap/errors';
import {
  getPosDeviceProvider,
  type EzetapPosProvider,
} from '@/lib/services/payments/ezetap/ezetap-pos-provider';
import { PosDeviceVault, type PosDeviceSummary } from '@/lib/services/payments/ezetap/device-vault';
import type { EzetapOutcome } from '@/lib/services/payments/ezetap/status';
import { ImsGatewayPaymentService, type GatewayCartLine } from './gateway-payment-service';
import { logger } from '@/lib/utils/enhanced-logger';

const LOG = 'ims/pos-device-payment';

function envMs(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Timing. The vendor suggests "start asking at 30s, every 10s, cancel at 150s" and
 * says the values are configurable. Thirty seconds of silence is too long at a
 * till, so we ask sooner; the 150s ceiling is the vendor's own.
 */
const FIRST_INQUIRY_MS = () => envMs('EZETAP_DQR_FIRST_INQUIRY_MS', 5_000);
const INQUIRY_COOLDOWN_MS = () => envMs('EZETAP_DQR_INQUIRY_COOLDOWN_MS', 5_000);
const DEADLINE_MS = () => envMs('EZETAP_DQR_DEADLINE_MS', 150_000);
/**
 * After the deadline, how long an unanswerable payment (Ezetap says "unknown", or
 * refuses the cancel because the customer is mid-payment) is still watched live
 * before it is parked as needs_review for the sweep and a human.
 */
const GRACE_MS = () => envMs('EZETAP_DQR_GRACE_MS', 90_000);

const MIN_AMOUNT_PAISE = 100;
const MAX_AMOUNT_PAISE = 100_000 * 100;

/** Rows the poll still has a question about. */
const OPEN_STATUSES = ['initiated', 'needs_review'];

export interface PushToDeviceInput {
  storeId: string;
  lines: GatewayCartLine[];
  additionalDiscount?: number;
  customerType?: string;
  customerName?: string | null;
  customerPhone?: string | null;
}

/** The terminal is holding another payment. Carries what the cashier needs to clear it. */
export class PosDeviceBusyError extends Error {
  constructor(
    message: string,
    public readonly blocking: { id: string; amount: number; createdAt: string } | null,
  ) {
    super(message);
    this.name = 'PosDeviceBusyError';
  }
}

export interface PosDevicePaymentStatus {
  id: string;
  status: string;
  amount: number;
  sale_id: string | null;
  sale_number: string | null;
  expires_at: string;
  late_credit: boolean;
  finalize_error: string | null;
  finalize_fatal: boolean;
  device_label: string | null;
  /** Ezetap's lifecycle marker, for "sent" vs "customer is paying" on screen. */
  terminal_stage: string | null;
  environment: 'demo' | 'live' | null;
}

export class ImsPosDevicePaymentService {
  /** Is there a usable terminal on this counter? Drives whether the POS shows the tab. */
  static async getStoreTerminal(storeId: string, userId: string): Promise<PosDeviceSummary | null> {
    const supabase = (await createServerSupabaseClient()) as any;
    // Same ownership check as a push, so this cannot enumerate other counters.
    await ImsGatewayPaymentService.assertStoreAccess(supabase, storeId, userId);
    if (!PosDeviceVault.isConfigured()) return null;
    const d = await PosDeviceVault.activeSummaryForStore(storeId);
    return d && d.hasCredentials ? d : null;
  }

  // ── Push ───────────────────────────────────────────────────────────────────

  static async pushToDevice(input: PushToDeviceInput, userId: string) {
    const supabase = (await createServerSupabaseClient()) as any;

    // 1. May this cashier sell here, and can a sale be booked at all? Checked
    //    BEFORE money is asked for, never after (see assertStoreAccess).
    const { institutionId, storeCode } = await ImsGatewayPaymentService.assertStoreAccess(
      supabase,
      input.storeId,
      userId,
    );

    // 2. The server prices the cart.
    const priced = await ImsGatewayPaymentService.priceServerSide(
      supabase,
      input.storeId,
      institutionId,
      input.lines,
      input.additionalDiscount ?? 0,
    );

    // 3. Bounds, so the vendor's amount-limit codes cannot occur.
    const amountPaise = toPaise(priced.total_amount);
    if (amountPaise < MIN_AMOUNT_PAISE) {
      throw new Error('Amount is below the minimum a UPI payment can collect');
    }
    if (amountPaise > MAX_AMOUNT_PAISE) {
      throw new Error('Amount is above the counter limit for a single UPI payment');
    }

    // 4. Which terminal. No fallback: a device is hardware on one counter, and
    //    pushing to "some other" terminal would ask a customer somewhere else.
    if (!PosDeviceVault.isConfigured()) {
      throw new Error('No payment terminal is set up for this store — take payment another way.');
    }
    const device = await PosDeviceVault.activeSummaryForStore(input.storeId);
    if (!device || !device.hasCredentials) {
      throw new Error('No payment terminal is set up for this store — take payment another way.');
    }
    const provider = await getPosDeviceProvider(device.id, { purpose: 'push' });

    const transactionRef = `IMSDQR-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`;

    const service = createServiceRoleClient() as any;

    // 5. INSERT BEFORE PUSHING. The row always exists before the terminal shows
    //    anything, and the in-flight index refuses a busy device right here.
    const expiresAt = new Date(Date.now() + DEADLINE_MS());
    const { data: row, error: insErr } = await service
      .from('ims_gateway_payments')
      .insert({
        store_id: input.storeId,
        institution_id: institutionId,
        cashier_id: userId,
        transaction_ref: transactionRef,
        provider: 'ezetap_pos',
        method: 'pos_dqr',
        amount_paise: amountPaise,
        amount: priced.total_amount,
        cart_snapshot: priced,
        customer_type: input.customerType ?? 'walk_in',
        customer_name: input.customerName ?? null,
        customer_phone: input.customerPhone ?? null,
        expires_at: expiresAt.toISOString(),
        pos_device_id: device.id,
        device_serial: device.serial,
        device_label: device.label,
      })
      .select()
      .single();

    if (insErr || !row) {
      if (insErr?.code === '23505' && String(insErr.message).includes('uq_ims_pos_device_inflight')) {
        throw await this.busyError(service, device);
      }
      throw new Error(`Could not open payment: ${insErr?.message ?? 'unknown'}`);
    }

    // 6. Push.
    let p2pRequestId: string;
    try {
      const pushed = await provider.push({
        externalRef: transactionRef,
        amountPaise,
        description: `${storeCode} ${transactionRef}`,
        customerName: input.customerName ?? null,
        customerMobile: input.customerPhone ?? null,
      });
      p2pRequestId = pushed.p2pRequestId;
    } catch (err) {
      // A vendor refusal is definitive: nothing is on the terminal. A transport
      // failure is NOT — the push may have landed, and without its p2pRequestId
      // we cannot ask or cancel. That row is parked for a human, never 'failed',
      // because 'failed' would invite the cashier to take the money a second way.
      const definitive = err instanceof EzetapApiError;
      const message = definitive
        ? describePushError(err.code, err.message, device.label)
        : `Could not confirm the amount reached ${device.label}. If the terminal is showing ` +
          `it, cancel it on the terminal before taking payment another way.`;

      await ImsGatewayPaymentService.writeRow(
        service,
        row.id,
        {
          status: definitive ? 'failed' : 'needs_review',
          finalize_error: definitive ? message : `Push outcome unknown: ${(err as Error).message}`,
          gateway_response: definitive ? ((err as EzetapApiError).raw as object) : null,
          updated_at: new Date().toISOString(),
        },
        definitive ? 'mark failed (push refused)' : 'mark needs_review (push outcome unknown)',
        ['initiated'],
      );
      await PosDeviceVault.recordHealth(device.id, {
        ok: false,
        code: definitive ? (err as EzetapApiError).code : 'TRANSPORT',
        message: (err as Error).message,
      });
      logger.error(LOG, 'push failed', { id: row.id, definitive, error: (err as Error).message });

      if (definitive && (err as EzetapApiError).code === 'EZETAP_0000623') {
        // Busy on Ezetap's side but not ours: something outside this system (or a
        // row we lost) holds the device. It can only be cleared on the terminal.
        throw new PosDeviceBusyError(message, null);
      }
      throw new Error(message);
    }

    // 7. Record the handle. If that write fails the terminal is showing a payment
    //    nothing can track — withdraw it rather than leave it payable.
    const linked = await ImsGatewayPaymentService.writeRow(
      service,
      row.id,
      { p2p_request_id: p2pRequestId, updated_at: new Date().toISOString() },
      'attach p2p_request_id',
    );
    if (!linked) {
      const withdrawn = await provider.cancel(p2pRequestId).catch(() => null);
      await ImsGatewayPaymentService.writeRow(
        service,
        row.id,
        {
          status: withdrawn?.cancelled ? 'failed' : 'needs_review',
          finalize_error: `Could not record the terminal request ${p2pRequestId}`,
        },
        'mark after link failure',
        ['initiated'],
      );
      throw new Error('Could not record the terminal payment — please try again');
    }

    await PosDeviceVault.recordHealth(device.id, { ok: true });

    return {
      id: row.id as string,
      transactionRef,
      amount: priced.total_amount,
      amountPaise,
      deviceLabel: device.label,
      environment: device.environment,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** Name the payment holding the terminal, so the cashier can clear it. */
  private static async busyError(service: any, device: PosDeviceSummary) {
    const { data: blocking } = await service
      .from('ims_gateway_payments')
      .select('id, amount, created_at')
      .eq('pos_device_id', device.id)
      .eq('status', 'initiated')
      .maybeSingle();

    const secs = blocking
      ? Math.max(0, Math.round((Date.now() - new Date(blocking.created_at).getTime()) / 1000))
      : null;
    return new PosDeviceBusyError(
      blocking
        ? `${device.label} is still waiting on a payment of ₹${Number(blocking.amount).toFixed(2)} ` +
            `started ${secs}s ago. Cancel that one first, or wait for it to finish.`
        : `${device.label} is busy with another payment. Try again in a moment.`,
      blocking
        ? { id: blocking.id, amount: Number(blocking.amount), createdAt: blocking.created_at }
        : null,
    );
  }

  // ── Poll ───────────────────────────────────────────────────────────────────

  /**
   * What the POS screen polls. Asks Ezetap (rate-limited server-side, so extra
   * tabs cannot multiply vendor calls), enforces the deadline, books the sale in
   * the cashier's session, and reports.
   */
  static async getStatus(paymentId: string, _userId: string): Promise<PosDevicePaymentStatus> {
    const supabase = (await createServerSupabaseClient()) as any;

    // Through the caller's session: RLS scopes the row to their institution.
    const { data: row } = await supabase
      .from('ims_gateway_payments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();
    if (!row || row.method !== 'pos_dqr') throw new Error('Payment not found');

    let current = await this.advance(row);

    if (current.status === 'paid' && !current.sale_id) {
      current = await ImsGatewayPaymentService.finalize(current, supabase);
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

    const stage = (current.gateway_response as { messageCode?: string } | null)?.messageCode ?? null;
    return {
      id: current.id,
      status: current.status,
      amount: Number(current.amount),
      sale_id: current.sale_id ?? null,
      sale_number: saleNumber,
      expires_at: current.expires_at,
      late_credit: !!current.late_credit,
      finalize_error: current.finalize_error ?? null,
      finalize_fatal: !!current.finalize_fatal,
      device_label: current.device_label ?? null,
      terminal_stage: stage,
      environment: current.__environment ?? null,
    };
  }

  /**
   * Move an open row forward: ask Ezetap, apply the answer, enforce the deadline.
   * Service-role writes, so the sweep can use it with no cashier session. Returns
   * the row as it now stands. Never throws for a vendor hiccup — the next poll or
   * sweep simply asks again.
   */
  static async advance(row: any): Promise<any> {
    if (!OPEN_STATUSES.includes(row.status) || !row.p2p_request_id || !row.pos_device_id) {
      return row;
    }

    const now = Date.now();
    const age = now - new Date(row.created_at).getTime();
    const cooledDown =
      !row.last_inquiry_at || now - new Date(row.last_inquiry_at).getTime() > INQUIRY_COOLDOWN_MS();
    if (age < FIRST_INQUIRY_MS() || !cooledDown) return row;

    const service = createServiceRoleClient() as any;
    const stamp = { last_inquiry_at: new Date().toISOString() };

    let provider: EzetapPosProvider;
    try {
      // PINNED to the device this was pushed to, active or not.
      provider = await getPosDeviceProvider(row.pos_device_id);
    } catch (err) {
      logger.error(LOG, 'cannot load the terminal for an open payment', {
        id: row.id, error: (err as Error).message,
      });
      await ImsGatewayPaymentService.writeRow(service, row.id, stamp, 'stamp (no provider)');
      if (row.status === 'initiated') {
        return this.parkIfOverdue(
          service,
          { ...row, ...stamp },
          now - new Date(row.expires_at).getTime(),
          `Terminal credentials unavailable: ${(err as Error).message}`,
        );
      }
      return { ...row, ...stamp };
    }

    try {
      const { outcome, raw } = await provider.getOutcome(row.p2p_request_id);
      let next = await this.apply(service, row, outcome, raw, stamp);

      // Deadline: withdraw a push nobody has paid, so the terminal is free for
      // the next customer even if this browser tab is long gone.
      const pastDeadline = now > new Date(row.expires_at).getTime();
      if (next.status === 'initiated' && pastDeadline) {
        next = await this.withdraw(service, next, provider, now);
      }
      return { ...next, __environment: provider.environment };
    } catch (err) {
      logger.warn(LOG, 'terminal inquiry failed (non-fatal)', {
        id: row.id, error: (err as Error).message,
      });
      await ImsGatewayPaymentService.writeRow(service, row.id, stamp, 'stamp after failure');
      // Ezetap unreachable for longer than the whole window plus grace: stop
      // presenting this as live. Parked, not failed — we cannot say what happened.
      if (row.status === 'initiated') {
        const parked = await this.parkIfOverdue(
          service,
          { ...row, ...stamp },
          now - new Date(row.expires_at).getTime(),
          `Could not reach the terminal service: ${(err as Error).message}`,
        );
        return { ...parked, __environment: provider.environment };
      }
      return { ...row, ...stamp, __environment: provider.environment };
    }
  }

  /** Write what Ezetap said. Every write is guarded so a slower path cannot overwrite a faster one. */
  private static async apply(
    service: any,
    row: any,
    outcome: EzetapOutcome,
    raw: unknown,
    stamp: Record<string, unknown>,
  ): Promise<any> {
    const base = { ...stamp, gateway_response: raw as object, updated_at: new Date().toISOString() };

    switch (outcome.kind) {
      case 'paid': {
        const d = outcome.details;
        const common = {
          ...base,
          ezetap_txn_id: d.txnId,
          captured_amount_paise: d.amountPaise,
          gateway_method: d.paymentMode?.toLowerCase() ?? 'upi',
          bank_rrn: d.rrNumber,
          payer_contact: d.customerMobile,
        };
        // Paise-exact, the same rule the Razorpay paths apply. A missing amount
        // is a mismatch, never a pass.
        if (d.amountPaise === null || d.amountPaise !== Number(row.amount_paise)) {
          const patch = { ...common, status: 'amount_mismatch' };
          await ImsGatewayPaymentService.writeRow(service, row.id, patch, 'mark amount_mismatch (dqr)', OPEN_STATUSES);
          logger.error(LOG, 'terminal amount does not match the bill', {
            id: row.id, expectedPaise: row.amount_paise, capturedPaise: d.amountPaise,
          });
          return { ...row, ...patch };
        }
        const patch = {
          ...common,
          status: 'paid',
          paid_at: new Date().toISOString(),
          // Paid after we gave up on it (needs_review) — honoured, and flagged.
          late_credit: row.status !== 'initiated',
          finalize_error: null,
        };
        await ImsGatewayPaymentService.writeRow(service, row.id, patch, 'mark paid (dqr)', OPEN_STATUSES);
        return { ...row, ...patch };
      }
      case 'failed': {
        const patch = { ...base, status: 'failed', finalize_error: outcome.reason };
        await ImsGatewayPaymentService.writeRow(service, row.id, patch, 'mark failed (dqr)', OPEN_STATUSES);
        return { ...row, ...patch };
      }
      case 'expired': {
        const patch = { ...base, status: 'expired' };
        await ImsGatewayPaymentService.writeRow(service, row.id, patch, 'mark expired (dqr)', OPEN_STATUSES);
        return { ...row, ...patch };
      }
      case 'cancelled': {
        const patch = {
          ...base,
          status: 'cancelled',
          finalize_error: outcome.by === 'device' ? 'Cancelled on the terminal' : null,
        };
        await ImsGatewayPaymentService.writeRow(service, row.id, patch, 'mark cancelled (dqr)', OPEN_STATUSES);
        return { ...row, ...patch };
      }
      case 'pending':
      case 'unknown': {
        // Keep the latest vendor body (its messageCode drives the on-screen stage).
        await ImsGatewayPaymentService.writeRow(service, row.id, base, `stamp ${outcome.kind} (dqr)`);
        return { ...row, ...base };
      }
    }
  }

  /**
   * Past the deadline and still open: take it off the terminal.
   *
   * Cancel first, THEN ask once more — after a successful cancel no payment can
   * start, so that answer is final. If the customer is already paying, Ezetap
   * refuses the cancel and we keep watching; after the grace period the row is
   * parked as needs_review for the sweep, never marked failed.
   */
  private static async withdraw(service: any, row: any, provider: EzetapPosProvider, now: number) {
    const overdueBy = now - new Date(row.expires_at).getTime();

    let result;
    try {
      result = await provider.cancel(row.p2p_request_id);
    } catch (err) {
      logger.warn(LOG, 'deadline cancel failed; will retry', { id: row.id, error: (err as Error).message });
      return this.parkIfOverdue(service, row, overdueBy, 'Could not withdraw the payment from the terminal');
    }

    if (!result.cancelled) {
      return this.parkIfOverdue(
        service,
        row,
        overdueBy,
        result.reason === 'payment_initiated'
          ? 'The customer started paying on the terminal as it timed out'
          : `Terminal refused the cancel: ${result.message}`,
      );
    }

    // Withdrawn. One final question closes the race with a payment that finished
    // between our last poll and the cancel.
    try {
      const { outcome, raw } = await provider.getOutcome(row.p2p_request_id);
      if (outcome.kind === 'paid') {
        return this.apply(service, row, outcome, raw, { last_inquiry_at: new Date().toISOString() });
      }
    } catch {
      /* the cancel succeeded, so nothing more can be paid into it */
    }

    const patch = {
      status: 'expired',
      finalize_error: 'Timed out — withdrawn from the terminal',
      updated_at: new Date().toISOString(),
    };
    await ImsGatewayPaymentService.writeRow(service, row.id, patch, 'mark expired (withdrawn)', ['initiated']);
    return { ...row, ...patch };
  }

  private static async parkIfOverdue(service: any, row: any, overdueBy: number, why: string) {
    if (overdueBy < GRACE_MS()) return row;
    const patch = { status: 'needs_review', finalize_error: why, updated_at: new Date().toISOString() };
    await ImsGatewayPaymentService.writeRow(service, row.id, patch, 'park needs_review', ['initiated']);
    logger.warn(LOG, 'payment parked for review', { id: row.id, why });
    return { ...row, ...patch };
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────

  /**
   * The cashier withdrew the payment (or is clearing a busy terminal). The
   * terminal is the arbiter: once Ezetap accepts the cancel, nothing more can be
   * paid, so we ask one final time and only then record a cancellation.
   */
  static async cancel(
    paymentId: string,
    _userId: string,
  ): Promise<{ cancelled: boolean; reason: string }> {
    const supabase = (await createServerSupabaseClient()) as any;
    const { data: row } = await supabase
      .from('ims_gateway_payments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();
    if (!row || row.method !== 'pos_dqr') throw new Error('Payment not found');

    if (row.status !== 'initiated') return { cancelled: false, reason: row.status };

    const service = createServiceRoleClient() as any;

    // Never reached the terminal — bookkeeping only.
    if (!row.p2p_request_id) {
      await ImsGatewayPaymentService.writeRow(
        service, row.id, { status: 'cancelled', updated_at: new Date().toISOString() },
        'mark cancelled (never pushed)', ['initiated'],
      );
      return { cancelled: true, reason: 'cancelled' };
    }

    let provider: EzetapPosProvider;
    let result;
    try {
      provider = await getPosDeviceProvider(row.pos_device_id);
      result = await provider.cancel(row.p2p_request_id);
    } catch (err) {
      logger.error(LOG, 'cancel failed — leaving the payment open', { id: row.id, error: err });
      return { cancelled: false, reason: 'cancel_failed' };
    }

    if (!result.cancelled) {
      return {
        cancelled: false,
        reason: result.reason === 'payment_initiated' ? 'payment_in_flight' : 'cancel_refused',
      };
    }

    try {
      const { outcome, raw } = await provider.getOutcome(row.p2p_request_id);
      if (outcome.kind === 'paid') {
        await this.apply(service, row, outcome, raw, { last_inquiry_at: new Date().toISOString() });
        return { cancelled: false, reason: 'payment_in_flight' };
      }
    } catch {
      /* cancel accepted: nothing further can be paid */
    }

    await ImsGatewayPaymentService.writeRow(
      service, row.id, { status: 'cancelled', updated_at: new Date().toISOString() },
      'mark cancelled (withdrawn by cashier)', ['initiated'],
    );
    return { cancelled: true, reason: 'cancelled' };
  }

  // ── Sweep ──────────────────────────────────────────────────────────────────

  /**
   * The cron's half. A closed tab stops the poll, but must not leave a terminal
   * armed or a paid customer unrecorded. Moves every open DQR row forward with
   * the same logic the poll uses.
   *
   * It does NOT book sales: ims_gateway_finalize_sale runs as the cashier
   * (auth.uid()). A row the sweep marks paid is booked the next time anyone
   * polls it, and shows on /ims/reports/gateway-payments meanwhile.
   */
  static async sweep(): Promise<{ examined: number; changed: number }> {
    const service = createServiceRoleClient() as any;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await service
      .from('ims_gateway_payments')
      .select('*')
      .eq('method', 'pos_dqr')
      .in('status', OPEN_STATUSES)
      .gte('created_at', since)
      .order('created_at')
      .limit(50);
    if (error) throw new Error(`sweep read failed: ${error.message}`);

    let changed = 0;
    for (const row of rows ?? []) {
      // Leave rows a live poll is still handling; needs_review is re-asked every
      // few minutes rather than every run.
      const graceOver = Date.now() > new Date(row.expires_at).getTime() + 30_000;
      const reviewDue =
        row.status === 'needs_review' &&
        (!row.last_inquiry_at || Date.now() - new Date(row.last_inquiry_at).getTime() > 5 * 60_000);
      if (row.status === 'initiated' && !graceOver) continue;
      if (row.status === 'needs_review' && !reviewDue) continue;

      const next = await this.advance({ ...row, last_inquiry_at: null });
      if (next.status !== row.status) changed++;
    }
    return { examined: rows?.length ?? 0, changed };
  }
}
