// @vitest-environment jsdom
/**
 * Pay Scales editor — a background refetch must not wipe unsaved edits.
 *
 * React Query refetches on window focus. The editor used to re-seed its form
 * from every fresh server object, so switching tabs and back threw away
 * whatever had been typed. It now re-seeds only while there are no unsaved
 * changes, and the save stays locked to the row the form was loaded from —
 * not to the newer row the refetch brought, which would let a stale draft
 * overwrite someone else's save.
 *
 * Run: npx vitest run __tests__/hr/pay-scales-editor-refetch-keeps-edits.test.tsx
 */

import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

type PolicyData = {
  exists: boolean;
  value: unknown;
  description: string | null;
  updatedAt: string | null;
};

const state: { data: PolicyData } = { data: undefined as unknown as PolicyData };
const mutate = vi.fn();
const lockArgs: Array<{ expectedUpdatedAt: string | null } | undefined> = [];

vi.mock('@/hooks/admin/use-hr-compensation-policies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/admin/use-hr-compensation-policies')>();
  return {
    ...actual,
    useCompensationPolicy: () => ({
      data: state.data,
      isLoading: false,
      isError: false,
      error: null,
    }),
    useUpdateCompensationPolicy: (
      _key: string,
      _inst: string,
      lock?: { expectedUpdatedAt: string | null }
    ) => {
      lockArgs.push(lock);
      return { mutate, isPending: false };
    },
  };
});
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/(routes)/hr/admin/policies/pay-scales/actions', () => ({
  getReferencePayLadders: vi.fn(async () => ({ success: true, ladders: [], notes: [] })),
}));

import { PayScalesEditor } from '@/app/(routes)/hr/admin/policies/pay-scales/_components/pay-scales-editor';

afterEach(() => {
  cleanup();
  mutate.mockReset();
  lockArgs.length = 0;
});

const LOADED_AT = '2026-10-08T10:00:00.000+00:00';
const REFETCHED_AT = '2026-10-08T10:05:00.000+00:00';

function row(designation: string, basicPay: number, updatedAt: string): PolicyData {
  return {
    exists: true,
    value: {
      pay_matrix: [{ designation, qualification: null, basic_pay: basicPay }],
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

describe('PayScalesEditor — refetch while editing', () => {
  it('keeps typed values when a refetch brings different server data, and stays locked to the loaded row', () => {
    state.data = row('Typist', 6500, LOADED_AT);
    const { rerenderEditor } = renderEditor();

    const input = screen.getByDisplayValue('Typist');
    fireEvent.change(input, { target: { value: 'Senior Typist' } });
    expect(screen.getByDisplayValue('Senior Typist')).toBeInTheDocument();

    // A background refetch: someone else saved a different matrix.
    state.data = row('Clerk', 9000, REFETCHED_AT);
    rerenderEditor();

    expect(screen.getByDisplayValue('Senior Typist')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Clerk')).not.toBeInTheDocument();
    // The save would still be checked against the row the form was loaded from.
    expect(lockArgs.at(-1)).toEqual({ expectedUpdatedAt: LOADED_AT });

    fireEvent.click(screen.getAllByRole('button', { name: /Save policy/ })[0]);
    expect(mutate).toHaveBeenCalledTimes(1);
    const saved = mutate.mock.calls[0][0] as { pay_matrix: Array<{ designation: string }> };
    expect(saved.pay_matrix[0].designation).toBe('Senior Typist');
  });

  it('re-seeds from a refetch when nothing has been typed', () => {
    state.data = row('Typist', 6500, LOADED_AT);
    const { rerenderEditor } = renderEditor();

    state.data = row('Clerk', 9000, REFETCHED_AT);
    rerenderEditor();

    expect(screen.getByDisplayValue('Clerk')).toBeInTheDocument();
    expect(lockArgs.at(-1)).toEqual({ expectedUpdatedAt: REFETCHED_AT });
  });
});
