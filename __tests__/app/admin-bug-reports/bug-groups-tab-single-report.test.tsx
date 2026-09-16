// @vitest-environment jsdom
// ============================================================================
// Groups tab — a ONE-report group renders sanely (Director decision
// 2026-09-15: "Let one-report bugs form a group too").
//
// fn_bug_cluster_ensure_single creates a 1-member group with origin='single'.
// The tab must:
//   1. say "1 report" (not "1 reports") and show the "single report" badge;
//   2. NOT offer "Confirm group" for a 1-member group (nothing to park) while
//      still offering Dismiss — and still offer Confirm for a 2+ group;
//   3. use singular copy in the stepper ("Finds the cause behind this report.",
//      "One fix can resolve this report", "Ask the reporter");
//   4. keep the 2+ group's copy unchanged.
// Network is replaced with a fetch stub; no server, no database.
// ============================================================================

import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() }
}));

import { BugGroupsTab } from '@/app/(routes)/admin/bug-reports/_components/bug-groups-tab';

const member = (id: string, displayId: string, reporter: string) => ({
  id,
  display_id: displayId,
  description: 'Attendance page shows blank list for section B when marking today',
  status: 'new',
  module_name: 'academic',
  created_at: '2026-09-13T09:12:00Z',
  reporter_name: reporter
});

const CLUSTERS = [
  {
    id: 'c-single-fresh',
    seed_bug_id: 'b1',
    member_count: 1,
    origin: 'single',
    status: 'proposed',
    sample_description: 'Attendance page shows blank list for section B when marking today',
    module_names: ['academic'],
    first_seen_at: '2026-09-15T01:40:00Z',
    last_scan_at: '2026-09-15T01:40:00Z',
    fixability: null,
    verify: null,
    members: [member('b1', 'BUG-006031', 'Reporter One')]
  },
  {
    id: 'c-single-fixed',
    seed_bug_id: 'b2',
    member_count: 1,
    origin: 'single',
    status: 'proposed',
    sample_description: 'Timetable view crashes with a red error when opening Monday',
    module_names: ['academic'],
    first_seen_at: '2026-09-14T01:40:00Z',
    last_scan_at: '2026-09-15T01:40:00Z',
    fixability: {
      status: 'done',
      verdict: {
        single_fix_feasible: true,
        root_cause: 'day index off by one when the week starts on Monday',
        files: ['app/(routes)/academic/timetables/page.tsx'],
        subgroups: []
      },
      fix: { status: 'pr_opened', pr_url: 'https://github.com/x/y/pull/1', pr_number: 1 }
    },
    verify: null,
    members: [member('b2', 'BUG-006032', 'Reporter Two')]
  },
  {
    id: 'c-scan-three',
    seed_bug_id: 'b3',
    member_count: 3,
    origin: 'scan',
    status: 'proposed',
    sample_description: 'Fee receipt PDF download button does nothing on the billing page',
    module_names: ['billing'],
    first_seen_at: '2026-09-12T01:40:00Z',
    last_scan_at: '2026-09-15T01:40:00Z',
    fixability: null,
    verify: null,
    members: [member('b3', 'BUG-006021', 'R3'), member('b4', 'BUG-006022', 'R4'), member('b5', 'BUG-006023', 'R5')]
  }
];

function fetchStub(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  const json = (body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  if (url.includes('/api/bug-reports/clusters?status=proposed')) return json({ clusters: CLUSTERS });
  if (url.includes('/api/bug-reports/clusters?status=')) return json({ clusters: [] });
  if (url.includes('/auto-resolve/status')) return json({ enabled: false, earned: 0, required: 10, suspended: {} });
  if (url.includes('/feedback')) return json({ feedback: null });
  if (url.includes('/verify')) return json({ verify: null });
  return json({});
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BugGroupsTab />
    </QueryClientProvider>
  );
}

describe('Groups tab — one-report groups (origin=single)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(fetchStub));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('says "1 report" with the single-report badge, and "3 reports" for the scan group', async () => {
    renderTab();
    await waitFor(() => expect(screen.getAllByText('1 report')).toHaveLength(2));
    expect(screen.getAllByText('single report')).toHaveLength(2);
    expect(screen.getByText('3 reports')).toBeInTheDocument();
    expect(screen.queryByText('1 reports')).not.toBeInTheDocument();
  });

  it('hides "Confirm group" for a 1-member group but keeps Dismiss; the 3-member group still has Confirm', async () => {
    renderTab();
    await waitFor(() => expect(screen.getAllByText('1 report')).toHaveLength(2));
    expect(screen.getAllByRole('button', { name: /Confirm group/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Dismiss/ })).toHaveLength(3);
  });

  it('uses singular stepper copy for a 1-report group and keeps plural copy for the scan group', async () => {
    renderTab();
    await waitFor(() => expect(screen.getAllByText('1 report')).toHaveLength(2));
    // ① fresh singleton: singular diagnose copy; scan group: plural copy unchanged
    expect(screen.getByText('Finds the cause behind this report.')).toBeInTheDocument();
    expect(screen.getByText('Says whether these 3 reports share one cause.')).toBeInTheDocument();
    // ① diagnosed singleton with a PR: singular one-fix badge and step ⑤ title
    expect(screen.getByText('One fix can resolve this report')).toBeInTheDocument();
    expect(screen.getAllByText('Ask the reporter')).toHaveLength(2); // both 1-report groups
    expect(screen.getAllByText('Ask the reporters')).toHaveLength(1); // the 3-report group
  });
});
