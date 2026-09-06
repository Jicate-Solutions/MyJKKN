// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StudentBill } from '@/types/billing-schedule';
import { OnlinePaymentAmountSelector } from '@/components/billing/online-payment-amount-selector';

// Radix primitives touch APIs jsdom doesn't implement.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
});

afterEach(() => cleanup());

const bill = (id: string, description: string, balance: number): StudentBill =>
  ({
    id,
    bill_description: description,
    balance_amount: balance,
    final_amount: balance,
    total_amount: balance,
    status: 'pending',
  }) as unknown as StudentBill;

const BILLS = [bill('b1', 'Tuition Fee', 50000), bill('b2', 'Exam Fee', 2000)];

function setup(bills: StudentBill[] = BILLS) {
  const onAmountsChange = vi.fn();
  const onValidityChange = vi.fn();
  render(
    <OnlinePaymentAmountSelector
      bills={bills}
      onAmountsChange={onAmountsChange}
      onValidityChange={onValidityChange}
    />
  );
  return { onAmountsChange, onValidityChange };
}

const selectPartial = () =>
  fireEvent.click(screen.getByRole('radio', { name: /Pay Partial Amount/ }));

const entryDialog = () => screen.getByRole('dialog');

const confirmButton = () =>
  within(entryDialog()).getByRole('button', { name: 'Confirm Amounts' });

const lastCall = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)?.[0];

describe('OnlinePaymentAmountSelector', () => {
  it('defaults to full payment and reports every balance as payable', () => {
    const { onAmountsChange, onValidityChange } = setup();

    expect(lastCall(onAmountsChange)).toEqual({ b1: 50000, b2: 2000 });
    expect(lastCall(onValidityChange)).toBe(true);
  });

  it('opens a dedicated entry dialog with EMPTY fields when partial is chosen', () => {
    setup();
    selectPartial();

    const dialog = entryDialog();
    expect(within(dialog).getByText('Enter Amount to Pay')).toBeInTheDocument();

    // The old behaviour prefilled the full balance here, so a "partial" payment
    // silently charged the full amount.
    expect(within(dialog).getByLabelText('Tuition Fee')).toHaveValue('');
    expect(within(dialog).getByLabelText('Exam Fee')).toHaveValue('');
  });

  it('clears the payable amounts and blocks payment the moment partial is chosen', () => {
    const { onAmountsChange, onValidityChange } = setup();
    selectPartial();

    expect(lastCall(onAmountsChange)).toEqual({});
    expect(lastCall(onValidityChange)).toBe(false);
  });

  it('keeps Confirm disabled until every bill has an amount', () => {
    setup();
    selectPartial();

    expect(confirmButton()).toBeDisabled();

    fireEvent.change(within(entryDialog()).getByLabelText('Tuition Fee'), {
      target: { value: '10000' },
    });
    expect(confirmButton()).toBeDisabled(); // Exam Fee still blank

    fireEvent.change(within(entryDialog()).getByLabelText('Exam Fee'), {
      target: { value: '500' },
    });
    expect(confirmButton()).toBeEnabled();
  });

  it('rejects an amount above the bill balance', () => {
    const { onValidityChange } = setup();
    selectPartial();

    fireEvent.change(within(entryDialog()).getByLabelText('Tuition Fee'), {
      target: { value: '60000' },
    });
    fireEvent.change(within(entryDialog()).getByLabelText('Exam Fee'), {
      target: { value: '500' },
    });

    expect(
      within(entryDialog()).getByText(/cannot exceed balance of ₹50,000/)
    ).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    expect(lastCall(onValidityChange)).toBe(false);
  });

  it('rejects zero', () => {
    setup();
    selectPartial();

    fireEvent.change(within(entryDialog()).getByLabelText('Tuition Fee'), {
      target: { value: '0' },
    });
    expect(
      within(entryDialog()).getByText('Amount must be greater than 0')
    ).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it('enables payment only after valid amounts are confirmed', () => {
    const { onAmountsChange, onValidityChange } = setup();
    selectPartial();

    fireEvent.change(within(entryDialog()).getByLabelText('Tuition Fee'), {
      target: { value: '10000' },
    });
    fireEvent.change(within(entryDialog()).getByLabelText('Exam Fee'), {
      target: { value: '500' },
    });

    // Still blocked while the dialog is open — typing alone is not committing.
    expect(lastCall(onValidityChange)).toBe(false);

    fireEvent.click(confirmButton());

    expect(lastCall(onAmountsChange)).toEqual({ b1: 10000, b2: 500 });
    expect(lastCall(onValidityChange)).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('falls back to full payment when the entry dialog is cancelled unentered', () => {
    const { onAmountsChange, onValidityChange } = setup();
    selectPartial();

    fireEvent.click(within(entryDialog()).getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('radio', { name: /Pay Full Amount/ })).toBeChecked();
    expect(lastCall(onAmountsChange)).toEqual({ b1: 50000, b2: 2000 });
    expect(lastCall(onValidityChange)).toBe(true);
  });

  it('strips stray characters and caps the fraction at two decimals', () => {
    const { onAmountsChange } = setup([bill('b1', 'Tuition Fee', 50000)]);
    selectPartial();

    fireEvent.change(within(entryDialog()).getByLabelText('Tuition Fee'), {
      target: { value: '1e2.3456abc' },
    });
    expect(within(entryDialog()).getByLabelText('Tuition Fee')).toHaveValue('12.34');

    fireEvent.click(confirmButton());
    expect(lastCall(onAmountsChange)).toEqual({ b1: 12.34 });
  });
});
