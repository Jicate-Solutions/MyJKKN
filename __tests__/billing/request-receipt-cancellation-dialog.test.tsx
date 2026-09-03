// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RequestReceiptCancellationDialog } from '@/components/billing/request-receipt-cancellation-dialog';

const requestCancellation = vi.fn();

vi.mock('@/hooks/billing/use-receipt-cancellations', () => ({
  useRequestReceiptCancellation: () => ({
    mutate: requestCancellation,
    isPending: false,
  }),
}));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

afterEach(() => {
  cleanup();
  requestCancellation.mockReset();
});

function setup(props: Partial<React.ComponentProps<typeof RequestReceiptCancellationDialog>> = {}) {
  const onOpenChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <RequestReceiptCancellationDialog
        open
        onOpenChange={onOpenChange}
        receiptId="r1"
        receiptNumber="RCPT-001"
        {...props}
      />
    </QueryClientProvider>
  );
  return { onOpenChange, ...utils };
}

const dialog = () => screen.getByRole('dialog');
const reasonInput = () => within(dialog()).getByLabelText('Reason (required)');
const submit = () => within(dialog()).getByRole('button', { name: 'Send for approval' });

describe('RequestReceiptCancellationDialog', () => {
  it('names the receipt and states that nothing is reversed yet', () => {
    setup();
    expect(within(dialog()).getByText(/RCPT-001/)).toBeInTheDocument();
    expect(
      within(dialog()).getByText(/stays valid and the bill stays paid/)
    ).toBeInTheDocument();
  });

  it('starts with an empty reason and a disabled action', () => {
    setup();
    expect(reasonInput()).toHaveValue('');
    expect(submit()).toBeDisabled();
  });

  // The RPC raises 'A reason of at least 5 characters is required'; mirroring
  // it client-side turns a round-trip error into an inert button.
  it.each([
    ['', true],
    ['dup', true],
    ['    ', true],
    ['dupe!', false],
    ['same payment receipted twice', false],
  ])('reason %j leaves the action disabled=%s', (reason, expected) => {
    setup();
    fireEvent.change(reasonInput(), { target: { value: reason } });
    expect((submit() as HTMLButtonElement).disabled).toBe(expected);
  });

  it('submits the trimmed reason for the given receipt', () => {
    setup();
    fireEvent.change(reasonInput(), { target: { value: '  duplicate entry  ' } });
    fireEvent.click(submit());

    expect(requestCancellation).toHaveBeenCalledTimes(1);
    expect(requestCancellation.mock.calls[0][0]).toEqual({
      receiptId: 'r1',
      reason: 'duplicate entry',
    });
  });

  it('closes and notifies the caller once the request is accepted', () => {
    const onRequested = vi.fn();
    const { onOpenChange } = setup({ onRequested });
    fireEvent.change(reasonInput(), { target: { value: 'duplicate entry' } });
    fireEvent.click(submit());

    // Drive the mutation's success path the way the hook would.
    requestCancellation.mock.calls[0][1].onSuccess();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onRequested).toHaveBeenCalledTimes(1);
  });

  it('never carries a reason from one receipt to the next', () => {
    const { rerender } = setup();
    fireEvent.change(reasonInput(), { target: { value: 'duplicate entry' } });
    expect(reasonInput()).toHaveValue('duplicate entry');

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <RequestReceiptCancellationDialog
          open
          onOpenChange={vi.fn()}
          receiptId="r2"
          receiptNumber="RCPT-002"
        />
      </QueryClientProvider>
    );
    expect(reasonInput()).toHaveValue('');
  });

  it('cannot submit without a receipt id', () => {
    setup({ receiptId: null, receiptNumber: null });
    fireEvent.change(reasonInput(), { target: { value: 'duplicate entry' } });
    expect(submit()).toBeDisabled();
  });
});
