// @vitest-environment jsdom

/**
 * BUG-005278 / 005203 / 004633 / 005131 — the CDC "New Corporate Internship"
 * form could never be completed and "Create Internship" did nothing.
 *
 * Production (read-only, 24 Sep 2026): internship_posting_cycles and
 * internship_external_sites both hold 0 rows, so the two REQUIRED pickers are
 * empty for every institution. The page then returned silently from submit on
 * the missing fields, and a failed load of the two lists read exactly like
 * "nothing set up".
 *
 * These tests render the real page and click its real button; only the network
 * and the app shell are stubbed. Each one fails against the page as it was.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const svc = vi.hoisted(() => ({
  getInternshipCycles: vi.fn(),
  getCorporateSites: vi.fn(),
  getDefaultRequiredAttendancePct: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/lib/services/cdc/internship-service', () => ({ CdcInternshipService: svc }));
vi.mock('react-hot-toast', () => ({ toast: toastMock }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));
vi.mock('@/components/layout/content-layout', () => ({
  ContentLayout: (props: { children: React.ReactNode }) => {
    const inner = props.children;
    return <div>{inner}</div>;
  },
}));
vi.mock('@/components/auth/permission-guard', () => ({
  PermissionGuard: (props: { children: React.ReactNode }) => {
    const inner = props.children;
    return <>{inner}</>;
  },
}));
// Stable object, as the real AuthProvider context state is between renders.
const authState = vi.hoisted(() => ({
  profile: { id: 'u1', institution_id: 'inst-1' },
  isLoading: false,
  error: null,
}));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/cdc/use-cdc-pickers', () => ({
  useStaffForPicker: () => ({ data: [], isLoading: false }),
}));
// cdc_internship_types lookup (browser client): one active corporate type, so
// the internship-type field is never the reason Create is blocked here.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () =>
            Promise.resolve({
              data: [{ id: 't1', display_name: 'Corporate Internship', config_key: 'corporate_internship' }],
            }),
        }),
      }),
    }),
  }),
}));

import NewCdcInternshipPage from '@/app/(routes)/cdc/internships/new/page';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NewCdcInternshipPage />
    </QueryClientProvider>
  );
}

const createButton = () => screen.getByRole('button', { name: /create internship/i });

beforeEach(() => {
  svc.getDefaultRequiredAttendancePct.mockResolvedValue(75);
  // Radix Checkbox measures itself; jsdom has no ResizeObserver.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ options: [] }) }))
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('CDC new corporate internship — required lists', () => {
  it('names what is missing and disables Create when cycles and sites load empty', async () => {
    svc.getInternshipCycles.mockResolvedValue([]);
    svc.getCorporateSites.mockResolvedValue([]);

    renderPage();
    await waitFor(() => expect(svc.getCorporateSites).toHaveBeenCalled());

    // The reported symptom: a Create button that can be pressed but does nothing.
    await waitFor(() => expect((createButton() as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByText(/Create is unavailable: no posting cycle and no corporate site/i)).toBeTruthy();

    expect(screen.getByText(/No internship posting cycle has been set up for your institution yet/i)).toBeTruthy();
    expect(screen.getByText(/No corporate site \/ company has been set up for your institution yet/i)).toBeTruthy();
    // Points at where a cycle is created.
    expect(screen.getByRole('link', { name: /Internships › Cycles/ }).getAttribute('href')).toBe(
      '/internships/cycles'
    );
  });

  it('shows the load error — not "nothing set up" — and disables Create when the lists fail to load', async () => {
    svc.getInternshipCycles.mockRejectedValue(
      new Error('permission denied for table internship_posting_cycles')
    );
    svc.getCorporateSites.mockResolvedValue([]);

    renderPage();

    // The database's own words reach the screen.
    expect(await screen.findByText(/permission denied for table internship_posting_cycles/)).toBeTruthy();

    // A failed load must never be presented as "nothing configured".
    expect(screen.queryByText(/configured for this institution/i)).toBeNull();
    expect(screen.queryByText(/has been set up for your institution yet/i)).toBeNull();
    expect(screen.getByText(/Could not load posting cycles — see the error above/i)).toBeTruthy();

    expect((createButton() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/could not be loaded/i)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/permission denied/);
  });

  it('says which required fields are missing instead of silently doing nothing', async () => {
    svc.getInternshipCycles.mockResolvedValue([
      { id: 'c1', cycle_name: 'Aug 2026', start_date: '2026-08-01', end_date: '2026-12-31' },
    ]);
    svc.getCorporateSites.mockResolvedValue([{ id: 's1', site_name: 'Acme', city: 'Erode', state: 'TN' }]);

    renderPage();

    await waitFor(() => expect(svc.getCorporateSites).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/Loading posting cycles/i)).toBeNull());

    const btn = createButton();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/Create is unavailable/i)).toBeNull();

    fireEvent.click(btn);

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    const msg = String(toastMock.error.mock.calls[0][0]);
    expect(msg).toMatch(/required fields/i);
    expect(msg).toMatch(/Posting cycle/);
    expect(msg).toMatch(/Corporate site \/ company/);
    expect(msg).toMatch(/Learner/);
  });
});
