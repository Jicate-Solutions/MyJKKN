// lib/services/payments/ezetap/status.ts
//
// Turns an Ezetap status response into ONE exhaustive outcome.
//
// THE RULE THIS FILE EXISTS FOR: `status === 'AUTHORIZED'` is the only thing that
// means money moved. The vendor says so twice ("If the Status = AUTHORIZED only
// then the payment is considered as successful"), and its own sample of a DECLINED
// card begins { "success": true, "messageCode": "P2P_DEVICE_TXN_DONE", … "status":
// "FAILED" }. `success` describes whether the LOOKUP worked, not the payment — so
// it is deliberately never read here.
//
// Pure: no I/O, so the whole table is unit-testable offline.

import type { Paise } from '@/lib/services/payments/amount';
import { fromEzetapAmount } from './amount';
import type { EzetapStatusResponse } from './types';

/** "Notification not found for this refNumber" — Ezetap does not know, not "failed". */
export const EZETAP_NOTIFICATION_NOT_FOUND = 'EZETAP_0000383';

export interface EzetapPaidDetails {
  txnId: string | null;
  /** Null when the response carried no parsable amount — callers must treat as mismatch. */
  amountPaise: Paise | null;
  paymentMode: string | null;
  rrNumber: string | null;
  authCode: string | null;
  payerName: string | null;
  customerMobile: string | null;
}

export type EzetapOutcome =
  /** Still on its way to, or showing on, the terminal. Keep asking. */
  | { kind: 'pending'; messageCode: string | null }
  /** AUTHORIZED. The only branch that may lead to a sale. */
  | { kind: 'paid'; details: EzetapPaidDetails }
  /** The device finished and the payment did not go through. */
  | { kind: 'failed'; reason: string; errorCode: string | null }
  /** The notification timed out on Ezetap's side. Nothing was collected. */
  | { kind: 'expired' }
  /** Withdrawn — on the terminal itself, or by our cancel call. */
  | { kind: 'cancelled'; by: 'device' | 'external_system' }
  /** Ezetap cannot say. Never collapse this into 'failed': money may have moved. */
  | { kind: 'unknown'; messageCode: string | null; errorCode: string | null };

const PENDING_CODES = new Set(['P2P_STATUS_QUEUED', 'P2P_DEVICE_SENT', 'P2P_DEVICE_RECEIVED']);

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

export function normalizeEzetapStatus(res: EzetapStatusResponse): EzetapOutcome {
  const status = str(res.status)?.toUpperCase() ?? null;
  const messageCode = str(res.messageCode);
  const errorCode = str(res.errorCode);

  // ── The device finished: `status` is the verdict ─────────────────────────
  if (status === 'AUTHORIZED') {
    return {
      kind: 'paid',
      details: {
        txnId: str(res.txnId),
        // `amount` is what was charged; totalAmount/amountOriginal are fallbacks
        // for the response shapes where amount is blank.
        amountPaise:
          fromEzetapAmount(res.amount) ??
          fromEzetapAmount(res.totalAmount) ??
          fromEzetapAmount(res.amountOriginal),
        paymentMode: str(res.paymentMode) ?? str(res.mode),
        rrNumber: str(res.rrNumber),
        authCode: str(res.authCode),
        payerName: str(res.payerName) ?? str(res.customerName),
        customerMobile: str(res.customerMobile),
      },
    };
  }
  if (status === 'FAILED') {
    return {
      kind: 'failed',
      reason: str(res.errorMessage) ?? str(res.message) ?? 'The payment did not go through',
      errorCode,
    };
  }
  if (status === 'EXPIRED') return { kind: 'expired' };
  // VOIDED / REFUNDED on a fresh push would mean something happened we did not
  // ask for. Not paid, not provably failed — a human looks at it.
  if (status) return { kind: 'unknown', messageCode, errorCode };

  // ── No `status` yet: the lifecycle marker decides ────────────────────────
  if (messageCode && PENDING_CODES.has(messageCode)) return { kind: 'pending', messageCode };
  switch (messageCode) {
    case 'P2P_DEVICE_CANCELED':
      return { kind: 'cancelled', by: 'device' };
    case 'P2P_STATUS_IN_CANCELED_FROM_EXTERNAL_SYSTEM':
      return { kind: 'cancelled', by: 'external_system' };
    case 'P2P_STATUS_IN_EXPIRED':
      return { kind: 'expired' };
    // TXN_DONE without a status field, UNKNOWN, 0000383, or a code this table has
    // never seen: all "cannot say". The caller keeps asking until its deadline.
    default:
      return { kind: 'unknown', messageCode, errorCode };
  }
}
