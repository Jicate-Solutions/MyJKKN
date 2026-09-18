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
 *
 * 2026-09-15 — the page grew a profile card, an academic-standing card and a
 * data-consent checkbox (direct pushes 760f08e180 / 18f5153bfa). "I'm in" is now
 * "Confirm willingness", it stays disabled until the consent box is ticked, and
 * the POST carries `additional_mobile` + `data_consent` alongside `intent`. The
 * fixture and the open-window test follow the shipped page; the closed-window
 * copy is unchanged.
 *
 * 2026-09-16 — the page became a role switch (6bcf5b789): learners get
 * LearnerWillingnessView, coordinators get AssignedWillingnessView, decided by
 * useAuth. What a learner sees is LearnerWillingnessView, so that is what this
 * file renders; the switch itself needs a live auth session. The same push made
 * CGPA and arrears mandatory before "Confirm willingness" unlocks.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LearnerWillingnessSnapshot } from '@/lib/services/cdc/willingness-service';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { LearnerWillingnessView } from '@/app/(routes)/cdc/drives/[id]/willingness/_components/learner-willingness-view';

const DRIVE_ID = 'drive-1';

function snapshot(over: Partial<LearnerWillingnessSnapshot> = {}): LearnerWillingnessSnapshot {
  const base = buildSnapshot(over);
  // `can_respond` is the service's own derivation; unless a case pins it, it
  // must follow the window the case set, or a "window shut" test would silently
  // be testing an open page.
  return {
    ...base,
    can_respond:
      over.can_respond ?? (base.is_window_open || base.reopened_for_learner),
  };
}

function buildSnapshot(over: Partial<LearnerWillingnessSnapshot>): LearnerWillingnessSnapshot {
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
    circular: null,
    eligibility: { id: 'e1', program_ids: ['prog-1'] } as LearnerWillingnessSnapshot['eligibility'],
    recruiter: { id: 'r1', name: 'Foxconn India' } as LearnerWillingnessSnapshot['recruiter'],
    drive_type: null,
    learner: {
      id: 'l1',
      program_id: 'prog-1',
      institution_id: 'inst-1',
      semester_order: 5,
      semester_label: 'Semester 5',
      register_number: '24UBAC12',
      full_name: 'Test Learner',
      email: 'test.student@jkkn.ac.in',
      mobile: '9876543210',
    },
    missing_profile_fields: [],
    academic: null,
    willingness: null,
    is_eligible: true,
    ineligible_reason: null,
    uses_semester_targeting: false,
    window_state: 'open',
    is_window_open: true,
    deadline_passed: false,
    // 2026-09-18 — the two Director rulings the page now carries: a same-day
    // clash warning, and a CDC reopening that lets one learner answer with the
    // window shut.
    same_day_clashes: [],
    reopened_for_learner: false,
    can_respond: true,
    ...over,
  };
}

async function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LearnerWillingnessView id={DRIVE_ID} />
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

    const yes = await screen.findByRole('button', { name: /Confirm willingness/i });
    expect(screen.getByRole('button', { name: /I decline/i })).toBeTruthy();

    // Confirm is gated on the data-consent box: a click before ticking it must
    // post nothing, so the learner cannot hand over CGPA/arrears by accident.
    expect((yes as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(yes);
    expect(
      fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    ).toBeUndefined();

    // Consent alone is not enough: CGPA and arrears are mandatory (2026-09-16).
    fireEvent.click(screen.getByRole('checkbox'));
    expect((yes as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('e.g. 8.20'), { target: { value: '8.2' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '0' } });
    await waitFor(() => expect((yes as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(yes);

    await waitFor(() => {
      const posted = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST'
      );
      expect(posted).toBeTruthy();
      expect(JSON.parse((posted![1] as RequestInit).body as string)).toEqual({
        intent: 'willing',
        additional_mobile: null,
        data_consent: true,
        cgpa: 8.2,
        arrears_count: 0,
      });
    });
  });
});

describe('willingness page — same-day clash (Director ruling A, 2026-09-18)', () => {
  it('warns about the other drive by name and still lets the learner say yes', async () => {
    serve(
      snapshot({
        same_day_clashes: [
          {
            drive_id: 'drive-2',
            title: 'INDO-MIM',
            drive_date: '2026-10-01',
            drive_start_time: '10:00:00',
            my_status: 'willing',
          },
        ],
      })
    );
    await renderPage();

    expect(await screen.findByText(/already said yes to another drive on this date/i)).toBeTruthy();
    expect(screen.getByText('INDO-MIM')).toBeTruthy();
    // A WARNING, not a block: both answers stay on the page.
    expect(screen.getByRole('button', { name: /Confirm willingness/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /I decline/i })).toBeTruthy();
  });

  it('says nothing when there is no clash', async () => {
    serve(snapshot());
    await renderPage();
    await screen.findByRole('button', { name: /Confirm willingness/i });
    expect(screen.queryByText(/already said yes to/i)).toBeNull();
  });
});

describe('willingness page — CDC reopened a decline (Director ruling B, 2026-09-18)', () => {
  it('lets a declined learner answer again with the window shut, and says why', async () => {
    serve(
      snapshot({
        is_window_open: false,
        window_state: 'closed',
        reopened_for_learner: true,
        willingness: {
          id: 'w1',
          status: 'withdrawn',
          declared_at: '2026-09-16T06:00:00Z',
        } as LearnerWillingnessSnapshot['willingness'],
        drive: { ...snapshot().drive, willingness_window_close_at: '2026-09-15T00:00:00Z' },
      })
    );
    await renderPage();

    expect(await screen.findByText(/has reopened your response/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Change to "Confirm willingness"/i })).toBeTruthy();
    // The shut-window notice must not also be shown — it would contradict it.
    expect(screen.queryByText(/window for responding has closed/i)).toBeNull();
  });

  it('a declined learner with NO reopening still sees the shut window and no way in', async () => {
    serve(
      snapshot({
        is_window_open: false,
        window_state: 'closed',
        reopened_for_learner: false,
        willingness: {
          id: 'w1',
          status: 'withdrawn',
          declared_at: '2026-09-16T06:00:00Z',
        } as LearnerWillingnessSnapshot['willingness'],
        drive: { ...snapshot().drive, willingness_window_close_at: '2026-09-15T00:00:00Z' },
      })
    );
    await renderPage();

    expect(await screen.findByText(/window for responding has closed/i)).toBeTruthy();
    expect(screen.queryByText(/has reopened your response/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Change to "Confirm willingness"/i })).toBeNull();
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
    expect(screen.queryByRole('button', { name: /Confirm willingness/i })).toBeNull();
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
    expect(screen.queryByRole('button', { name: /Confirm willingness/i })).toBeNull();
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
