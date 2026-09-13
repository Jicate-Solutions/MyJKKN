// @vitest-environment jsdom

/**
 * What a learner actually SEES when a drive's willingness window is shut.
 *
 * The service-level predicate is pinned in willingness-window.test.ts. This file
 * pins the half that reaches a human: the drive page must say WHICH of the two
 * things happened. Before the window was honoured there was one message for
 * every closure — "This drive is not open for willingness right now. Current
 * status: Willingness Open." — which is self-contradictory the moment a date,
 * rather than the status, is what closed it.
 *
 * The page is rendered for real and its buttons are clicked for real; only the
 * network is stubbed.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { Suspense } from 'react';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LearnerWillingnessSnapshot } from '@/lib/services/cdc/willingness-service';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import CdcDriveWillingnessPage from '@/app/(routes)/cdc/drives/[id]/willingness/page';

const DRIVE_ID = 'drive-1';
// `use(params)` reads a thenable that already carries React's fulfilled shape
// synchronously, so the page never suspends. A bare Promise suspends on first
// use and the resume does not land inside this harness.
const PARAMS = Object.assign(Promise.resolve({ id: DRIVE_ID }), {
  status: 'fulfilled',
  value: { id: DRIVE_ID },
}) as Promise<{ id: string }>;

function snapshot(over: Partial<LearnerWillingnessSnapshot> = {}): LearnerWillingnessSnapshot {
  return {
    drive: {
      id: DRIVE_ID,
      title: 'Foxconn India — Graduate Engineer',
      description: null,
      status: 'willingness_open',
      willingness_window_open_at: null,
      willingness_window_close_at: null,
      drive_date: '2026-10-01',
    } as LearnerWillingnessSnapshot['drive'],
    eligibility: { id: 'e1', program_ids: ['prog-1'] } as LearnerWillingnessSnapshot['eligibility'],
    recruiter: { id: 'r1', name: 'Foxconn India' } as LearnerWillingnessSnapshot['recruiter'],
    drive_type: null,
    learner: { id: 'l1', program_id: 'prog-1' },
    willingness: null,
    is_eligible: true,
    is_window_open: true,
    window_state: 'open',
    ...over,
  };
}

async function renderPage() {
  await PARAMS;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Suspense fallback={<div>loading</div>}>
        <CdcDriveWillingnessPage params={PARAMS} />
      </Suspense>
    </QueryClientProvider>
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function serve(snap: LearnerWillingnessSnapshot) {
  fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => snap } as Response);
  });
}

describe('willingness page — window open (the state every production drive is in)', () => {
  it('offers both answers and actually posts the one the learner clicks', async () => {
    serve(snapshot());
    await renderPage();

    const yes = await screen.findByRole('button', { name: /I'm in/i });
    expect(screen.getByRole('button', { name: /I decline/i })).toBeTruthy();

    fireEvent.click(yes);

    await waitFor(() => {
      const posted = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST'
      );
      expect(posted).toBeTruthy();
      expect(JSON.parse((posted![1] as RequestInit).body as string)).toEqual({
        intent: 'willing',
      });
    });
  });
});

describe('willingness page — window closed by its date', () => {
  it('says the window closed, names when, and offers no answer buttons', async () => {
    serve(
      snapshot({
        is_window_open: false,
        window_state: 'closed',
        drive: {
          ...snapshot().drive,
          willingness_window_close_at: '2026-09-10T00:00:00Z',
        },
      })
    );
    await renderPage();

    expect(await screen.findByText(/window for responding has closed/i)).toBeTruthy();
    expect(screen.getByText(/Responses closed on/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /I'm in/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /I decline/i })).toBeNull();
  });

  it('never tells the learner it is shut because the status is open', async () => {
    // The old copy did exactly this. Guard the contradiction, not the wording.
    serve(
      snapshot({
        is_window_open: false,
        window_state: 'closed',
        drive: {
          ...snapshot().drive,
          willingness_window_close_at: '2026-09-10T00:00:00Z',
        },
      })
    );
    await renderPage();

    await screen.findByText(/window for responding has closed/i);
    expect(screen.queryByText(/Current status: Willingness Open/i)).toBeNull();
    expect(screen.queryByText(/^Willingness Open$/)).toBeNull();
  });
});

describe('willingness page — window has not started', () => {
  it('says responses are not open yet and names the opening moment', async () => {
    serve(
      snapshot({
        is_window_open: false,
        window_state: 'not_yet_open',
        drive: {
          ...snapshot().drive,
          willingness_window_open_at: '2026-09-20T00:00:00Z',
        },
      })
    );
    await renderPage();

    expect(await screen.findByText(/not accepting responses yet/i)).toBeTruthy();
    expect(screen.getByText(/You can respond from/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /I'm in/i })).toBeNull();
  });
});

describe('willingness page — closed by status, unchanged behaviour', () => {
  it('still reports the status when the status is what closed it', async () => {
    serve(
      snapshot({
        is_window_open: false,
        window_state: 'status',
        drive: { ...snapshot().drive, status: 'eligibility_locked' },
      })
    );
    await renderPage();

    expect(await screen.findByText(/not open for willingness right now/i)).toBeTruthy();
    expect(screen.getByText(/Current status: Eligibility Locked/i)).toBeTruthy();
  });
});
