// lib/services/payments/ezetap/ezetap-pos-provider.ts
//
// One physical terminal, three verbs: push, ask, withdraw.
//
// Deliberately NOT a PaymentProvider (provider.ts). A device push has no order,
// no signature scheme and no refund endpoint — the same reasoning that keeps
// RazorpayProvider.createQrCode off that interface. Methods live on the class so
// the appKey never leaves it.

import 'server-only';

import type { Paise } from '@/lib/services/payments/amount';
import { sandboxPaymentsAllowed } from '@/lib/services/payments/razorpay/resolve-credentials';
import { EzetapApiError, ezetapRequest } from './client';
import { toEzetapAmount } from './amount';
import { normalizeEzetapStatus, type EzetapOutcome } from './status';
import { PosDeviceVault } from './device-vault';
import type {
  EzetapCancelResponse,
  EzetapDeviceCredentials,
  EzetapPayResponse,
  EzetapStatusResponse,
} from './types';

/** DQR shows a UPI QR. ALL would let a card tap in too; not provisioned for IMS. */
const DQR_MODE = 'UPI';

export interface PushInput {
  /** Our transaction_ref. Ezetap's externalRefNumber — must be non-empty and unique. */
  externalRef: string;
  amountPaise: Paise;
  description?: string | null;
  customerName?: string | null;
  customerMobile?: string | null;
}

export type CancelResult =
  | { cancelled: true }
  /** The customer already submitted payment on the terminal (P2P_PAYMENT_INITIATED). */
  | { cancelled: false; reason: 'payment_initiated'; code: string | null }
  | { cancelled: false; reason: 'refused'; code: string | null; message: string };

export class EzetapPosProvider {
  readonly name = 'ezetap_pos' as const;

  constructor(private readonly creds: EzetapDeviceCredentials) {}

  get deviceId() { return this.creds.deviceId; }
  get label() { return this.creds.label; }
  get serial() { return this.creds.serial; }
  get environment() { return this.creds.environment; }

  private auth() {
    return { username: this.creds.username, appKey: this.creds.appKey };
  }

  private pushTo() {
    return { deviceId: `${this.creds.serial}|${this.creds.kind}` };
  }

  /** Send the amount to the terminal. Returns Ezetap's p2pRequestId. */
  async push(input: PushInput): Promise<{ p2pRequestId: string; raw: EzetapPayResponse }> {
    if (!input.externalRef) throw new Error('externalRef is required'); // else EZETAP_0000387

    const body: Record<string, unknown> = {
      ...this.auth(),
      amount: toEzetapAmount(input.amountPaise),
      externalRefNumber: input.externalRef,
      pushTo: this.pushTo(),
      mode: DQR_MODE,
    };
    if (input.description) body.description = input.description.slice(0, 50);
    if (input.customerName) body.customerName = input.customerName;
    if (input.customerMobile) body.customerMobileNumber = input.customerMobile;
    if (this.creds.accountLabel) body.accountLabel = this.creds.accountLabel;

    const res = await ezetapRequest<EzetapPayResponse>(this.creds.environment, 'pay', body);

    if (res.success !== true || !res.p2pRequestId) {
      throw new EzetapApiError(
        res.errorCode ?? res.messageCode ?? null,
        res.errorMessage || res.message || 'The payment terminal refused the request',
        res,
      );
    }
    return { p2pRequestId: res.p2pRequestId, raw: res };
  }

  /** Ask what happened. Transport errors propagate; the caller retries later. */
  async getOutcome(p2pRequestId: string): Promise<{ outcome: EzetapOutcome; raw: EzetapStatusResponse }> {
    const res = await ezetapRequest<EzetapStatusResponse>(this.creds.environment, 'status', {
      ...this.auth(),
      origP2pRequestId: p2pRequestId,
    });
    return { outcome: normalizeEzetapStatus(res), raw: res };
  }

  /** Withdraw a push from the terminal. */
  async cancel(p2pRequestId: string): Promise<CancelResult> {
    const res = await ezetapRequest<EzetapCancelResponse>(this.creds.environment, 'cancel', {
      ...this.auth(),
      origP2pRequestId: p2pRequestId,
      pushTo: this.pushTo(),
    });
    if (res.success === true) return { cancelled: true };

    const code = res.errorCode ?? res.messageCode ?? null;
    if ([res.errorCode, res.messageCode, res.realCode].includes('P2P_PAYMENT_INITIATED')) {
      return { cancelled: false, reason: 'payment_initiated', code };
    }
    return {
      cancelled: false,
      reason: 'refused',
      code,
      message: res.errorMessage || res.message || 'The terminal did not accept the cancel',
    };
  }
}

/**
 * A provider for a device.
 *
 * `purpose: 'push'` is set ONLY when opening a new payment. It requires the
 * device to be active and refuses a DEMO terminal in production: the demo host
 * simulates payment, so a real bill pushed there would book a sale for money
 * that never moved. Status and cancel on an existing payment omit it, so a
 * payment stays serviceable after its device is deactivated or swapped.
 */
export async function getPosDeviceProvider(
  deviceId: string,
  opts: { purpose?: 'push' } = {},
): Promise<EzetapPosProvider> {
  const creds = await PosDeviceVault.getById(deviceId);
  if (!creds) throw new Error('Payment terminal not found');
  if (!creds.username || !creds.appKey) {
    throw new Error(`${creds.label} has no Razorpay POS credentials saved yet.`);
  }

  if (opts.purpose === 'push') {
    if (!creds.isActive) throw new Error(`${creds.label} is switched off.`);
    if (creds.environment === 'demo' && !sandboxPaymentsAllowed()) {
      throw new Error(
        `${creds.label} is a DEMO terminal and cannot take real money. ` +
          'Ask an administrator to switch it to Live in IMS Settings → Payment Terminals.',
      );
    }
  }
  return new EzetapPosProvider(creds);
}
