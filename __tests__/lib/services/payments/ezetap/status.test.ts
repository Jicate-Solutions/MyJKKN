// __tests__/lib/services/payments/ezetap/status.test.ts
//
// Every row of the vendor's "action to be taken" table, plus its own sample of a
// DECLINED card whose response starts with success:true.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { normalizeEzetapStatus } from '@/lib/services/payments/ezetap/status';

describe('normalizeEzetapStatus', () => {
  it('AUTHORIZED is paid, with the amount in paise', () => {
    const o = normalizeEzetapStatus({
      success: true,
      messageCode: 'P2P_DEVICE_TXN_DONE',
      status: 'AUTHORIZED',
      amount: 2100,
      txnId: 'TXN1',
      rrNumber: 'RR25071',
      paymentMode: 'UPI',
    });
    expect(o.kind).toBe('paid');
    if (o.kind !== 'paid') return;
    expect(o.details.amountPaise).toBe(210000);
    expect(o.details.txnId).toBe('TXN1');
    expect(o.details.rrNumber).toBe('RR25071');
  });

  it('the vendor declined-card sample (success:true, status FAILED) is failed, not paid', () => {
    const o = normalizeEzetapStatus({
      success: true,
      messageCode: 'P2P_DEVICE_TXN_DONE',
      message: 'Transaction done on device, Please look at Txn status.',
      errorCode: 'EZETAP_1000003',
      errorMessage: 'Card Declined. Please try again.',
      realCode: 'P2P_DEVICE_TXN_DONE',
      amount: 531.0,
      settlementStatus: 'FAILED',
      status: 'FAILED',
      states: ['FAILED'],
    });
    expect(o).toEqual({
      kind: 'failed',
      reason: 'Card Declined. Please try again.',
      errorCode: 'EZETAP_1000003',
    });
  });

  it('success:true alone never means paid', () => {
    expect(
      normalizeEzetapStatus({ success: true, messageCode: 'P2P_DEVICE_TXN_DONE' }).kind,
    ).toBe('unknown');
  });

  it.each([
    ['P2P_STATUS_QUEUED', 'pending'],
    ['P2P_DEVICE_SENT', 'pending'],
    ['P2P_DEVICE_RECEIVED', 'pending'],
    ['P2P_DEVICE_CANCELED', 'cancelled'],
    ['P2P_STATUS_IN_CANCELED_FROM_EXTERNAL_SYSTEM', 'cancelled'],
    ['P2P_STATUS_IN_EXPIRED', 'expired'],
    ['P2P_STATUS_UNKNOWN', 'unknown'],
  ])('%s with no status is %s', (messageCode, kind) => {
    expect(normalizeEzetapStatus({ success: true, messageCode }).kind).toBe(kind);
  });

  it('TXN_DONE + EXPIRED is expired', () => {
    expect(
      normalizeEzetapStatus({ messageCode: 'P2P_DEVICE_TXN_DONE', status: 'EXPIRED' }).kind,
    ).toBe('expired');
  });

  it('notification-not-found is unknown, never failed', () => {
    expect(normalizeEzetapStatus({ success: false, errorCode: 'EZETAP_0000383' }).kind).toBe(
      'unknown',
    );
  });

  it('VOIDED on a fresh push is for a human, not paid', () => {
    expect(normalizeEzetapStatus({ status: 'VOIDED' }).kind).toBe('unknown');
  });

  it('`success` is not read anywhere in the status normalizer', () => {
    const src = readFileSync(
      path.resolve(process.cwd(), 'lib/services/payments/ezetap/status.ts'),
      'utf8',
    ).replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/\.success\b/);
  });
});
