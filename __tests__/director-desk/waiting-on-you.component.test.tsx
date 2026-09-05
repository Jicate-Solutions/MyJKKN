// @vitest-environment jsdom
// ============================================================================
// <WaitingOnYou/> mounted for real, against a mocked Supabase client, in the
// states the pure-function tests cannot reach: what the section SAYS when the
// fetch is paused (offline phone), when the call fails, when the answer is
// malformed, when it is an empty list, and when it has rows.
//
// The one sentence under test above all others: an offline phone must NOT
// read "Nothing waiting". With react-query 5, isLoading is false for a
// paused fetch, and a branch keyed on isLoading fell through to the all-clear.
//
// NOTE: __tests__/director-desk is NOT run by CI (every workflow names explicit
// paths). Run locally: npx vitest run __tests__/director-desk/waiting-on-you*
// ============================================================================

import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

import { WaitingOnYou } from '@/app/(routes)/my-desk/_components/waiting-on-you';
import type { WaitingRow } from '@/app/(routes)/my-desk/_lib/waiting';

// The one read this component makes. Each test sets what it answers.
let rpcAnswer: () => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = vi.fn(() => rpcAnswer());

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ rpc }),
}));

// next/link needs no router here; a plain anchor carries the same href.
vi.mock('next/link', () => ({
  default: ({ href, children: inner, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, inner),
}));

const DAY = 86_400_000;

function row(over: Partial<WaitingRow> & { item_id: string }): WaitingRow {
  return {
    source: 'refund',
    title: 'RF-0001 — A. Learner',
    detail: 'pinned to you by name',
    amount: 54500,
    waiting_since: new Date(Date.now() - 36 * DAY).toISOString(),
    age_days: 36,
    href: '/billing/refunds',
    ...over,
  };
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WaitingOnYou userId="user-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rpc.mockClear();
  onlineManager.setOnline(true);
});

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
});

describe('<WaitingOnYou/> — an offline phone is not an empty desk', () => {
  it('PAUSED: says it is waiting for a connection, never "Nothing waiting"', async () => {
    onlineManager.setOnline(false);
    rpcAnswer = () => new Promise(() => {}); // never answers; offline pauses it anyway
    mount();

    await screen.findByText('Waiting for a connection to check what is waiting on you');
    expect(screen.queryByText(/Nothing waiting/i)).toBeNull();
    expect(screen.queryByText(/Could not check/i)).toBeNull();
    // No count badge and no summary line without an answer.
    expect(screen.queryByText(/items? waiting/i)).toBeNull();
  });

  it('ERROR: "Could not check" with the reason, and never the all-clear', async () => {
    rpcAnswer = async () => ({
      data: null,
      error: {
        message:
          'Could not find the function public.fn_my_desk_waiting without parameters in the schema cache',
      },
    });
    mount();

    await screen.findByText(/Could not check what is waiting on you/i);
    expect(screen.getByText(/not installed yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing waiting/i)).toBeNull();
  });

  it('MALFORMED: an answer that is not a list lands in the error branch, not the all-clear', async () => {
    rpcAnswer = async () => ({ data: { rows: [] }, error: null });
    mount();

    await screen.findByText(/Could not check what is waiting on you/i);
    expect(screen.getByText(/unexpected shape/i)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing waiting/i)).toBeNull();
  });

  it('SUCCESS, EMPTY: the six-queue all-clear with a time', async () => {
    rpcAnswer = async () => ({ data: [], error: null });
    mount();

    // Six since 2026-09-03 (migration 20261018030000 added 'offer').
    const p = await screen.findByText(/Nothing waiting across 6 queues/i);
    expect(p.textContent).toMatch(/hires, refunds, leave, triggers, grievances, onboarding/);
    expect(p.textContent).toMatch(/checked \d\d:\d\d$/);
  });

  it('SUCCESS, ROWS: groups, count, one Open per row, age from waiting_since', async () => {
    rpcAnswer = async () => ({
      data: [
        // age_days LIES (2); waiting_since says 36 days. The chip must read 36.
        row({ item_id: 'f1', age_days: 2 }),
        row({
          item_id: 'g1',
          source: 'grievance',
          title: 'GRV-0009 — Hostel water',
          detail: 'no assignee — Director fallback',
          amount: null,
          waiting_since: new Date(Date.now() - 12 * DAY).toISOString(),
          age_days: 12,
          href: '/learners-council/issues',
        }),
      ],
      error: null,
    });
    mount();

    await screen.findByText('RF-0001 — A. Learner');
    expect(screen.getByText('Refunds to approve')).toBeInTheDocument();
    expect(screen.getByText('Grievances to assign')).toBeInTheDocument();
    expect(screen.getByText('₹54,500')).toBeInTheDocument();
    expect(screen.getByText('36 days')).toBeInTheDocument();
    expect(screen.queryByText('2 days')).toBeNull();
    expect(screen.getByText(/2 items waiting · oldest 36 days · checked/)).toBeInTheDocument();

    const links = screen.getAllByRole('link', { name: /^Open — / });
    expect(links.map((a) => a.getAttribute('href')).sort()).toEqual([
      '/billing/refunds',
      '/learners-council/issues',
    ]);
    expect(screen.queryByText(/Nothing waiting/i)).toBeNull();
  });

  it('SUCCESS, ROWS: a row whose href is not an in-app path gets no link', async () => {
    rpcAnswer = async () => ({
      data: [
        row({ item_id: 'bad1', title: 'Off-site thing', href: '//evil.example/x' }),
        row({ item_id: 'ok1', title: 'On-site thing' }),
      ],
      error: null,
    });
    mount();

    await screen.findByText('Off-site thing');
    expect(screen.getByText('no page')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: /^Open — / });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/billing/refunds');
    expect(document.querySelector('a[href^="//"]')).toBeNull();
  });

  it('calls the zero-argument RPC exactly once per mount', async () => {
    rpcAnswer = async () => ({ data: [], error: null });
    mount();
    await screen.findByText(/Nothing waiting/i);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith('fn_my_desk_waiting');
  });
});
