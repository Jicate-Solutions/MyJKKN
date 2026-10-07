// @vitest-environment jsdom
// ============================================================================
// <MyReliability/> on My Desk (migration 20271007161151): a team member's own
// 12-week record, plus a Director-only block.
// ============================================================================

import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

type Answer = { data: unknown; error: { message: string } | null };
let answers: Record<string, Answer>;
const rpc = vi.fn(async (name: string) => answers[name] ?? { data: null, error: { message: `no answer for ${name}` } });

// Every table read the Director block makes. A non-Director must never reach one.
const tableReads: string[] = [];
function table(name: string) {
  tableReads.push(name);
  const rows: Record<string, unknown[]> = {
    hr_trust_switch_log: [{ turned_on: false, at: '2026-10-05T01:17:00Z' }],
    hr_trust_suggestions: [{
      id: 's1', user_id: 'u-9', duty_code: 'S2', status: 'proposed', created_at: '2026-10-05T01:17:00Z',
      evidence: { items: 28, on_time_rate: 1 }, person: { full_name: 'Kavya Suggested' },
    }],
    hr_duty_tower_readings: [{
      duty_code: 'S2', institution_id: null, week_start: '2026-09-28', items: 4, on_time: 3, late: 1,
      open_overdue: 0, reversed: 0, on_time_rate: '0.75', reversal_rate: '0',
    }],
    institutions: [],
  };
  const result = { data: rows[name] ?? [], error: null };
  const chain: any = {
    select: () => chain, order: () => chain, eq: () => chain, in: () => chain,
    limit: () => Promise.resolve(result),
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result).then(ok, bad),
  };
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ rpc, from: (name: string) => table(name) }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MyReliability } from '@/app/(routes)/my-desk/_components/my-reliability';

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MyReliability />
    </QueryClientProvider>,
  );
}

const MY_ROWS = [
  { duty_code: 'S2', items: 12, on_time_rate: '1.0000', reversal_rate: '0.0000', signal: 'steady' },
  { duty_code: 'L1', items: 3, on_time_rate: '0.6667', reversal_rate: '0.0000', signal: 'too few items' },
];

beforeEach(() => {
  rpc.mockClear();
  tableReads.length = 0;
  answers = {
    fn_hr_my_reliability: { data: MY_ROWS, error: null },
    fn_is_the_director: { data: false, error: null },
  };
});
afterEach(() => cleanup());

describe('<MyReliability/> — a team member sees only their own record', () => {
  it('shows the record with the plain sentence that only they can see it', async () => {
    mount();
    expect(await screen.findByText('Your record, last 12 weeks')).toBeInTheDocument();
    expect(screen.getByText('Only you can see this.')).toBeInTheDocument();
    expect(screen.getByText('Verify a document a team member uploaded')).toBeInTheDocument();
    expect(screen.getByText('steady')).toBeInTheDocument();
    expect(screen.getByText(/12 items · 100% on time/)).toBeInTheDocument();
  });

  it('is hidden when the team member decided no items', async () => {
    answers.fn_hr_my_reliability = { data: [], error: null };
    mount();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('fn_hr_my_reliability'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('fn_is_the_director'));
    expect(screen.queryByText('Your record, last 12 weeks')).not.toBeInTheDocument();
    expect(screen.queryByTestId('my-reliability-card')).not.toBeInTheDocument();
  });

  it('hides the Director block for a team member who is not the Director, and reads none of its tables', async () => {
    mount();
    await screen.findByText('Your record, last 12 weeks');
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('fn_is_the_director'));
    expect(screen.queryByTestId('trust-director-block')).not.toBeInTheDocument();
    expect(screen.queryByText('Earned-trust suggestions')).not.toBeInTheDocument();
    expect(tableReads).toEqual([]);
  });

  it("renders no other team member's name", async () => {
    mount();
    await screen.findByText('Your record, last 12 weeks');
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('fn_is_the_director'));
    expect(screen.queryByText(/Kavya Suggested/)).not.toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/u-9/);
  });

  it('asks the database for no other person: fn_hr_my_reliability is called with no arguments', async () => {
    mount();
    await screen.findByText('Your record, last 12 weeks');
    expect(rpc.mock.calls.find((c) => c[0] === 'fn_hr_my_reliability')).toEqual(['fn_hr_my_reliability']);
  });
});

describe('<MyReliability/> — the Director block', () => {
  it('shows the switch, the suggestions and the per-college table to the Director', async () => {
    answers.fn_is_the_director = { data: true, error: null };
    mount();
    expect(await screen.findByTestId('trust-director-block')).toBeInTheDocument();
    expect(await screen.findByText('Earned-trust suggestions')).toBeInTheDocument();
    expect(screen.getByText(/changes nothing on its own/)).toBeInTheDocument();
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(screen.getByText('Kavya Suggested')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Note' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
    expect(screen.getByText('All colleges')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });
});
