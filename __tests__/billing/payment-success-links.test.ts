import { describe, it, expect } from 'vitest';
import {
  buildPaymentSuccessLinks,
  MY_BILLS_RECEIPT_PARAM,
} from '@/lib/billing/payment-status-flow';

// BUG-006167: after paying online, a learner tapped "View Receipt" / "View My
// Bills" on /billing/payment/success and hit Access Denied — both buttons went
// to staff-only pages. Learners must land on /learners/my-bills instead.

const RECEIPT = '1613b0eb-437d-4554-a542-1806c115eeca';
const LEARNER = '43cea16f-7eda-43c1-8d94-74f69bf345fb';

describe('buildPaymentSuccessLinks', () => {
  it('sends a student to their own receipt on /learners/my-bills', () => {
    const links = buildPaymentSuccessLinks({ isStudent: true, receiptId: RECEIPT, studentId: LEARNER });
    const url = new URL(links.receipt!, 'https://x.test');
    expect(url.pathname).toBe('/learners/my-bills');
    expect(url.searchParams.get('tab')).toBe('paid');
    expect(url.searchParams.get(MY_BILLS_RECEIPT_PARAM)).toBe(RECEIPT);
    expect(links.bills).toBe('/learners/my-bills');
  });

  it('never sends a student to a staff billing page', () => {
    const links = buildPaymentSuccessLinks({ isStudent: true, receiptId: RECEIPT, studentId: LEARNER });
    expect(links.receipt).not.toContain('/billing/');
    expect(links.bills).not.toContain('/billing/');
  });

  it('keeps staff on the admin receipt and learner bill pages', () => {
    const links = buildPaymentSuccessLinks({ isStudent: false, receiptId: RECEIPT, studentId: LEARNER });
    expect(links.receipt).toBe(`/billing/receipts/${RECEIPT}`);
    expect(links.bills).toBe(`/billing/schedule/students/${LEARNER}`);
  });

  it('falls back to the student list for staff when the learner is unknown', () => {
    const links = buildPaymentSuccessLinks({ isStudent: false, receiptId: RECEIPT, studentId: null });
    expect(links.bills).toBe('/billing/schedule/students');
  });

  it('offers no receipt link until a receipt exists', () => {
    expect(buildPaymentSuccessLinks({ isStudent: true, receiptId: null }).receipt).toBeNull();
    expect(buildPaymentSuccessLinks({ isStudent: false, receiptId: null }).receipt).toBeNull();
  });
});
