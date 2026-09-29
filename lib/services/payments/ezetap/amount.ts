// lib/services/payments/ezetap/amount.ts
//
// THE ONLY PLACE the Ezetap amount unit is decided.
//
// The vendor PDF never states the unit. It declares `amount` a BigDecimal and its
// status responses carry "amount": 531.00 — two decimals, which paise never have —
// so we send RUPEES. Everything else in the stack stays in Paise.
//
// UAT GATE: a ₹1.00 push on the demo host must show ₹1.00 on the terminal. If it
// shows ₹0.01, the unit is paise: change these two functions and nothing else.

import type { Paise } from '@/lib/services/payments/amount';

/** Paise → the rupee string Ezetap expects on the wire, e.g. 124050 → "1240.50". */
export function toEzetapAmount(paise: Paise): string {
  if (!Number.isInteger(paise) || paise <= 0) {
    throw new Error('Ezetap amount must be a positive whole number of paise');
  }
  return (paise / 100).toFixed(2);
}

/**
 * Wire value (rupees, number or string) → Paise. Null when the field is absent or
 * unparsable — the status response sends "" before the device has a transaction,
 * and an absent amount must never be read as ₹0.
 */
export function fromEzetapAmount(value: unknown): Paise | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) as Paise;
}
