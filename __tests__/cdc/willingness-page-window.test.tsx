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
 * copy is unchanged. Since 2026-09-16 the POST also carries `cgpa` and
 * `arrears_count`, both mandatory before Confirm enables.
 *
 * 2026-09-16 — the page now routes learners to LearnerWillingnessView and
 * everyone else to a permission-guarded coordinator view (direct push
 * 6bcf5b7890). The auth and permission hooks are stubbed below so the learner
 * branch renders; the copy under test did not change.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { Suspense } from 'react';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LearnerWillingnessSnapshot } from '@/lib/services/cdc/willingness-service';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// 2026-09-16 (direct push 6bcf5b7890) — the page became "one URL, two
// audiences": it reads useAuth to pick the learner view over the coordinator
// view, and imports PermissionGuard for the latter. PermissionGuard pulls in
// usePermissions → RoleService, whose static initialiser builds a browser
// Supabase client at import time and throws without NEXT_PUBLIC_SUPABASE_URL
// (CI has none). Both hooks are stubbed: this file tests what a LEARNER sees.
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    profile: { id: 'user-1', learner_id: 'l1', role: 'student' },
    isLoading: false,
    error: null,
  }),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => false, isSuperAdmin: false, isLoading: false }),
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

    const yes = await screen.findByRole('button', { name: /Confirm willingness/i });
    expect(screen.getByRole('button', { name: /I decline/i })).toBeTruthy();

    // Confirm is gated on the data-consent box: a click before ticking it must
    // post nothing, so the learner cannot hand over CGPA/arrears by accident.
    expect((yes as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(yes);
    expect(
      fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    ).toBeUndefined();

    fireEvent.click(screen.getByRole('checkbox'));

    // 2026-09-16 (direct push 6bcf5b7890): CGPA and arrears are mandatory and
    // travel with the declaration. With no published COE result to pre-fill
    // them (the fixture's `academic` is null), consent alone must not enable
    // Confirm — the learner has to type both.
    expect((yes as HTMLButtonElement).disabled).toBe(true);
    const cgpa = document.getElementById('cdc-cgpa') as HTMLInputElement | null;
    const arrears = document.getElementById('cdc-arrears') as HTMLInputElement | null;
    expect(cgpa).toBeTruthy();
    expect(arrears).toBeTruthy();
    fireEvent.change(cgpa!, { target: { value: '8.2' } });
    fireEvent.change(arrears!, { target: { value: '0' } });
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
