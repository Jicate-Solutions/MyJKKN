/**
 * Branded integer type representing a paise amount.
 * Cannot be confused with a plain `number` (rupees) at the type level.
 */
export type Paise = number & { readonly __brand: 'Paise' };

export function toPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees)) throw new Error('Amount must be a finite number');
  if (rupees < 0) throw new Error('Amount cannot be negative');
  return Math.round(rupees * 100) as Paise;
}

export function fromPaise(paise: Paise): number {
  return paise / 100;
}
