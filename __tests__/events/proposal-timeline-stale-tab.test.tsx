// @vitest-environment jsdom
// ============================================================================
// ProposalTimeline — the 2026-09-07 stale-tab regression.
//
// A proposer left the status page open; the Director approved the proposal
// from another screen; the open tab kept saying "Submitted — Current" for
// hours. The stepper was never wrong — the component had read the row exactly
// once and had no reason to read it again. The fix re-reads the proposal
// whenever the tab comes back to the foreground (visibilitychange → visible).
//
// These tests drive the component the way the browser does: render it with
// the row in one state, change the row underneath it, then fire the same
// event the browser fires when the user switches back to the tab.
// ============================================================================

import '@testing-library/jest-dom';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventProposal, EventProposalStatus } from '@/types/events';

// What the database currently holds, and how many times the component asked.
const db: {
  status: EventProposalStatus;
  reads: number;
  error: { message: string } | null;
} = { status: 'submitted', reads: 0, error: null };

function row(status: EventProposalStatus): EventProposal {
  return {
    id: 'prop-1',
    institution_id: 'inst-1',
    proposer_id: 'user-1',
    sender_role: null,
    sender_email: null,
    contact_phone: null,
    title: 'Annual Tech Fest',
    event_date: '2026-10-01',
    venue: 'Main Auditorium',
    audience: [],
    expected_attendance: null,
    budget_band: null,
    status,
    source: 'form',
    decision_notes: null,
    decided_by: null,
    decided_at: status === 'approved' ? '2026-09-07T12:50:00Z' : null,
    metadata: {},
    created_at: '2026-08-29T10:00:00Z',
    updated_at: '2026-08-29T10:00:00Z',
  };
}

// The real createClientSupabaseClient() returns a SINGLETON — the same object on
// every render. That matters here: the component lists the client in its effect
// deps, so a factory that minted a fresh object per render would re-run the
// effect (and re-read) on every render and hide the very bug under test.
const client = {
  from: () => ({
    select: () => ({
      eq: () => ({
        single: async () => {
          db.reads += 1;
          if (db.error) return { data: null, error: db.error };
          return { data: row(db.status), error: null };
        },
      }),
    }),
  }),
};

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => client,
}));

import ProposalTimeline from '@/app/(routes)/events/propose/[id]/status/_components/timeline';

// Simulate the browser switching the tab away / back. jsdom's
// document.visibilityState is a fixed 'visible'; the component reads it inside
// its handler, so the getter has to be swapped before the event is fired.
function switchTab(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

function currentStep(): string | null {
  return document.querySelector('li[aria-current="step"]')?.textContent ?? null;
}

describe('ProposalTimeline re-reads the proposal when the tab comes back', () => {
  beforeEach(() => {
    db.status = 'submitted';
    db.reads = 0;
    db.error = null;
  });

  afterEach(() => {
    cleanup();
    switchTab('visible');
  });

  it('a tab open since before the approval shows Approved once it is foregrounded again', async () => {
    render(<ProposalTimeline proposalId="prop-1" />);

    await screen.findByText('Annual Tech Fest');
    expect(currentStep()).toContain('Submitted');
    expect(currentStep()).toContain('Current');
    expect(db.reads).toBe(1);

    // The Director decides while this tab is in the background.
    switchTab('hidden');
    db.status = 'approved';

    // The proposer comes back to the tab.
    switchTab('visible');

    await waitFor(() => expect(currentStep()).toContain('Approved'));
    expect(currentStep()).not.toContain('Submitted');
    expect(db.reads).toBe(2);
  });

  it('going to the background does not trigger a read', async () => {
    render(<ProposalTimeline proposalId="prop-1" />);
    await screen.findByText('Annual Tech Fest');
    expect(db.reads).toBe(1);

    switchTab('hidden');
    await act(async () => {});

    expect(db.reads).toBe(1);
  });

  it('a failed first read is replaced by the truth on the next return', async () => {
    db.error = { message: 'network down' };
    render(<ProposalTimeline proposalId="prop-1" />);

    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('network down');

    db.error = null;
    db.status = 'reviewing';
    switchTab('hidden');
    switchTab('visible');

    await screen.findByText('Annual Tech Fest');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(currentStep()).toContain('Under Review');
  });

  it('stops listening once unmounted', async () => {
    const { unmount } = render(<ProposalTimeline proposalId="prop-1" />);
    await screen.findByText('Annual Tech Fest');
    expect(db.reads).toBe(1);

    unmount();
    switchTab('hidden');
    switchTab('visible');
    await act(async () => {});

    expect(db.reads).toBe(1);
  });
});
