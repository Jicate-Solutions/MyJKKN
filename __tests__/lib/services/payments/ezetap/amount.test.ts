// __tests__/lib/services/payments/ezetap/amount.test.ts
import { describe, it, expect } from 'vitest';
import { toEzetapAmount, fromEzetapAmount } from '@/lib/services/payments/ezetap/amount';
import { toPaise, type Paise } from '@/lib/services/payments/amount';

describe('Ezetap amount boundary (rupees on the wire, paise inside)', () => {
  it('sends rupees with two decimals', () => {
    expect(toEzetapAmount(toPaise(1240.5))).toBe('1240.50');
    expect(toEzetapAmount(toPaise(1))).toBe('1.00');
  });

  it('round-trips', () => {
    for (const r of [1, 21, 99.99, 1240.5, 100000]) {
      expect(fromEzetapAmount(toEzetapAmount(toPaise(r)))).toBe(toPaise(r));
    }
  });

  it('parses the numeric form the status response uses', () => {
    expect(fromEzetapAmount(531.0)).toBe(53100);
    expect(fromEzetapAmount('531.00')).toBe(53100);
  });

  it('never reads a missing amount as zero', () => {
    expect(fromEzetapAmount('')).toBeNull();
    expect(fromEzetapAmount(null)).toBeNull();
    expect(fromEzetapAmount(undefined)).toBeNull();
    expect(fromEzetapAmount('abc')).toBeNull();
  });

  it('rejects non-positive or fractional paise', () => {
    expect(() => toEzetapAmount(0 as Paise)).toThrow();
    expect(() => toEzetapAmount(-100 as Paise)).toThrow();
    expect(() => toEzetapAmount(10.5 as Paise)).toThrow();
  });
});
