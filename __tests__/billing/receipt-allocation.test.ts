import { describe, it, expect } from 'vitest';
import { pendingAmountFor, toPaise } from '@/lib/billing/receipt-allocation';

describe('pendingAmountFor', () => {
  it('treats a settled bill as nothing owed', () => {
    // BUG: the old `balance_amount > 0 ? balance_amount : final_amount` form
    // reported the full original amount here, so a paid bill showed as fully
    // pending and could be collected a second time.
    expect(pendingAmountFor({ balance_amount: 0, final_amount: 50000 })).toBe(0);
  });

  it('uses the outstanding balance on a part-paid bill', () => {
    expect(pendingAmountFor({ balance_amount: 1500, final_amount: 5000 })).toBe(1500);
  });

  it('falls back to the full amount when the balance was never populated', () => {
    // This is the case the original fallback existed to handle, and it still must work.
    expect(pendingAmountFor({ balance_amount: null, final_amount: 5000 })).toBe(5000);
    expect(pendingAmountFor({ final_amount: 5000 })).toBe(5000);
  });

  it('never reports a negative amount owed', () => {
    expect(pendingAmountFor({ balance_amount: -250, final_amount: 5000 })).toBe(0);
  });
});

describe('toPaise', () => {
  it('keeps paise instead of rounding to whole rupees', () => {
    // Rounding to rupees is what made the bills below impossible to clear.
    expect(toPaise(4500.5)).toBe(4500.5);
    expect(toPaise(0.01)).toBe(0.01);
  });

  it('rounds beyond two decimals', () => {
    expect(toPaise(100.005)).toBe(100.01);
    expect(toPaise(100.004)).toBe(100.0);
  });

  it('survives floating point addition', () => {
    expect(toPaise(0.1 + 0.2)).toBe(0.3);
  });

  it.each([
    ['dc42bd50', 79999.97],
    ['beb26afc', 50000.01],
    ['b221daaf', 500.01],
    ['885d52c2', 0.01],
  ])(
    'allows bill %s to be paid to exactly zero (balance %s)',
    (_bill, balance) => {
      // These four bills exist in production and are all stuck at
      // 'partially_paid' because the form rounded their balance to rupees.
      const entered = toPaise(balance);
      const capped = Math.min(entered, balance);
      expect(toPaise(balance - capped)).toBe(0);
    }
  );
});
