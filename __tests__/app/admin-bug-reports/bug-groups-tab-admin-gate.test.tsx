// @vitest-environment jsdom
// ============================================================================
// Groups tab — two Director rulings (2026-09-15):
//   Part B  low-risk fix gate: a HELD group (sensitive path) shows
//           "Held — bugs desk / Director" + the deciding path instead of the
//           "Fix this group" button; a LOW group keeps the button.
//   Part A  admin confirmation on silence: when a sent question has expired
//           (or expires within 3 days) the step ⑤ shows "Reporter silent —
//           confirm as admin" with 👍/👎 + a note field; admin answers are
//           shown apart from reporter answers ("confirmed by staff").
// Network replaced with a fetch stub; no server, no database.
// ============================================================================
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import { BugGroupsTab } from '@/app/(routes)/admin/bug-reports/_components/bug-groups-tab';

const verdictDone = (files: string[]) => ({
  status: 'done',
  verdict: { single_fix_feasible: true, root_cause: 'x', files, subgroups: [], confidence: 'high', shared_root_cause: true, summary: '' },
  fix: null
});
const member = (id: string, pageUrl: string | null) => ({
  id,
  display_id: `BUG-${id}`,
  description: 'desc long enough to render',
  status: 'new',
  module_name: 'academic',
  page_url: pageUrl,
  created_at: '2026-09-13T09:12:00Z',
  reporter_name: 'Someone'
});
const base = (id: string, extra: Record<string, unknown>) => ({
  id,
  seed_bug_id: id,
  member_count: 1,
  origin: 'single',
  status: 'proposed',
  sample_description: `sample ${id}`,
  module_names: ['academic'],
  first_seen_at: '2026-09-15T01:40:00Z',
  last_scan_at: '2026-09-15T01:40:00Z',
  verify: null,
  ...extra
});

const CLUSTERS = [
  // LOW by verdict file → Fix button
  base('low', { fixability: verdictDone(['app/(routes)/academic/timetables/page.tsx']), members: [member('low', 'https://www.jkkn.ai/academic/timetables')] }),
  // HELD by verdict file (marks) even though the page url is harmless
  base('heldfile', { fixability: verdictDone(['lib/services/exams/internalMarksService.ts']), members: [member('heldfile', 'https://www.jkkn.ai/academic/timetables')] }),
  // HELD by page url: the verdict names no files, so the members' page paths decide
  base('heldurl', { fixability: verdictDone([]), members: [member('heldurl', 'https://www.jkkn.ai/billing/receipts?tab=paid')] }),
  // Part A: PR opened + a silent (expired) reporter
  base('silent', {
    fixability: { ...verdictDone(['components/ui/badge.tsx']), fix: { status: 'pr_opened', pr_url: 'https://github.com/x/y/pull/9', pr_number: 9 } },
    members: [member('silent', 'https://www.jkkn.ai/x')]
  })
];

const FEEDBACK: Record<string, unknown> = {
  silent: {
    total: 2, pending_send: 0, sent: 0, delivered: 1, answered: 1, expired: 1, yes: 0, no: 0,
    admin_yes: 1, admin_no: 0,
    admin_confirmable: [{ id: 'req-1', bug_id: 'silent', expires_at: '2026-09-01T00:00:00Z', expired: true }]
  }
};

const calls: { url: string; body?: unknown }[] = [];
function fetchStub(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  if (url.includes('/api/bug-reports/clusters?status=proposed')) return json({ clusters: CLUSTERS });
  if (url.includes('/api/bug-reports/clusters?status=')) return json({ clusters: [] });
  if (url.includes('/auto-resolve/status')) return json({ enabled: false, earned: 0, required: 10, suspended: {} });
  const fb = url.match(/clusters\/([^/]+)\/feedback/);
  if (fb && (!init || init.method !== 'POST')) return json({ feedback: FEEDBACK[fb[1]] ?? null });
  if (fb) return json({ ok: true, answered_by: 'admin' });
  if (url.includes('/verify')) return json({ verify: null });
  return json({});
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><BugGroupsTab /></QueryClientProvider>);
}

describe('Groups tab — low-risk fix gate (Part B)', () => {
  beforeEach(() => { calls.length = 0; vi.stubGlobal('fetch', vi.fn(fetchStub)); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('a LOW group keeps "Fix this group"; a HELD group shows the held notice with the deciding path', async () => {
    renderTab();
    await waitFor(() => expect(screen.getAllByText('1 report').length).toBeGreaterThanOrEqual(4));
    // exactly one Fix button: the low group. Both held groups show the notice instead.
    expect(screen.getAllByRole('button', { name: /Fix this group/ })).toHaveLength(1);
    expect(screen.getAllByText('Held — bugs desk / Director')).toHaveLength(2);
    expect(screen.getAllByText('lib/services/exams/internalMarksService.ts').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/'Marks' in lib\/services\/exams\/internalMarksService\.ts/)).toBeInTheDocument();
    expect(screen.getAllByText('/billing/receipts').length).toBeGreaterThanOrEqual(1); // page url judged by path only
  });
});

describe('Groups tab — admin confirmation on a silent reporter (Part A)', () => {
  beforeEach(() => { calls.length = 0; vi.stubGlobal('fetch', vi.fn(fetchStub)); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('shows the silent-reporter control, keeps admin answers apart, and posts admin_confirm with the note', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText(/Reporter silent/)).toBeInTheDocument());
    expect(screen.getByText(/confirmed by an admin, not the reporter/)).toBeInTheDocument();
    const note = screen.getByLabelText('Admin confirmation note');
    fireEvent.change(note, { target: { value: 'Checked on the phone, loads fine' } });
    fireEvent.click(screen.getByRole('button', { name: /Fixed \(admin\)/ }));
    await waitFor(() => expect(calls.some((c) => (c.body as any)?.action === 'admin_confirm')).toBe(true));
    const post = calls.find((c) => (c.body as any)?.action === 'admin_confirm')!.body as any;
    expect(post).toMatchObject({ action: 'admin_confirm', request_id: 'req-1', answer: 'pos', note: 'Checked on the phone, loads fine' });
    expect(post.url ?? calls.find((c) => (c.body as any)?.action === 'admin_confirm')!.url).toContain('/clusters/silent/feedback');
  });
});
