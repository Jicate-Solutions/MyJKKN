// @vitest-environment jsdom
/**
 * Pay Scales editor — what the screen does around a save (panel round 1, 9 Oct 2026).
 *
 *   - Two quick clicks on Save send one save, not two locked to the same row.
 *   - While a save is in flight every input is disabled, so nothing typed
 *     mid-save can be dropped when it lands.
 *   - After "someone else just changed the pay scales" there is a way out:
 *     discard the draft and reload what is saved now.
 *   - A stored row missing keys opens with the defaults instead of crashing.
 *
 * Run: npx vitest run __tests__/hr/pay-scales-editor-save-states.test.tsx
 */

import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

type PolicyData = {
  exists: boolean;
  value: unknown;
  description: string | null;
  updatedAt: string | null;
};

const state: {
  data: PolicyData;
  refetched: PolicyData | null;
  pending: boolean;
  error: Error | null;
} = { data: undefined as unknown as PolicyData, refetched: null, pending: false, error: null };
const mutate = vi.fn();
const reset = vi.fn();
// Like React Query: a refetch returns the fresh row and the query now holds it.
const refetch = vi.fn(async () => {
  if (state.refetched) state.data = state.refetched;
  return { data: state.data };
});

vi.mock('@/hooks/admin/use-hr-compensation-policies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/admin/use-hr-compensation-policies')>();
  return {
    ...actual,
    useCompensationPolicy: () => ({
      data: state.data,
      isLoading: false,
      isError: false,
      error: null,
      refetch,
    }),
    useUpdateCompensationPolicy: () => ({
      mutate,
      reset,
      isPending: state.pending,
      isError: state.error !== null,
      error: state.error,
    }),
  };
});
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/(routes)/hr/admin/policies/pay-scales/actions', () => ({
  getReferencePayLadders: vi.fn(async () => ({ success: true, ladders: [], notes: [] })),
}));

import { STALE_POLICY_MESSAGE } from '@/hooks/admin/use-hr-compensation-policies';
import { PayScalesEditor } from '@/app/(routes)/hr/admin/policies/pay-scales/_components/pay-scales-editor';

afterEach(() => {
  cleanup();
  mutate.mockReset();
  reset.mockReset();
  refetch.mockClear();
  state.refetched = null;
  state.pending = false;
  state.error = null;
});

function row(designation: string, updatedAt: string): PolicyData {
  return {
    exists: true,
    value: {
      pay_matrix: [{ designation, qualification: null, basic_pay: 6500 }],
      overrides: { net_set_basic: null },
      fixation_basis: ['qualification'],
      selection_committee_authority: true,
      higher_pay_package_approver: 'Trust Secretary',
    },
    description: null,
    updatedAt,
  };
}

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = () => (
    <QueryClientProvider client={client}>
      <PayScalesEditor />
    </QueryClientProvider>
  );
  const utils = render(ui());
  return { ...utils, rerenderEditor: () => utils.rerender(ui()) };
}

describe('PayScalesEditor — around a save', () => {
  it('two quick clicks on Save send one save', () => {
    state.data = row('Typist', '2026-10-09T10:00:00.000+00:00');
    renderEditor();
    fireEvent.change(screen.getByDisplayValue('Typist'), { target: { value: 'Senior Typist' } });

    // The save has not come back yet: both Save buttons are still on screen.
    const [top, bottom] = screen.getAllByRole('button', { name: /Save policy/ });
    fireEvent.click(top);
    fireEvent.click(bottom);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('every input is disabled while a save is in flight', () => {
    state.data = row('Typist', '2026-10-09T10:00:00.000+00:00');
    state.pending = true;
    renderEditor();
    expect(screen.getByDisplayValue('Typist')).toBeDisabled();
    expect(screen.getByDisplayValue('6500')).toBeDisabled();
    expect(screen.getByPlaceholderText('(any) — leave blank')).toBeDisabled();
    expect(screen.getByLabelText(/Net set basic/)).toBeDisabled();
    expect(screen.getByLabelText(/Approver for higher pay package/)).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Toggle selection committee authority' })).toBeDisabled();
  });

  it('after a stale refusal, "Discard my changes and reload" loads what is saved now', async () => {
    state.data = row('Typist', '2026-10-09T10:00:00.000+00:00');
    const { rerenderEditor } = renderEditor();
    fireEvent.change(screen.getByDisplayValue('Typist'), { target: { value: 'Senior Typist' } });

    // The save is refused: someone else saved first.
    state.error = new Error(STALE_POLICY_MESSAGE);
    state.refetched = row('Clerk', '2026-10-09T10:05:00.000+00:00');
    rerenderEditor();
    expect(screen.getByText('Someone else saved this college first')).toBeInTheDocument();
    // The draft is kept until the person chooses to drop it.
    expect(screen.getByDisplayValue('Senior Typist')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Discard my changes and reload' }));
    });
    expect(reset).toHaveBeenCalled();
    expect(refetch).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByDisplayValue('Clerk')).toBeInTheDocument());
    expect(screen.queryByDisplayValue('Senior Typist')).not.toBeInTheDocument();
  });

  it('a stored row with no pay_matrix opens with the defaults instead of crashing', () => {
    state.data = { exists: true, value: { overrides: { net_set_basic: 15000 } }, description: null, updatedAt: null };
    renderEditor();
    expect(screen.getByText(/No pay-matrix rows yet/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Net set basic/)).toHaveValue(15000);
  });
});
