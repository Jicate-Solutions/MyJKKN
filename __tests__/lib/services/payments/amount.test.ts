import { describe, it, expect } from 'vitest';
import { toPaise, fromPaise, type Paise } from '@/lib/services/payments/amount';

describe('toPaise', () => {
  it('converts whole rupees to paise', () => {
    expect(toPaise(500)).toBe(50000);
  });
  it('converts decimal rupees to paise (banker-safe rounding)', () => {
    expect(toPaise(123.45)).toBe(12345);
    expect(toPaise(0.01)).toBe(1);
  });
  it('rounds half-paise inputs to nearest integer paise', () => {
    expect(toPaise(0.005)).toBe(1); // 0.5 paise rounds up
    expect(toPaise(0.004)).toBe(0); // 0.4 paise rounds down
  });
  it('refuses negative amounts', () => {
    expect(() => toPaise(-1)).toThrow(/negative/i);
  });
  it('refuses non-finite amounts', () => {
    expect(() => toPaise(NaN)).toThrow(/finite/i);
    expect(() => toPaise(Infinity)).toThrow(/finite/i);
  });
});

describe('fromPaise', () => {
  it('converts paise to rupees with 2-decimal precision', () => {
    expect(fromPaise(50000 as Paise)).toBe(500);
    expect(fromPaise(12345 as Paise)).toBe(123.45);
    expect(fromPaise(1 as Paise)).toBe(0.01);
  });
});
